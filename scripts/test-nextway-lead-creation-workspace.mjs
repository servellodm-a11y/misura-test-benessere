import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261112000000_nextway_lead_creation_workspace.sql",
  "utf8",
);

for (const fn of [
  "nextway_create_lead_with_conversation_v2",
  "nextway_create_lead_with_conversation_idempotent_v2",
]) assert.match(sql, new RegExp(fn), `missing workspace-aware creation RPC: ${fn}`);

assert.match(sql, /alter table public\.nextway_lead_creation_requests\s+add column if not exists workspace_id uuid/i);
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, "SQL dollar-quoted blocks must be balanced");
assert.match(sql, /nextway_lead_creation_requests_workspace_id_fkey/i);
assert.match(sql, /v_existing_workspace_id is distinct from p_workspace_id/i);
assert.match(sql, /or v_existing_workspace_id is not null/i);
assert.match(sql, /nextway_is_platform_admin\(\)/i);
assert.match(sql, /workspace_id is obligatory|workspace è obbligatorio/i);
assert.match(sql, /from public\.nextway_workspaces w\s+where w\.id=p_workspace_id/i);
assert.match(sql, /v_workspace_status<>'active'/i);
assert.match(sql, /nextway_has_workspace_access\(/i);
assert.match(sql, /array\['workspace_owner','workspace_admin','workspace_manager','workspace_member'\]/i);
assert.match(sql, /owner_profile_id,display_name,category,source_name,source_url,public_evidence,workspace_id/i);
assert.match(sql, /lead_id,owner_profile_id,channel,objective,workspace_id/i);
assert.match(sql, /create or replace function public\.nextway_create_lead_with_conversation\(/i);
assert.match(sql, /if not public\.nextway_is_platform_admin\(\) then[\s\S]*?Seleziona un workspace operativo/i);
assert.match(sql, /security definer[\s\S]*?set search_path = pg_catalog, public/i);
assert.match(sql, /on conflict \(owner_profile_id,request_id\) do nothing/i);
assert.match(sql, /v_existing_hash is distinct from p_request_hash/i);
assert.match(sql, /completed_at=clock_timestamp\(\)/i);
assert.match(sql, /revoke all on function public\.nextway_create_lead_with_conversation_v2[\s\S]*?from public,anon,authenticated,service_role/i);
assert.doesNotMatch(sql, /grant execute on function public\.nextway_create_lead_with_conversation_v2[\s\S]*?to authenticated/i);
assert.match(sql, /revoke all on function public\.nextway_create_lead_with_conversation_idempotent_v2/i);
assert.match(sql, /grant execute on function public\.nextway_create_lead_with_conversation_idempotent_v2[\s\S]*?to authenticated/i);
assert.doesNotMatch(sql, /update public\.nextway_(leads|setter_conversations)\s/i,
  "migration must not rewrite existing Lead or conversation records");

console.log("NEXTWAY workspace-aware Lead creation SQL contract: PASS");
