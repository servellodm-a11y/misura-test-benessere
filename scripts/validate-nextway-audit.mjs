import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const cloud = read("../nextway-cloud.js");
const setter = read("../nextway-setter.js");
const setterFunction = read("../supabase/functions/nextway-ai-setter/index.ts");
const html = read("../nextway-ai.html");
const leadSchema = read("../supabase/nextway_leads.sql");
const audit = read("../supabase/migrations/20261110000900_nextway_lead_audit_trail.sql");
const archiveSchema = read("../supabase/migrations/20261110000800_nextway_leads_soft_archive.sql");
const privacy = read("../supabase/migrations/20261110001000_nextway_audit_data_minimization.sql");
const leadCreationIdempotency = read("../supabase/migrations/20261110001100_nextway_lead_creation_idempotency.sql");
const leadActivities = read("../supabase/migrations/20261110001200_nextway_lead_activities.sql");
const leadLifecycle = read("../supabase/migrations/20261110001300_nextway_lead_lifecycle.sql");
const leadConversion = read("../supabase/migrations/20261110001400_nextway_lead_conversion_requests.sql");
const conversionProvisioning = read("../supabase/migrations/20261111001500_nextway_conversion_provisioning.sql");
const conversionProvisioningFunction = read("../supabase/functions/nextway-conversion-provisioning/index.ts");
const triggerPrivileges = read("../supabase/migrations/20261111160000_nextway_trigger_function_privileges.sql");

new Function(cloud);
new Function(setter);
const inlineScripts = [];
let cursor = 0;
while ((cursor = html.indexOf("<script", cursor)) !== -1) {
  const openEnd = html.indexOf(">", cursor);
  if (openEnd === -1) break;
  const tag = html.slice(cursor, openEnd);
  const close = html.indexOf("</script>", openEnd);
  if (close === -1) break;
  if (!tag.includes("src=")) inlineScripts.push(html.slice(openEnd + 1, close));
  cursor = close + 9;
}
assert.ok(inlineScripts.length > 0, "Nessuno script inline trovato in nextway-ai.html");

const leadUiScript = inlineScripts.join("\n");
assert.ok(html.includes("const safeHttpUrl=value=>{try{const u=new URL(String(value??'').trim());"), "Lead UI must define strict HTTP(S) URL validation");
assert.match(leadUiScript, /let activeOwnerId=null,data=\[\]/);
assert.match(leadUiScript, /localStorage\.getItem\(KEY\+':'\+userId\)/);
assert.match(leadUiScript, /localStorage\.setItem\(KEY\+':'\+activeOwnerId/);
assert.match(leadUiScript, /if\(!activeOwnerId\)\{alert\('Accedi con il tuo account NEXTWAY prima di creare un Lead\.'/);
assert.match(leadUiScript, /window\.NEXTWAY_LOCAL_ARCHIVE=\{\s*activate:activateLocalAccount,\s*clear:clearLocalAccount/);
assert.doesNotMatch(leadUiScript, /localStorage\.(?:getItem|setItem)\(KEY(?:\)|,)/, "Lead UI must not read or write the unscoped legacy archive key");
assert.match(cloud, /function localArchiveKey\(userId\)/);
assert.match(cloud, /localStorage\.getItem\(localArchiveKey\(s\.user\.id\)\)/);
assert.match(cloud, /localStorage\.setItem\(localArchiveKey\(s\.user\.id\)/);
assert.match(cloud, /client\.auth\.onAuthStateChange/);
assert.match(cloud, /function activateLocalArchive\(userId\)\{const archive=window\.NEXTWAY_LOCAL_ARCHIVE;if\(!archive\)return false;/,
  "Cloud authentication must not require the page-local archive component");
const archiveActivation = cloud.match(/function activateLocalArchive\(userId\)\{[\s\S]*?\}/)?.[0];
assert.ok(archiveActivation, "Optional local archive activation helper must exist");
const activateWithoutArchive = new Function("window", archiveActivation + "; return activateLocalArchive;")({});
assert.equal(activateWithoutArchive("123e4567-e89b-12d3-a456-426614174000"), false,
  "Search-only pages must retain Supabase authentication when no local archive UI is loaded");
let archiveActivated = "";
const activateWithArchive = new Function("window", archiveActivation + "; return activateLocalArchive;")({
  NEXTWAY_LOCAL_ARCHIVE: { activate: (userId) => { archiveActivated = userId; } }
});
assert.equal(activateWithArchive("123e4567-e89b-12d3-a456-426614174000"), true);
assert.equal(archiveActivated, "123e4567-e89b-12d3-a456-426614174000");

assert.match(cloud, /if\(previousId!==nextId\)\{clearLocalArchive\(\);\$\('nw-results'\)\.replaceChildren\(\);\$\('nw-act-results'\)\.replaceChildren\(\);\$\('nw-org-activity'\)\.hidden=true/);
assert.match(cloud, /clearLocalArchive\(\)/);
assert.match(leadUiScript, /safeHttpUrl\(x\.url\)/);
assert.ok(leadUiScript.includes("sourceUrl?'<a target=\"_blank\" rel=\"noopener noreferrer\" href="), "Valid historical source URL must render as a safe external link");
assert.match(leadUiScript, /'<span aria-disabled="true">Fonte non valida<\/span>'/);
assert.doesNotMatch(leadUiScript, /href="\'+esc\(safeHttpUrl\(x\.url\)\|\|\x27#\x27\)/);
assert.match(leadUiScript, /let n=points\(x\),sourceUrl=safeHttpUrl\(x\.url\)/);
assert.match(leadUiScript, /!safeHttpUrl\(x\.url\)/);
assert.match(cloud, /const safeHttpUrl=value=>/);
assert.match(cloud, /const safeUrl=safeHttpUrl\(item\.url\);if\(!safeUrl\)return/);
assert.match(cloud, /a\.href=safeUrl/);
assert.match(cloud, /new URL\(safeUrl\)\.hostname/);
console.log("External URL validation: only credential-free HTTP(S) URLs become clickable or importable");
for (const source of inlineScripts) new Function(source);

assert.match(audit, /create table if not exists public\.nextway_lead_audit_logs/i);
assert.match(audit, /enable row level security/i);
assert.match(audit, /for select to authenticated/i);
assert.match(audit, /revoke all on table public\.nextway_lead_audit_logs from public, anon, authenticated/i);
assert.match(audit, /after insert or update or delete on public\.nextway_leads/i);
assert.match(audit, /lead_owner_profile_id = auth\.uid\(\)/i);
assert.match(audit, /p\.id = auth\.uid\(\) and p\.role = 'platform_admin'/i);
assert.match(audit, /grant select on table public\.nextway_lead_audit_logs to authenticated/i);
assert.doesNotMatch(audit, /create policy[\s\S]*?for (insert|update|delete) to authenticated/i);
assert.match(archiveSchema, /add column if not exists archived_at timestamptz/i);
assert.match(archiveSchema, /add column if not exists archived_by uuid/i);
assert.match(archiveSchema, /add column if not exists archive_reason text/i);
assert.match(archiveSchema, /if auth\.uid\(\) is null[\s\S]*?raise exception/i);
assert.match(archiveSchema, /new\.archived_by := auth\.uid\(\)/i);
assert.match(archiveSchema, /new\.archived_by := null/i);
assert.match(archiveSchema, /new\.archive_reason := null/i);
assert.match(archiveSchema, /revoke all on function public\.nextway_set_lead_archive_metadata\(\) from public, anon, authenticated/i);

assert.match(cloud, /if\(!\(await isPlatformAdmin\(\)\)\)throw new Error\('Accesso riservato a platform_admin\.'/);
assert.match(cloud, /\.range\(offset,offset\+limit-1\)/);
assert.match(cloud, /eq\('lead_owner_profile_id',filters\.ownerId\)/);
assert.match(cloud, /lead_name:after_data->>display_name,lead_name_before:before_data->>display_name/);

assert.match(privacy, /v_after_full - 'notes' - 'public_evidence'/);
assert.match(privacy, /v_before_full - 'notes' - 'public_evidence'/);
assert.match(privacy, /jsonb_each\(v_after_full\)/);
assert.doesNotMatch(privacy, /update public\.nextway_lead_audit_logs/i);
assert.match(html, /\[valore non registrato per riservatezza\]/);
assert.match(html, /x\.local_dirty\)\{alert\('Questo Lead contiene modifiche locali non sincronizzate/);
assert.match(html, /x\._sync_conflict\)\{alert\('Risolvi prima il conflitto di sincronizzazione/);
assert.match(html, /Archiviato:/);
assert.match(html, /reason=entered\.trim\(\)\.slice\(0,500\)/);

// Identità leggibili nel registro: verifica i campi reali dello schema Supabase.
assert.match(cloud, /select\('id,full_name'\)\.in\('id',profileIds\)/);
assert.match(cloud, /select\('profile_id,first_name,last_name'\)\.in\('profile_id',profileIds\)/);
assert.match(cloud, /const name=String\(p\.full_name\|\|''\)\.trim\(\);if\(name\)profileNames\[p\.id\]=name/);
assert.match(cloud, /profileNames\[p\.profile_id\]=name/);
assert.match(cloud, /ev\.lead_owner_name=ev\.lead_owner_profile_id\?/);
assert.match(cloud, /ev\.actor_name=ev\.actor_profile_id\?/);
assert.match(cloud, /Proprietario: '\+\(ev\.lead_owner_name/);
assert.match(cloud, /Operatore: '\+\(ev\.actor_name/);
assert.match(cloud, /'Nome non disponibile'/);
assert.match(cloud, /'identità non disponibile'/);
assert.match(cloud, /if\(!profilesError\)/);
assert.match(cloud, /if\(!partnersError\)/);
assert.match(cloud, /if\(!\(await isPlatformAdmin\(\)\)\)throw new Error\('Accesso riservato a platform_admin\.'/);
assert.doesNotMatch(cloud, /select\('id,email,full_name/);
assert.doesNotMatch(cloud, /select\('profile_id,first_name,last_name,phone/);

// Lead soft-archive API: verify logical archive/restore, bounded reason and returned metadata.
assert.match(cloud, /async function setLeadArchived\(cloudId, archived, reason=''/);
assert.match(cloud, /archive_reason:String\(reason\|\|'Archiviazione manuale'\)\.slice\(0,500\)/);
assert.match(cloud, /archived\?\{archived_at:new Date\(\)\.toISOString\(\),archive_reason:/);
assert.match(cloud, /:\{archived_at:null,archive_reason:null\}/);
assert.match(cloud, /archiveLead:\(id,reason,updatedAt\)=>setLeadArchived\(id,true,reason,updatedAt\)/);
assert.match(cloud, /restoreLead:\(id,updatedAt\)=>setLeadArchived\(id,false,'',updatedAt\)/);
assert.match(cloud, /async function setLeadArchived\(cloudId, archived, reason='', expectedUpdatedAt=''/);
assert.match(cloud, /\.eq\('updated_at',expectedUpdatedAt\)/);
assert.match(cloud, /Versione cloud non disponibile/);
assert.match(cloud, /Il Lead è cambiato sul cloud/);
assert.match(html, /cloud\.restoreLead\(x\.cloud_id,x\.cloud_updated_at\)/);
assert.match(html, /cloud\.archiveLead\(x\.cloud_id,reason,x\.cloud_updated_at\)/);
assert.match(cloud, /select\('id,archived_at,archived_by,archive_reason,updated_at'\)/);
assert.match(cloud, /select\('id,full_name'\)\.in\('id',actorIds\)/);
assert.match(cloud, /select\('profile_id,first_name,last_name'\)\.in\('profile_id',actorIds\)/);
assert.match(cloud, /ev\.actor_name=ev\.actor_profile_id\?/);

console.log("NEXTWAY audit static checks: PASS");
console.log(`Inline scripts parsed: ${inlineScripts.length}`);
console.log("Privacy snapshots: notes/public_evidence excluded from new audit events");
console.log("Readable audit identities: profile/partner fields, fallbacks and admin gate: PASS");
console.log("Lead soft-archive API: archive/restore metadata and bounded reason: PASS");
// Lead history identity and local-only removal/archive prompt safeguards.
assert.match(cloud, /const actorIds=\[\.\.\.new Set\(events\.map\(ev=>ev\.actor_profile_id\)\.filter\(Boolean\)\)\]/);
assert.match(cloud, /select\('id,full_name'\)\.in\('id',actorIds\)/);
assert.match(cloud, /select\('profile_id,first_name,last_name'\)\.in\('profile_id',actorIds\)/);
assert.match(cloud, /ev\.actor_name=ev\.actor_profile_id\?/);
assert.match(html, /ev\.actor_name\|\|'identità non disponibile'/);
assert.match(html, /if\(entered===null\)return/);
assert.match(html, /Rimuovi copia locale/);
assert.match(html, /non cancella il Lead dal cloud né la sua cronologia/);
console.log("Lead history identities and safe local removal/archive cancellation: PASS");
assert.match(html, /LEAD ARCHIVIATO · '\+new Date\(x\.archived_at\)\.toLocaleString\('it-IT'\)\+' · Motivo: '/);
console.log("Archived Lead date and reason are visible in the card: PASS");


// Explicit role matrix: non-admin roles are owner-scoped; platform_admin has cross-owner access.
for (const operation of ["select", "insert", "update", "delete"]) {
  const start = leadSchema.toLowerCase().indexOf(`on public.nextway_leads for ${operation} to authenticated`);
  assert.ok(start >= 0, `Missing Lead RLS policy for ${operation}`);
  const end = leadSchema.indexOf(';', start);
  const policy = leadSchema.slice(start, end + 1);
  assert.match(policy, /owner_profile_id = auth\.uid\(\)/i, `Lead ${operation}: owner scope missing`);
  assert.match(policy, /p\.id = auth\.uid\(\) and p\.role = 'platform_admin'/i, `Lead ${operation}: admin scope missing`);
  assert.doesNotMatch(policy, /role\s*=\s*'(director|team_leader|sponsor|partner)'/i, `Lead ${operation}: unexpected hierarchical privilege`);
}
assert.match(audit, /lead_owner_profile_id = auth\.uid\(\)/i);
assert.match(audit, /p\.id = auth\.uid\(\) and p\.role = 'platform_admin'/i);
console.log("Lead permissions matrix: owner-scoped roles and platform_admin cross-owner access: PASS");

// AI Setter: prevent duplicate Lead/conversation creation after a generation failure.
assert.match(setter, /let pendingCreatedConversationId = ''/);
assert.match(setter, /const PENDING_CREATE_KEY = 'nextway_setter_pending_create_v1'/);
assert.match(setter, /sessionStorage\.getItem\(PENDING_CREATE_KEY\)/);
assert.match(setter, /sessionStorage\.setItem\(PENDING_CREATE_KEY/);
assert.match(setter, /sessionStorage\.removeItem\(PENDING_CREATE_KEY\)/);
assert.match(setter, /pendingCreatedOwnerProfileId = savedPending\.owner_profile_id/);
assert.match(setter, /owner_profile_id: pendingCreatedOwnerProfileId/);
assert.match(setter, /pendingCreatedOwnerProfileId !== s\.user\.id/);
assert.match(setter, /pendingLeadCreateRequest\.owner_profile_id !== s\.user\.id/);
assert.match(setter, /owner_profile_id: request\.owner_profile_id/);
assert.match(setter, /pendingCreatedGoal = savedPending\.goal/);
assert.match(setter, /await generateDraft\(pendingCreatedConversationId, pendingCreatedGoal\)/);
assert.match(setter, /È presente una conversazione creata in precedenza senza bozza completata/);
assert.match(setter, /if \(pendingCreatedConversationId\) \{/);
assert.match(setter, /await generateDraft\(pendingCreatedConversationId, pendingCreatedGoal\)/);
assert.match(setter, /pendingCreatedConversationId = result\.conversation_id/);
assert.match(setter, /form\.reset\(\)/);
assert.match(setter, /Riprova generazione sulla conversazione creata/);
assert.match(setter, /\['closed', 'archived'\]\.includes\(String\(row\.status \|\| ''\)\.toLowerCase\(\)\)/);
console.log("AI Setter retry safety: pending conversation and goal restored across reload; duplicate creation avoided; closed conversations excluded: PASS");

// AI Setter provider payload: allowlist and minimization of prospect/history data.
assert.match(setterFunction, /function sanitizeModelText\(value: unknown, maxLength: number\)/);
assert.match(setterFunction, /replace\(\/\\b/);
assert.match(setterFunction, /\[email rimosso\]/);
assert.match(setterFunction, /\[collegamento rimosso\]/);
assert.match(setterFunction, /\[numero rimosso\]/);
const aiContextBlock = setterFunction.match(/const context = \{([\s\S]*?)\n    \};/);
assert.ok(aiContextBlock, "AI Setter context allowlist block missing");
assert.doesNotMatch(aiContextBlock[1], /\bnotes\b/);
assert.match(aiContextBlock[1], /public_evidence: sanitizeModelText\(lead\.public_evidence, 2000\)/);
assert.match(aiContextBlock[1], /content: sanitizeModelText\(message\.content, 1500\)/);
const leadSelectBlock = setterFunction.match(/\.from\("nextway_leads"\)[\s\S]*?\.select\([\s\S]*?qualification[\s\S]*?\)\s*\.eq\("id", conversation\.lead_id\)/);
assert.ok(leadSelectBlock, "AI Setter lead select block missing");
assert.doesNotMatch(leadSelectBlock[0], /notes/);
assert.match(setterFunction, /function logSafeFailure\(label: string, error: unknown\)/);
assert.match(setterFunction, /console\.error\(label, \{ code, status \}\)/);
assert.match(setterFunction, /console\.error\("OpenAI request failed:", \{ status: aiResponse\.status \}\)/);
assert.match(setterFunction, /console\.error\("NEXTWAY AI Setter request failed"\)/);
assert.doesNotMatch(setterFunction, /console\.error\([^\n]*,\s*(?:limitError|claimError|stagedReadError|stageError|completeError|details|error)\s*\)/);
console.log("AI Setter provider data minimization: explicit allowlist, free notes excluded, email/phone/URL redaction: PASS");

 
// Lead creation idempotency: same user/key/hash must replay the first result atomically.
assert.match(setter, /const PENDING_LEAD_CREATE_KEY = 'nextway_setter_pending_lead_create_v1'/);
assert.match(setter, /sessionStorage\.setItem\(PENDING_LEAD_CREATE_KEY/);
assert.match(setter, /sessionStorage\.getItem\(PENDING_LEAD_CREATE_KEY/);
assert.match(setter, /crypto\.subtle\.digest\('SHA-256'/);
assert.match(setter, /nextway_create_lead_with_conversation_idempotent/);
assert.match(setter, /p_request_id: createRequest\.request_id/);
assert.match(setter, /p_request_hash: createRequest\.request_hash/);
assert.match(setter, /clearPendingLeadCreateRequest\(\)/);
assert.match(setter, /pendingLeadCreateRequest\.payload/);
assert.match(setter, /await generateDraft\(pendingCreatedConversationId, pendingCreatedGoal\);\s*clearPendingCreate\(\);\s*clearPendingLeadCreateRequest\(\);/);
assert.match(leadCreationIdempotency, /create table if not exists public\.nextway_lead_creation_requests/i);
assert.match(leadCreationIdempotency, /primary key \(owner_profile_id, request_id\)/i);
assert.match(leadCreationIdempotency, /enable row level security/i);
assert.match(leadCreationIdempotency, /using \(owner_profile_id = auth\.uid\(\)\)/i);
assert.match(leadCreationIdempotency, /with check \(owner_profile_id = auth\.uid\(\)\)/i);
assert.match(leadCreationIdempotency, /security invoker/i);
assert.match(leadCreationIdempotency, /on conflict \(owner_profile_id, request_id\) do nothing/i);
assert.match(leadCreationIdempotency, /v_existing_hash <> p_request_hash/i);
assert.match(leadCreationIdempotency, /idempotent_replay/i);
assert.match(leadCreationIdempotency, /public\.nextway_create_lead_with_conversation\(/i);
assert.match(leadCreationIdempotency, /raise exception[\s\S]*?annulla l'intera transazione/i);
assert.doesNotMatch(leadCreationIdempotency, /request_payload\s+jsonb/i);
assert.match(leadCreationIdempotency, /revoke all on function public\.nextway_create_lead_with_conversation_idempotent/i);
assert.match(leadCreationIdempotency, /function public\.nextway_prune_lead_creation_requests\(\)[\s\S]*?security definer/i);
assert.match(leadCreationIdempotency, /p\.role = 'platform_admin'/i);
assert.match(leadCreationIdempotency, /interval '30 days'/i);
assert.match(leadCreationIdempotency, /revoke all on function public\.nextway_prune_lead_creation_requests\(\) from public, anon/i);
console.log("Lead creation idempotency: browser-persisted key, SHA-256 payload fingerprint, owner-scoped RPC replay and atomic rollback: PASS");


// NEXTWAY CRM: Lead editing must update the existing local record, not create a duplicate.
assert.match(html, /id="formTitle">Nuovo Lead/);
assert.match(html, /id="formSubmit" type="submit">Salva Lead/);
assert.match(html, /id="cancelEdit" type="button" hidden/);
assert.match(leadUiScript, /let editingLeadId=''/);
assert.match(leadUiScript, /function startEdit\(lead\)/);
assert.match(leadUiScript, /function cancelEdit\(\)/);
assert.match(leadUiScript, /editingLeadId=lead\.id/);
assert.match(leadUiScript, /Object\.entries\(fields\)\.forEach/);
assert.match(leadUiScript, /const existing=editingLeadId\?data\.find\(y=>y\.id===editingLeadId\):null/);
assert.match(leadUiScript, /data\.some\(y=>y!==existing&&!y\.is_test&&y\.url&&values\.url/);
assert.match(leadUiScript, /if\(existing\)\{const metadata=readProspectMetadata\(existing\);Object\.assign\(existing,values\);if\(Object\.keys\(metadata\)\.length\)writeProspectMetadata\(existing,metadata\)/, "Editing a Lead must preserve its prospect metadata");
assert.match(leadUiScript, /existing\.local_dirty=true/);
assert.match(leadUiScript, /values\.id=Date\.now\(\)\.toString\(36\)/);
assert.match(leadUiScript, /edit\.textContent='Modifica Lead'/);
assert.match(leadUiScript, /edit\.disabled=!!x\.archived_at\|\|!!x\._sync_conflict/);
assert.match(leadUiScript, /bar\.append\(edit,archive,sel,del\)/);
console.log("NEXTWAY CRM Lead editing: edit form, duplicate protection, existing-record update and sync dirty flag: PASS");


// NEXTWAY CRM: deterministic list sorting must coexist with existing filters.
assert.match(html, /id="sort" aria-label="Ordina Lead"/);
assert.match(leadUiScript, /sort==='recent'\?new Date\(b\.created\|\|0\)-new Date\(a\.created\|\|0\)/);
assert.match(leadUiScript, /sort==='oldest'\?new Date\(a\.created\|\|0\)-new Date\(b\.created\|\|0\)/);
assert.match(leadUiScript, /sort==='name'\?String\(a\.name\|\|''\)\.localeCompare/);
assert.match(leadUiScript, /\['query','cat','state','archiveFilter','qualificationFilter','partnerFilter','commercialQualificationFilter','prospectQualityFilter','entityTypeFilter','sort'\]\.forEach/, "All CRM filters, including prospect-quality filters, must trigger list refresh");
console.log("NEXTWAY CRM sorting: score, newest, oldest and alphabetical order: PASS");


// NEXTWAY CRM: broaden search and add qualification/profile filters.
assert.match(html, /id="qualificationFilter"/);
assert.match(html, /id="partnerFilter"/);
assert.match(leadUiScript, /qualification=el\('qualificationFilter'\)\.value,partner=el\('partnerFilter'\)\.value/);
assert.match(leadUiScript, /x\.company_brand,x\.location,x\.source,x\.url,x\.evidence,x\.notes/);
assert.match(leadUiScript, /!qualification\|\|x\.qualification===qualification/);
assert.match(leadUiScript, /!partner\|\|x\.partner_type===partner/);
assert.match(leadUiScript, /'qualificationFilter','partnerFilter','commercialQualificationFilter','prospectQualityFilter','entityTypeFilter','sort'/, "Filter state must include all expanded prospect filters");
console.log("NEXTWAY CRM search: company/source/evidence/notes plus qualification and partner filters: PASS");


// NEXTWAY CRM: cloud pull must page through the full authorized result set.
assert.match(cloud, /const pageSize=1000;let data=\[\],offset=0;while\(true\)/);
assert.match(cloud, /\.range\(offset,offset\+pageSize-1\)/);
assert.match(cloud, /data\.push\(\.\.\.page\);offset\+=page\.length;if\(page\.length<pageSize\)break/);
console.log("NEXTWAY CRM cloud pull pagination: all pages are loaded without the previous 1,000-row cap: PASS");

assert.match(cloud, /\.order\('created_at',\{ascending:false\}\)\.order\('id',\{ascending:true\}\)\.range\(offset,offset\+pageSize-1\)/);
console.log("NEXTWAY CRM cloud pagination: deterministic ordering across page boundaries: PASS");


// NEXTWAY CRM: cloud interaction history and follow-up lifecycle.
assert.match(cloud, /async function getLeadActivities\(cloudId\)/);
assert.match(cloud, /async function addLeadActivity\(cloudId,activity\)/);
assert.match(cloud, /async function setLeadActivityStatus\(activityId,status\)/);
assert.match(cloud, /nextway_lead_activities/);
assert.match(cloud, /owner_profile_id:lead\.owner_profile_id,created_by:s\.user\.id/);
assert.match(cloud, /getLeadActivities,getOpenLeadActivities,getLeadActivitySummary,addLeadActivity,setLeadActivityStatus/, "Cloud API must expose lead activities, follow-up summary and status updates");
assert.match(cloud, /owner_profile_id:r\.owner_profile_id/);
assert.match(leadUiScript, /Attività e follow-up/);
assert.match(leadUiScript, /Registra attività/);
assert.match(leadUiScript, /Segna completato/);
assert.match(leadUiScript, /Annulla follow-up/);
assert.match(leadUiScript, /getLeadActivities\(x\.cloud_id\)/);
assert.match(leadUiScript, /addLeadActivity\(x\.cloud_id/);
assert.match(leadActivities, /create table if not exists public\.nextway_lead_activities/i);
assert.match(leadActivities, /enable row level security/i);
assert.match(leadActivities, /for select to authenticated/i);
assert.match(leadActivities, /for insert to authenticated/i);
assert.match(leadActivities, /for update to authenticated/i);
assert.match(leadActivities, /l\.owner_profile_id = nextway_lead_activities\.owner_profile_id/i);
assert.match(leadActivities, /created_by = auth\.uid\(\)/i);
assert.match(leadActivities, /grant select, insert on table public\.nextway_lead_activities to authenticated/i);
assert.match(leadActivities, /grant update \(next_action_status\) on table public\.nextway_lead_activities to authenticated/i);
assert.doesNotMatch(leadActivities, /grant delete on table public\.nextway_lead_activities/i);
console.log("NEXTWAY CRM activity log and follow-up: cloud API, UI and owner-scoped RLS migration: PASS");

assert.match(leadUiScript, /activityBtn\.disabled=!x\.cloud_id/);
assert.match(leadUiScript, /if\(x\.archived_at\)\{save\.disabled=true;feedback\.textContent='Lead archiviato/);
console.log("NEXTWAY CRM archived Lead: activity history remains readable while new activity entry is disabled: PASS");

assert.match(cloud, /async function getOpenLeadActivities\(limit=100\)/);
assert.match(cloud, /\.eq\('next_action_status','open'\)\.not\('next_action_at','is',null\)/);
assert.match(cloud, /getLeadActivities,getOpenLeadActivities,getLeadActivitySummary,addLeadActivity/, "Cloud API must expose the open-activity summary");
assert.match(html, /id="loadFollowups"/);
assert.match(leadUiScript, /getOpenLeadActivities\(100\)/);
assert.match(leadUiScript, /Completa/);
assert.match(leadUiScript, /Apri Lead/);
console.log("NEXTWAY CRM follow-up queue: due-date ordering, lead navigation and completion action: PASS");

assert.match(cloud, /async function getLeadById\(cloudId\)/);
assert.match(cloud, /getLeadById/);
assert.match(leadUiScript, /api\.getLeadById\(ev\.lead_id\)/);
assert.match(leadUiScript, /data\.unshift\(result\.record\)/);
assert.match(leadUiScript, /if\(!data\.some\(item=>item\.cloud_id===ev\.lead_id\)\)/);
console.log("NEXTWAY CRM follow-up navigation: retrieves missing Lead through authenticated RLS before opening its activity panel: PASS");

assert.match(leadUiScript, /Scaduti: '\+overdue\+' · Oggi: '\+today\+' · Entro 7 giorni: '\+week/);
assert.match(leadUiScript, /call:'Telefonata',message:'Messaggio',email:'Email',meeting:'Incontro'/);
console.log("NEXTWAY CRM follow-up queue: overdue/today/7-day summary and localized activity types: PASS");


// NEXTWAY CRM: explicit lifecycle stages are consistent across schema, browser UI and cloud sync.
const lifecycleStages = ["Da verificare","Verificato","Contattato","In follow-up","In valutazione","Convertito cliente","Convertito partner","Non interessato","Escluso"];
for (const stage of lifecycleStages) {
  assert.ok(leadLifecycle.includes("'" + stage + "'"), "Lifecycle migration missing stage: " + stage);
  assert.ok(html.includes("<option>" + stage + "</option>"), "Lead state filter missing stage: " + stage);
  assert.ok(cloud.includes("'" + stage + "'"), "Cloud sync whitelist missing stage: " + stage);
  assert.ok(leadUiScript.includes("'" + stage + "'"), "Lead UI/import stage missing stage: " + stage);
}
assert.match(cloud, /status:\['Da verificare','Verificato','Contattato','In follow-up','In valutazione','Convertito cliente','Convertito partner','Non interessato','Escluso'\]\.includes\(x\.status\)/, "Cloud sync must preserve all lifecycle stages");
assert.match(leadLifecycle, /drop constraint if exists nextway_leads_status_check/i);
assert.match(leadLifecycle, /add constraint nextway_leads_status_check/i);
assert.match(leadLifecycle, /non crea automaticamente un record cliente o partner/i);
assert.match(html, /id="stageContacted"/);
assert.match(html, /id="stageFollowup"/);
assert.match(html, /id="stageEvaluation"/);
assert.match(html, /id="stageConverted"/);
assert.match(leadUiScript, /stageConverted.*Convertito cliente.*Convertito partner/);
console.log("NEXTWAY CRM lifecycle: 9 stages synchronized across SQL, UI, import and cloud sync; funnel counters present: PASS");


// NEXTWAY CRM: conversion requests are staged, owner-bound and reviewed by platform_admin.
// No client/partner/auth profile is provisioned by this workflow.
assert.match(leadConversion, /create table if not exists public\.nextway_lead_conversion_requests/i);
assert.match(leadConversion, /conversion_type text not null check \(conversion_type in \('customer','partner'\)\)/i);
assert.match(leadConversion, /sponsor_profile_id = owner_profile_id/i);
assert.match(leadConversion, /l\.status = 'In valutazione'/i);
assert.match(leadConversion, /l\.archived_at is null/i);
assert.match(leadConversion, /nextway_conversion_active_lead_unique/i);
assert.match(leadConversion, /nextway_conversion_active_email_unique/i);
assert.match(leadConversion, /p\.role = 'platform_admin'/i);
assert.match(leadConversion, /for update to authenticated/i);
assert.match(leadConversion, /status = 'pending'[\s\S]*?p\.role = 'platform_admin'/i);
assert.match(leadConversion, /function public\.nextway_guard_conversion_request_review\(\)/i);
assert.ok(leadConversion.includes("as $$"), "Conversion review trigger must use a valid dollar-quote opener");
assert.ok(leadConversion.includes("nullif(btrim(new.review_notes), '')"), "Rejected conversion requests must require a non-empty reason");
assert.ok(leadConversion.includes("end;\n$$;"), "Conversion review trigger must close its dollar-quoted body");
assert.match(leadConversion, /old\.status <> 'pending'/i);
assert.match(leadConversion, /new\.reviewed_by is distinct from auth\.uid\(\)/i);
assert.match(leadConversion, /new\.full_name is distinct from old\.full_name/i);
assert.match(leadConversion, /before update on public\.nextway_lead_conversion_requests/i);
assert.match(leadConversion, /grant update \(status, review_notes, reviewed_by, reviewed_at\)/i);
assert.doesNotMatch(leadConversion, /insert into public\.(clients|profiles|partner_details)/i);
assert.match(cloud, /async function createLeadConversionRequest\(cloudId,request\)/);
assert.match(cloud, /async function getLeadConversionQueue\(status='pending'\)/);
assert.match(cloud, /\['pending','ready_for_activation'\]\.includes\(status\)/);
assert.match(cloud, /\.eq\('status',status\)\.order\('created_at'/);
assert.match(cloud, /id="nw-conv-ready-load"/);
assert.match(cloud, /loadLeadConversionQueue\('ready_for_activation'\)/);
assert.match(cloud, /pronta per l’attivazione/);
assert.match(cloud, /functions\.invoke\('nextway-conversion-provisioning'/);
assert.match(cloud, /Invita e attiva partner/);
assert.match(cloud, /Registra cliente/);
assert.match(conversionProvisioning, /nextway_claim_conversion_activation/);
assert.match(conversionProvisioning, /nextway_finalize_conversion_activation/);
assert.match(conversionProvisioning, /nextway_release_conversion_activation/);
assert.match(conversionProvisioning, /grant execute on function public\.nextway_finalize_conversion_activation\(uuid,uuid,uuid\) to service_role/i);
assert.match(conversionProvisioning, /nextway_conversion_request_id/);
assert.match(conversionProvisioning, /status='activated'/);
assert.match(conversionProvisioningFunction, /NEXTWAY_SERVICE_ROLE_KEY/);
assert.doesNotMatch(conversionProvisioningFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(conversionProvisioningFunction, /profile\?\.role !== "platform_admin"/);
assert.match(conversionProvisioningFunction, /inviteUserByEmail/);
assert.match(conversionProvisioningFunction, /nextway_finalize_conversion_activation/);
assert.doesNotMatch(conversionProvisioningFunction, /service_role.{0,30}console\.log/i);
assert.match(cloud, /async function reviewLeadConversionRequest\(requestId,status,notes=''/);
assert.match(cloud, /status==='rejected'&&!reviewNotes/);
assert.match(cloud, /getLeadConversionQueue,reviewLeadConversionRequest/);
assert.match(cloud, /Esiste già una richiesta attiva per questo Lead o per questo indirizzo email/);
assert.match(cloud, /Accesso riservato a platform_admin/);
assert.match(cloud, /nw-conversion-queue/);
assert.match(cloud, /Verifica e prepara attivazione/);
assert.match(leadUiScript, /Avvia conversione/);
assert.match(leadUiScript, /x\.status!=='In valutazione'/);
assert.match(leadUiScript, /createLeadConversionRequest\(x\.cloud_id/);
assert.match(leadUiScript, /Richiesta già presente|Ultima richiesta/);
assert.match(leadUiScript, /Non crea account o profili/);
console.log("NEXTWAY CRM conversion workflow: duplicate guard, owner/sponsor binding, admin review queue and no premature provisioning: PASS");
 
// Trigger-only functions: remove client/PUBLIC EXECUTE without changing installed triggers.
for (const signature of [
  "nextway_apply_lead_qualification_v1()",
  "nextway_set_lead_updated_at()",
  "nextway_setter_touch()",
  "nextway_validate_setter_owner()"
]) {
  const expected = "revoke all on function public." + signature + "\n  from public, anon, authenticated";
  assert.ok(triggerPrivileges.toLowerCase().includes(expected.toLowerCase()), `Missing least-privilege revoke for ${signature}`);
}
assert.doesNotMatch(triggerPrivileges, /drop trigger|disable trigger|drop function/i);
assert.doesNotMatch(triggerPrivileges, /nextway_save_ai_analysis|nextway_prune_lead_creation_requests|nextway_is_platform_admin/i);
console.log("NEXTWAY trigger-only function EXECUTE: PUBLIC, anon and authenticated revoked; installed triggers retained: PASS");


// Prospect identity extraction: guard against treating organization names as people.
const prospectProfileMatch = html.match(/function buildProspectProfile\\([\\s\\S]*?\\n}\\nfunction canonicalProspectUrl/);
assert.ok(prospectProfileMatch, "Prospect profile extraction function must exist");
const prospectProfileSource = prospectProfileMatch[0].replace(/\\nfunction canonicalProspectUrl$/, "");
const buildProspectProfile = new Function("safeUrl", prospectProfileSource + "; return buildProspectProfile;")(value => value);
const prospectCases = [
  { title: "Dott. Marco Verdi – Nutrizionista", expected: "Marco Verdi", profession: "Nutrizionista" },
  { title: "Mario Rossi - Personal Trainer", expected: "Mario Rossi", profession: "Personal trainer" },
  { title: "Laura Bianchi | LinkedIn", expected: "Laura Bianchi" },
  { title: "Profilo professionale", snippet: "Mi chiamo Giulia Neri, sono biologa nutrizionista.", expected: "Giulia Neri", profession: "Biologo/a nutrizionista" },
  { title: "Centro Benessere Aurora", expected: "Non rilevato con certezza" },
  { title: "Studio Medico Rossi", expected: "Non rilevato con certezza" },
  { title: "Articolo senza nominativo", expected: "Non rilevato con certezza" }
];
for (const item of prospectCases) {
  const profile = buildProspectProfile(item.title, item.snippet || "", "", "https://example.test/profilo", {}, { individual: false, score: 20 }, {});
  assert.equal(profile.name, item.expected, "Unexpected extracted name for: " + item.title);
  if (item.profession) assert.equal(profile.profession, item.profession);
}
console.log("Prospect identity extraction: 7 controlled cases PASS (including organization false-positive guards)");
