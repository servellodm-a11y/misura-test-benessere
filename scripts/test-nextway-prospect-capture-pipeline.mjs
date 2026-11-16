import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const cloud = readFileSync('nextway-cloud.js', 'utf8');

function extractFunction(source, declaration, nextDeclaration) {
  const start = source.indexOf(declaration);
  const end = source.indexOf(nextDeclaration, start);
  assert.ok(start >= 0 && end > start, 'Could not locate ' + declaration);
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
  if (url.hostname.toLowerCase().startsWith('www.')) url.hostname = url.hostname.slice(4).toLowerCase();
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(key => url.searchParams.delete(key));
  while (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};
const addSource = extractFunction(cloud, 'function addSearchLeadToLocalArchive(userId,record){', 'let client=null');
const addSearchLeadToLocalArchive = new Function(
  'localArchiveKey', 'safeHttpUrl', 'readSearchArchiveRows',
  'canonicalSearchArchiveUrl', 'readSearchArchiveMeta', 'localStorage',
  'return (' + addSource.replace(/^function addSearchLeadToLocalArchive/, 'function') + ');'
)(
  userId => 'nextway_ai_records_v1:' + userId,
  safeHttpUrl,
  () => rows,
  canonicalSearchArchiveUrl,
  lead => {
    const marker = String.fromCharCode(10, 10) + '[NEXTWAY_PROSPECT_METADATA_V1]' + String.fromCharCode(10);
    const notes = String(lead.notes || '');
    const index = notes.indexOf(marker);
    if (index < 0) return {};
    try { return JSON.parse(notes.slice(index + marker.length)); } catch { return {}; }
  },
  localStorage
);

const payloadStart = cloud.indexOf('const CRM_LEAD_CATEGORIES=');
const payloadEnd = cloud.indexOf('async function resolveLeadConflict(', payloadStart);
assert.ok(payloadStart >= 0 && payloadEnd > payloadStart, 'CRM sync guard and payload must exist');
const payloadSource = cloud.slice(payloadStart, payloadEnd).trim();
const { leadPayload, leadSyncReadiness } = new Function(
  payloadSource + '; return { leadPayload, leadSyncReadiness };'
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
      organization: 'Studio Esempio',
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
assert.equal(lead.company_brand, 'Studio Esempio',
  'the prospect organization extracted by the search engine must be preserved as the CRM company field');
assert.match(lead.notes, /NEXTWAY_PROSPECT_METADATA_V1/);
assert.match(lead.notes, /linkedin:profilo-esempio/);

const cloudPayload = leadPayload(lead);
assert.equal(cloudPayload.category, null,
  'research-only results must never be written as a CRM partner category');
assert.equal(leadSyncReadiness(lead), 'category_requires_manual_review',
  'research results must remain local until a human assigns a CRM category');
const manuallyCategorized={...lead,category:'potential_partner'};
assert.equal(leadSyncReadiness(manuallyCategorized),'ready',
  'a human-assigned CRM category may sync while the Lead remains unqualified');
assert.equal(leadPayload(manuallyCategorized).category,'potential_partner');
assert.equal(leadPayload(manuallyCategorized).qualification,'Da approfondire',
  'manual categorization must not silently qualify a prospect');
const manuallyQualified={...manuallyCategorized,qualification:'Qualificato',identity_check:'confirmed',fit:30,activity:10,presence:5,interest:5,approach:5,manual_review_confirmed:true};
assert.equal(leadSyncReadiness(manuallyQualified),'ready',
  'a qualified Lead may proceed only after identity, score and explicit review gates');
assert.equal(leadPayload(manuallyQualified).qualification,'Da approfondire',
  'the cloud write must remain unqualified until the manual-review RPC succeeds');
assert.equal(leadSyncReadiness({...manuallyQualified,manual_review_confirmed:false}),'manual_review_required');
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

console.log('NEXTWAY prospect capture pipeline: 28 integration assertions passed.');
