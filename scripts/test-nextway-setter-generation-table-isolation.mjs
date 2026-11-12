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
assert.ok(migration.includes("create table if not exists public." + table));
assert.ok(migration.includes("revoke all on public." + table + " from public, anon, authenticated, service_role"));
assert.ok(migration.includes("unique (owner_profile_id,idempotency_key)"));
assert.ok(migration.includes("status text not null default 'generating'"));

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
  assert.ok(body.includes(table), fn + " must use the isolated workspace table");
  assert.ok(!body.includes("public.nextway_setter_generation_requests"),
    fn + " must not access the legacy table");
  assert.ok(body.includes("security definer"));
  assert.ok(body.includes("set search_path = pg_catalog, public"));
}

assert.ok(migration.includes("nextway_has_workspace_access("));
assert.ok(migration.includes("array['workspace_owner','workspace_admin','workspace_manager','workspace_member']"));
assert.ok(migration.includes("grant execute on function public.nextway_begin_setter_generation(uuid,uuid) to authenticated"));
assert.ok(migration.includes("grant execute on function public.nextway_complete_setter_generation(uuid,text,text,text,text,text) to authenticated"));
assert.ok(migration.includes("nextway_prune_workspace_setter_generation_requests"));
assert.ok(migration.includes("p.role='platform_admin'"));
assert.ok(migration.includes("interval '30 days'"));
assert.ok(migration.includes("interval '24 hours'"));
assert.ok(!migration.includes("drop table"));
assert.ok(!migration.includes("truncate table"));
assert.ok(!migration.includes("delete from public.nextway_setter_generation_requests"));
assert.ok(original.includes("create table if not exists public.nextway_setter_generation_requests"));
assert.ok(legacy.includes("create table if not exists public.nextway_setter_generation_requests"));
assert.equal((migration.match(/\$\$/g) || []).length % 2, 0, "SQL dollar-quoted blocks must be balanced");

console.log("NEXTWAY AI Setter legacy/workspace idempotency table isolation: PASS");
