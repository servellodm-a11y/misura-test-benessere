import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261111230000_nextway_workspace_scoped_rls.sql",
  "utf8",
);

for (const table of [
  "nextway_leads",
  "nextway_lead_activities",
  "nextway_lead_conversion_requests",
  "nextway_lead_audit_logs",
  "nextway_knowledge_documents",
  "nextway_knowledge_chunks",
]) {
  assert.match(sql, new RegExp(table), `missing workspace RLS target: ${table}`);
}
assert.match(sql, /as restrictive\s+for all to authenticated/i);
assert.match(sql, /as permissive\s+for select to authenticated/i);
assert.match(sql, /to_regprocedure\('public\.nextway_has_workspace_access\(uuid,text\[\]\)'\)/i);
assert.match(sql, /c\.relrowsecurity/i);
assert.match(sql, /workspace_id association columns are missing/i);
assert.match(sql, /nextway_has_workspace_access\(workspace_id\)/i);
assert.match(sql, /nextway_is_platform_admin\(\)/i);
assert.match(sql, /nextway_guard_lead_workspace_assignment/i);
assert.match(sql, /Solo platform_admin può trasferire un Lead tra workspace/i);
assert.match(sql, /workspace_id is null or public\.nextway_has_workspace_access/i);
assert.match(sql, /workspace_id is not null\s+and public\.nextway_has_workspace_access/i);
assert.match(sql, /alter table public\.nextway_lead_audit_logs\s+add column if not exists workspace_id uuid/i);
assert.match(sql, /v_after_full - 'notes' - 'public_evidence'/i);
assert.match(sql, /v_before_full - 'notes' - 'public_evidence'/i);
assert.match(sql, /nextway_search_knowledge\(text, text, text, integer\)[\s\S]*?from public, anon, authenticated, service_role/i);
assert.match(sql, /nextway_search_knowledge\(uuid, text, text, text, integer\)/i);
assert.match(sql, /d\.workspace_id = p_workspace_id/i);
assert.match(sql, /public\.nextway_has_workspace_access\(p_workspace_id\)/i);
assert.doesNotMatch(sql, /update\s+public\.(nextway_leads|nextway_knowledge_documents|nextway_lead_audit_logs)/i,
  "migration must not backfill or rewrite existing application records");
assert.doesNotMatch(sql, /nextway_setter_conversations|nextway_setter_messages/i,
  "setter RLS must wait for the authoritative table/foreign-key schema");
assert.doesNotMatch(sql, /insert into public\.nextway_workspace_memberships/i,
  "migration must not create memberships");

console.log("NEXTWAY workspace-scoped RLS static contract: PASS");
