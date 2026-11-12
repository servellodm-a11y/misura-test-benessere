import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const edge = readFileSync(new URL("../supabase/functions/nextway-workspace-admin/index.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/migrations/20261111200000_nextway_workspace_activation_rpc.sql", import.meta.url), "utf8");

// CORS regression guard: local admin development must receive an explicit origin
// on both the OPTIONS preflight and the authenticated POST response.
assert.ok(edge.includes('"http://localhost:8000"'), "Local NEXTWAY admin origin must be allow-listed");
assert.match(edge, /\.\.\.configuredOrigins/);
assert.match(edge, /req\.method === "OPTIONS"[\s\S]*?respond\(\{\}, 200, origin\)/);
assert.match(edge, /Access-Control-Allow-Origin/);
assert.match(edge, /allowedOrigins\.includes\(origin\)/);

assert.match(edge, /Deno\.serve\(async \(req\)/);
assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /profile\?\.role !== "platform_admin"/);
assert.match(edge, /NEXTWAY_SERVICE_ROLE_KEY/);
assert.match(edge, /MAX_BODY_BYTES = 100_000/);
for (const action of ["list_workspaces", "list_profiles", "list_memberships", "set_membership", "list_documents", "approve_document", "reject_document", "list_prompts", "list_criteria", "create_workspace", "update_workspace", "save_prompt_draft", "save_criteria_draft", "activate_prompt", "activate_criteria", "archive_prompt", "archive_criteria"]) {
  assert.ok(edge.includes(action), "Missing action " + action);
}
assert.match(edge, /nextway_activate_workspace_prompt/);
assert.match(edge, /nextway_activate_workspace_criteria/);
assert.match(edge, /nextway_workspace_memberships/);
assert.match(edge, /action === "list_profiles"/);
assert.match(edge, /select\("id,role,full_name"\)/);
assert.match(edge, /select\("profile_id,first_name,last_name"\)/);
assert.doesNotMatch(edge, /select\([^\n]*email[^\n]*\)/i, "admin profile directory must not expose email addresses");

assert.match(edge, /auth\.admin\.getUserById\(body\.user_id\)/);
assert.match(edge, /onConflict: "workspace_id,user_id"/);
assert.match(edge, /membership_status === "active"/);
assert.match(edge, /workspace\.status !== "active"/);
assert.match(edge, /workspace_owner[\s\S]*?workspace_admin[\s\S]*?workspace_manager[\s\S]*?workspace_member[\s\S]*?workspace_viewer/);
assert.match(edge, /invited[\s\S]*?active[\s\S]*?suspended/);
assert.match(edge, /Esiste già un owner attivo o invitato/);
assert.match(edge, /nextway_knowledge_documents/);
assert.match(edge, /approval_status: "approved"/);
assert.match(edge, /approval_status: "rejected"/);
assert.match(edge, /approved_by: authData\.user\.id/);
assert.match(edge, /validText\(body\.reason, 5, 1000\)/);
assert.match(edge, /\.eq\("approval_status", "pending"\)/);

assert.match(edge, /status: "draft"/);
assert.match(edge, /approved_by/);
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
