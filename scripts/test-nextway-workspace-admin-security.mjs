import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const edge = readFileSync(new URL("../supabase/functions/nextway-workspace-admin/index.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/migrations/20261111200000_nextway_workspace_activation_rpc.sql", import.meta.url), "utf8");

assert.match(edge, /Deno\.serve\(async \(req\)/);
assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /profile\?\.role !== "platform_admin"/);
assert.match(edge, /NEXTWAY_SERVICE_ROLE_KEY/);
assert.match(edge, /MAX_BODY_BYTES = 100_000/);
for (const action of ["list_workspaces", "list_prompts", "list_criteria", "create_workspace", "update_workspace", "save_prompt_draft", "save_criteria_draft", "activate_prompt", "activate_criteria", "archive_prompt", "archive_criteria"]) {
  assert.ok(edge.includes(action), "Missing action " + action);
}
assert.match(edge, /nextway_activate_workspace_prompt/);
assert.match(edge, /nextway_activate_workspace_criteria/);
assert.match(edge, /status: "draft"/);
assert.match(edge, /approved_by/);
assert.doesNotMatch(edge, /approval_status:\s*"approved"/);
assert.doesNotMatch(edge, /console\.(log|error)\([^\n]*(token|serviceKey|prompt_body)/i);

for (const fn of ["nextway_activate_workspace_prompt", "nextway_activate_workspace_criteria"]) {
  assert.match(sql, new RegExp("create or replace function public\\." + fn + "\\("));
}
assert.equal((sql.match(/security definer/gi) ?? []).length, 2);
assert.equal((sql.match(/set search_path = pg_catalog, public/gi) ?? []).length, 2);
assert.equal((sql.match(/p\.role = 'platform_admin'/gi) ?? []).length, 2);
assert.match(sql, /for update/);
assert.match(sql, /set status = 'archived'/i);
assert.match(sql, /set status = 'active', approved_by = p_admin_user_id/i);
assert.match(sql, /revoke all on function public\.nextway_activate_workspace_prompt\(uuid, uuid\) from public, anon, authenticated/i);
assert.match(sql, /revoke all on function public\.nextway_activate_workspace_criteria\(uuid, uuid\) from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.nextway_activate_workspace_prompt\(uuid, uuid\) to service_role/i);
assert.match(sql, /grant execute on function public\.nextway_activate_workspace_criteria\(uuid, uuid\) to service_role/i);
assert.doesNotMatch(sql, /grant execute[^;]*authenticated/i);

console.log("NEXTWAY workspace admin: authenticated admin API, draft-only creation, atomic version activation, restricted RPC grants: PASS");
