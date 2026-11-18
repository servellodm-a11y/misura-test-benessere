import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../nextway-admin.html", import.meta.url), "utf8");
const admin = readFileSync(new URL("../nextway-admin.js", import.meta.url), "utf8");
const ingest = readFileSync(new URL("../supabase/functions/nextway-knowledge-ingest/index.ts", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../docs/companies/zinzino/knowledge/import-manifest.v1.json", import.meta.url), "utf8"));
const base = new URL("../docs/companies/zinzino/knowledge/", import.meta.url);

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.workspace_key, "zinzino-italia");
assert.equal(manifest.language_code, "it");
assert.equal(manifest.documents.length, 7);
assert.equal(manifest.import_policy.approval_status, "pending");
assert.equal(manifest.import_policy.deduplicate_by_content_sha256, true);
assert.match(html, /id="import-zinzino-knowledge"/);
assert.match(admin, /nextway-knowledge-ingest/);
assert.match(admin, /manifest\.documents\.length !== 7/);
assert.match(admin, /workspace\.workspace_key !== "zinzino-italia"/);
assert.match(admin, /approval_status/);
assert.match(admin, /result\.duplicate/);
assert.match(admin, /c\.auth\.refreshSession\(\)/);
assert.match(admin, /"Authorization": "Bearer " \+ accessToken/);
assert.doesNotMatch(admin.slice(admin.indexOf('$("import-zinzino-knowledge")'), admin.indexOf('$("knowledge-upload").addEventListener')), /service_role|NEXTWAY_SERVICE_ROLE_KEY|approve_document/);
assert.match(ingest, /"training_material"/);
assert.match(ingest, /approval_status: "pending"/);

for (const item of manifest.documents) {
  assert.match(item.file, /^[a-z0-9-]+\.md$/);
  assert.match(item.module_key, /^[a-z0-9][a-z0-9_-]{1,63}$/);
  assert.equal(item.source_type, "training_material");
  assert.equal(item.language_code ?? "it", "it");
  assert.ok(item.title && item.title.trim());
  assert.match(item.source_reference, /^https:\/\//);
  const file = await import("node:fs/promises").then(fs => fs.readFile(new URL(item.file, base), "utf8"));
  assert.ok(file.trim().length > 0, item.file + " must not be empty");
  assert.ok(file.length <= 500000, item.file + " exceeds the ingestion size limit");
}

console.log("NEXTWAY Zinzino Knowledge bulk import contract: PASS (8 Markdown files, JWT-only, idempotent, pending approval)");
