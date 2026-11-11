import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(
  new URL("../supabase/functions/nextway-knowledge-ingest/index.ts", import.meta.url),
  "utf8",
);

assert.match(source, /Deno\.serve\(async \(req\)/);
assert.match(source, /authorization/);
assert.match(source, /auth\.getUser\(token\)/);
assert.match(source, /profile\?\.role !== "platform_admin"/);
assert.match(source, /NEXTWAY_SERVICE_ROLE_KEY/);
assert.match(source, /MAX_BODY_BYTES = 600_000/);
assert.match(source, /MAX_CONTENT_CHARS = 500_000/);
assert.match(source, /languageCode !== "it"/);
assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(source, /approval_status: "pending"/);
assert.match(source, /uploaded_by: authData\.user\.id/);
assert.match(source, /chunkText\(normalizedContent\)/);
assert.match(source, /nextway_knowledge_documents/);
assert.match(source, /nextway_knowledge_chunks/);
assert.match(source, /23505/);
assert.match(source, /Indicizzazione non completata; documento non pubblicato/);
assert.doesNotMatch(source, /approval_status:\s*"approved"/);
assert.doesNotMatch(source, /console\.(log|error)\([^\n]*(content|token|serviceKey)/i);

console.log("NEXTWAY Knowledge Ingest security contract: PASS");
