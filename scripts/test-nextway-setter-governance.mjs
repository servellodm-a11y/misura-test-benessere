import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20261112030000_nextway_setter_governance_read_rpc.sql",
  "utf8",
);
const membership = readFileSync(
  "supabase/migrations/20261111220000_nextway_workspace_memberships.sql",
  "utf8",
);
const edge = readFileSync(
  "supabase/functions/nextway-ai-setter/index.ts",
  "utf8",
);

// RPC boundary: authenticated caller, explicit workspace, narrow role allowlist,
// SECURITY DEFINER with a fixed search_path and no anonymous execution.
assert.match(migration, /nextway_get_active_setter_governance\\s*\\(/i);
assert.match(migration, /security definer[\\s\\S]*?set search_path = pg_catalog, public/i);
assert.match(migration, /auth\\.uid\\(\\) is null/i);
assert.match(migration, /p_workspace_id is null/i);
assert.match(migration, /nextway_has_workspace_access\\s*\\(/i);
for (const role of ["workspace_owner", "workspace_admin", "workspace_manager", "workspace_member"]) {
  assert.ok(migration.includes("'" + role + "'"), "RPC missing allowed role " + role);
}
assert.doesNotMatch(migration, /workspace_viewer/i, "read-only viewers must not receive Setter governance access");
assert.match(migration, /where workspace_id = p_workspace_id[\\s\\S]*?and status = 'active'/i);
assert.match(migration, /revoke all on function public\\.nextway_get_active_setter_governance\\(uuid\\)[\\s\\S]*?from public, anon/i);
assert.match(migration, /grant execute on function public\\.nextway_get_active_setter_governance\\(uuid\\)[\\s\\S]*?to authenticated/i);
assert.doesNotMatch(migration, /grant execute[\\s\\S]*?to anon/i);

// Verify the helper called by the RPC actually enforces current membership,
// active workspace state and the caller's user id (not just its function name).
assert.match(membership, /create or replace function public\\.nextway_has_workspace_access/i);
assert.match(membership, /auth\\.uid\\(\\) is not null/i);
assert.match(membership, /m\\.user_id = auth\\.uid\\(\\)/i);
assert.match(membership, /m\\.membership_status = 'active'/i);
assert.match(membership, /w\\.status = 'active'/i);
assert.match(membership, /m\\.workspace_role = any/i);
assert.match(membership, /public\\.nextway_is_platform_admin\\(\\)/i);

// Edge integration: fetches governance for the conversation's workspace before
// claiming generation; failure must stop generation and avoid a provider call.
assert.match(edge, /objective, workspace_id/);
assert.match(edge, /nextway_get_active_setter_governance/);
assert.match(edge, /Istruzioni e criteri del workspace temporaneamente non disponibili/);
assert.match(edge, /qualification_criteria:\\s*activeQualificationCriteria/);
assert.match(edge, /approvedWorkspaceInstructions/);
assert.ok(edge.includes("String(item.prompt_body).slice(0, 6000)"));
assert.ok(edge.includes("serializedConfig.length <= 5000"));
assert.match(edge, /mancanti e proporre una domanda utile/);
assert.match(edge, /Non inviarla: deve rimanere una bozza/);
assert.ok(
  edge.indexOf("nextway_get_active_setter_governance") <
    edge.indexOf("nextway_begin_setter_generation"),
  "Governance authorization must run before the idempotency claim",
);

console.log("NEXTWAY AI Setter approved workspace governance contract: PASS");
