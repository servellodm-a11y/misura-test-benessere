import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const legacy = read("supabase/migrations/20261110000200_nextway_setter_idempotency.sql");
const recovery = read("supabase/migrations/20261110000500_nextway_setter_output_recovery.sql");
const oldTrigger = read("supabase/migrations/20261110000700_nextway_clear_stale_staged_output.sql");
const workspaceFoundation = read("supabase/migrations/20261111240000_nextway_setter_generation_workspace.sql");
const isolation = read("supabase/migrations/20261112020000_nextway_setter_generation_table_isolation.sql");
const fix = read("supabase/migrations/20261113150000_nextway_setter_stale_output_trigger_workspace_fix.sql");

const legacyCreate = legacy.match(/create table if not exists public\.nextway_setter_generation_requests\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
assert.match(legacyCreate, /user_id uuid/i);
assert.match(legacyCreate, /idempotency_key uuid/i);
assert.match(legacyCreate, /conversation_id uuid/i);
assert.match(recovery, /alter table public\.nextway_setter_generation_requests[\s\S]*add column if not exists generated_output jsonb/i);
assert.match(oldTrigger, /new\.user_id is distinct from old\.user_id[\s\S]*new\.generated_output := null/i);
assert.match(oldTrigger, /create trigger nextway_clear_stale_setter_output_trg[\s\S]*?on public\.nextway_setter_generation_requests/i);

const workspaceCreate = isolation.match(/create table if not exists public\.nextway_setter_workspace_generation_requests\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
assert.match(workspaceCreate, /owner_profile_id uuid/i);
assert.match(workspaceCreate, /idempotency_key uuid/i);
assert.match(workspaceCreate, /conversation_id uuid/i);
assert.match(workspaceCreate, /generated_output jsonb/i);
assert.match(workspaceFoundation, /create table if not exists public\.nextway_setter_generation_requests/i);

assert.match(fix, /drop trigger if exists nextway_clear_stale_setter_output_trg[\s\S]*?on public\.nextway_setter_generation_requests/i);
assert.match(fix, /create or replace function public\.nextway_clear_stale_workspace_setter_output\(\)/i);
assert.match(fix, /new\.owner_profile_id is distinct from old\.owner_profile_id/i);
assert.match(fix, /new\.idempotency_key is distinct from old\.idempotency_key/i);
assert.match(fix, /new\.conversation_id is distinct from old\.conversation_id/i);
assert.match(fix, /new\.generated_output := null/i);
assert.match(fix, /create trigger nextway_clear_stale_workspace_setter_output_trg[\s\S]*?on public\.nextway_setter_workspace_generation_requests/i);
assert.match(fix, /revoke all on function public\.nextway_clear_stale_workspace_setter_output\(\)[\s\S]*?from public, anon, authenticated/i);
assert.doesNotMatch(fix, /drop table|truncate table|delete from/i);

console.log("NEXTWAY stale Setter output trigger migration contract: PASS");
console.log("The historical trigger matches the original legacy schema; the forward-only migration retires it after table isolation and installs the guard on the workspace store.");
console.log("Static only: PostgreSQL migration and trigger behavior remain unexecuted.");
