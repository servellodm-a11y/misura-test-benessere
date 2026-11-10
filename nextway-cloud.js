(function(){
'use strict';
const CFG='nextway_supabase_config_v1',KEY='nextway_ai_records_v1';
 function localArchiveKey(userId){if(typeof userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))throw new Error('Profilo non valido per archivio locale.');return KEY+':'+userId;}
 function activateLocalArchive(userId){const archive=window.NEXTWAY_LOCAL_ARCHIVE;if(!archive||typeof archive.activate!=='function')throw new Error('Archivio locale non pronto. Ricarica la pagina.');archive.activate(userId);}
 function clearLocalArchive(){const archive=window.NEXTWAY_LOCAL_ARCHIVE;if(archive&&typeof archive.clear==='function')archive.clear();}
const style=`#nw-cloud{max-width:1160px;margin:18px auto;padding:0 18px;font:14px system-ui;color:#172033}#nw-cloud .nwbox{background:#fff;border:1px solid #dce4ef;border-radius:12px;padding:15px;margin:10px 0}#nw-cloud .nwgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#nw-cloud input,#nw-cloud textarea{width:100%;padding:9px;border:1px solid #ccd5e2;border-radius:7px;font:inherit;margin:4px 0 8px}#nw-cloud button{border:0;border-radius:7px;padding:9px 12px;background:#2457d6;color:#fff;font-weight:650;cursor:pointer;margin:4px 5px 4px 0}#nw-cloud button.secondary{background:#edf1f7;color:#24344d}#nw-cloud .nwmuted{color:#647187;font-size:12px}#nw-cloud .nwresult{border-top:1px solid #e5eaf1;padding:10px 0;overflow-wrap:anywhere}#nw-cloud .nwresult a{color:#2457d6}#nw-cloud .nwstatus{font-weight:650;margin-left:8px}@media(max-width:650px){#nw-cloud .nwgrid{grid-template-columns:1fr}}`;
function init(){
 if(document.getElementById('nw-cloud'))return;
 const header=document.querySelector('header');if(!header)return;
 const root=document.createElement('section');root.id='nw-cloud';
 root.innerHTML=`<style>${style}</style><div class="nwbox"><h2 style="margin:0 0 8px">NEXTWAY · Connessione centrale</h2><p class="nwmuted">Autenticazione personale, ricerca pubblica assistita e archivio Supabase. I risultati non diventano Lead finché non li verifichi e li acquisisci manualmente.</p><div class="nwgrid"><label>URL progetto Supabase<input id="nw-url" type="url" placeholder="https://xxxx.supabase.co"></label><label>Publishable key<input id="nw-key" type="password" autocomplete="off" placeholder="sb_publishable_..."></label></div><div><button id="nw-config">Salva configurazione</button><span id="nw-status" class="nwstatus">Non configurato</span></div><div class="nwgrid"><label>Email<input id="nw-email" type="email" autocomplete="username" placeholder="email account"></label><label>Password<input id="nw-password" type="password" autocomplete="current-password" placeholder="Password Supabase"></label></div><button id="nw-login">Accedi</button><button id="nw-logout" class="secondary">Esci</button><button id="nw-sync" class="secondary">Sincronizza archivio locale</button><button id="nw-pull" class="secondary">Carica archivio cloud</button><p id="nw-message" class="nwmuted" aria-live="polite">La configurazione salva solo URL e publishable key nel browser. La password non viene memorizzata.</p></div><div class="nwbox"><h3 style="margin:0 0 8px">Ricerca web assistita</h3><label>Query di ricerca<textarea id="nw-query" rows="2" placeholder='Es. "network marketing" "cerco collaboratori" Italia'></textarea></label><button id="nw-search">Cerca sul web</button><span class="nwmuted">La ricerca richiede login e Edge Function pubblicata su Supabase.</span><div id="nw-results"></div></div><div class="nwbox" id="nw-org-activity" hidden><h3 style="margin:0 0 8px">Registro attività organizzazione</h3><p class="nwmuted">Vista amministratore · eventi audit Lead · massimo 100 per caricamento. Non mostra snapshot o note personali.</p><div class="nwgrid"><label>Dal<input id="nw-act-from" type="date"></label><label>Al<input id="nw-act-to" type="date"></label><label>Operazione<select id="nw-act-action"><option value="">Tutte</option><option value="INSERT">Creazione</option><option value="UPDATE">Modifica</option><option value="DELETE">Eliminazione</option></select></label><label>ID profilo proprietario (facoltativo)<input id="nw-act-owner" type="text" placeholder="UUID, se necessario"></label></div><button id="nw-act-load">Applica filtri</button><button id="nw-act-more" class="secondary" disabled>Carica altri</button><span id="nw-act-status" class="nwmuted" aria-live="polite"></span><div id="nw-act-results"></div></div>`;
 header.insertAdjacentElement('afterend',root);
 const $=id=>document.getElementById(id),say=t=>{$('nw-message').textContent=t};
 const safeHttpUrl=value=>{try{const u=new URL(String(value??'').trim());return ['http:','https:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password?u.href:''}catch{return ''}};
 let client=null,clientConfig='',session=null,authListenerBound=false;
 try{const cfg=JSON.parse(localStorage.getItem(CFG)||'{}');$('nw-url').value=cfg.url||'';$('nw-key').value=cfg.key||'';}catch(e){}
 function getConfig(){return {url:$('nw-url').value.trim().replace(/\/$/,''),key:$('nw-key').value.trim()};}
 function setup(){const c=getConfig();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url)||!c.key){throw new Error('Inserisci URL Supabase valido e publishable key.');}if(!window.supabase||!window.supabase.createClient)throw new Error('Libreria Supabase non caricata. Ricarica la pagina.');localStorage.setItem(CFG,JSON.stringify(c));if(!client||clientConfig!==c.url+'|'+c.key){clearLocalArchive();session=null;authListenerBound=false;client=window.supabase.createClient(c.url,c.key);clientConfig=c.url+'|'+c.key;if(!authListenerBound){client.auth.onAuthStateChange((event,nextSession)=>{const previousId=session?.user?.id||null;session=nextSession;const nextId=session?.user?.id||null;if(previousId!==nextId){clearLocalArchive();$('nw-results').replaceChildren();$('nw-act-results').replaceChildren();$('nw-org-activity').hidden=true;orgActivityOffset=0;}if(session){try{activateLocalArchive(session.user.id)}catch(e){clearLocalArchive()}}else clearLocalArchive();status();});authListenerBound=true;}}return client;}
 function requireClient(){return client||setup();}
 function status(){const s=session?('Connesso: '+(session.user.email||session.user.id)):'Non autenticato';$('nw-status').textContent=s;}
 $('nw-config').onclick=()=>{try{setup();say('Configurazione salvata. Ora accedi con il tuo account Supabase.');}catch(e){say(e.message)}};
 $('nw-login').onclick=async()=>{try{const c=requireClient();const {data,error}=await c.auth.signInWithPassword({email:$('nw-email').value.trim(),password:$('nw-password').value});if(error)throw error;session=data.session;activateLocalArchive(session.user.id);$('nw-password').value='';status();refreshOrgActivityVisibility();say('Accesso effettuato. Archivio personale caricato. Gli archivi legacy non associati a un profilo restano separati.');}catch(e){say('Accesso non riuscito: '+e.message)}};
 $('nw-logout').onclick=async()=>{try{if(client)await client.auth.signOut();session=null;clearLocalArchive();$('nw-results').replaceChildren();$('nw-act-results').replaceChildren();status();refreshOrgActivityVisibility();say('Sessione chiusa. Archivio personale rimosso dalla memoria della pagina.');}catch(e){say(e.message)}};
 async function active(){const c=requireClient();const {data,error}=await c.auth.getSession();if(error)throw error;session=data.session;if(!session){clearLocalArchive();throw new Error('Accedi prima di procedere.');}activateLocalArchive(session.user.id);return {c,s:session};}
 async function isPlatformAdmin(){
  const {c,s}=await active();
  const {data,error}=await c.from('profiles').select('role').eq('id',s.user.id).maybeSingle();
  if(error)throw error;
  return data?.role==='platform_admin';
 }
 async function getOrganizationActivity(filters={}){
  const {c}=await active();
  if(!(await isPlatformAdmin()))throw new Error('Accesso riservato a platform_admin.');
  const limit=Math.min(100,Math.max(1,Number(filters.limit)||100));
  const offset=Math.max(0,Number(filters.offset)||0);
  let q=c.from('nextway_lead_audit_logs')
   .select('id,lead_id,lead_owner_profile_id,actor_profile_id,action,changed_fields,created_at,lead_name:after_data->>display_name,lead_name_before:before_data->>display_name')
   .order('created_at',{ascending:false}).range(offset,offset+limit-1);
  if(filters.from)q=q.gte('created_at',filters.from);
  if(filters.to)q=q.lte('created_at',filters.to);
  if(filters.action)q=q.eq('action',filters.action);
  if(filters.ownerId)q=q.eq('lead_owner_profile_id',filters.ownerId);
  const {data,error}=await q;
  if(error)throw error;
  const events=data||[];
  const profileIds=[...new Set(events.flatMap(ev=>[ev.lead_owner_profile_id,ev.actor_profile_id]).filter(Boolean))];
  const profileNames={};
  if(profileIds.length){
   const {data:profiles,error:profilesError}=await c.from('profiles').select('id,full_name').in('id',profileIds);
   if(!profilesError)(profiles||[]).forEach(p=>{const name=String(p.full_name||'').trim();if(name)profileNames[p.id]=name;});
   const {data:partners,error:partnersError}=await c.from('partner_details').select('profile_id,first_name,last_name').in('profile_id',profileIds);
   if(!partnersError)(partners||[]).forEach(p=>{
    const name=[p.first_name,p.last_name].filter(Boolean).join(' ').trim();
    if(name)profileNames[p.profile_id]=name;
   });
  }
  events.forEach(ev=>{
   ev.lead_owner_name=ev.lead_owner_profile_id?(profileNames[ev.lead_owner_profile_id]||'Nome non disponibile'):'n/d';
   ev.actor_name=ev.actor_profile_id?(profileNames[ev.actor_profile_id]||'Nome non disponibile'):'identità non disponibile';
  });
  return {events,offset,limit,hasMore:events.length===limit};
 }
 async function refreshOrgActivityVisibility(){
  const panel=$('nw-org-activity');if(!panel)return;
  panel.hidden=true;
  if(!session)return;
  try{if(await isPlatformAdmin())panel.hidden=false;}catch(e){panel.hidden=true;}
 }
 function renderOrganizationActivity(events,append=false){
  const target=$('nw-act-results');if(!append)target.replaceChildren();
  if(!events.length&&!append){const p=document.createElement('p');p.className='nwmuted';p.textContent='Nessuna attività trovata con i filtri selezionati.';target.append(p);return;}
  events.forEach(ev=>{
   const item=document.createElement('div');item.className='nwresult';
   const title=document.createElement('strong');
   const verb=ev.action==='INSERT'?'Creato':ev.action==='DELETE'?'Eliminato':'Modificato';
   title.textContent=verb+' · '+(ev.lead_name||ev.lead_name_before||'Lead non più disponibile')+' · '+new Date(ev.created_at).toLocaleString('it-IT');
   const meta=document.createElement('p');meta.className='nwmuted';
   meta.textContent='Proprietario: '+(ev.lead_owner_name||'Nome non disponibile')+' · Operatore: '+(ev.actor_name||'identità non disponibile');
   const fieldNames={display_name:'Nome',profession:'Professione',company_brand:'Azienda / brand',location:'Località',category:'Categoria',partner_type:'Profilo partner',discovery_mode:'Modalità',public_signal:'Segnale pubblico',source_name:'Fonte',source_url:'URL',public_evidence:'Evidenza',verified_at:'Data verifica',identity_check:'Verifica identità',qualification:'Qualificazione',score_fit:'Coerenza target',score_activity:'Attività',score_presence:'Presenza',score_interest:'Interesse',score_approach:'Pertinenza',status:'Stato',notes:'Note',archived_at:'Archiviazione',archived_by:'Archiviato da',archive_reason:'Motivo archiviazione'};
   const fields=document.createElement('p');fields.textContent='Campi: '+((ev.changed_fields||[]).map(k=>fieldNames[k]||k).join(', ')||'nessun dettaglio');
   const id=document.createElement('p');id.className='nwmuted';id.textContent='Lead ID: '+ev.lead_id;
   item.append(title,meta,fields,id);target.append(item);
  });
 }
 async function loadOrganizationActivity(append=false){
  const statusEl=$('nw-act-status'),more=$('nw-act-more');
  try{
   const ownerId=$('nw-act-owner').value.trim();
   if(ownerId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId))throw new Error('UUID proprietario non valido.');
   const from=$('nw-act-from').value?new Date($('nw-act-from').value+'T00:00:00').toISOString():null;
   const to=$('nw-act-to').value?new Date($('nw-act-to').value+'T23:59:59.999').toISOString():null;
   if(from&&to&&from>to)throw new Error('Intervallo date non valido.');
   const offset=append?orgActivityOffset:0;
   statusEl.textContent='Caricamento…';more.disabled=true;
   const result=await getOrganizationActivity({from,to,action:$('nw-act-action').value,ownerId,limit:100,offset});
   renderOrganizationActivity(result.events,append);orgActivityOffset=offset+result.events.length;
   more.disabled=!result.hasMore;statusEl.textContent=result.events.length+' eventi caricati.';
  }catch(e){statusEl.textContent='Registro non disponibile: '+e.message;more.disabled=true;}
 }
 let orgActivityOffset=0;
 $('nw-act-load').addEventListener('click',()=>{orgActivityOffset=0;loadOrganizationActivity(false);});
 $('nw-act-more').addEventListener('click',()=>loadOrganizationActivity(true));

 async function setLeadArchived(cloudId, archived, reason='', expectedUpdatedAt=''){
  if(!cloudId)throw new Error('Questo Lead non è ancora sincronizzato. Sincronizza prima l’archivio.');
  if(!expectedUpdatedAt)throw new Error('Versione cloud non disponibile. Ricarica l’archivio prima di procedere.');
  const {c}=await active();
  const patch=archived?{archived_at:new Date().toISOString(),archive_reason:String(reason||'Archiviazione manuale').slice(0,500)}:{archived_at:null,archive_reason:null};
  const {data,error}=await c.from('nextway_leads').update(patch).eq('id',cloudId).eq('updated_at',expectedUpdatedAt).select('id,archived_at,archived_by,archive_reason,updated_at').maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Il Lead è cambiato sul cloud o non è più accessibile. Ricarica l’archivio e ripeti l’operazione.');
  return data;
}
async function getLeadForConflict(cloudId){
  if(!cloudId)throw new Error('Lead non collegato al cloud.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_leads').select('*').eq('id',cloudId).maybeSingle();
  if(error)throw error;if(!data)throw new Error('Lead non trovato o non autorizzato.');
  return {record:fromCloud(data),updated_at:data.updated_at};
 }
 async function getLeadActivities(cloudId){
  if(!cloudId)throw new Error('Lead non collegato al cloud.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_lead_activities')
   .select('id,lead_id,owner_profile_id,created_by,activity_type,subject,details,occurred_at,next_action_at,next_action_status,created_at,updated_at')
   .eq('lead_id',cloudId).order('occurred_at',{ascending:false}).order('id',{ascending:true}).limit(100);
  if(error)throw error;
  return data||[];
 }
 async function getOpenLeadActivities(limit=100){
  const {c}=await active();
  const safeLimit=Math.max(1,Math.min(100,Number(limit)||100));
  const {data,error}=await c.from('nextway_lead_activities')
   .select('id,lead_id,owner_profile_id,activity_type,subject,occurred_at,next_action_at,next_action_status,lead:nextway_leads(display_name)')
   .eq('next_action_status','open').not('next_action_at','is',null)
   .order('next_action_at',{ascending:true}).order('id',{ascending:true}).limit(safeLimit);
  if(error)throw error;
  return data||[];
 }
 async function addLeadActivity(cloudId,activity){
  if(!cloudId)throw new Error('Sincronizza prima il Lead nel cloud.');
  const allowed=['call','message','email','meeting','note','task'];
  const subject=String(activity?.subject||'').trim();
  const details=String(activity?.details||'').trim();
  if(!allowed.includes(activity?.activity_type))throw new Error('Tipo di attività non valido.');
  if(!subject||subject.length>180)throw new Error('Inserisci un oggetto da 1 a 180 caratteri.');
  if(details.length>4000)throw new Error('Le note non possono superare 4.000 caratteri.');
  const {c,s}=await active();
  const {data:lead,error:leadError}=await c.from('nextway_leads').select('id,owner_profile_id').eq('id',cloudId).single();
  if(leadError)throw leadError;
  const occurredAt=activity.occurred_at?new Date(activity.occurred_at):new Date();
  const nextActionAt=activity.next_action_at?new Date(activity.next_action_at):null;
  if(Number.isNaN(occurredAt.getTime())||(nextActionAt&&Number.isNaN(nextActionAt.getTime())))throw new Error('Data attività o promemoria non valida.');
  const payload={lead_id:lead.id,owner_profile_id:lead.owner_profile_id,created_by:s.user.id,activity_type:activity.activity_type,subject,details:details||null,occurred_at:occurredAt.toISOString(),next_action_at:nextActionAt?nextActionAt.toISOString():null,next_action_status:'open'};
  const {data,error}=await c.from('nextway_lead_activities').insert(payload).select('id,lead_id,owner_profile_id,created_by,activity_type,subject,details,occurred_at,next_action_at,next_action_status,created_at,updated_at').single();
  if(error)throw error;
  return data;
 }
 async function setLeadActivityStatus(activityId,status){
  if(!activityId||!['done','cancelled'].includes(status))throw new Error('Stato attività non valido.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_lead_activities').update({next_action_status:status}).eq('id',activityId).select('id,next_action_status,updated_at').maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Attività non trovata o non autorizzata.');
  return data;
 }
 async function getLeadHistory(cloudId){
  if(!cloudId)throw new Error('Lead non collegato al cloud.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_lead_audit_logs')
   .select('id,lead_id,actor_profile_id,action,changed_fields,before_data,after_data,created_at')
   .eq('lead_id',cloudId).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  const events=data||[];
  const actorIds=[...new Set(events.map(ev=>ev.actor_profile_id).filter(Boolean))];
  const names={};
  if(actorIds.length){
   const {data:profiles,error:profilesError}=await c.from('profiles').select('id,full_name').in('id',actorIds);
   if(!profilesError)(profiles||[]).forEach(profile=>{const name=String(profile.full_name||'').trim();if(name)names[profile.id]=name;});
   const {data:partners,error:partnersError}=await c.from('partner_details').select('profile_id,first_name,last_name').in('profile_id',actorIds);
   if(!partnersError)(partners||[]).forEach(partner=>{const name=[partner.first_name,partner.last_name].filter(Boolean).join(' ').trim();if(name)names[partner.profile_id]=name;});
  }
  events.forEach(ev=>{ev.actor_name=ev.actor_profile_id?(names[ev.actor_profile_id]||'Nome non disponibile'):'identità non disponibile';});
  return events;
 }
 function leadPayload(x){
  return {display_name:String(x.name||'').slice(0,120),profession:x.profession||null,company_brand:x.company_brand||null,location:x.location||null,category:['potential_partner','final_customer','wellness_professional'].includes(x.category)?x.category:'potential_partner',partner_type:x.partner_type||null,discovery_mode:x.mode||null,public_signal:x.signal_type||null,source_name:String(x.source||'').slice(0,200),source_url:x.url,public_evidence:String(x.evidence||'').slice(0,4000),verified_at:x.verified_at||null,identity_check:['pending','confirmed','uncertain'].includes(x.identity_check)?x.identity_check:'pending',qualification:['Da approfondire','Qualificato','Escluso'].includes(x.qualification)?x.qualification:'Da approfondire',score_fit:Number(x.fit||0),score_activity:Number(x.activity||0),score_presence:Number(x.presence||0),score_interest:Number(x.interest||0),score_approach:Number(x.approach||0),status:['Da verificare','Verificato','Escluso','Contattato'].includes(x.status)?x.status:'Da verificare',notes:x.notes||null};
 }
 async function resolveLeadConflict(cloudId,expectedRemoteUpdatedAt,localRecord){
  if(!cloudId||!expectedRemoteUpdatedAt)throw new Error('Manca la versione cloud di confronto. Ricarica il conflitto.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_leads').update(leadPayload(localRecord)).eq('id',cloudId).eq('updated_at',expectedRemoteUpdatedAt).select('*').maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Il cloud è cambiato ancora durante la risoluzione. Nessuna modifica applicata: ricarica il confronto.');
  return {record:fromCloud(data),updated_at:data.updated_at};
 }
 window.NEXTWAY_CLOUD={active,getConfig,archiveLead:(id,reason,updatedAt)=>setLeadArchived(id,true,reason,updatedAt),restoreLead:(id,updatedAt)=>setLeadArchived(id,false,'',updatedAt),getLeadForConflict,getLeadHistory,getLeadActivities,getOpenLeadActivities,addLeadActivity,setLeadActivityStatus,resolveLeadConflict};
 function fromCloud(r){return {id:r.id,cloud_id:r.id,owner_profile_id:r.owner_profile_id,name:r.display_name,profession:r.profession||'',company_brand:r.company_brand||'',location:r.location||'',category:r.category,partner_type:r.partner_type||'',mode:r.discovery_mode||'',signal_type:r.public_signal||'',source:r.source_name,url:r.source_url,evidence:r.public_evidence,verified_at:r.verified_at||'',identity_check:r.identity_check,qualification:r.qualification,fit:r.score_fit,activity:r.score_activity,presence:r.score_presence,interest:r.score_interest,approach:r.score_approach,status:r.status,notes:r.notes||'',created:r.created_at,archived_at:r.archived_at||null,archive_reason:r.archive_reason||'',cloud_updated_at:r.updated_at,local_dirty:false};}
 async function syncLocal(){const {c,s}=await active();let rows=[];try{rows=JSON.parse(localStorage.getItem(localArchiveKey(s.user.id))||'[]')}catch(e){throw new Error('Archivio locale non leggibile.');}let added=0,updated=0,skipped=0,failed=0,conflicts=0;
 for(const x of rows){if(x.is_test){skipped++;continue;}if(!x.name||!x.url||!x.source||!x.evidence){failed++;continue;}
 const payload={display_name:String(x.name).slice(0,120),profession:x.profession||null,company_brand:x.company_brand||null,location:x.location||null,category:['potential_partner','final_customer','wellness_professional'].includes(x.category)?x.category:'potential_partner',partner_type:x.partner_type||null,discovery_mode:x.mode||null,public_signal:x.signal_type||null,source_name:String(x.source).slice(0,200),source_url:x.url,public_evidence:String(x.evidence).slice(0,4000),verified_at:x.verified_at||null,identity_check:['pending','confirmed','uncertain'].includes(x.identity_check)?x.identity_check:'pending',qualification:['Da approfondire','Qualificato','Escluso'].includes(x.qualification)?x.qualification:'Da approfondire',score_fit:Number(x.fit||0),score_activity:Number(x.activity||0),score_presence:Number(x.presence||0),score_interest:Number(x.interest||0),score_approach:Number(x.approach||0),status:['Da verificare','Verificato','Escluso','Contattato'].includes(x.status)?x.status:'Da verificare',notes:x.notes||null};
 if(x.cloud_id){
   if(!x.local_dirty){skipped++;continue;}
   if(!x.cloud_updated_at){conflicts++;x._sync_conflict={reason:'missing_base_version',detected_at:new Date().toISOString()};continue;}
   const {data,error}=await c.from('nextway_leads').update(payload).eq('id',x.cloud_id).eq('updated_at',x.cloud_updated_at).select('id,updated_at').maybeSingle();
   if(error){failed++;continue;}if(!data){conflicts++;x._sync_conflict={reason:'remote_changed',detected_at:new Date().toISOString()};continue;}
   x.cloud_updated_at=data.updated_at;x.local_dirty=false;delete x._sync_conflict;updated++;continue;
 }
 const insertPayload={...payload,owner_profile_id:s.user.id};
 const {data,error}=await c.from('nextway_leads').insert(insertPayload).select('id,updated_at').single();
 if(error){if(error.code==='23505'){skipped++;continue;}failed++;continue;}x.cloud_id=data.id;x.cloud_updated_at=data.updated_at;x.local_dirty=false;added++;
 }
 localStorage.setItem(localArchiveKey(s.user.id),JSON.stringify(rows));say('Sincronizzazione terminata. Nuovi: '+added+' · aggiornati: '+updated+' · invariati: '+skipped+' · conflitti da verificare: '+conflicts+' · errori: '+failed+'. Nessun conflitto è stato sovrascritto.');}
 async function pullCloud(){const {c,s}=await active();const pageSize=1000;let data=[],offset=0;while(true){const {data:page,error}=await c.from('nextway_leads').select('*').order('created_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+pageSize-1);if(error)throw error;if(!page?.length)break;data.push(...page);offset+=page.length;if(page.length<pageSize)break;}let local=[];try{local=JSON.parse(localStorage.getItem(localArchiveKey(s.user.id))||'[]')}catch(e){}let added=0,refreshed=0,conflicts=0;
 for(const r of data){const existing=local.find(x=>x.cloud_id===r.id);if(existing){
   if(existing.local_dirty){if(!existing.cloud_updated_at){existing._sync_conflict={reason:'missing_base_version',detected_at:new Date().toISOString(),remote_updated_at:r.updated_at};conflicts++;}else if(existing.cloud_updated_at!==r.updated_at){existing._sync_conflict={reason:'remote_changed',detected_at:new Date().toISOString(),remote_updated_at:r.updated_at};conflicts++;}continue;}
   if(!existing.cloud_updated_at){existing._sync_conflict={reason:'missing_base_version',detected_at:new Date().toISOString(),remote_updated_at:r.updated_at};conflicts++;continue;}
   Object.assign(existing,fromCloud(r));refreshed++;continue;
  }
  local.push(fromCloud(r));added++;
 }
 localStorage.setItem(localArchiveKey(s.user.id),JSON.stringify(local));say('Archivio cloud consultato: '+data.length+' record. Nuovi: '+added+' · aggiornati in locale: '+refreshed+' · conflitti da verificare: '+conflicts+'. Le modifiche locali non sono state sovrascritte.');if(added||refreshed)location.reload();}
 $('nw-sync').onclick=async()=>{try{say('Sincronizzazione in corso…');await syncLocal();}catch(e){say('Sincronizzazione non riuscita: '+e.message)}};
 $('nw-pull').onclick=async()=>{try{say('Lettura archivio cloud…');await pullCloud();}catch(e){say('Lettura non riuscita: '+e.message)}};
 $('nw-search').onclick=async()=>{const query=$('nw-query').value.trim();if(!query){say('Scrivi una query prima di avviare la ricerca.');return;}try{const {c,s}=await active();const cfg=getConfig();say('Ricerca in corso…');const response=await fetch(cfg.url+'/functions/v1/nextway-search',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token,'apikey':cfg.key},body:JSON.stringify({queries:[query],max_results:10})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||('Errore HTTP '+response.status));const target=$('nw-results');target.replaceChildren();(payload.results||[]).forEach(group=>(group.results||[]).forEach(item=>{const safeUrl=safeHttpUrl(item.url);if(!safeUrl)return;const box=document.createElement('div');box.className='nwresult';const title=document.createElement('strong');title.textContent=item.title||'Risultato senza titolo';const p=document.createElement('p');p.textContent=item.snippet||'';const a=document.createElement('a');a.href=safeUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Apri fonte originale';const use=document.createElement('button');use.className='secondary';use.textContent='Usa URL nel modulo Lead';use.onclick=()=>{const form=document.querySelector('#form')||document.querySelector('#capture');if(!form){say('Apri Gestione Lead o Ricerca assistita per acquisire il risultato.');return;}const source=form.querySelector('[name="source"]'),url=form.querySelector('[name="url"]'),evidence=form.querySelector('[name="evidence"]');if(source)source.value=new URL(safeUrl).hostname;if(url)url.value=safeUrl;if(evidence)evidence.value=(item.title||'')+' — '+(item.snippet||'').slice(0,650);form.scrollIntoView({behavior:'smooth',block:'start'});say('Fonte trasferita nel modulo. Completa manualmente nome, verifica identità ed evidenza prima di salvare.');};box.append(title,p,a,document.createTextNode(' '),use);target.append(box);}));say('Ricerca completata: '+(payload.results||[]).reduce((n,g)=>n+(g.results||[]).length,0)+' risultati. Verifica ogni fonte manualmente.');}catch(e){say('Ricerca non riuscita: '+e.message)}};
 try{if(window.supabase?.createClient&&getConfig().url&&getConfig().key){client=setup();client.auth.getSession().then(({data})=>{session=data.session;if(session)activateLocalArchive(session.user.id);else clearLocalArchive();status();refreshOrgActivityVisibility();}).catch(()=>status());}else status();}catch(e){status();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();