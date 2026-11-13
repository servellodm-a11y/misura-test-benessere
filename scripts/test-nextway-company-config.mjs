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
assert.ok(searchHtml.includes('company_id:activeCompany?.id||null'));
assert.ok(searchHtml.includes('company_id:activeCompany?.id||\\'zinzino\\''));
assert.ok(archiveHtml.includes('partner_company_id:String(record.company_id||\\'zinzino\\')'));
assert.ok(archiveHtml.includes('partner_company_name:String(record.company_name||\\'Zinzino\\')'));
assert.ok(archiveHtml.includes("'partner_company_id','partner_company_name'"));

const docs = fs.readFileSync('docs/companies/zinzino/README.md', 'utf8');
assert.ok(docs.includes('Piano compensi'));
assert.ok(docs.includes('Non inventare prezzi'));
assert.ok(docs.includes('Misura Test Benessere'));
assert.ok(docs.includes('Sito replica personale Zinzino'));
console.log('NEXTWAY company configuration contract: PASS');
