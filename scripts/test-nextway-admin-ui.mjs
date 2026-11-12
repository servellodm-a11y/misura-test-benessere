import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("nextway-admin.html", "utf8");
const js = readFileSync("nextway-admin.js", "utf8");
const edge = readFileSync("supabase/functions/nextway-workspace-admin/index.ts", "utf8");

for (const required of [
  "nextway-cloud.js",
  "nextway-admin.js",
  "selected-workspace",
  "workspace-create",
  "membership-save",
  "knowledge-upload",
  "documents-refresh",
  "knowledge-search",
]) {
  assert.ok(html.includes(required), "Admin page missing " + required);
}

for (const action of [
  "list_workspaces",
  "create_workspace",
  "update_workspace",
  "list_profiles",
  "list_memberships",
  "set_membership",
  "list_documents",
  "approve_document",
  "reject_document",
]) {
  assert.ok(js.includes('action: "' + action + '"'), "Admin UI missing action " + action);
  assert.ok(edge.includes('action === "' + action + '"'), "Admin API missing action " + action);
}

assert.match(js, /\/functions\/v1\/nextway-workspace-admin/);
assert.match(js, /\/functions\/v1\/nextway-knowledge-upload/);
assert.match(js, /rpc\("nextway_search_knowledge"/);
assert.match(js, /textContent/);
assert.doesNotMatch(js, /\.innerHTML\s*=/, "Untrusted admin data must not be rendered through innerHTML");
assert.doesNotMatch(js, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i, "Service-role credentials must never appear in browser code");
assert.match(js, /Nessuna email o invito è stato inviato/);
assert.match(edge, /profile\?\.role !== "platform_admin"/);
assert.match(edge, /auth\.admin\.getUserById\(body\.user_id\)/);
assert.match(edge, /approval_status: "approved"/);
assert.match(edge, /approval_status: "rejected"/);

console.log("NEXTWAY platform admin UI: workspace, membership, Knowledge Base, safe rendering and server-side admin gate: PASS");
