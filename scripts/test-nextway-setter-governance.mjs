import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20261112030000_nextway_setter_governance_read_rpc.sql",
  "utf8",
);
const edge = readFileSync(
  "supabase/functions/nextway-ai-setter/index.ts",
  "utf8",
);

assert.match(migration, /nextway_get_active_setter_governance\s*\(/i);
assert.match(migration, /security definer[\s\S]*?set search_path = pg_catalog, public/i);
assert.match(migration, /nextway_has_workspace_access\s*\(/i);
assert.match(migration, /status = 'active'/i);
assert.doesNotMatch(migration, /workspace_viewer/i, 'read-only viewers must not receive Setter governance access');
assert.match(migration, /revoke all on function public\.nextway_get_active_setter_governance\(uuid\)[\s\S]*?from public, anon/i);
assert.match(migration, /grant execute on function public\.nextway_get_active_setter_governance\(uuid\)[\s\S]*?to authenticated/i);
assert.doesNotMatch(migration, /grant execute[\s\S]*?to anon/i);

assert.match(edge, /objective, workspace_id/);
assert.match(edge, /nextway_get_active_setter_governance/);
assert.match(edge, /Istruzioni e criteri del workspace temporaneamente non disponibili/);
assert.match(edge, /qualification_criteria:\s*activeQualificationCriteria/);
assert.match(edge, /approvedWorkspaceInstructions/);
assert.ok(edge.includes("mancanti e proporre una domanda utile"));
assert.match(edge, /Non inviarla: deve rimanere una bozza/);

console.log("NEXTWAY AI Setter approved workspace governance contract: PASS");
