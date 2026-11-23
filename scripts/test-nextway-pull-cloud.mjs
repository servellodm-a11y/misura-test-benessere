import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('nextway-cloud.js', 'utf8');

function extractBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Cannot locate source block: ${startMarker}`);
  return source.slice(start, end).trim();
}

const archiveReader = extractBetween(
  'function readSearchArchiveRows(userId){',
  '\n function readSearchArchiveMeta'
);
const pullCloud = extractBetween(
  'async function pullCloud(){',
  '\n $(\'nw-sync\').onclick'
);

const owner = '123e4567-e89b-42d3-a456-426614174000';
const key = 'nextway_ai_records_v1:' + owner;

function makeHarness(initialValue, options = {}) {
  const state = {
    value: initialValue,
    writes: [],
    message: '',
    reloads: 0
  };
  const localStorage = {
    getItem(requestedKey) {
      if (options.getItemThrows) throw new Error('storage unavailable');
      assert.equal(requestedKey, key);
      return state.value;
    },
    setItem(requestedKey, value) {
      state.writes.push({ key: requestedKey, value: String(value) });
      state.value = String(value);
    }
  };
  const query = {
    select() { return this; },
    order() { return this; },
    async range() {
      if (options.queryThrows) return { data: null, error: new Error('cloud read failed') };
      return { data: [], error: null };
    }
  };
  const context = {
    localStorage,
    localArchiveKey(userId) {
      assert.equal(userId, owner);
      return key;
    },
    active: async () => ({ c: { from: () => query }, s: { user: { id: owner } } }),
    fromCloud: row => row,
    say: message => { state.message = message; },
    location: { reload: () => { state.reloads++; } },
    Date
  };
  vm.runInNewContext(
    archiveReader + '\n' + pullCloud + '\nthis.runPullCloud = pullCloud;',
    context
  );
  return { state, run: () => context.runPullCloud() };
}

const validRows = [{ id: 'local-1', name: 'Lead locale' }];
{
  const h = makeHarness(JSON.stringify(validRows));
  await h.run();
  assert.equal(h.state.writes.length, 1, 'A valid archive may be saved after cloud pull');
  assert.deepEqual(JSON.parse(h.state.writes[0].value), validRows);
}
{
  const h = makeHarness(null);
  await h.run();
  assert.equal(h.state.writes.length, 1, 'A missing archive key is a valid empty archive');
  assert.equal(h.state.writes[0].value, '[]');
}
for (const [label, value, options] of [
  ['corrupt JSON', '{not-json', {}],
  ['valid JSON with a non-array structure', JSON.stringify({ leads: [] }), {}],
  ['localStorage read failure', '[]', { getItemThrows: true }]
]) {
  const h = makeHarness(value, options);
  await assert.rejects(h.run(), /Archivio locale non leggibile/, label);
  assert.equal(h.state.writes.length, 0, label + ': local archive must never be overwritten');
  assert.equal(h.state.value, value, label + ': original local value must remain unchanged');
}
{
  const original = JSON.stringify(validRows);
  const h = makeHarness(original, { queryThrows: true });
  await assert.rejects(h.run(), /cloud read failed/);
  assert.equal(h.state.writes.length, 0, 'A failed cloud read must not write to local storage');
  assert.equal(h.state.value, original, 'A failed cloud read must preserve the original local archive');
}

console.log('NEXTWAY pullCloud archive-preservation regression: PASS');
