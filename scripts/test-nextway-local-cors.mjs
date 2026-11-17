import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const files = [
  "../supabase/functions/nextway-workspace-admin/index.ts",
  "../supabase/functions/nextway-ai-setter/index.ts",
  "../supabase/functions/nextway-search/index.ts",
  "../supabase/functions/nextway-knowledge-ingest/index.ts",
  "../supabase/functions/nextway-knowledge-upload/index.ts",
  "../supabase/functions/nextway-conversion-provisioning/index.ts",
];

for (const relativePath of files) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.ok(source.includes('"http://localhost:8000"'), relativePath + ": localhost origin missing");
  assert.match(source, /\.\.\.configuredOrigins/, relativePath + ": configured origins must be preserved");
  assert.match(source, /allowedOrigins\.includes\(origin\)/, relativePath + ": explicit origin allow-list check missing");
  assert.match(source, /Access-Control-Allow-Origin/, relativePath + ": CORS allow-origin response missing");
  assert.match(source, /req\.method === "OPTIONS"/, relativePath + ": OPTIONS preflight handling missing");
  assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/i, relativePath + ": wildcard CORS is forbidden");
}

console.log("NEXTWAY local CORS: all six authenticated Edge Functions explicitly allow localhost without wildcard CORS: PASS");
