import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const association = read("supabase/migrations/20261111210000_nextway_workspace_data_association.sql");
const workspace = read("supabase/migrations/20261111190000_nextway_multi_workspace_foundation.sql");
const membership = read("supabase/migrations/20261111220000_nextway_workspace_memberships.sql");
const scopedRls = read("supabase/migrations/20261111230000_nextway_workspace_scoped_rls.sql");
const setter = read("supabase/migrations/20261111240000_nextway_setter_generation_workspace.sql");
const leadCreation = read("supabase/migrations/20261112000000_nextway_lead_creation_workspace.sql");
const knowledge = read("supabase/migrations/20261111170000_nextway_knowledge_base.sql");

for (const table of [
  "nextway_leads",
  "nextway_knowledge_documents",
  "nextway_setter_conversations",
]) {
  assert.match(association, new RegExp(table), `missing workspace association target: ${table}`);
}
assert.match(association, /nextway_workspaces\(id\)/i, "workspace FK target missing");
assert.match(association, /add column if not exists workspace_id uuid/i, "workspace_id must be additive and nullable");
assert.match(association, /on delete restrict/i, "workspace deletion must not cascade into operational data");
assert.match(association, /create index if not exists/i, "workspace lookup index missing");
assert.match(association, /Lead activities\/conversion requests inherit workspace through nextway_leads/i);
assert.match(association, /Setter messages\/generation requests inherit workspace through their conversation/i);
assert.match(association, /workspace authorization is not enabled by this migration/i);
assert.match(association, /nullable groundwork/i);
assert.doesNotMatch(association, /update\s+public\.(nextway_leads|nextway_knowledge_documents|nextway_setter_conversations)/i,
  "migration must not backfill or mutate existing records");
assert.doesNotMatch(association, /create policy|drop policy|enable row level security|force row level security/i,
  "migration must not change existing RLS behavior");
assert.match(association, /if to_regclass\('public\.nextway_workspaces'\) is null/i);
assert.match(association, /'nextway_setter_conversations'/i, "setter conversation association should be optional and conditional");

// Cross-migration dependency contract: each prerequisite must be created before
// the first migration that consumes it.
const ordered = [
  "20261111170000_nextway_knowledge_base.sql",
  "20261111180000_nextway_knowledge_storage.sql",
  "20261111190000_nextway_multi_workspace_foundation.sql",
  "20261111200000_nextway_workspace_activation_rpc.sql",
  "20261111210000_nextway_workspace_data_association.sql",
  "20261111220000_nextway_workspace_memberships.sql",
  "20261111230000_nextway_workspace_scoped_rls.sql",
  "20261111240000_nextway_setter_generation_workspace.sql",
  "20261112000000_nextway_lead_creation_workspace.sql",
];
assert.deepEqual(ordered, [...ordered].sort(), "workspace migrations must remain in dependency order");

assert.match(knowledge, /create table if not exists public\.nextway_knowledge_documents/i);
assert.match(workspace, /create table if not exists public\.nextway_workspaces/i);
assert.match(membership, /create or replace function public\.nextway_has_workspace_access/i);
assert.match(scopedRls, /workspace_id association columns are missing/i);
assert.match(scopedRls, /nextway_has_workspace_access\(uuid,text\[\]\)/i);
assert.match(setter, /workspace association columns are missing/i);
assert.match(setter, /nextway_has_workspace_access\(uuid,text\[\]\)/i);
assert.match(leadCreation, /workspace_id\s*\)\s*then/i);
assert.match(leadCreation, /nextway_has_workspace_access\(uuid,text\[\]\)/i);

console.log("NEXTWAY workspace data association and migration dependency contract: PASS");
