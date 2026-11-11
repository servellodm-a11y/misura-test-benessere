import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const rateBase = read("../supabase/migrations/20261110000100_nextway_distributed_rate_limit.sql");
const rateUnits = read("../supabase/migrations/20261110000300_nextway_rate_limit_units.sql");
const idempotency = read("../supabase/migrations/20261110000200_nextway_setter_idempotency.sql");
const retention = read("../supabase/migrations/20261110000400_nextway_idempotency_retention.sql");
const recovery = read("../supabase/migrations/20261110000500_nextway_setter_output_recovery.sql");
const hardening = read("../supabase/migrations/20261110000600_nextway_setter_output_authorization_hardening.sql");
const staleOutput = read("../supabase/migrations/20261110000700_nextway_clear_stale_staged_output.sql");

function securityDefinerWithPinnedPath(sql, signature) {
  const start = sql.toLowerCase().indexOf(signature.toLowerCase());
  assert.ok(start >= 0, `Missing function: ${signature}`);
  const end = sql.indexOf("as $$", start);
  assert.ok(end > start, `Missing function body: ${signature}`);
  const header = sql.slice(start, end).toLowerCase();
  assert.match(header, /security definer/);
  assert.match(header, /set search_path = pg_catalog, public/);
  return sql.slice(end + 5);
}

// Distributed rate limit: no direct table access; authenticated callers consume bounded units.
assert.match(rateBase, /enable row level security/i);
assert.match(rateBase, /revoke all on table public\.nextway_api_rate_limits from public, anon, authenticated/i);
assert.match(rateBase, /v_user_id uuid := auth\.uid\(\)/i);
assert.match(rateBase, /if v_user_id is null then[\s\S]*?errcode = '28000'/i);
assert.match(rateBase, /on conflict \(user_id, scope\) do update/i);
assert.match(rateUnits, /drop function if exists public\.nextway_consume_api_rate_limit\(text\)/i);
assert.match(rateUnits, /p_units integer default 1/i);
assert.match(rateUnits, /p_units is null or p_units < 1 or p_units > 5/i);
assert.match(rateUnits, /when 'ai_setter'[\s\S]*?v_limit := 5/i);
assert.match(rateUnits, /when 'public_search'[\s\S]*?v_limit := 10/i);
assert.match(rateUnits, /p_units <> 1/i);
assert.match(rateUnits, /least\(current_limit\.request_count \+ excluded\.request_count, v_limit \+ 1\)/i);
assert.match(rateUnits, /revoke all on function public\.nextway_consume_api_rate_limit\(text, integer\) from public, anon/i);
assert.match(rateUnits, /grant execute on function public\.nextway_consume_api_rate_limit\(text, integer\) to authenticated/i);
securityDefinerWithPinnedPath(rateUnits, "create or replace function public.nextway_consume_api_rate_limit(");
console.log("Rate limit SQL: atomic per-user counters, 5 AI generations / 10 search units, bounded input and no table access: PASS");

// Idempotency reservation: owner/admin gate, unique keys and one pending request per conversation.
assert.match(idempotency, /unique \(user_id, idempotency_key\)/i);
assert.match(idempotency, /where status = 'pending'/i);
assert.match(idempotency, /on public\.nextway_setter_generation_requests \(conversation_id\)/i);
assert.match(idempotency, /enable row level security/i);
assert.match(idempotency, /revoke all on table public\.nextway_setter_generation_requests from public, anon, authenticated/i);
const beginBody = securityDefinerWithPinnedPath(idempotency, "create or replace function public.nextway_begin_setter_generation(");
assert.match(beginBody, /auth\.uid\(\)/i);
assert.match(beginBody, /v_owner_id <> v_user_id and not v_is_admin/i);
assert.match(beginBody, /on conflict do nothing/i);
assert.match(beginBody, /for update/i);
assert.match(beginBody, /lease_expires_at > clock_timestamp\(\)/i);
assert.match(beginBody, /status = 'completed'/i);
assert.match(idempotency, /grant execute on function public\.nextway_begin_setter_generation\(uuid, uuid\) to authenticated/i);
console.log("Idempotency reservation SQL: per-user key uniqueness, global conversation lease and owner/admin authorization: PASS");

// Atomic completion: lock request + conversation, reject closed state, insert draft and cache response together.
const completeBody = securityDefinerWithPinnedPath(idempotency, "create or replace function public.nextway_complete_setter_generation(");
assert.match(completeBody, /for update/i);
assert.match(completeBody, /v_conversation_status in \('closed', 'archived'\)/i);
assert.match(completeBody, /insert into public\.nextway_setter_messages/i);
assert.match(completeBody, /'sent', false/i);
assert.match(completeBody, /'approved', false/i);
assert.match(completeBody, /set status = 'completed',[\s\S]*?response = v_response/i);
assert.match(idempotency, /grant execute on function public\.nextway_complete_setter_generation\(uuid, text, text, text, text, text\) to authenticated/i);
console.log("Idempotent completion SQL: conversation lock, closed-state guard, draft-only insert and cached response: PASS");

// Output staging/recovery: strict schema, lease and renewed authorization on every operation.
const storeBody = securityDefinerWithPinnedPath(hardening, "create or replace function public.nextway_store_setter_generation_output(");
assert.match(storeBody, /jsonb_typeof\(p_generated_output\) <> 'object'/i);
assert.match(storeBody, /p_generated_output - array\['message','strategy','objective','tone','next_step'\]/i);
assert.match(storeBody, /v_request\.lease_expires_at <= clock_timestamp\(\)/i);
assert.match(storeBody, /v_owner_id <> v_user_id and not v_is_admin/i);
assert.match(storeBody, /v_conversation_status in \('closed', 'archived'\)/i);
assert.match(storeBody, /for update/i);
const getBody = securityDefinerWithPinnedPath(hardening, "create or replace function public.nextway_get_staged_setter_output(");
assert.match(getBody, /r\.user_id = v_user_id/i);
assert.match(getBody, /r\.lease_expires_at > clock_timestamp\(\)/i);
assert.match(getBody, /v_owner_id <> v_user_id and not v_is_admin/i);
assert.match(getBody, /v_conversation_status in \('closed', 'archived'\)/i);
assert.match(hardening, /revoke all on function public\.nextway_store_setter_generation_output\(uuid, jsonb\) from public, anon/i);
assert.match(hardening, /revoke all on function public\.nextway_get_staged_setter_output\(uuid\) from public, anon/i);
assert.match(hardening, /grant execute on function public\.nextway_store_setter_generation_output\(uuid, jsonb\) to authenticated/i);
assert.match(hardening, /grant execute on function public\.nextway_get_staged_setter_output\(uuid\) to authenticated/i);
console.log("Staged output SQL: strict JSON contract, lease validation, owner/admin recheck and closed-conversation denial: PASS");

// Lease reassignment must invalidate the previous provider output.
const triggerBody = securityDefinerWithPinnedPath(staleOutput, "create or replace function public.nextway_clear_stale_setter_output()");
assert.match(triggerBody, /new\.user_id is distinct from old\.user_id/i);
assert.match(triggerBody, /new\.idempotency_key is distinct from old\.idempotency_key/i);
assert.match(triggerBody, /new\.conversation_id is distinct from old\.conversation_id/i);
assert.match(triggerBody, /new\.generated_output := null/i);
assert.match(staleOutput, /before update of user_id, idempotency_key, conversation_id/i);
assert.match(staleOutput, /revoke all on function public\.nextway_clear_stale_setter_output\(\) from public, anon, authenticated/i);
console.log("Lease reassignment trigger: stale AI output is cleared and direct client execution is revoked: PASS");

// Retention is manual and administrator-only.
const retentionBody = securityDefinerWithPinnedPath(retention, "create or replace function public.nextway_prune_setter_generation_requests()");
assert.match(retentionBody, /p\.role = 'platform_admin'/i);
assert.match(retentionBody, /if not v_is_admin then[\s\S]*?errcode = '42501'/i);
assert.match(retentionBody, /interval '30 days'/i);
assert.match(retentionBody, /interval '24 hours'/i);
assert.match(retention, /grant execute on function public\.nextway_prune_setter_generation_requests\(\) to authenticated/i);
assert.match(retention, /revoke all on function public\.nextway_prune_setter_generation_requests\(\) from public, anon/i);
assert.doesNotMatch(retention, /pg_cron|cron\.schedule/i);
console.log("Idempotency retention SQL: admin-only manual cleanup; no scheduled job: PASS");
