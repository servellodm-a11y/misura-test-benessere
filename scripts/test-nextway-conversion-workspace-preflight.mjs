import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/diagnostics/nextway_conversion_workspace_preflight_readonly.sql", import.meta.url),
  "utf8",
);

const workflow = readFileSync(
  new URL("../.github/workflows/nextway-static-validation.yml", import.meta.url),
  "utf8",
);

assert.match(sql, /NEXTWAY CRM: prerequisiti conversione multi-workspace \(READ-ONLY\)/i);
assert.match(sql, /to_regclass\(format\('public\.%I',t\.table_name\)\) is not null as table_exists/i);
assert.doesNotMatch(sql, /\bas exists\b/i, "Avoid ambiguous/reserved-looking alias in table metadata");
for (const table of [
  "clients", "partner_details", "profiles", "nextway_leads",
  "nextway_lead_conversion_requests", "nextway_workspace_memberships", "nextway_workspaces",
]) {
  assert.ok(sql.includes(`('${table}')`) || sql.includes(`('${table}'),`), `Missing target table: ${table}`);
}
for (const catalog of [
  "information_schema.columns", "pg_class", "pg_constraint", "pg_indexes",
  "pg_policies", "pg_trigger", "pg_proc",
]) {
  assert.ok(sql.includes(catalog), `Missing read-only catalog source: ${catalog}`);
}
assert.match(sql, /jsonb_pretty\(jsonb_build_object\(/i);
assert.match(sql, /\) as nextway_conversion_workspace_preflight\s*;/i);
assert.match(sql, /Metadata only\. No customer\/partner rows/i);

const pullRequestTrigger = workflow.split(/\n  pull_request:\n/)[1]?.split(/\npermissions:/)[0] ?? "";
assert.ok(pullRequestTrigger, "Workflow must define a pull_request trigger");
for (const path of [
  "scripts/test-nextway-conversion-workspace-preflight.mjs",
  "supabase/diagnostics/nextway_conversion_workspace_preflight_readonly.sql",
]) {
  assert.ok(pullRequestTrigger.includes(`- "${path}"`), `Pull request trigger must include ${path}`);
}
assert.doesNotMatch(sql, /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|index|policy|function)|drop\s+(table|index|policy|function)|truncate|grant\s|revoke\s)/i,
  "Preflight must remain strictly read-only");
assert.doesNotMatch(sql, /auth\.users|service_role|access_token|refresh_token|password/i,
  "Preflight must not inspect credentials or auth user records");

console.log("NEXTWAY conversion workspace preflight: single JSON result, catalog-only metadata, read-only contract and PR trigger coverage: PASS");
