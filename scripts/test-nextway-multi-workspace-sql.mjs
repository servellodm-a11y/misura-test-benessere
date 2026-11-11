import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  new URL("../supabase/migrations/20261111190000_nextway_multi_workspace_foundation.sql", import.meta.url),
  "utf8",
);

for (const table of [
  "nextway_workspaces",
  "nextway_workspace_prompts",
  "nextway_workspace_prospect_criteria",
]) {
  assert.match(sql, new RegExp("create table if not exists public\\." + table, "i"));
  assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security", "i"));
  assert.match(sql, new RegExp("revoke all on public\\." + table + " from public, anon", "i"));
  assert.match(sql, new RegExp("public\\.nextway_is_platform_admin\\(\\)", "i"));
}
assert.match(sql, /workspace_key text not null unique/i);
assert.match(sql, /settings jsonb not null default '\{\}'::jsonb/i);
assert.match(sql, /unique \(workspace_id, prompt_key, version\)/i);
assert.match(sql, /unique \(workspace_id, criteria_key, version\)/i);
assert.match(sql, /where status = 'active'/i);
assert.match(sql, /approved_by is not null and approved_at is not null/i);
assert.match(sql, /config jsonb not null default '\{\}'::jsonb/i);
assert.match(sql, /grant select, insert, update, delete on public\.nextway_workspaces to authenticated, service_role/i);
assert.doesNotMatch(sql, /insert into public\.nextway_workspaces/i);
assert.doesNotMatch(sql, /alter table public\.(nextway_leads|nextway_knowledge_documents|nextway_knowledge_chunks)/i);
assert.doesNotMatch(sql, /service_role_key|create extension/i);
assert.match(sql, /begin;[\s\S]*commit;/i);

console.log("NEXTWAY multi-workspace SQL: isolated workspace registry, versioned prompts/criteria, admin-only RLS, no seed or operational-table mutation: PASS");
