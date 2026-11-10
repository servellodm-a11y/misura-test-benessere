(function(){
'use strict';
const CFG='nextway_supabase_config_v1',KEY='nextway_ai_records_v1';
const style=`#nw-cloud{max-width:1160px;margin:18px auto;padding:0 18px;font:14px system-ui;color:#172033}#nw-cloud .nwbox{background:#fff;border:1px solid #dce4ef;border-radius:12px;padding:15px;margin:10px 0}#nw-cloud .nwgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#nw-cloud input,#nw-cloud textarea{width:100%;padding:9px;border:1px solid #ccd5e2;border-radius:7px;font:inherit;margin:4px 0 8px}#nw-cloud button{border:0;border-radius:7px;padding:9px 12px;background:#2457d6;color:#fff;font-weight:650;cursor:pointer;margin:4px 5px 4px 0}#nw-cloud button.secondary{background:#edf1f7;color:#24344d}#nw-cloud .nwmuted{color:#647187;font-size:12px}#nw-cloud .nwresult{border-top:1px solid #e5eaf1;padding:10px 0;overflow-wrap:anywhere}#nw-cloud .nwresult a{color:#2457d6}#nw-cloud .nwstatus{font-weight:650;margin-left:8px}@media(max-width:650px){#nw-cloud .nwgrid{grid-template-columns:1fr}}`;
function init(){
 if(document.getElementById('nw-cloud'))return;
 const header=document.querySelector('header');if(!header)return;
 const root=document.createElement('section');root.id='nw-cloud';
 root.innerHTML=`<style>${style}</style><div class="nwbox"><h2 style="margin:0 0 8px">NEXTWAY · Connessione centrale</h2><p class="nwmuted">Autenticazione personale, ricerca pubblica assistita e archivio Supabase. I risultati non diventano Lead finché non li verifichi e li acquisisci manualmente.</p><div class="nwgrid"><label>URL progetto Supabase<input id="nw-url" type="url" placeholder="https://xxxx.supabase.co"></label><label>Publishable key<input id="nw-key" type="password" autocomplete="off" placeholder="sb_publishable_..."></label></div><div><button id="nw-config">Salva configurazione</button><span id="nw-status" class="nwstatus">Non configurato</span></div><div class="nwgrid"><label>Email<input id="nw-email" type="email" autocomplete="username" placeholder="email account"></label><label>Password<input id="nw-password" type="password" autocomplete="current-password" placeholder="Password Supabase"></label></div><button id="nw-login">Accedi</button><button id="nw-logout" class="secondary">Esci</button><button id="nw-sync" class="secondary">Sincronizza archivio locale</button><button id="nw-pull" class="secondary">Carica archivio cloud</button><p id="nw-message" class="nwmuted" aria-live="polite">La configurazione salva solo URL e publishable key nel browser. La password non viene memorizzata.</p></div><div class="nwbox"><h3 style="margin:0 0 8px">Ricerca web assistita</h3><label>Query di ricerca<textarea id="nw-query" rows="2" placeholder='Es. "network marketing" "cerco collaboratori" Italia'></textarea></label><button id="nw-search">Cerca sul web</button><span class="nwmuted">La ricerca richiede login e Edge Function pubblicata su Supabase.</span><div id="nw-results"></div></div>`;
 header.insertAdjacentElement('afterend',root);
 const $=id=>document.getElementById(id),say=t=>{$('nw-message').textContent=t};
 let client=null,clientConfig='',session=null;
 try{const cfg=JSON.parse(localStorage.getItem(CFG)||'{}');$('nw-url').value=cfg.url||'';$('nw-key').value=cfg.key||'';}catch(e){}
 function getConfig(){return {url:$('nw-url').value.trim().replace(/\/$/,''),key:$('nw-key').value.trim()};}
 function setup(){const c=getConfig();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url)||!c.key){throw new Error('Inserisci URL Supabase valido e publishable key.');}if(!window.supabase||!window.supabase.createClient)throw new Error('Libreria Supabase non caricata. Ricarica la pagina.');localStorage.setItem(CFG,JSON.stringify(c));if(!client||clientConfig!==c.url+'|'+c.key){client=window.supabase.createClient(c.url,c.key);clientConfig=c.url+'|'+c.key;}return client;}
 function requireClient(){return client||setup();}
 function status(){const s=session?('Connesso: '+(session.user.email||session.user.id)):'Non autenticato';$('nw-status').textContent=s;}
 $('nw-config').onclick=()=>{try{setup();say('Configurazione salvata. Ora accedi con il tuo account Supabase.');}catch(e){say(e.message)}};
 $('nw-login').onclick=async()=>{try{const c=requireClient();const {data,error}=await c.auth.signInWithPassword({email:$('nw-email').value.trim(),password:$('nw-password').value});if(error)throw error;session=data.session;$('nw-password').value='';status();say('Accesso effettuato. Archivio e ricerca sono disponibili.');}catch(e){say('Accesso non riuscito: '+e.message)}};
 $('nw-logout').onclick=async()=>{try{if(client)await client.auth.signOut();session=null;status();say('Sessione chiusa.');}catch(e){say(e.message)}};
 async function active(){const c=requireClient();const {data,error}=await c.auth.getSession();if(error)throw error;session=data.session;if(!session)throw new Error('Accedi prima di procedere.');return {c,s:session};}
 async function setLeadArchived(cloudId, archived, reason=''){
  if(!cloudId)throw new Error('Questo Lead non è ancora sincronizzato. Sincronizza prima l’archivio.');
  const {c}=await active();
  const patch=archived?{archived_at:new Date().toISOString(),archive_reason:String(reason||'Archiviazione manuale').slice(0,500)}:{archived_at:null,archive_reason:null};
  const {data,error}=await c.from('nextway_leads').update(patch).eq('id',cloudId).select('id,archived_at,archived_by,archive_reason,updated_at').maybeSingle();
  if(error)throw error;if(!data)throw new Error('Lead non trovato o non autorizzato.');return data;
}
async function getLeadForConflict(cloudId){
  if(!cloudId)throw new Error('Lead non collegato al cloud.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_leads').select('*').eq('id',cloudId).maybeSingle();
  if(error)throw error;if(!data)throw new Error('Lead non trovato o non autorizzato.');
  return {record:fromCloud(data),updated_at:data.updated_at};
 }
 async function getLeadHistory(cloudId){
  if(!cloudId)throw new Error('Lead non collegato al cloud.');
  const {c}=await active();
  const {data,error}=await c.from('nextway_lead_audit_logs')
   .select('id,lead_id,actor_profile_id,action,changed_fields,before_data,after_data,created_at')
   .eq('lead_id',cloudId).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  return data||[];
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
 window.NEXTWAY_CLOUD={active,getConfig,archiveLead:(id,reason)=>setLeadArchived(id,true,reason),restoreLead:id=>setLeadArchived(id,false),getLeadForConflict,getLeadHistory,resolveLeadConflict};
 function fromCloud(r){return {id:r.id,cloud_id:r.id,name:r.display_name,profession:r.profession||'',company_brand:r.company_brand||'',location:r.location||'',category:r.category,partner_type:r.partner_type||'',mode:r.discovery_mode||'',signal_type:r.public_signal||'',source:r.source_name,url:r.source_url,evidence:r.public_evidence,verified_at:r.verified_at||'',identity_check:r.identity_check,qualification:r.qualification,fit:r.score_fit,activity:r.score_activity,presence:r.score_presence,interest:r.score_interest,approach:r.score_approach,status:r.status,notes:r.notes||'',created:r.created_at,archived_at:r.archived_at||null,archive_reason:r.archive_reason||'',cloud_updated_at:r.updated_at,local_dirty:false};}
 async function syncLocal(){const {c,s}=await active();let rows=[];try{rows=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){throw new Error('Archivio locale non leggibile.');}let added=0,updated=0,skipped=0,failed=0,conflicts=0;
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
 localStorage.setItem(KEY,JSON.stringify(rows));say('Sincronizzazione terminata. Nuovi: '+added+' · aggiornati: '+updated+' · invariati: '+skipped+' · conflitti da verificare: '+conflicts+' · errori: '+failed+'. Nessun conflitto è stato sovrascritto.');}
 async function pullCloud(){const {c}=await active();const {data,error}=await c.from('nextway_leads').select('*').order('created_at',{ascending:false}).limit(1000);if(error)throw error;let local=[];try{local=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){}let added=0,refreshed=0,conflicts=0;
 for(const r of data){const existing=local.find(x=>x.cloud_id===r.id);if(existing){
   if(existing.local_dirty){if(!existing.cloud_updated_at){existing._sync_conflict={reason:'missing_base_version',detected_at:new Date().toISOString(),remote_updated_at:r.updated_at};conflicts++;}else if(existing.cloud_updated_at!==r.updated_at){existing._sync_conflict={reason:'remote_changed',detected_at:new Date().toISOString(),remote_updated_at:r.updated_at};conflicts++;}continue;}
   if(!existing.cloud_updated_at){existing._sync_conflict={reason:'missing_base_version',detected_at:new Date().toISOString(),remote_updated_at:r.updated_at};conflicts++;continue;}
   Object.assign(existing,fromCloud(r));refreshed++;continue;
  }
  local.push(fromCloud(r));added++;
 }
 localStorage.setItem(KEY,JSON.stringify(local));say('Archivio cloud consultato: '+data.length+' record. Nuovi: '+added+' · aggiornati in locale: '+refreshed+' · conflitti da verificare: '+conflicts+'. Le modifiche locali non sono state sovrascritte.');if(added||refreshed)location.reload();}
 $('nw-sync').onclick=async()=>{try{say('Sincronizzazione in corso…');await syncLocal();}catch(e){say('Sincronizzazione non riuscita: '+e.message)}};
 $('nw-pull').onclick=async()=>{try{say('Lettura archivio cloud…');await pullCloud();}catch(e){say('Lettura non riuscita: '+e.message)}};
 $('nw-search').onclick=async()=>{const query=$('nw-query').value.trim();if(!query){say('Scrivi una query prima di avviare la ricerca.');return;}try{const {c,s}=await active();const cfg=getConfig();say('Ricerca in corso…');const response=await fetch(cfg.url+'/functions/v1/nextway-search',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token,'apikey':cfg.key},body:JSON.stringify({queries:[query],max_results:10})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||('Errore HTTP '+response.status));const target=$('nw-results');target.replaceChildren();(payload.results||[]).forEach(group=>(group.results||[]).forEach(item=>{const box=document.createElement('div');box.className='nwresult';const title=document.createElement('strong');title.textContent=item.title||'Risultato senza titolo';const p=document.createElement('p');p.textContent=item.snippet||'';const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Apri fonte originale';const use=document.createElement('button');use.className='secondary';use.textContent='Usa URL nel modulo Lead';use.onclick=()=>{const form=document.querySelector('#form')||document.querySelector('#capture');if(!form){say('Apri Gestione Lead o Ricerca assistita per acquisire il risultato.');return;}const source=form.querySelector('[name="source"]'),url=form.querySelector('[name="url"]'),evidence=form.querySelector('[name="evidence"]');if(source)source.value=new URL(item.url).hostname;if(url)url.value=item.url;if(evidence)evidence.value=(item.title||'')+' — '+(item.snippet||'').slice(0,650);form.scrollIntoView({behavior:'smooth',block:'start'});say('Fonte trasferita nel modulo. Completa manualmente nome, verifica identità ed evidenza prima di salvare.');};box.append(title,p,a,document.createTextNode(' '),use);target.append(box);}));say('Ricerca completata: '+(payload.results||[]).reduce((n,g)=>n+(g.results||[]).length,0)+' risultati. Verifica ogni fonte manualmente.');}catch(e){say('Ricerca non riuscita: '+e.message)}};
 try{if(window.supabase?.createClient&&getConfig().url&&getConfig().key){client=setup();client.auth.getSession().then(({data})=>{session=data.session;status();}).catch(()=>status());}else status();}catch(e){status();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();