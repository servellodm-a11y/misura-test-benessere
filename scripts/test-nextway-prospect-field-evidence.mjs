import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('nextway-motore-ricerca.html','utf8');
const start=html.indexOf('function assessProspectFieldEvidence(');
const end=html.indexOf('function buildEvidenceReview(',start);
assert.ok(start>=0&&end>start,'profile field evidence assessor must be present');
const sandbox={};
vm.runInNewContext(html.slice(start,end)+';this.assessProspectFieldEvidence=assessProspectFieldEvidence;',sandbox);
const assess=sandbox.assessProspectFieldEvidence;
const profile={name:'Mario Rossi',profession:'Nutrizionista',organization:'Studio Salute',location:'Milano'};
const fields=assess(profile,'Mario Rossi | Nutrizionista','Riceve a Milano presso Studio Salute','');
assert.equal(fields.length,4);
assert.equal(fields[0].status,'presente_nella_fonte');
assert.equal(fields[0].source,'Titolo della pagina');
assert.equal(fields[1].status,'presente_nella_fonte');
assert.equal(fields[2].status,'presente_nella_fonte');
assert.equal(fields[3].status,'presente_nella_fonte');
assert.ok(fields.every(item=>item.note.includes('non verifica indipendente')));

const missing=assess({name:'Mario Rossi',profession:'Nutrizionista',organization:'Non rilevata',location:'Non rilevata'},'Mario Rossi','','');
assert.equal(missing[0].status,'presente_nella_fonte');
assert.equal(missing[1].status,'estratto_non_rintracciato');
assert.equal(missing[2].status,'non_rilevato');
assert.equal(missing[3].status,'non_rilevato');

const partial=assess({name:'Mario Rossi',profession:'Nutrizionista',organization:'Studio Salute',location:'Milano'},'Mario Rossi','Professionista sanitario','Studio Salute · Milano');
assert.equal(partial[0].status,'presente_nella_fonte');
assert.equal(partial[1].status,'estratto_non_rintracciato');
assert.equal(partial[2].status,'presente_nella_fonte');
assert.equal(partial[3].status,'presente_nella_fonte');

const accented=assess({name:'José Bianchi',profession:'Nutrizionista',organization:'Centro Benessere',location:'Forlì'},'Jose Bianchi · Nutrizionista','Centro Benessere a Forli','');
assert.equal(accented[0].status,'presente_nella_fonte');
assert.equal(accented[2].status,'presente_nella_fonte');
assert.equal(accented[3].status,'presente_nella_fonte');
console.log('NEXTWAY prospect profile-field provenance contract: 18 checks passed.');
