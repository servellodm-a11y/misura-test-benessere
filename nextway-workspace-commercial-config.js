/* NEXTWAY workspace commercial configuration contract.
 * Workspace data is supplied by the protected RPC; this module validates and
 * normalizes it before the search engine or message-draft UI can use it.
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
  function normalizeWorkspaceCommercialConfig(payload){
    const raw=payload&&typeof payload==='object'?payload:{};
    const config=raw.commercial_config&&typeof raw.commercial_config==='object'?raw.commercial_config:{};
    const company=config.company&&typeof config.company==='object'?config.company:{};
    const id=clean(company.id||raw.workspace_key,80).toLowerCase();
    const name=clean(company.name||raw.partner_name||raw.workspace_name,160);
    const sector=Array.isArray(company.sector)?company.sector.map(x=>clean(x,80)).filter(Boolean).slice(0,20):clean(company.sector||raw.sector,160);
    const positioning=clean(company.positioning,1200);
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
      channels[key]={
        url,
        label:clean(value.label,120)||key,
        role:clean(value.role,180),
        companyBranding:clean(value.company_branding,80)||'aziendale',
        use:clean(value.use,500)
      };
    }
    const materials={};
    for(const [key,value] of Object.entries(officialMaterials).slice(0,30)){
      if(!value||typeof value!=='object')continue;
      materials[key]={status:clean(value.status,40)||'da_caricare',source:clean(value.source,300),version:clean(value.version,80),market:clean(value.market,80)};
    }
    if(!id||!name)throw new Error('Configurazione commerciale workspace incompleta: identificativo e nome azienda sono obbligatori.');
    if(!SEGMENTS.some(segment=>normalizedModifiers[segment].length))throw new Error('Configurazione commerciale workspace senza criteri di ricerca: ricerca sospesa.');
    return {
      id,name,active:true,country:clean(company.country||raw.market_country,80),
      language:clean(company.language||raw.language_code,12)||'it',
      sector,positioning,
      searchModifiers:normalizedModifiers,
      consultantChannels:channels,
      officialMaterials:materials,
      guardrails,
      workspaceId:clean(raw.workspace_id,80),
      workspaceKey:clean(raw.workspace_key,80)
    };
  }
  root.NEXTWAY_WORKSPACE_COMMERCIAL_CONFIG={
    version:1,
    segments:SEGMENTS.slice(),
    normalize:normalizeWorkspaceCommercialConfig
  };
})(typeof window!=='undefined'?window:globalThis);
