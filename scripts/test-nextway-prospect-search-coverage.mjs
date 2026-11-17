import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('nextway-motore-ricerca.html','utf8');
const start=html.indexOf('const refinedItalianQueries=');
const end=html.indexOf('const refinedEnglishQueries=',start);
assert.ok(start>=0&&end>start,'Italian query packs must be extractable');
const enStart=end;
const enEnd=html.indexOf('const segmentGuidance=',enStart);
assert.ok(enEnd>enStart,'English query packs must be extractable');
const sandbox={};
vm.runInNewContext(html.slice(start,end)+'\n'+html.slice(enStart,enEnd)+';this.it=refinedItalianQueries;this.en=refinedEnglishQueries;',sandbox);
const required=['customers','wellness_pro','wellness_networker','new_networker','other_networker','entrepreneur','side_income','business_seeking','exnetworker'];
for(const segment of required){
  assert.ok(Array.isArray(sandbox.it[segment]),`Missing Italian query pack: ${segment}`);
  assert.equal(sandbox.it[segment].length,5,`Italian segment ${segment} must have five search variants`);
  assert.ok(Array.isArray(sandbox.en[segment]),`Missing English query pack: ${segment}`);
  assert.equal(sandbox.en[segment].length,5,`English segment ${segment} must have five search variants`);
  const labels=sandbox.it[segment].map(item=>item[0]);
  assert.equal(new Set(labels).size,5,`Italian labels must be distinct for ${segment}`);
}
for(const segment of ['side_income','business_seeking']){
  const text=sandbox.it[segment].map(item=>item[1]).join(' ').toLowerCase();
  assert.match(text,/cerco|valuto|voglio|vorrei/,`Intent-led Italian query language required for ${segment}`);
}
assert.ok(html.includes('Seleziona la query per la ricerca singola'),'The UI must label the selector as single-query mode');
assert.ok(html.includes('Esegui tutte le 5 ricerche'),'The UI must also expose the explicit five-query batch mode');
console.log('NEXTWAY prospect search coverage contract: 28 checks passed.');
