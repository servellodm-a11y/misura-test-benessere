import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('nextway-workspace-commercial-config.js','utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const api=sandbox.window.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG;
assert.equal(api.version,1);
assert.equal(api.segments.length,9);
const allModifiers=Object.fromEntries(api.segments.map(segment=>[segment,segment==='customers'?[['omega 3','BalanceTest']]:['termine '+segment]]));
const allQueries={
  it:Object.fromEntries(api.segments.map(segment=>[segment,[[segment,'query italiana '+segment]]])),
  en:Object.fromEntries(api.segments.map(segment=>[segment,[[segment,'english query '+segment]]]))
};
const baseCommercial={
  company:{id:'zinzino',name:'Zinzino',sector:['benessere','nutrizione'],positioning:'Configurazione test'},
  brand_terms:['zinzino','balancetest'],
  search_queries:allQueries,
  search_modifiers:allModifiers,
  consultant_channels:{general_website:{url:'https://example.com',label:'Sito generale'}},
  official_materials:{catalogue:{status:'da_caricare',source:'Catalogo ufficiale'}}
};
const valid=api.normalize({
  workspace_id:'ws-1',workspace_key:'zinzino-italia',workspace_name:'Zinzino Italia',
  partner_name:'Zinzino',market_country:'Italia',language_code:'it',
  commercial_config:baseCommercial
});
assert.equal(valid.id,'zinzino');
assert.equal(valid.name,'Zinzino');
assert.equal(valid.workspaceId,'ws-1');
assert.deepEqual([...valid.brandTerms],['zinzino','balancetest']);
assert.equal(valid.searchQueries.it.customers[0][1],'query italiana customers');
assert.equal(valid.searchQueries.en.customers[0][1],'english query customers');
assert.deepEqual([...valid.searchModifiers.customers[0]],['omega 3','BalanceTest']);
assert.equal(valid.consultantChannels.general_website.url,'https://example.com');
assert.equal(valid.officialMaterials.catalogue.status,'da_caricare');
assert.throws(()=>api.normalize({workspace_key:'vuoto',workspace_name:'Workspace vuoto',commercial_config:{}}),/Criteri commerciali mancanti/);
assert.throws(()=>api.normalize({workspace_name:'Senza ID',commercial_config:{company:{name:'Azienda'},search_modifiers:allModifiers,search_queries:allQueries}}),/identificativo/);
const incomplete={...baseCommercial,search_modifiers:{...allModifiers,wellness_pro:[]}};
assert.throws(()=>api.normalize({workspace_key:'incompleto',workspace_name:'Incompleto',commercial_config:incomplete}),/Criteri commerciali mancanti per: wellness_pro/);
const incompleteQueries={...baseCommercial,search_queries:{...allQueries,it:{...allQueries.it,side_income:[]}}};
assert.throws(()=>api.normalize({workspace_key:'query-incomplete',workspace_name:'Query incomplete',commercial_config:incompleteQueries}),/Query commerciali IT\/EN mancanti per: side_income/);
const unsafeChannel={...baseCommercial,consultant_channels:{bad:{url:'javascript:alert(1)'}}};
const badUrl=api.normalize({workspace_key:'brand-x',workspace_name:'Brand X',commercial_config:unsafeChannel});
assert.equal(Object.keys(badUrl.consultantChannels).length,0);

const seed=JSON.parse(fs.readFileSync('docs/companies/zinzino/workspace-commercial-settings.json','utf8'));
const seedWorkspace=api.normalize({
  workspace_id:'workspace-fixture',workspace_key:'zinzino-italia',workspace_name:'Zinzino Italia',
  partner_name:'Zinzino',market_country:'Italia',language_code:'it',commercial_config:seed
});
for(const segment of api.segments){
  assert.ok(seedWorkspace.searchModifiers[segment].length>0, 'Missing Zinzino modifiers: '+segment);
  assert.equal(seedWorkspace.searchQueries.it[segment].length,5,'Expected five Italian queries for '+segment);
  assert.equal(seedWorkspace.searchQueries.en[segment].length,5,'Expected five English queries for '+segment);
}
assert.equal(Object.keys(seedWorkspace.officialMaterials).length,5);
assert.ok(Object.values(seedWorkspace.officialMaterials).every(item=>item.status==='da_caricare'));
assert.ok(seedWorkspace.guardrails.some(rule=>rule.includes('promesse di reddito')));

const sql=fs.readFileSync('supabase/migrations/20261116140000_nextway_workspace_commercial_config.sql','utf8');
assert.match(sql,/security definer/i);
assert.match(sql,/set search_path = pg_catalog, public/i);
assert.match(sql,/auth\.uid\(\)/i);
assert.match(sql,/membership_status = 'active'/i);
assert.match(sql,/workspace_role = any/i);
assert.match(sql,/settings -> 'commercial'/i);
assert.match(sql,/grant execute on function public\.nextway_get_workspace_commercial_config\(uuid\) to authenticated/i);
assert.match(sql,/revoke all on function public\.nextway_get_workspace_commercial_config\(uuid\) from public, anon/i);
assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from)\b/i);
const searchHtml=fs.readFileSync('nextway-motore-ricerca.html','utf8');
assert.ok(searchHtml.includes('<script src="/nextway-workspace-commercial-config.js"></script>'));
assert.ok(searchHtml.includes("clientSession.rpc('nextway_get_workspace_commercial_config'"));
assert.ok(searchHtml.includes('activeCompany?.searchQueries?.it?.[seg]'));
assert.ok(searchHtml.includes('activeCompany?.searchQueries?.en?.[seg]'));
assert.ok(searchHtml.includes('activeCompany?.brandTerms'));
assert.ok(!searchHtml.includes('<script src="/nextway-company-config.js"></script>'));
console.log('NEXTWAY workspace commercial config: 25+ contract assertions passed.');
