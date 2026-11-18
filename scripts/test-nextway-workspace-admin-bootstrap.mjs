import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../supabase/functions/nextway-workspace-admin/index.ts", import.meta.url), "utf8");
const membership = source.slice(source.indexOf('if (action === "set_membership")'), source.indexOf('if (action === "list_documents")'));
const workspace = source.slice(source.indexOf('if (action === "update_workspace")'), source.indexOf('if (action === "save_prompt_draft"'));

assert.match(source, /profile\?\.role !== "platform_admin"/, "admin endpoint must enforce platform_admin");
assert.match(membership, /workspace\.status === "draft"/, "bootstrap must be limited to draft workspaces");
assert.match(membership, /body\.workspace_role === "workspace_owner"/, "bootstrap must require Owner role");
assert.match(membership, /body\.user_id === authData\.user\.id/, "bootstrap must be limited to the authenticated administrator");
assert.match(membership, /existing\.membership_status !== "invited"/, "bootstrap must require a prior invited membership");
assert.match(membership, /authUser\.user\.email_confirmed_at/, "active membership must require confirmed email");
assert.match(membership, /nextway_workspace_one_owner_uidx|23505/, "duplicate Owner must remain handled");
assert.match(workspace, /workspace_role", "workspace_owner"/, "workspace activation must verify Owner role");
assert.match(workspace, /membership_status", "active"/, "workspace activation must require active Owner membership");
assert.match(workspace, /Impossibile attivare il workspace/, "workspace activation must fail closed without active Owner");
assert.match(source, /auth\.getUser\(token\)/, "session JWT must be validated");

console.log("NEXTWAY workspace Owner bootstrap security contract: PASS");
