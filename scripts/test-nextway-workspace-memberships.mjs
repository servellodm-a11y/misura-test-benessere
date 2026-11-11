import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261111220000_nextway_workspace_memberships.sql",
  "utf8",
);

assert.match(sql, /create table if not exists public\.nextway_workspace_memberships/i);
assert.match(sql, /references public\.nextway_workspaces\(id\) on delete restrict/i);
assert.match(sql, /references auth\.users\(id\) on delete restrict/i);
assert.match(sql, /workspace_role text not null[\s\S]*?workspace_owner[\s\S]*?workspace_admin[\s\S]*?workspace_manager[\s\S]*?workspace_member[\s\S]*?workspace_viewer/i);
assert.match(sql, /membership_status text not null[\s\S]*?invited[\s\S]*?active[\s\S]*?suspended/i);
assert.match(sql, /unique \(workspace_id, user_id\)/i);
assert.match(sql, /nextway_workspace_one_owner_uidx/i);
assert.match(sql, /alter table public\.nextway_workspace_memberships enable row level security/i);
assert.match(sql, /nextway_workspace_memberships_admin_all[\s\S]*?nextway_is_platform_admin\(\)/i);
assert.match(sql, /nextway_workspace_memberships_self_read[\s\S]*?user_id = auth\.uid\(\)/i);
assert.match(sql, /create or replace function public\.nextway_has_workspace_access/i);
assert.match(sql, /membership_status = 'active'/i);
assert.match(sql, /workspace_role = any/i);
assert.match(sql, /create or replace function public\.nextway_can_manage_workspace/i);
assert.match(sql, /array\['workspace_owner', 'workspace_admin'\]/i);
assert.match(sql, /revoke all on function public\.nextway_has_workspace_access\(uuid, text\[\]\) from public, anon/i);
assert.match(sql, /grant execute on function public\.nextway_has_workspace_access\(uuid, text\[\]\) to authenticated, service_role/i);
assert.doesNotMatch(sql, /insert into public\.nextway_workspace_memberships/i, "migration must not seed memberships");
assert.doesNotMatch(sql, /create policy.*nextway_leads|create policy.*nextway_knowledge_documents|create policy.*nextway_setter/i,
  "membership foundation must not alter operational RLS before coordinated migration");

console.log("NEXTWAY workspace membership static contract: PASS");
