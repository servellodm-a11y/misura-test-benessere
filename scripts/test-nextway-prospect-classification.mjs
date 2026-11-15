import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('nextway-motore-ricerca.html', 'utf8');
function extract(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Cannot extract ${startMarker}`);
  return html.slice(start, end);
}

const helpers = [
  extract('function assessNetworkerActivity(', 'function assessCustomerIntent('),
  extract('function assessCustomerIntent(', 'function assessOpportunityIntent('),
  extract('function assessOpportunityIntent(', 'function assessSearchEvidence('),
  extract('function classifyProspectTarget(', 'function classifyNetworkerStage(')
].join('\n');
const sandbox = {};
vm.runInNewContext(helpers + `
  this.assessOpportunityIntent = assessOpportunityIntent;
  this.classifyProspectTarget = classifyProspectTarget;
`, sandbox);

const opportunity = sandbox.assessOpportunityIntent;
assert.equal(opportunity('Cerco un lavoro extra', '', '').status, 'side_income');
assert.equal(opportunity('Cerco un progetto di business', '', '').status, 'business_seeking');
assert.equal(opportunity('Non cerco un lavoro extra', '', '').status, 'negated');
assert.equal(opportunity('Mi piacerebbe guadagnare di più', '', '').status, 'none',
  'Generic desire for more income must not be treated as an explicit job search');

const classify = sandbox.classifyProspectTarget;
assert.equal(classify('Mario Rossi | Nutrizionista', '', '', 'wellness_pro').segment, 'wellness_pro');
assert.equal(classify('Nutrizionisti Milano - elenco professionisti', '', '', 'wellness_pro').kind, 'unknown',
  'A generic directory title must not be promoted to an individual professional prospect');
assert.equal(classify('Mario Rossi | Founder', '', '', 'entrepreneur').segment, 'entrepreneur');
assert.equal(classify('Founder Italia - magazine', '', '', 'entrepreneur').kind, 'unknown',
  'A generic founder article/page title must not be promoted to an individual entrepreneur');
assert.equal(classify('Cerco un lavoro extra', '', '', 'side_income').segment, 'side_income');
assert.equal(classify('Cerco un nutrizionista', '', '', 'customers').kind, 'customer');
assert.equal(classify('Articolo sul network marketing', 'Il network marketing è un modello di vendita diretta', '', 'wellness_networker').kind, 'unknown',
  'An industry article must not be classified as an active networker');

console.log('NEXTWAY prospect classification contract: 8 checks passed.');
