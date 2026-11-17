import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('nextway-motore-ricerca.html','utf8');
const start=html.indexOf('function assessProspectDimensions(');
const end=html.indexOf('function buildEvidenceReview(',start);
assert.ok(start>=0&&end>start,'Prospect dimension assessor must be present and extractable');
const sandbox={};
vm.runInNewContext(html.slice(start,end)+';this.assessProspectDimensions=assessProspectDimensions;',sandbox);
const assess=sandbox.assessProspectDimensions;
const source={reliability_score:75,reliability_label:'Profilo professionale dichiarato',freshness_score:100,freshness_label:'Recente',published_at:'2026-11-01T00:00:00.000Z',age_days:14};
const target={segment:'wellness_pro',confidence:'alta',reason:'Professione coerente'};
const evidence={individual:true};
const profile={name:'Mario Rossi'};
const priority={priority_score:82};
const explicit=assess({commercial_outcome:'partner_potential',commercial_outcome_label:'Ricerca opportunità dichiarata',segment_match:true},source,target,evidence,profile,priority);
assert.equal(explicit.source_reliability.score,75);
assert.equal(explicit.freshness.score,100);
assert.equal(explicit.segment_relevance.score,100);
assert.equal(explicit.commercial_opportunity.score,100);
assert.equal(explicit.priority_score,82);
assert.equal(explicit.missing_evidence.includes('Dichiarazione personale di interesse o disponibilità'),false);

const noIntent=assess({commercial_outcome:'generic_result',commercial_outcome_label:'Interesse non dichiarato',segment_match:true},source,target,evidence,profile,priority);
assert.equal(noIntent.segment_relevance.score,100);
assert.equal(noIntent.commercial_opportunity.score,25);
assert.ok(noIntent.reasons.some(reason=>reason.includes('Non è presente una dichiarazione esplicita')));
assert.ok(noIntent.missing_evidence.includes('Dichiarazione personale di interesse o disponibilità'));

const weak=assess({commercial_outcome:'generic_result',segment_match:false}, {...source,reliability_score:30,published_at:null,age_days:null,freshness_score:50}, {...target,segment:'entrepreneur'}, {...evidence,individual:false}, {}, priority);
assert.equal(weak.source_reliability.score,30);
assert.equal(weak.segment_relevance.score,0);
assert.equal(weak.commercial_opportunity.score,0);
assert.ok(weak.missing_evidence.includes('Identità individuale confermata'));
assert.ok(weak.missing_evidence.includes('Data di pubblicazione o aggiornamento'));
assert.ok(weak.missing_evidence.includes('Ruolo/segmento coerente con la ricerca'));
assert.ok(weak.disclaimer.includes('non certificano'));
console.log('NEXTWAY explainable prospect dimensions contract: 18 checks passed.');
