/* NEXTWAY workspace commercial configuration contract.
 * Workspace data is supplied by the protected RPC; this module validates and
 * normalizes it before search and commercial guidance can use it.
 */
(function(root){
  'use strict';
  const SEGMENTS=[
    'customers','wellness_pro','wellness_networker','new_networker',
    'other_networker','exnetworker','entrepreneur','side_income','business_seeking'
  ];
  function clean(value,max=500){
    return typeof value==='string'?value.trim().slice(0,max):'';
  }
  function plainObject(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value);
  }
  function normalizeCommercialData(value,workspaceId){
    if(value==null)return null;
    if(!plainObject(value)||value.schema_version!==1)throw new Error('Base commerciale non valida: versione schema non supportata.');
    const company=plainObject(value.company)?value.company:{};
    if(clean(company.id,80).toLowerCase()!==workspaceId)throw new Error('La base commerciale appartiene a un brand diverso dal workspace.');
    if(!plainObject(value.customer)||!plainObject(value.partner))throw new Error('Base commerciale incompleta: sezioni Cliente e Partner obbligatorie.');
    const customer=value.customer,partner=value.partner;
    const premier=customer.premier_kits;
    const partnerKits=partner.partner_kits;
    if(!plainObject(premier)||!Array.isArray(premier.offers))throw new Error('Catalogo Premier Kit non valido.');
    if(!plainObject(partnerKits)||!Array.isArray(partnerKits.offers))throw new Error('Catalogo Partner Kit non valido.');
    const uniqueIds=offers=>{
      const ids=offers.map(item=>clean(item?.id,120));
      return ids.every(Boolean)&&new Set(ids).size===ids.length;
    };
    if(!uniqueIds(premier.offers)||!uniqueIds(partnerKits.offers))throw new Error('La base commerciale contiene offerte senza ID o con ID duplicati.');
    if(!plainObject(partner.compensation_plan))throw new Error('Stato del piano compensi Partner mancante.');
    const plan=partner.compensation_plan;
    if(plan.calculations_enabled===true&&(!Array.isArray(plan.rules)||plan.rules.length===0||plan.status!=='official_plan_validated')){
      throw new Error('Calcoli compensi bloccati: piano ufficiale non validato.');
    }
    const serialized=JSON.stringify(value);
    if(serialized.length>250000)throw new Error('Base commerciale troppo grande per la configurazione workspace.');
    return JSON.parse(serialized);
  }
  function normalizeWorkspaceCommercialConfig(payload){
    const raw=payload&&typeof payload==='object'?payload:{};
    const config=raw.commercial_config&&typeof raw.commercial_config==='object'?raw.commercial_config:{};
    const company=config.company&&typeof config.company==='object'?config.company:{};
    const id=clean(company.id||raw.workspace_key,80).toLowerCase();
    const name=clean(company.name||raw.partner_name||raw.workspace_name,160);
    const sector=Array.isArray(company.sector)?company.sector.map(x=>clean(x,80)).filter(Boolean).slice(0,20):clean(company.sector||raw.sector,160);
    const positioning=clean(company.positioning,1200);
    const brandTerms=Array.isArray(config.brand_terms)?config.brand_terms.map(x=>clean(x,100).toLocaleLowerCase('it')).filter(Boolean).slice(0,40):[name.toLocaleLowerCase('it')];
    const rawSearchQueries=config.search_queries&&typeof config.search_queries==='object'?config.search_queries:{};
    const searchQueries={it:{},en:{}};
    for(const language of ['it','en'])for(const segment of SEGMENTS){
      const entries=rawSearchQueries[language]?.[segment];
      searchQueries[language][segment]=Array.isArray(entries)?entries.slice(0,8).map((entry,index)=>Array.isArray(entry)?[clean(entry[0],120)||('Ricerca '+(index+1)),clean(entry[1],500)]:[('Ricerca '+(index+1)),clean(entry,500)]).filter(entry=>entry[1]):[];
    }
    const searchModifiers=config.search_modifiers&&typeof config.search_modifiers==='object'?config.search_modifiers:{};
    const consultantChannels=config.consultant_channels&&typeof config.consultant_channels==='object'?config.consultant_channels:{};
    const officialMaterials=config.official_materials&&typeof config.official_materials==='object'?config.official_materials:{};
    const guardrails=Array.isArray(config.guardrails)?config.guardrails.map(x=>clean(x,500)).filter(Boolean).slice(0,30):[];
    const normalizedModifiers={};
    for(const segment of SEGMENTS){
      const values=searchModifiers[segment];
      normalizedModifiers[segment]=Array.isArray(values)?values.slice(0,12).map(value=>Array.isArray(value)?value.map(x=>clean(x,100)).filter(Boolean).slice(0,8):clean(value,180)).filter(value=>Array.isArray(value)?value.length>0:!!value):[];
    }
    const channels={};
    for(const [key,value] of Object.entries(consultantChannels).slice(0,12)){
      if(!value||typeof value!=='object')continue;
      const url=clean(value.url,500);
      if(!/^https:\/\//i.test(url))continue;
      channels[key]={url,label:clean(value.label,120)||key,role:clean(value.role,180),companyBranding:clean(value.company_branding,80)||'aziendale',use:clean(value.use,500)};
    }
    const materials={};
    for(const [key,value] of Object.entries(officialMaterials).slice(0,30)){
      if(!value||typeof value!=='object')continue;
      materials[key]={status:clean(value.status,40)||'da_caricare',source:clean(value.source,300),version:clean(value.version,80),market:clean(value.market,80)};
    }
    if(!id||!name)throw new Error('Configurazione commerciale workspace incompleta: identificativo e nome azienda sono obbligatori.');
    const missingModifiers=SEGMENTS.filter(segment=>!normalizedModifiers[segment].length);
    if(missingModifiers.length)throw new Error('Criteri commerciali mancanti per: '+missingModifiers.join(', ')+'. Ricerca sospesa.');
    const missingQueries=SEGMENTS.filter(segment=>!searchQueries.it[segment].length||!searchQueries.en[segment].length);
    if(missingQueries.length)throw new Error('Query commerciali IT/EN mancanti per: '+missingQueries.join(', ')+'. Ricerca sospesa.');
    const commercialData=normalizeCommercialData(config.commercial_data,id);
    if(id==='zinzino'&&!commercialData)throw new Error('Base commerciale Zinzino Cliente/Partner obbligatoria. Caricare il modello completo prima del salvataggio.');
    return {
      id,name,active:true,country:clean(company.country||raw.market_country,80),
      language:clean(company.language||raw.language_code,12)||'it',
      sector,positioning,brandTerms,searchQueries,
      searchModifiers:normalizedModifiers,consultantChannels,officialMaterials,guardrails,
      commercialData,
      workspaceId:clean(raw.workspace_id,80),
      workspaceKey:clean(raw.workspace_key,80)
    };
  }
  function resolveAudience(value){
    const audience=clean(value,32).toLowerCase();
    return audience==='customer'||audience==='partner'?audience:null;
  }
  function getAudienceCatalog(normalizedConfig,audience){
    const selected=resolveAudience(audience),data=normalizedConfig?.commercialData;
    if(!selected||!data)return null;
    return selected==='customer'?data.customer:data.partner;
  }
  function getOffer(normalizedConfig,audience,offerId){
    const selected=resolveAudience(audience),catalog=getAudienceCatalog(normalizedConfig,audience);
    if(!selected||!catalog)return null;
    const offers=selected==='customer'?catalog.premier_kits?.offers:catalog.partner_kits?.offers;
    if(!Array.isArray(offers))return null;
    return offers.find(item=>item.id===clean(offerId,120))||null;
  }
  function canCalculateCompensation(normalizedConfig){
    const plan=normalizedConfig?.commercialData?.partner?.compensation_plan;
    return !!plan&&plan.calculations_enabled===true&&plan.status==='official_plan_validated'&&Array.isArray(plan.rules)&&plan.rules.length>0;
  }
  root.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG={
    version:2,segments:SEGMENTS.slice(),normalize:normalizeWorkspaceCommercialConfig,
    resolveAudience,getAudienceCatalog,getOffer,canCalculateCompensation
  };
})(typeof window!=='undefined'?window:globalThis);
