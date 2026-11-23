import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('nextway-cloud.js', 'utf8');
const start = source.indexOf('function normalizeLeadSourceUrl(value){');
const end = source.indexOf(' async function syncLocal(){', start);
assert.ok(start >= 0 && end > start, 'Duplicate recovery helpers must exist before syncLocal');
const helperSource = source.slice(start, end);
const context = {};
vm.runInNewContext(helperSource + '\nthis.normalizeLeadSourceUrl=normalizeLeadSourceUrl;this.leadPayloadMatches=leadPayloadMatches;this.findExistingLeadBySourceUrl=findExistingLeadBySourceUrl;', context);

assert.equal(context.normalizeLeadSourceUrl('  HTTPS://Example.COM/Lead  '), 'https://example.com/lead');
const payload = { display_name: 'Mario Rossi', source_url: 'https://example.com/lead', score_fit: 10, notes: null };
assert.equal(context.leadPayloadMatches({ ...payload }, payload), true);
assert.equal(context.leadPayloadMatches({ ...payload, notes: 'different' }, payload), false);
assert.equal(context.leadPayloadMatches({ ...payload, display_name: 'Mario Bianchi' }, payload), false);
assert.equal(context.leadPayloadMatches({ ...payload, notes: undefined }, payload), true, 'Undefined and SQL NULL are equivalent');

const owner = '123e4567-e89b-42d3-a456-426614174000';
const rows = [
  { id: 'lead-1', owner_profile_id: owner, source_url: 'https://elsewhere.test/' },
  { id: 'lead-2', owner_profile_id: owner, source_url: ' HTTPS://EXAMPLE.COM/LEAD ' },
  { id: 'lead-3', owner_profile_id: owner, source_url: 'https://another.test/' }
];
let requestedOwner = null;
const query = {
  select() { return this; },
  eq(field, value) { assert.equal(field, 'owner_profile_id'); requestedOwner = value; return this; },
  order() { return this; },
  async range(from, to) { return { data: rows.slice(from, to + 1), error: null }; }
};
const matches = await context.findExistingLeadBySourceUrl({ from: () => query }, owner, payload.source_url);
assert.equal(requestedOwner, owner, 'Lookup must be restricted to the authenticated owner');
assert.equal(matches.length, 1);
assert.equal(matches[0].id, 'lead-2');

const syncStart = source.indexOf(' async function syncLocal(){');
const syncEnd = source.indexOf('\n async function pullCloud(){', syncStart);
const syncSource = source.slice(syncStart, syncEnd);
assert.match(syncSource, /if\(error\.code==='23505'\)\{[\s\S]*?findExistingLeadBySourceUrl/);
assert.match(syncSource, /matches\.length===1&&leadPayloadMatches\(matches\[0\],payload\)/);
assert.match(syncSource, /x\.cloud_id=existing\.id[\s\S]*?x\.local_dirty=false[\s\S]*?linked\+\+/);
assert.match(syncSource, /conflicts\+\+;continue;/, 'Ambiguous or non-identical records must remain unlinked');
assert.match(syncSource, /' · ricollegati: '\+linked/);

console.log('NEXTWAY duplicate URL recovery contract: PASS');
