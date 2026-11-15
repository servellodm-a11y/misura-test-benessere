import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const cloud = readFileSync('nextway-cloud.js', 'utf8');
const start = cloud.indexOf('async function resolveLeadConflict(');
const end = cloud.indexOf('\n window.NEXTWAY_CLOUD=', start);
assert.ok(start >= 0 && end > start, 'resolveLeadConflict must exist');
const source = cloud.slice(start, end).trim();

function makeHarness({ updateData = { id: 'lead-1', qualification: 'Da approfondire', updated_at: 'v2' }, updateError = null, reviewData = null, reviewError = null } = {}) {
  const calls = { updates: [], rpc: [] };
  const c = {
    from(table) {
      assert.equal(table, 'nextway_leads');
      return {
        update(payload) {
          calls.updates.push(payload);
          return {
            eq() { return this; },
            select() { return this; },
            maybeSingle: async () => ({ data: updateData, error: updateError })
          };
        }
      };
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return { data: reviewData, error: reviewError };
    }
  };
  const active = async () => ({ c });
  const leadPayload = record => ({ qualification: record.qualification, display_name: record.name || 'Lead test' });
  const fromCloud = record => ({ ...record, id: record.id, qualification: record.qualification });
  const factory = new Function('active', 'leadPayload', 'fromCloud', `return (${source});`);
  return { resolve: factory(active, leadPayload, fromCloud), calls };
}

const base = { name: 'Lead test', qualification: 'Da approfondire', manual_review_confirmed: false };
{
  const h = makeHarness();
  const result = await h.resolve('lead-1', 'v1', base);
  assert.equal(h.calls.updates.length, 1);
  assert.equal(h.calls.updates[0].qualification, 'Da approfondire');
  assert.equal(h.calls.rpc.length, 0);
  assert.equal(result.record.qualification, 'Da approfondire');
  assert.equal(result.updated_at, 'v2');
}

{
  const h = makeHarness();
  await assert.rejects(() => h.resolve('lead-1', 'v1', { ...base, qualification: 'Qualificato' }),
    /confermare nuovamente la revisione manuale/);
  assert.equal(h.calls.updates.length, 0, 'missing human confirmation must block the cloud update');
  assert.equal(h.calls.rpc.length, 0);
}

{
  const h = makeHarness({
    updateData: { id: 'lead-1', qualification: 'Da approfondire', updated_at: 'v2' },
    reviewData: { qualification: 'Qualificato', manual_reviewed_at: '2026-11-15T10:00:00Z', manual_reviewed_by: 'user-1', updated_at: 'v3' }
  });
  const result = await h.resolve('lead-1', 'v1', { ...base, qualification: 'Qualificato', manual_review_confirmed: true });
  assert.equal(h.calls.updates[0].qualification, 'Da approfondire', 'the direct update must be safely demoted');
  assert.deepEqual(h.calls.rpc, [{ name: 'nextway_confirm_lead_manual_review', args: { p_lead_id: 'lead-1' } }]);
  assert.equal(result.record.qualification, 'Qualificato');
  assert.equal(result.record.manual_reviewed_at, '2026-11-15T10:00:00Z');
  assert.equal(result.record.manual_review_confirmed, false);
  assert.equal(result.updated_at, 'v3');
}

{
  const h = makeHarness({
    updateData: { id: 'lead-1', qualification: 'Da approfondire', updated_at: 'v2' },
    reviewError: { message: 'Punteggio insufficiente' }
  });
  await assert.rejects(
    () => h.resolve('lead-1', 'v1', { ...base, qualification: 'Qualificato', manual_review_confirmed: true }),
    /Il Lead resta "Da approfondire"/
  );
  assert.equal(h.calls.updates[0].qualification, 'Da approfondire');
  assert.equal(h.calls.rpc.length, 1);
}

{
  const h = makeHarness({ updateData: null });
  await assert.rejects(() => h.resolve('lead-1', 'v1', base), /Il cloud è cambiato ancora/);
  assert.equal(h.calls.rpc.length, 0, 'a stale cloud version must never trigger manual review');
}

{
  const h = makeHarness({ updateError: { message: 'network error' } });
  await assert.rejects(() => h.resolve('lead-1', 'v1', base), error => error?.message === 'network error');
  assert.equal(h.calls.rpc.length, 0, 'a failed update must never trigger manual review');
}

console.log('NEXTWAY Lead conflict resolution: 6 mocked runtime scenarios passed.');
