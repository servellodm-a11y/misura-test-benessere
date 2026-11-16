import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const edge = readFileSync("supabase/functions/nextway-search/index.ts", "utf8");
const ui = readFileSync("nextway-motore-ricerca.html", "utf8");
const migration = readFileSync("supabase/migrations/20261116100000_nextway_prospect_identity_memory.sql", "utf8");
assert.equal((migration.match(/\bcommit;/gi) || []).length, 1,
  "all central memory tables and RPCs must be created inside one atomic transaction");
assert.match(migration, /nextway_merge_prospect_identity[\s\S]*commit;\s*$/,
  "the identity merge RPC must be created before the single final transaction commit");

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
assert.match(edge, /nextway_lookup_prospect_crm_matches/,
  "existing CRM Leads must be checked before permitting acquisition");
assert.match(edge, /crm_match:\s*true/,
  "a matching existing CRM Lead must be returned as an acquired identity");
assert.match(migration, /create or replace function public\.nextway_lookup_prospect_crm_matches/,
  "the CRM duplicate lookup must be implemented as a protected database RPC");
assert.match(migration, /lower\(btrim\(l\.source_url\)\) = lower\(btrim\(u\.url\)\)/,
  "CRM duplicate lookup must compare canonical source URLs within the selected workspace");
assert.match(migration, /l\.workspace_id is null and l\.owner_profile_id = auth\.uid\(\)/,
  "legacy owner-scoped CRM Leads must also be recognized without crossing user boundaries");
assert.match(migration, /v_effective_archive_status := 'acquired'/,
  "the database, not the browser, must derive acquired status from an existing CRM Lead");
assert.match(migration, /p_archive_status is distinct from 'seen'/,
  "authenticated clients must not self-assert acquired or reviewed status");
assert.match(migration, /array_position\(coalesce\(p_identity_fingerprints/,
  "the merge RPC must reject null identity fingerprints");
assert.match(migration, /jsonb_array_elements\(case when jsonb_typeof\(coalesce\(p_public_contacts -> 'emails'/,
  "public contact arrays must be validated safely before merging");
assert.match(migration, /jsonb_array_elements\(case when jsonb_typeof\(coalesce\(p_source_evidence/,
  "source evidence validation must not throw on malformed scalar JSON");
assert.match(migration, /jsonb_array_elements\(case when jsonb_typeof\(coalesce\(p_results/,
  "cache result validation must not throw on malformed scalar JSON");
assert.match(migration, /coalesce\(jsonb_typeof\(item\.value -> 'score'\), ''\) <> 'number'/,
  "cached search results must contain numeric relevance scores");
assert.match(migration, /jsonb_array_length\(case when jsonb_typeof\(source_evidence\) = 'array'/,
  "source evidence table constraints must safely handle malformed JSON");
assert.match(migration, /jsonb_array_length\(case when jsonb_typeof\(results\) = 'array'/,
  "query cache table constraints must safely handle malformed JSON");
assert.match(migration, /nextway_leads.*workspace_id.*source_url/s,
  "migration prerequisites must include workspace-scoped Lead source URLs");
assert.match(edge, /p_archive_status:\s*archiveStatus/,
  "the central merge RPC must receive only the server-enforced seen status");
assert.match(edge, /p_results:\s*safeItems/,
  "validated provider results must be persisted through the cache RPC");
assert.match(edge, /normalized\.length <= 2048 \? normalized : ""/,
  "canonical source URLs must be bounded before database lookup and persistence");
assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/,
  "identity keys must be hashed server-side before persistence");
assert.match(edge, /"url:"\s*\+\s*url/,
  "canonical source URLs must contribute to identity deduplication");
assert.match(edge, /action === "archive_prospects"/,
  "the Edge Function must expose the authenticated central archive action");
assert.match(edge, /const archiveStatus = "seen"/,
  "untrusted search results must never assert acquired or human-reviewed archive status");
assert.match(edge, /action === "lookup_prospects"/,
  "the Edge Function must expose the authenticated central identity lookup");
assert.match(edge, /\.overlaps\("identity_fingerprints", fingerprintBatch\)/,
  "central lookup must match shared identities by server-side hashed fingerprints");
assert.match(edge, /offset < fingerprints\.length; offset \+= 80/,
  "fingerprint lookups must be split into bounded URL query batches");
assert.match(edge, /offset < urls\.length; offset \+= 5/,
  "canonical URL lookups must also use bounded batches");
assert.match(edge, /input\.fingerprints\.some\(fingerprint => \(storedFingerprints as string\[\]\)\.includes\(fingerprint\)\)/,
  "lookup results must be correlated using the same fingerprints persisted in the archive");
assert.match(edge, /candidates\.length > 1/,
  "multiple central identity matches must be flagged as ambiguous, never silently selected");
assert.match(edge, /\.eq\("workspace_id", workspaceId\)/,
  "central identity lookup must remain strictly workspace-scoped");

assert.match(edge, /nextway_store_search_query_cache/,
  "cache writes must use the validated database RPC");
assert.doesNotMatch(edge, /\.from\("nextway_search_query_cache"\)\.(insert|update)/,
  "the Edge Function must not write cache rows directly");
assert.match(edge, /central_cache_unavailable/,
  "if central cache is unavailable, paid external search must stop safely");
assert.match(edge, /p_target_type:\s*targetType/,
  "archive records must preserve customer/partner/unknown classification");
assert.match(edge, /classification\.includes\("cliente"\)/,
  "Italian customer classification must map to potential_customer");
assert.match(edge, /new_networker: "other_networker"/,
  "new networkers must map into the supported other-networker archive segment");
assert.match(edge, /exnetworker: "other_networker"/,
  "former networkers must map into the supported other-networker archive segment");
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
assert.match(ui, /offset<dailyProspects\.length;offset\+=25/,
  "all search results must be checked in bounded batches, not only the first 25");
assert.match(ui, /slice\(offset,offset\+25\)/,
  "all central archive writes must cover the complete result set in bounded batches");
assert.match(ui, /acquisizione CRM bloccata finché la memoria condivisa non è verificata/,
  "CRM capture must fail closed if shared duplicate lookup is unavailable");
assert.match(ui, /Attendi il confronto con la memoria condivisa prima di acquisire/,
  "capture buttons must be disabled while the central duplicate lookup is pending");
assert.match(ui, /centralIdentityBlocked/,
  "central acquired or ambiguous identities must remain blocked after lookup completes");
assert.match(ui, /acquisizione CRM bloccata finché la memoria condivisa non è aggiornata/,
  "CRM capture must also fail closed if central archive persistence fails");

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
