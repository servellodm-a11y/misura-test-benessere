import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('nextway-motore-ricerca.html','utf8');
const start=html.indexOf('function assessProspectContactability(');
const end=html.indexOf('function safeUrl(',start);
assert.ok(start>=0&&end>start,'contactability assessor must be present and extractable');
const sandbox={URL};
vm.runInNewContext(html.slice(start,end)+';this.assessProspectContactability=assessProspectContactability;',sandbox);
const assess=sandbox.assessProspectContactability;
const profile={name:'Mario Rossi',identity_status:'Persona individuale'};
const generic=assess({emails:['info@studio.it'],phones:['+39 02 12345678'],whatsapp:[],socials:['https://www.linkedin.com/company/studio-salute']},profile,'https://studio.it','Mario Rossi · Nutrizionista\ninfo@studio.it\n+39 02 12345678');
assert.equal(generic.status,'solo_recapiti_pubblici_non_associati');
assert.equal(generic.emails[0].status,'pubblico_generico');
assert.equal(generic.socials[0].status,'social_aziendale');
assert.equal(generic.counts.associato_persona,0);

const personal=assess({emails:['mario.rossi@example.it'],phones:[],whatsapp:[],socials:['https://www.linkedin.com/in/mario-rossi-123']},profile,'https://example.it/mario','Profilo di Mario Rossi · Nutrizionista');
assert.equal(personal.status,'canale_individuale_da_confermare');
assert.equal(personal.emails[0].status,'associato_persona');
assert.equal(personal.socials[0].status,'social_personale');
assert.ok(personal.disclaimer.includes('non prova titolarità'));

const uncertain=assess({emails:['studio@example.it'],phones:[],whatsapp:[],socials:['https://www.instagram.com/studiosalute']},profile,'https://example.it','Mario Rossi lavora presso Studio Salute');
assert.equal(uncertain.emails[0].status,'pubblico_generico');
assert.equal(uncertain.socials[0].status,'da_verificare');

const empty=assess({emails:[],phones:[],whatsapp:[],socials:[]},{name:'',identity_status:'Non confermata'},'https://example.it','');
assert.equal(empty.status,'nessun_recapito');
assert.ok(empty.missing_evidence.includes('Identità individuale confermata'));
assert.ok(empty.missing_evidence.includes('Recapito direttamente associato alla persona'));
assert.ok(empty.missing_evidence.includes('Profilo social personale verificato'));
console.log('NEXTWAY prospect contactability evidence contract: 14 checks passed.');
