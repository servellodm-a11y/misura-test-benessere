import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const page = readFileSync('nextway-motore-ricerca.html', 'utf8');

assert.match(page, /id="runsearch"[^>]*>Esegui 1 ricerca · fino a 10 risultati/,
  'the single-search button must communicate its ten-result limit');
assert.match(page, /id="runallsearch"[^>]*>Esegui tutte le 5 ricerche · fino a 50 risultati/,
  'the batch button must communicate five queries and up to fifty results');
assert.match(page, /5 unità di ricerca/,
  'the user must be told that the full batch consumes five search units');
assert.match(page, /const SEARCH_MAX_RESULTS\s*=\s*10\s*;/,
  'the browser module must define one authoritative search-result limit');
assert.match(page, /max_results\s*:\s*SEARCH_MAX_RESULTS/,
  'the Edge Function request must use the authoritative result limit');
assert.match(page, /queries:queriesToRun\.map\(entry=>entry\.query\)/,
  'the Edge Function must receive either the selected query or the explicit batch');
assert.match(page, /runallsearch'\)\.addEventListener\('click',\(\)=>runSearch\(true\)\)/,
  'the all-search button must invoke the explicit batch path');
assert.match(page, /Array\.isArray\(payload\.failures\)/,
  'partial provider failures must be handled explicitly');
assert.match(page, /Ricerche non completate/,
  'the UI must visibly identify incomplete search queries');
assert.match(page, /reasonLabels\[failure\.reason\]/,
  'provider failure codes must be translated into readable Italian explanations');
assert.match(page, /if\(partialFailureNotice\)rankingContainer\.append\(partialFailureNotice\)/,
  'the partial-failure notice must survive the final results re-render');
assert.match(page, /queriesToRun\.length\*SEARCH_MAX_RESULTS/,
  'the in-progress status must communicate the maximum combined result count');
assert.match(page, /massimo '\+SEARCH_MAX_RESULTS\+' risultati per query/,
  'the completed status must communicate the per-query result limit');
assert.doesNotMatch(page, /massimo 5 risultati|un solo risultato richiesto/,
  'stale five-result and single-result status messages must not return');

console.log('NEXTWAY prospect search contract: 10 checks passed.');
