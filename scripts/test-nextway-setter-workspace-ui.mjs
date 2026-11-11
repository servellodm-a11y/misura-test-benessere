import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("nextway-setter.js", "utf8");

assert.match(source, /id="nwst-workspace"/i);
assert.match(source, /name="workspace_id"/i);
assert.match(source, /from\('nextway_workspaces'\)/i);
assert.match(source, /eq\('status','active'\)/i);
assert.match(source, /nextway_create_lead_with_conversation_idempotent_v2/i);
assert.match(source, /rpcArgs\.p_workspace_id\s*=\s*workspaceId/i);
assert.match(source, /workspace_id:\s*formValues\.workspace_id\s*\|\|\s*null/i);
assert.match(source, /Nessun workspace — solo platform_admin/i);
assert.match(source, /Per creare prospect condivisi/i);
assert.match(source, /Bozza generata e salvata\. Nessun messaggio è stato inviato/i);

console.log("NEXTWAY AI Setter workspace selector UI contract: PASS");
