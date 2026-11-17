import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../nextway-admin.html", import.meta.url), "utf8");
const admin = readFileSync(new URL("../nextway-admin.js", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../supabase/functions/nextway-workspace-admin/index.ts", import.meta.url), "utf8");
const commercial = JSON.parse(readFileSync(new URL("../docs/companies/zinzino/workspace-commercial-settings.json", import.meta.url), "utf8"));
const base = JSON.parse(readFileSync(new URL("../docs/companies/zinzino/commercial-base.v1.json", import.meta.url), "utf8"));

assert.match(html, /id="prepare-zinzino-workspace"/);
assert.match(html, /id="zinzino-bootstrap-status"/);
assert.match(admin, /pendingZinzinoSeed/);
assert.match(admin, /workspace-commercial-settings\.json/);
assert.match(admin, /commercial-base\.v1\.json/);
assert.match(admin, /normalizer\.normalize\(/);
assert.match(admin, /values\.workspace_key !== "zinzino-italia"/);
assert.match(admin, /values\.name !== "Zinzino Italia"/);
assert.match(admin, /values\.settings\.commercial = state\.pendingZinzinoSeed/);
assert.match(admin, /Il workspace non verrà attivato/);
assert.match(endpoint, /if \(action === "create_workspace"\)/);
assert.match(endpoint, /status: "draft"/);
assert.equal(commercial.schema_version, 1);
assert.equal(commercial.company.id, "zinzino");
assert.equal(Object.keys(commercial.search_queries.it).length, 9);
assert.equal(Object.keys(commercial.search_queries.en).length, 9);
assert.equal(base.schema_version, 1);
assert.equal(base.company.id, "zinzino");
assert.equal(base.data_policy.compensation_calculation_enabled, false);
assert.equal(base.data_policy.commercial_activation_enabled, false);
assert.equal(base.partner.compensation_plan.calculations_enabled, false);

console.log("NEXTWAY Zinzino draft workspace bootstrap contract: PASS");
