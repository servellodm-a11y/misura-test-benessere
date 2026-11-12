import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20261112020000_nextway_setter_generation_table_isolation.sql",
  "utf8",
);
const original = readFileSync(
  "supabase/migrations/20261111240000_nextway_setter_generation_workspace.sql",
  "utf8",
);
const legacy = readFileSync(
  "supabase/migrations/20261110000200_nextway_setter_idempotency.sql",
  "utf8",
);

const table = "nextway_setter_workspace_generation_requests";
assert.match(migration, new RegExp("create table if not exists public\\." + table));
assert.match(migration, /revoke all on public\.nextway_setter_workspace_generation_requests from public, anon, authenticated, service_role/i);
assert.match(migration, /unique \(owner_profile_id,idempotency_key\)/i);
assert.match(migration, /status text not null default 'generating'/i);

for (const fn of [
  "nextway_begin_setter_generation",
  "nextway_store_setter_generation_output",
  "nextway_get_staged_setter_output",
  "nextway_complete_setter_generation",
]) {
  const start = migration.indexOf("create or replace function public." + fn + "(");
  assert.ok(start >= 0, "Missing replacement RPC: " + fn);
  const next = migration.indexOf("create or replace function public.", start + 30);
  const body = migration.slice(start, next < 0 ? migration.length : next);
  assert.match(body, new RegExp(table), fn + " must use the isolated workspace table");
  assert.doesNotMatch(body, /public\.nextway_setter_generation_requests\b/,
    fn + " must not access the legacy table");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = pg_catalog, public/i);
}

assert.match(migration, /nextway_has_workspace_access\(/i);
assert.match(migration, /array\['workspace_owner','workspace_admin','workspace_manager','workspace_member'\]/i);
assert.match(migration, /grant execute on function public\.nextway_begin_setter_generation\(uuid,uuid\) to authenticated/i);
assert.match(migration, /grant execute on function public\.nextway_complete_setter_generation\(uuid,text,text,text,text,text\) to authenticated/i);
assert.match(migration, /nextway_prune_workspace_setter_generation_requests/i);
assert.match(migration, /p\.role='platform_admin'/i);
assert.match(migration, /interval '30 days'/i);
assert.match(migration, /interval '24 hours'/i);
assert.doesNotMatch(migration, /drop table|truncate table|delete from public\.nextway_setter_generation_requests/i);
assert.match(original, /create table if not exists public\.nextway_setter_generation_requests/i);
assert.match(legacy, /create table if not exists public\.nextway_setter_generation_requests/i);
assert.equal((migration.match(/\$\$/g) || []).length % 2, 0, "SQL dollar-quoted blocks must be balanced");

console.log("NEXTWAY AI Setter legacy/workspace idempotency table isolation: PASS");
