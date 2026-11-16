import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('nextway-workspace-commercial-config.js','utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const api=sandbox.window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG;
assert.equal(api.version,1);
assert.equal(api.segments.length,9);
const valid=api.normalize({
  workspace_id:'ws-1',workspace_key:'zinzino-italia',workspace_name:'Zinzino Italia',
  partner_name:'Zinzino',market_country:'Italia',language_code:'it',
  commercial_config:{
    company:{id:'zinzino',name:'Zinzino',sector:['benessere','nutrizione'],positioning:'Configurazione test'},
    search_modifiers:{customers:[['omega 3','BalanceTest']],wellness_pro:['nutrizione','benessere']},
    consultant_channels:{general_website:{url:'https://example.com',label:'Sito generale'}},
    official_materials:{catalogue:{status:'da_caricare',source:'Catalogo ufficiale'}}
  }
});
assert.equal(valid.id,'zinzino');
assert.equal(valid.name,'Zinzino');
assert.equal(valid.workspaceId,'ws-1');
assert.deepEqual([...valid.searchModifiers.customers[0]],['omega 3','BalanceTest']);
assert.equal(valid.consultantChannels.general_website.url,'https://example.com');
assert.equal(valid.officialMaterials.catalogue.status,'da_caricare');
assert.throws(()=>api.normalize({workspace_key:'vuoto',workspace_name:'Workspace vuoto',commercial_config:{}}),/criteri di ricerca/);
assert.throws(()=>api.normalize({workspace_name:'Senza ID',commercial_config:{company:{name:'Azienda'},search_modifiers:{customers:['termine']}}}),/identificativo/);
const badUrl=api.normalize({workspace_key:'brand-x',workspace_name:'Brand X',commercial_config:{company:{id:'brand-x',name:'Brand X'},search_modifiers:{customers:['keyword']},consultant_channels:{bad:{url:'javascript:alert(1)'}}}});
assert.equal(Object.keys(badUrl.consultantChannels).length,0);
console.log('NEXTWAY workspace commercial config: 11 assertions passed.');
