import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const edge = readFileSync("supabase/functions/nextway-search/index.ts", "utf8");
const ui = readFileSync("nextway-motore-ricerca.html", "utf8");

const cacheRead = edge.indexOf('.from("nextway_search_query_cache")');
const rateLimit = edge.indexOf('"nextway_consume_api_rate_limit"');
const providerCall = edge.indexOf('https://api.tavily.com/search');
assert.ok(cacheRead >= 0 && rateLimit > cacheRead && providerCall > rateLimit,
  "central cache lookup must happen before rate-limit consumption and Tavily");
assert.match(edge, /p_units:\s*uncached\.length/,
  "only cache-miss queries may consume provider units");
assert.match(edge, /nextway_has_workspace_access/,
  "the Edge Function must validate active workspace membership");
assert.match(edge, /nextway_merge_prospect_identity/,
  "central identity updates must use the protected merge RPC");
assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/,
  "identity keys must be hashed server-side before persistence");
assert.match(edge, /"url:"\s*\+\s*url/,
  "canonical source URLs must contribute to identity deduplication");
assert.match(edge, /action === "archive_prospects"/,
  "the Edge Function must expose the authenticated central archive action");
assert.match(edge, /action === "lookup_prospects"/,
  "the Edge Function must expose the authenticated central identity lookup");
assert.match(edge, /\.overlaps\("identity_fingerprints", fingerprints\)/,
  "central lookup must match shared identities by server-side hashed fingerprints");
assert.match(edge, /input\.fingerprints\.some\(fingerprint => \(storedFingerprints as string\[\]\)\.includes\(fingerprint\)\)/,
  "lookup results must be correlated using the same fingerprints persisted in the archive");
assert.match(edge, /candidates\.length > 1/,
  "multiple central identity matches must be flagged as ambiguous, never silently selected");
assert.match(edge, /\.eq\("workspace_id", workspaceId\)/,
  "central identity lookup must remain strictly workspace-scoped");

assert.match(edge, /const expiresAt = new Date\(Date\.parse\(fetchedAt\) \+ 7 \* 24 \* 60 \* 60 \* 1000\)/,
  "cache expiry must be calculated from the exact fetched_at value to satisfy the SQL seven-day cap");
assert.match(edge, /expires_at: expiresAt/,
  "the exact seven-day expiry must be persisted with the cached result");
assert.match(edge, /central_cache_unavailable/,
  "if central cache is unavailable, paid external search must stop safely");
assert.match(edge, /p_target_type:\s*targetType/,
  "archive records must preserve customer/partner/unknown classification");
assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY/,
  "the search Edge Function must not bypass workspace RLS with a service key");

assert.match(ui, /nextway_list_accessible_workspaces/,
  "the UI must load only workspaces available to the signed-in user");
assert.match(ui, /workspace_id:searchWorkspaceId/,
  "search requests must carry the selected workspace scope");
assert.match(ui, /segment_key:\$\('segment'\)\.value/,
  "cache keys must be segmented by prospect target");
assert.match(ui, /market_key:\$\('area'\)\.value/,
  "cache keys must be segmented by market");
assert.match(ui, /action:'archive_prospects'/,
  "classified search results must be sent to the central archive");
assert.match(ui, /action:'lookup_prospects'/,
  "search results must be checked against the shared identity archive before writing");
assert.ok(ui.indexOf("action:'lookup_prospects'") < ui.indexOf("action:'archive_prospects'"),
  "central duplicate lookup must run before merging newly found identities");
assert.match(ui, /GIÀ INDIVIDUATO NEL WORKSPACE/,
  "the UI must label identities already present in the shared workspace");
assert.match(ui, /Già acquisito nel CRM/,
  "the UI must prevent reacquiring identities already acquired in the shared CRM");
assert.match(ui, /central_identity_ambiguous/,
  "ambiguous shared identity matches must be surfaced to the operator");
assert.match(ui, /Duplicato centrale da verificare/,
  "CRM capture must be blocked for ambiguous shared identity matches");

assert.match(ui, /archivePayload\.archived_count/,
  "the UI must report successful central identity updates");
assert.match(ui, /if\(!searchWorkspaceId\)throw new Error/,
  "the UI must block search when no authorized workspace is selected");

console.log("NEXTWAY central prospect memory integration: contract checks passed.");
