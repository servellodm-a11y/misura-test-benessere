import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261111240000_nextway_setter_generation_workspace.sql",
  "utf8",
);

for (const name of [
  "nextway_setter_generation_requests",
  "nextway_begin_setter_generation",
  "nextway_store_setter_generation_output",
  "nextway_get_staged_setter_output",
  "nextway_complete_setter_generation",
]) assert.match(sql, new RegExp(name), `missing AI Setter generation component: ${name}`);

assert.match(sql, /workspace_id association columns are missing/i);
assert.match(sql, /nextway_has_workspace_access\(/i);
assert.match(sql, /array\['workspace_owner','workspace_admin','workspace_manager','workspace_member'\]/i);
assert.match(sql, /security definer[\s\S]*?set search_path = pg_catalog, public/i);
assert.match(sql, /unique \(owner_profile_id,idempotency_key\)/i);
assert.match(sql, /for update/i);
assert.match(sql, /interval '2 minutes'/i);
assert.match(sql, /generated_output jsonb/i);
assert.match(sql, /cached_response jsonb/i);
assert.match(sql, /status='completed'/i);
assert.match(sql, /direction,content,message_type,ai_generated/i);
assert.match(sql, /'outgoing'.*'text'.*true/is);
assert.match(sql, /last_message_at=clock_timestamp\(\)/i);
assert.match(sql, /new\.workspace_id is distinct from v_workspace_id/i);
assert.match(sql, /revoke all on public\.nextway_setter_generation_requests from public, anon, authenticated/i);
assert.doesNotMatch(sql, /insert into public\.nextway_(leads|setter_conversations|setter_messages)\s*\(/i,
  "migration must not create application records during installation");
assert.doesNotMatch(sql, /update public\.nextway_(leads|setter_messages)\s/i,
  "migration must not backfill or rewrite application records");

console.log("NEXTWAY AI Setter generation workspace SQL contract: PASS");
