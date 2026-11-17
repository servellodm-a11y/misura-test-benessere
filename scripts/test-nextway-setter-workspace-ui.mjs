import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("nextway-setter.js", "utf8");

assert.match(source, /id="nwst-workspace"/i);
assert.match(source, /name="workspace_id"/i);
assert.match(source, /from\('nextway_workspaces'\)/i);
assert.match(source, /eq\('status','active'\)/i);
assert.match(source, /nextway_create_lead_with_conversation_commercial_v3/i);
assert.ok(source.includes("p_commercial_audience: values.commercial_audience"));
assert.ok(source.includes("p_workspace_id: workspaceId"));
assert.match(source, /workspace_id:\s*formValues\.workspace_id\s*\|\|\s*null/i);
assert.match(source, /Nessun workspace — solo platform_admin/i);
assert.match(source, /Per creare prospect condivisi/i);
assert.match(source, /Bozza generata e salvata\. Nessun messaggio è stato inviato/i);

console.log("NEXTWAY AI Setter workspace selector UI contract: PASS");
