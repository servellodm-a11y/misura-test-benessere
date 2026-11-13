import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20261113120000_nextway_conversion_request_workspace_snapshot.sql", "utf8");
const cloud = fs.readFileSync("nextway-cloud.js", "utf8");

const checks = [
  ["workspace snapshot column", /add column if not exists workspace_id uuid[\s\S]*references public\.nextway_workspaces\(id\) on delete restrict/i.test(migration)],
  ["server-side lead lock", /from public\.nextway_leads l[\s\S]*for update/i.test(migration)],
  ["workspace derived from locked lead", /v_lead\.workspace_id[\s\S]*workspace_id/i.test(migration)],
  ["active membership and allowed roles", /nextway_has_workspace_access\([\s\S]*workspace_owner[\s\S]*workspace_member/i.test(migration)],
  ["viewer excluded from conversion proposal", !/array\[[^\]]*workspace_viewer/i.test(migration)],
  ["direct authenticated INSERT revoked", /revoke insert on table public\.nextway_lead_conversion_requests from authenticated/i.test(migration)],
  ["snapshot immutable in guard", /new\.workspace_id is distinct from old\.workspace_id/i.test(migration)],
  ["browser uses creation RPC", /rpc\('nextway_create_lead_conversion_request'/i.test(cloud)],
  ["browser does not send workspace_id to creation RPC", /p_workspace_id\s*:/i.test(cloud) === false],
  ["request reads include workspace_id", /select\([^\n]*workspace_id[^\n]*\)[\s\S]*\.eq\('id',requestId\)/i.test(cloud)],
];

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} | ${name}`);
}
assert.ok(checks.every(([, passed]) => passed), "NEXTWAY workspace snapshot static checks failed");
console.log(`\nNEXTWAY conversion workspace snapshot: ${checks.length}/${checks.length} static checks passed.`);
