import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const cloud = read("../nextway-cloud.js");
const html = read("../nextway-ai.html");
const audit = read("../supabase/migrations/20261110000900_nextway_lead_audit_trail.sql");
const archiveSchema = read("../supabase/migrations/20261110000800_nextway_leads_soft_archive.sql");
const privacy = read("../supabase/migrations/20261110001000_nextway_audit_data_minimization.sql");

new Function(cloud);
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
