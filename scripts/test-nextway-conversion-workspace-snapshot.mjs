import fs from "node:fs";
import assert from "node:assert/strict";

const snapshot = fs.readFileSync("supabase/migrations/20261113120000_nextway_conversion_request_workspace_snapshot.sql", "utf8");
const finalize = fs.readFileSync("supabase/migrations/20261113130000_nextway_conversion_workspace_finalization.sql", "utf8");
const cloud = fs.readFileSync("nextway-cloud.js", "utf8");
const edge = fs.readFileSync("supabase/functions/nextway-conversion-provisioning/index.ts", "utf8");

const checks = [
  ["workspace snapshot column with RESTRICT FK", /add column if not exists workspace_id uuid[\s\S]*references public\.nextway_workspaces\(id\) on delete restrict/i.test(snapshot)],
  ["server-side Lead lock at request creation", /from public\.nextway_leads l[\s\S]*for update/i.test(snapshot)],
  ["workspace derived from locked Lead", /v_lead\.workspace_id[\s\S]*workspace_id/i.test(snapshot)],
  ["active membership with explicit allowed roles", /nextway_has_workspace_access\([\s\S]*workspace_owner[\s\S]*workspace_member/i.test(snapshot)],
  ["viewer excluded from conversion proposal", !/array\[[^\]]*workspace_viewer/i.test(snapshot)],
  ["direct authenticated INSERT revoked", /revoke insert on table public\.nextway_lead_conversion_requests from authenticated/i.test(snapshot)],
  ["snapshot immutable in request guard", /new\.workspace_id is distinct from old\.workspace_id/i.test(snapshot)],
  ["browser uses creation RPC", /rpc\('nextway_create_lead_conversion_request'/i.test(cloud)],
  ["browser does not supply workspace_id", !/p_workspace_id\s*:/i.test(cloud)],
  ["request detail and queue read workspace_id", cloud.includes("created_by,workspace_id,conversion_type") && cloud.includes("lead_id,workspace_id,conversion_type")],
  ["admin queue resolves workspace name", /workspace:nextway_workspaces\(name,partner_name\)/i.test(cloud) && cloud.includes("Workspace: ' + workspaceLabel")],
  ["finalizer locks conversion request", /from public\.nextway_lead_conversion_requests[\s\S]*for update/i.test(finalize)],
  ["finalizer locks and validates Lead", /from public\.nextway_leads[\s\S]*for update/i.test(finalize) && /l\.workspace_id is distinct from r\.workspace_id/i.test(finalize)],
  ["Auth invite bound to conversion request metadata", /raw_user_meta_data ->> 'nextway_conversion_request_id' = r\.id::text/i.test(finalize)],
  ["existing profiles are not blindly upserted", !/on conflict\s*\(id\)\s*do update/i.test(finalize)],
  ["existing partner details are not blindly upserted", !/on conflict\s*\(profile_id\)\s*do update/i.test(finalize)],
  ["partner gets invited membership", /'workspace_member', 'invited', r\.owner_profile_id/i.test(finalize)],
  ["customer workspace attribution created", /insert into public\.nextway_client_workspace_attributions/i.test(finalize)],
  ["attribution table has no direct authenticated grants", /revoke all on table public\.nextway_client_workspace_attributions from public, anon, authenticated, service_role/i.test(finalize)],
  ["workspace client projection excludes viewer", /nextway_has_workspace_access\([\s\S]*workspace_owner[\s\S]*workspace_member/i.test(finalize) && !/array\[[^\]]*workspace_viewer/i.test(finalize)],
  ["Edge Function binds Auth invite to request", /nextway_conversion_request_id: requestId/i.test(edge)],
  ["Edge Function does not accept workspace_id", !/body\.workspace_id/i.test(edge)],
];

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} | ${name}`);
}
assert.ok(checks.every(([, passed]) => passed), "NEXTWAY conversion workspace static checks failed");
console.log(`\nNEXTWAY conversion workspace: ${checks.filter(([, passed]) => passed).length}/${checks.length} static checks passed.`);
