import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('nextway-motore-ricerca.html', 'utf8');
const cloud = readFileSync('nextway-cloud.js', 'utf8');

assert.match(ui, /dailyEntry\.archive_status='captured'/,
  'local capture must use a state distinct from CRM acquisition');
assert.doesNotMatch(ui, /dailyEntry\.archive_status='acquired';\s*markSearchHistoryAcquired/,
  'local capture must never mark the prospect as acquired in CRM');
assert.match(ui, /function markSearchHistoryAcquired\(/,
  'the explicit CRM-confirmed history helper remains available for a future post-sync hook');
assert.match(ui, /Salvato nell’archivio locale/,
  'capture confirmation must describe the actual local archive destination');
assert.match(ui, /SALVATO NELL’ARCHIVIO LOCALE/,
  'agenda must distinguish locally captured records from CRM Leads');
assert.match(ui, /già acquisiti nel CRM/,
  'agenda must reserve acquired wording for CRM records');
assert.match(ui, /if\(prospect\.archive_status==='acquired'\|\|prospect\.archive_status==='followup'\)/,
  'CRM navigation must only be offered for CRM-backed states');
assert.match(cloud, /await c\.from\('nextway_leads'\)\.insert\(insertPayload\)/,
  'CRM acquisition still occurs only during explicit cloud synchronization');
assert.match(cloud, /localStorage\.setItem\(localArchiveKey\(s\.user\.id\),JSON\.stringify\(rows\)\)/,
  'local capture remains persisted locally until explicit synchronization');
console.log('NEXTWAY capture-state semantics: 9 assertions passed.');