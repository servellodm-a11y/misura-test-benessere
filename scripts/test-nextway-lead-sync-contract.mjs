import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const cloud = readFileSync('nextway-cloud.js', 'utf8');
const payloadStart = cloud.indexOf('const CRM_LEAD_CATEGORIES=');
const payloadEnd = cloud.indexOf('async function resolveLeadConflict(', payloadStart);
assert.ok(payloadStart >= 0 && payloadEnd > payloadStart, 'CRM category and sync guards must exist');
const payloadSource = cloud.slice(payloadStart, payloadEnd).trim();
const helpers = new Function(`${payloadSource}; return {leadPayload,leadSyncReadiness};`)();
const {leadPayload,leadSyncReadiness}=helpers;
for (const category of ['potential_partner', 'final_customer', 'wellness_professional']) {
  assert.equal(leadPayload({ category }).category, category,
    `CRM sync must preserve the ${category} category`);
}
assert.equal(leadPayload({ category: 'research_result' }).category, null,
  'research-only results must never be mapped to a CRM partner category');
assert.equal(leadPayload({ category: 'unknown_category' }).category, null,
  'unknown categories must fail closed instead of becoming potential partners');
assert.equal(leadPayload({ qualification: 'Qualificato' }).qualification, 'Da approfondire',
  'qualified records must be sent to the database only as Da approfondire before the review RPC');
const baseLead={category:'potential_partner',qualification:'Da approfondire',identity_check:'pending',fit:0,activity:0,presence:0,interest:0,approach:0,manual_review_confirmed:false};
assert.equal(leadSyncReadiness({...baseLead,category:'research_result'}),'category_requires_manual_review');
assert.equal(leadSyncReadiness(baseLead),'ready',
  'a manually categorized prospect may sync before qualification as Da approfondire');
const qualified={...baseLead,qualification:'Qualificato',identity_check:'confirmed',fit:30,activity:10,presence:10,interest:5,approach:5,manual_review_confirmed:true};
assert.equal(leadSyncReadiness(qualified),'ready',
  'qualified sync requires identity, score >=50 and an explicit human-review confirmation');
assert.equal(leadSyncReadiness({...qualified,manual_review_confirmed:false}),'manual_review_required');
assert.equal(leadSyncReadiness({...qualified,identity_check:'pending'}),'manual_review_required');
assert.equal(leadSyncReadiness({...qualified,fit:10,activity:0,presence:0,interest:0,approach:0}),'manual_review_required');

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

// Retry and conflict-safety checks: transient failures must leave local data dirty.
assert.match(sync, /if\(error\)\{failed\+\+;continue;\}/,
  'a failed cloud update must not mark the local record clean');
assert.match(sync, /if\(error\)\{failed\+\+;continue;\}if\(!data\)\{conflicts\+\+/,
  'optimistic update must detect a remote version change');
assert.match(sync, /\.eq\('updated_at',x\.cloud_updated_at\)/,
  'cloud updates must be guarded by the version previously read');
assert.match(sync, /localStorage\.setItem\(localArchiveKey\(s\.user\.id\),JSON\.stringify\(rows\)\)/,
  'the local archive state must be persisted after the sync pass');
assert.match(sync, /if\(needsManualReview\)\{const \{data:review,error:reviewError\}=await c\.rpc\('nextway_confirm_lead_manual_review'/,
  'manual review must be executed through the database RPC after the safe write');
assert.ok(sync.indexOf(".update(payload)") < sync.indexOf("rpc('nextway_confirm_lead_manual_review'"),
  'the safe unqualified update must precede the manual-review RPC');
assert.ok(sync.indexOf(".insert(insertPayload)") < sync.lastIndexOf("rpc('nextway_confirm_lead_manual_review'"),
  'the safe unqualified insert must precede the manual-review RPC');\nassert.match(sync, /x\.manual_review_confirmed=false;x\.local_dirty=false/,
  'a local record may be marked clean only after the cloud operation and any required review succeed');

const pullStart = cloud.indexOf('async function pullCloud()');
const pullEnd = cloud.indexOf("$('nw-sync').onclick", pullStart);
assert.ok(pullStart >= 0 && pullEnd > pullStart, 'pullCloud must exist');
const pull = cloud.slice(pullStart, pullEnd);
assert.match(pull, /if\(existing\.local_dirty\).*?continue;/s,
  'cloud refresh must preserve dirty local records rather than overwrite them');
assert.match(pull, /existing\.cloud_updated_at!==r\.updated_at/,
  'cloud refresh must flag concurrent remote changes');


const conflictStart = cloud.indexOf('async function resolveLeadConflict(');
const conflictEnd = cloud.indexOf('window.NEXTWAY_CLOUD=', conflictStart);
assert.ok(conflictStart >= 0 && conflictEnd > conflictStart,
  'resolveLeadConflict must exist');
const conflict = cloud.slice(conflictStart, conflictEnd);
assert.match(conflict, /requiresManualReview=localRecord\?\.qualification==='Qualificato'/,
  'conflict resolution must detect locally qualified records');
assert.match(conflict, /localRecord\.manual_review_confirmed!==true/,
  'conflict resolution must require explicit renewed human review');
assert.match(conflict, /requiresManualReview\?\{\.\.\.localRecord,qualification:'Da approfondire'\}:localRecord/,
  'conflict resolution must never send Qualified directly in its update payload');
assert.ok(conflict.indexOf(".update(leadPayload(safeRecord))") < conflict.indexOf("rpc('nextway_confirm_lead_manual_review'"),
  'manual-review RPC must run only after the safe conflict update succeeds');
assert.match(conflict, /reviewError.*?Il Lead resta "Da approfondire"/s,
  'failed manual review must leave the Lead safely unqualified and report the partial outcome');
assert.match(conflict, /record\.manual_review_confirmed=false/,
  'successful conflict resolution must clear the transient local review checkbox state');

console.log('NEXTWAY Lead sync contract: 36 checks passed.');
