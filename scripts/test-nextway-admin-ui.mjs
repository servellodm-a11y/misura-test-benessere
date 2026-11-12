import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("nextway-admin.html", "utf8");
const js = readFileSync("nextway-admin.js", "utf8");
const edge = readFileSync("supabase/functions/nextway-workspace-admin/index.ts", "utf8");

// Creating a workspace is a database write: never prefill a real organization.
assert.match(html, /La creazione registra un nuovo workspace nel database/);
assert.match(html, /name="name" required maxlength="160" placeholder="Es\. Zinzino Italia"/);
assert.match(html, /name="workspace_key" required maxlength="80" pattern="\[a-z0-9\]\[a-z0-9_-\]\{1,79\}" placeholder="Es\. zinzino-italia"/);
assert.match(html, /name="market_country" maxlength="120" placeholder="Es\. Italia"/);
assert.doesNotMatch(html, /name="(?:name|workspace_key|market_country)"[^>]*\bvalue=/, "workspace creation fields must not be prefilled");


for (const required of [
  "nextway-cloud.js",
  "nextway-admin.js",
  "selected-workspace",
  "workspace-create",
  "membership-save",
  "knowledge-upload",
  "documents-refresh",
  "knowledge-search",
  "prompt-create",
  "criteria-create",
  "prompt-list",
  "criteria-list",
  "governance-refresh",
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
  "list_prompts",
  "list_criteria",
  "save_prompt_draft",
  "save_criteria_draft",
  "activate_prompt",
  "activate_criteria",
  "archive_prompt",
  "archive_criteria",
]) {
  assert.ok(js.includes('"' + action + '"' ), "Admin UI missing action " + action);
  assert.ok(edge.includes('action === "' + action + '"'), "Admin API missing action " + action);
}

assert.match(js, /\/functions\/v1\/nextway-workspace-admin/);
assert.match(js, /\/functions\/v1\/nextway-knowledge-upload/);
assert.match(js, /rpc\("nextway_search_knowledge"/);
assert.match(js, /JSON\.parse\(values\.config/);
assert.match(js, /renderGovernanceItems/);
assert.match(js, /status === "draft"/);
assert.match(js, /textContent/);
assert.doesNotMatch(js, /\.innerHTML\s*=/, "Untrusted admin data must not be rendered through innerHTML");
assert.doesNotMatch(js, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i, "Service-role credentials must never appear in browser code");
assert.match(js, /Nessuna email o invito è stato inviato/);
assert.match(edge, /profile\?\.role !== "platform_admin"/);
assert.match(edge, /auth\.admin\.getUserById\(body\.user_id\)/);
assert.match(edge, /approval_status: "approved"/);
assert.match(edge, /approval_status: "rejected"/);

console.log("NEXTWAY platform admin UI: workspace, membership, Knowledge Base, safe rendering and server-side admin gate: PASS");
