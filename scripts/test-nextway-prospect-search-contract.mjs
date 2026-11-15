import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const page = readFileSync('nextway-motore-ricerca.html', 'utf8');

assert.match(page, /id="runsearch"[^>]*>Esegui 1 ricerca · fino a 10 risultati/,
  'the search button must communicate the ten-result limit');
assert.match(page, /const SEARCH_MAX_RESULTS\s*=\s*10\s*;/,
  'the browser module must define one authoritative search-result limit');
assert.match(page, /max_results\s*:\s*SEARCH_MAX_RESULTS/,
  'the Edge Function request must use the authoritative result limit');
assert.match(page, /massimo '\+SEARCH_MAX_RESULTS\+' risultati/,
  'the in-progress status must display the same result limit as the request');
assert.match(page, /massimo '\+SEARCH_MAX_RESULTS\+' risultati per query/,
  'the completed status must not claim that only one result was requested');
assert.doesNotMatch(page, /massimo 5 risultati|un solo risultato richiesto/,
  'stale five-result and single-result status messages must not return');

console.log('NEXTWAY prospect search contract: 6 checks passed.');
