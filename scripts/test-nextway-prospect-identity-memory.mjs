import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const page = readFileSync('nextway-motore-ricerca.html', 'utf8');

assert.match(page, /SEARCH_IDENTITY_ARCHIVE_LIMIT=500/,
  'identity memory must retain up to 500 prospects independently of the ten-session display history');
assert.match(page, /nextway_prospect_identity_archive_v1:/,
  'identity memory must use a separate account-scoped local archive');
assert.match(page, /function rememberProspectIdentities\(prospects\)/,
  'every completed search must merge prospect identities into the long-lived archive');
assert.match(page, /existing\.identity_keys=\[\.\.\.new Set/,
  'repeat sightings must merge strong identity keys instead of creating duplicate identities');
assert.match(page, /existing\.public_contacts=/,
  'public contact details must be consolidated across sightings');
assert.match(page, /existing\.sources=\[\.\.\.\(existing\.sources\|\|\[\]\)\]/,
  'source provenance must accumulate across repeated sightings');
assert.match(page, /SEARCH_QUERY_CACHE_TTL_MS=7\*24\*60\*60\*1000/,
  'query results must have an explicit seven-day cache lifetime');
assert.match(page, /nextway_search_query_cache_v1:/,
  'query cache must be separated from the prospect identity archive');
assert.match(page, /queriesToRun\.forEach\(entry=>\{const cached=getFreshCachedQuery/,
  'the browser must check its cache before sending paid provider queries');
assert.match(page, /queries:queriesToFetch\.map\(entry=>entry\.query\)/,
  'only uncached queries may be sent to the external search provider');
assert.match(page, /riutilizzate dalla cache/,
  'the UI must disclose how many queries were reused without a new provider request');
assert.match(page, /GIÀ INDIVIDUATO IN PRECEDENZA/,
  'previously seen identities must be visibly marked in search results');
assert.match(page, /history_seen_before:!!historicalIdentity/,
  'search results must preserve whether the identity was already present in historical memory');
assert.match(page, /function markSearchHistoryAcquired[\s\S]*searchIdentityArchiveKey\(\)/,
  'CRM acquisition must update the long-lived identity archive as well');
assert.match(page, /rememberProspectIdentities\(prospects\)/,
  'identity memory must be written together with the completed search history');

console.log('NEXTWAY prospect identity memory and query cache: 14 checks passed.');
