import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const cloud = readFileSync('nextway-cloud.js', 'utf8');
const syncStart = cloud.indexOf('async function syncLocal()');
const syncEnd = cloud.indexOf('async function pullCloud()', syncStart);
assert.ok(syncStart >= 0 && syncEnd > syncStart, 'syncLocal and pullCloud must exist');
const sync = cloud.slice(syncStart, syncEnd);

assert.match(sync, /if\(x\._sync_conflict\)\{conflicts\+\+;continue;\}/,
  'unresolved conflicts must be excluded from automatic retries');
assert.match(sync, /error\.code==='23505'/,
  'duplicate unique violations must be handled explicitly');
assert.match(sync, /\.eq\('owner_profile_id',s\.user\.id\)/,
  'duplicate reconciliation must be scoped to the authenticated owner');
assert.match(sync, /\.eq\('source_url',payload\.source_url\)/,
  'duplicate reconciliation must require the exact source URL');
assert.ok(sync.indexOf(".eq('source_url',payload.source_url)") < sync.indexOf(".insert(insertPayload)"),
  'cloud URL reconciliation must happen before inserting an unlinked Lead');
assert.match(sync, /matches\?\.length===1/,
  'a duplicate may be linked only when exactly one matching cloud row exists');
assert.match(sync, /reason:'duplicate_import_match'/,
  'a linked import duplicate must enter the existing manual conflict workflow');
assert.match(sync, /x\.local_dirty=true/,
  'the imported local version must remain preserved until a user chooses');
assert.doesNotMatch(sync, /if\(error\)\{if\(error\.code==='23505'\)\{skipped\+\+;continue;\}/,
  'a duplicate must not be silently counted as skipped');

console.log('NEXTWAY Lead sync contract: 9 checks passed.');
