import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const configSource = fs.readFileSync('nextway-company-config.js', 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(configSource, sandbox);
const config = sandbox.window.NEXTWAY_COMPANY_CONFIG;

assert.equal(config?.activeCompanyId, 'zinzino');
assert.equal(config?.active?.id, 'zinzino');
assert.equal(config?.active?.name, 'Zinzino');
// Convert the VM array to a host-realm array before strict deep comparison.
assert.deepEqual([...Object.keys(config.companies)], ['zinzino']);

const channels = config.active.consultantChannels;
assert.equal(channels?.generalWellnessWebsite?.url, 'https://misura-test-benessere.netlify.app');
assert.equal(channels?.generalWellnessWebsite?.companyBranding, 'neutro');
assert.equal(channels?.zinzinoReplicaWebsite?.url, 'https://www.zinzino.com/2017234122');
assert.equal(channels?.zinzinoReplicaWebsite?.companyBranding, 'Zinzino');
assert.notEqual(channels.generalWellnessWebsite.url, channels.zinzinoReplicaWebsite.url);

const requiredSegments = [
  'customers', 'wellness_pro', 'wellness_networker', 'new_networker',
  'other_networker', 'exnetworker', 'entrepreneur', 'side_income',
  'business_seeking'
];
for (const segment of requiredSegments) {
  assert.ok(Array.isArray(config.active.searchModifiers[segment]), `Missing Zinzino search modifiers: ${segment}`);
  assert.ok(config.active.searchModifiers[segment].length > 0, `Empty Zinzino search modifiers: ${segment}`);
}

for (const key of ['productCatalogue', 'compensationPlan', 'productTraining', 'complianceGuidelines', 'brandPresentation']) {
  assert.equal(config.active.officialMaterials[key]?.status, 'da_caricare', `Official source must be uploaded/verified: ${key}`);
}

const searchHtml = fs.readFileSync('nextway-motore-ricerca.html', 'utf8');
const archiveHtml = fs.readFileSync('nextway-ai.html', 'utf8');
assert.ok(searchHtml.includes('<script src="/nextway-company-config.js"></script>'));
assert.ok(searchHtml.includes('const activeCompany=companyConfig?.active||null'));
assert.ok(searchHtml.includes('const companyTerms=activeCompany?.searchModifiers?.[seg]||[]'));
assert.ok(searchHtml.includes('function createMessageDraftPanel('));
assert.ok(searchHtml.includes('Sito da proporre (facoltativo)'));
assert.ok(searchHtml.includes('Nessun link — consigliato per il primo contatto'));
assert.ok(searchHtml.includes('Misura Test Benessere') || searchHtml.includes('generalWellnessWebsite'));
assert.ok(searchHtml.includes('Per approfondire, qui trova il mio riferimento:'));
assert.ok(searchHtml.includes('linkSelect.value=recommended'));
assert.ok(searchHtml.includes("segment==='customers'||segment==='wellness_pro'?'general'"));
assert.ok(searchHtml.includes("explicitZinzinoInterest?'replica':'none'"));
// Compile the browser script without executing DOM/network actions.
const inlineScripts = [...searchHtml.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].map(match => match[1]);
const messageScript = inlineScripts.find(source => source.includes('function createMessageDraftPanel('));
assert.ok(messageScript, 'Inline search script with message drafts must exist');
new vm.Script(messageScript, { filename: 'nextway-motore-ricerca.inline.js' });

assert.ok(searchHtml.includes('company_id:activeCompany?.id||null'));
assert.ok(searchHtml.includes('company_id:activeCompany?.id||\\'zinzino\\''));
assert.ok(archiveHtml.includes('partner_company_id:String(record.company_id||\\'zinzino\\')'));
assert.ok(archiveHtml.includes('partner_company_name:String(record.company_name||\\'Zinzino\\')'));
assert.ok(archiveHtml.includes("'partner_company_id','partner_company_name'"));
assert.ok(archiveHtml.includes('<script src="/nextway-company-config.js"></script>'));
assert.ok(archiveHtml.includes('Prepara un messaggio per questo Lead'));
assert.ok(archiveHtml.includes('Sito da proporre (facoltativo)'));
assert.ok(archiveHtml.includes('BOZZA DA INVIARE MANUALMENTE'));
assert.ok(archiveHtml.includes('Nessun link aggiunto'));
assert.ok(archiveHtml.includes('websites.generalWellnessWebsite'));
assert.ok(archiveHtml.includes('websites.zinzinoReplicaWebsite'));
const archiveScripts = [...archiveHtml.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].map(match => match[1]);
const crmScript = archiveScripts.find(source => source.includes('Prepara un messaggio per questo Lead'));
assert.ok(crmScript, 'CRM inline script with message drafts must exist');
new vm.Script(crmScript, { filename: 'nextway-ai.inline.js' });


const docs = fs.readFileSync('docs/companies/zinzino/README.md', 'utf8');
assert.ok(docs.includes('Piano compensi'));
assert.ok(docs.includes('Non inventare prezzi'));
assert.ok(docs.includes('Misura Test Benessere'));
assert.ok(docs.includes('Sito replica personale Zinzino'));
console.log('NEXTWAY company configuration contract: PASS');
