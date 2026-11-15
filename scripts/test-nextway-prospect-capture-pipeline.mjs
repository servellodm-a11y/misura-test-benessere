import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const cloud = readFileSync('nextway-cloud.js', 'utf8');

function extractFunction(source, declaration, nextDeclaration) {
  const start = source.indexOf(declaration);
  const end = source.indexOf(nextDeclaration, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${declaration}`);
  return source.slice(start, end).trim();
}

const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};
const rows = [];
const safeHttpUrl = value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
};
const canonicalSearchArchiveUrl = value => {
  const url = new URL(value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\\./, '');
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(key => url.searchParams.delete(key));
  url.pathname = url.pathname.replace(/\\/+$/, '') || '/';
  return url.toString().replace(/\\/$/, '');
};
const addSource = extractFunction(cloud, 'function addSearchLeadToLocalArchive(userId,record){', '\\n let client=null');
const addSearchLeadToLocalArchive = new Function(
  'localArchiveKey', 'safeHttpUrl', 'readSearchArchiveRows',
  'canonicalSearchArchiveUrl', 'readSearchArchiveMeta', 'localStorage',
  `return (${addSource.replace(/^function addSearchLeadToLocalArchive/, 'function')});`
)(
  userId => 'nextway_ai_records_v1:' + userId,
  safeHttpUrl,
  () => rows,
  canonicalSearchArchiveUrl,
  lead => {
    const marker = '\\n\\n[NEXTWAY_PROSPECT_METADATA_V1]\\n';
    const notes = String(lead.notes || '');
    const index = notes.indexOf(marker);
    if (index < 0) return {};
    try { return JSON.parse(notes.slice(index + marker.length)); } catch { return {}; }
  },
  localStorage
);

const payloadSource = extractFunction(cloud, 'function leadPayload(x){', 'async function resolveLeadConflict(');
const leadPayload = new Function(
  `return (${payloadSource.replace(/^function leadPayload/, 'function')});`
)();

const fixture = {
  title: 'Consulente benessere · profilo pubblico',
  evidence: 'La pagina pubblica descrive il ruolo professionale e i servizi offerti.',
  url: 'https://www.example.org/profilo?utm_source=fixture',
  sources: [{
    url: 'https://www.example.org/profilo',
    title: 'Profilo professionale',
    snippet: 'Consulente benessere',
    evidence: 'Ruolo dichiarato nella pagina originale.',
    collected_at: '2026-11-15T09:00:00.000Z'
  }],
  category: 'research_result',
  partner_type: 'Professionista salute e benessere',
  identity_keys: ['linkedin:profilo-esempio'],
  public_contacts: { emails: ['persona@example.org'], phones: [], whatsapp: [], socials: [] },
  evidence_quality: {
    score: 78, identityScore: 30, relevanceScore: 32, evidenceScore: 16,
    identity: 'Identità da verificare', entityType: 'Persona candidata',
    reasons: ['Ruolo indicato nella fonte'],
    prospect_profile: {
      name: 'Persona Esempio',
      profession: 'Consulente benessere',
      company_brand: 'Studio Esempio',
      location: 'Milano'
    },
    target_classification: { segment: 'wellness_pro' },
    commercial_qualification: {
      status: 'Prospect interessante · da verificare',
      commercial_fit: { commercial_outcome: 'insufficient_evidence' }
    }
  },
  company_id: 'zinzino',
  company_name: 'Zinzino'
};

const captured = addSearchLeadToLocalArchive('user-fixture', fixture);
assert.equal(captured.duplicate, false, 'first capture must create a local CRM draft');
const lead = captured.lead;
assert.equal(rows.length, 1);
assert.equal(lead.category, 'research_result');
assert.equal(lead.qualification, 'Da approfondire', 'capture must never auto-qualify a Lead');
assert.equal(lead.identity_check, 'pending', 'identity must remain pending until human verification');
assert.equal(lead.requires_manual_qualification, true);
assert.equal(lead.fit_status, 'Non valutato');
assert.equal(lead.status, 'Da verificare');
assert.equal(lead.local_dirty, true, 'new capture must remain queued for deliberate CRM sync');
assert.equal(lead.name, 'Persona Esempio');
assert.equal(lead.profession, 'Consulente benessere');
assert.match(lead.notes, /NEXTWAY_PROSPECT_METADATA_V1/);
assert.match(lead.notes, /linkedin:profilo-esempio/);

const cloudPayload = leadPayload(lead);
assert.equal(cloudPayload.category, 'research_result',
  'cloud payload must preserve the research-only category');
assert.equal(cloudPayload.qualification, 'Da approfondire');
assert.equal(cloudPayload.identity_check, 'pending');
assert.equal(cloudPayload.status, 'Da verificare');

const duplicate = addSearchLeadToLocalArchive('user-fixture', {
  ...fixture,
  url: 'https://example.org/profilo?utm_campaign=duplicate'
});
assert.equal(duplicate.duplicate, true, 'canonical URL variants must not create duplicate CRM drafts');
assert.equal(rows.length, 1, 'duplicate capture must leave the archive unchanged');

assert.throws(() => addSearchLeadToLocalArchive('user-fixture', {
  ...fixture, url: 'javascript:alert(1)'
}), /URL della fonte non valido/);
assert.equal(rows.length, 1, 'invalid source URLs must not write a CRM draft');

console.log('NEXTWAY prospect capture pipeline: 19 integration assertions passed.');
