import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
const migrations = new Map(files.map((name) => [name, readFileSync(`${dir}/${name}`, "utf8")]));
const get = (prefix) => {
  const entry = [...migrations.entries()].find(([name]) => name.startsWith(prefix));
  assert.ok(entry, `Missing migration ${prefix}`);
  return entry[1];
};
const all = [...migrations.values()].join("\n");

const conversion = get("20261111001500");
assert.match(conversion, /alter table public\.partner_details[\s\S]*add column if not exists nextway_conversion_request_id/i);
assert.match(conversion, /alter table public\.clients[\s\S]*add column if not exists nextway_conversion_request_id/i);
assert.match(conversion, /partner_details_nextway_conversion_request_uidx/i);
assert.match(conversion, /clients_nextway_conversion_request_uidx/i);

const archive = get("20261110000800");
assert.match(archive, /alter table public\.nextway_leads[\s\S]*add column if not exists archived_at/i);
assert.match(archive, /add column if not exists archived_by/i);
assert.match(archive, /add column if not exists archive_reason/i);
assert.match(archive, /nextway_leads_archive_state_check/i);
assert.match(archive, /nextway_set_lead_archive_metadata/i);

const lifecycle = get("20261110001300");
assert.match(lifecycle, /alter table public\.nextway_leads[\s\S]*nextway_leads_status_check/i);

const association = get("20261111210000");
assert.match(association, /'nextway_leads'[\s\S]*'nextway_knowledge_documents'[\s\S]*'nextway_setter_conversations'/i);
assert.match(association, /add column if not exists workspace_id uuid/i);
assert.match(association, /foreign key \(workspace_id\) references public\.nextway_workspaces/i);

const workspaceRls = get("20261111230000");
assert.match(workspaceRls, /alter table public\.nextway_lead_audit_logs[\s\S]*add column if not exists workspace_id/i);
assert.match(workspaceRls, /nextway_leads_workspace_select/i);
assert.match(workspaceRls, /nextway_leads_workspace_scope/i);
assert.match(workspaceRls, /nextway_knowledge_documents_workspace_scope/i);

const conversationPolicies = get("20261111240000");
assert.match(conversationPolicies, /nextway_setter_conversations_workspace_select/i);
assert.match(conversationPolicies, /nextway_setter_conversations_workspace_scope/i);

const isolation = get("20261112020000");
assert.match(isolation, /create table if not exists public\.nextway_setter_workspace_generation_requests/i);
assert.match(isolation, /create or replace function public\.nextway_begin_setter_generation/i);

const createdCore = [...all.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(profiles|nextway_leads|nextway_setter_conversations|nextway_setter_messages|partner_details|clients)\b/gi)];
assert.equal(createdCore.length, 0, "A versioned migration unexpectedly creates a table classified as pre-existing core.");

for (const table of ["profiles", "nextway_setter_messages"]) {
  const directAlter = new RegExp(`alter\\s+table\\s+(?:only\\s+)?public\\.${table}\\b`, "i");
  assert.doesNotMatch(all, directAlter, `Unexpected direct ALTER TABLE on core table ${table}; update the delta map.`);
}

console.log("NEXTWAY core baseline migration-delta contract: PASS");
console.log(`Inspected ${files.length} versioned migration files.`);
console.log("Confirmed known additions to nextway_leads, nextway_setter_conversations, nextway_knowledge_documents, partner_details and clients.");
console.log("Confirmed migration-created tables are not misclassified as pre-existing core.");
console.log("Static only: no baseline DDL was generated or applied; PostgreSQL runtime remains outstanding.");
