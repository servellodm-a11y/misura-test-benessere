import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(
  new URL("../supabase/functions/nextway-knowledge-upload/index.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20261111180000_nextway_knowledge_storage.sql", import.meta.url),
  "utf8",
);

assert.match(source, /Deno\.serve\(async \(req\)/);
assert.match(source, /auth\.getUser\(token\)/);
assert.match(source, /profile\?\.role !== "platform_admin"/);
assert.match(source, /NEXTWAY_SERVICE_ROLE_KEY/);
assert.match(source, /MAX_FILE_BYTES = 12 \* 1024 \* 1024/);
assert.match(source, /application\/pdf/);
assert.match(source, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
assert.match(source, /pdfjs\.getDocument/);
assert.match(source, /mammoth\.extractRawText/);
assert.match(source, /new TextDecoder\("utf-8", \{ fatal: true \}\)/);
assert.match(source, /nextway-knowledge/);
assert.match(source, /functions\/v1\/nextway-knowledge-ingest/);
assert.match(source, /approval_status/);
assert.match(source, /storage_path: objectName/);
assert.match(source, /ocr_required: false/);
assert.match(source, /source-files\//);
assert.doesNotMatch(source, /NEXTWAY_SERVICE_ROLE_KEY[^\n]*respond/i);
assert.match(migration, /public = false/);
assert.match(migration, /file_size_limit/);
assert.match(migration, /nextway_is_platform_admin\(\)/);
assert.match(migration, /for delete to authenticated/);

console.log("NEXTWAY Knowledge Upload security contract: PASS");
