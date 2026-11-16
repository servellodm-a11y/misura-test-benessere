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
assert.match(edge, /expires_at:\s*new Date\(Date\.now\(\)\s*\+\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)/,
  "successful provider results must be cached for no more than seven days");
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
assert.match(ui, /archivePayload\.archived_count/,
  "the UI must report successful central identity updates");
assert.match(ui, /if\(!searchWorkspaceId\)throw new Error/,
  "the UI must block search when no authorized workspace is selected");

console.log("NEXTWAY central prospect memory integration: contract checks passed.");
