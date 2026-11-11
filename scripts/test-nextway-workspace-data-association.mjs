import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261111210000_nextway_workspace_data_association.sql",
  "utf8",
);

for (const table of [
  "nextway_leads",
  "nextway_knowledge_documents",
  "nextway_setter_conversations",
]) {
  assert.match(sql, new RegExp(table), `missing workspace association target: ${table}`);
}
assert.match(sql, /nextway_workspaces\(id\)/i, "workspace FK target missing");
assert.match(sql, /add column if not exists workspace_id uuid/i, "workspace_id must be additive and nullable");
assert.match(sql, /on delete restrict/i, "workspace deletion must not cascade into operational data");
assert.match(sql, /create index if not exists/i, "workspace lookup index missing");
assert.match(sql, /activities\/conversion requests inherit workspace through nextway_leads/i);
assert.match(sql, /setter messages\/generation requests inherit workspace through their conversation/i);
assert.match(sql, /workspace authorization is not enabled by this migration/i);
assert.match(sql, /nullable groundwork/i);
assert.doesNotMatch(sql, /update\s+public\.(nextway_leads|nextway_knowledge_documents|nextway_setter_conversations)/i,
  "migration must not backfill or mutate existing records");
assert.doesNotMatch(sql, /create policy|drop policy|enable row level security|force row level security/i,
  "migration must not change existing RLS behavior");
assert.match(sql, /if to_regclass\('public\.nextway_workspaces'\) is null/i);
assert.match(sql, /'nextway_setter_conversations'/i, "setter conversation association should be optional and conditional");

console.log("NEXTWAY workspace data association static contract: PASS");
