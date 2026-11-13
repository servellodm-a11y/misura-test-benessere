import fs from "node:fs";
import assert from "node:assert/strict";

const workspaceSchema = fs.readFileSync("supabase/migrations/20261111190000_nextway_multi_workspace_foundation.sql", "utf8");
const membershipSchema = fs.readFileSync("supabase/migrations/20261111220000_nextway_workspace_memberships.sql", "utf8");
const snapshot = fs.readFileSync("supabase/migrations/20261113120000_nextway_conversion_request_workspace_snapshot.sql", "utf8");
const finalize = fs.readFileSync("supabase/migrations/20261113130000_nextway_conversion_workspace_finalization.sql", "utf8");
const cloud = fs.readFileSync("nextway-cloud.js", "utf8");
const edge = fs.readFileSync("supabase/functions/nextway-conversion-provisioning/index.ts", "utf8");
const inviteLifecycle = fs.readFileSync("supabase/functions/nextway-conversion-provisioning/invite-lifecycle.mjs", "utf8");
const inviteUnitTest = fs.readFileSync("scripts/test-nextway-partner-invite-lifecycle.mjs", "utf8");
const workspaceAdmin = fs.readFileSync("supabase/functions/nextway-workspace-admin/index.ts", "utf8");
const isolation = fs.readFileSync("supabase/diagnostics/nextway_conversion_workspace_isolation_transactional_test.sql", "utf8");

const checks = [
  ["workspace snapshot column with RESTRICT FK", /add column if not exists workspace_id uuid[\s\S]*references public\.nextway_workspaces\(id\) on delete restrict/i.test(snapshot)],
  ["server-side Lead lock at request creation", /from public\.nextway_leads l[\s\S]*for update/i.test(snapshot)],
  ["workspace derived from locked Lead", /v_lead\.workspace_id[\s\S]*workspace_id/i.test(snapshot)],
  ["active membership with explicit allowed roles", /nextway_has_workspace_access\([\s\S]*workspace_owner[\s\S]*workspace_member/i.test(snapshot)],
  ["viewer excluded from conversion proposal", !/array\[[^\]]*workspace_viewer/i.test(snapshot)],
  ["direct authenticated INSERT revoked", /revoke insert on table public\.nextway_lead_conversion_requests from authenticated/i.test(snapshot)],
  ["snapshot immutable in request guard", /new\.workspace_id is distinct from old\.workspace_id/i.test(snapshot)],
  ["concurrent requests with same email are serialized", /pg_advisory_xact_lock\(hashtextextended\(lower\(btrim\(p_email\)\), 0\)\)/i.test(snapshot)],
  ["duplicate check includes provisioning state", /q\.status in \('pending','ready_for_activation','provisioning'\)/i.test(snapshot)],
  ["browser uses creation RPC", /rpc\('nextway_create_lead_conversion_request'/i.test(cloud)],
  ["browser does not supply workspace_id", !/p_workspace_id\s*:/i.test(cloud)],
  ["request detail and queue read workspace_id", cloud.includes("created_by,workspace_id,conversion_type") && cloud.includes("lead_id,workspace_id,conversion_type")],
  ["admin queue resolves workspace name", /workspace:nextway_workspaces\(name,partner_name\)/i.test(cloud) && cloud.includes("meta.textContent='Workspace: '+workspaceLabel")],
  ["finalizer locks conversion request", /from public\.nextway_lead_conversion_requests[\s\S]*for update/i.test(finalize)],
  ["finalizer locks and validates Lead", /from public\.nextway_leads[\s\S]*for update/i.test(finalize) && /l\.workspace_id is distinct from r\.workspace_id/i.test(finalize)],
  ["Auth invite bound to conversion request metadata", /raw_user_meta_data ->> 'nextway_conversion_request_id' = r\.id::text/i.test(finalize)],
  ["existing profiles are not blindly upserted", !/on conflict\s*\(id\)\s*do update/i.test(finalize)],
  ["existing partner details are not blindly upserted", !/on conflict\s*\(profile_id\)\s*do update/i.test(finalize)],
  ["partner gets invited membership", /'workspace_member', 'invited', r\.owner_profile_id/i.test(finalize)],
  ["customer workspace attribution created", /insert into public\.nextway_client_workspace_attributions/i.test(finalize)],
  ["attribution table has no direct authenticated grants", /revoke all on table public\.nextway_client_workspace_attributions from public, anon, authenticated, service_role/i.test(finalize)],
  ["workspace client projection excludes viewer", /nextway_has_workspace_access\([\s\S]*workspace_owner[\s\S]*workspace_member/i.test(finalize) && !/array\[[^\]]*workspace_viewer/i.test(finalize)],
  ["workspace client RPC granted only to authenticated", /revoke all on function public\.nextway_list_workspace_clients\(uuid\) from public, anon, service_role/i.test(finalize) && /grant execute on function public\.nextway_list_workspace_clients\(uuid\) to authenticated/i.test(finalize)],
  ["Edge Function binds Auth invite to request", /nextway_conversion_request_id: requestId/i.test(edge)],
  ["Edge Function tracks invites created by the current attempt", /let inviteCreatedByThisAttempt = false/i.test(edge) && /inviteCreatedByThisAttempt = true/i.test(edge)],
  ["Edge Function preserves recovered invites after finalization failure", /if \(invitedUserId && inviteCreatedByThisAttempt\)/i.test(edge) && /recovered invite may[\s\S]*remain available for retry/i.test(edge)],
  ["Edge Function re-sends an unconfirmed invite instead of silently reusing an expired link", /inviteAction === "resend"[\s\S]*inviteUserByEmail\([\s\S]*inviteMetadata/i.test(edge)],
  ["Partner invite resend preserves the exact Auth user ID", /resent\.user\.id !== existingInvite\.id/i.test(edge)],
  ["Partner invite resend revalidates email and request metadata", /getUserById\(existingInvite\.id\)[\s\S]*refreshed\.user\.email[\s\S]*nextway_conversion_request_id !== requestId/i.test(edge)],
  ["Accepted Partner invite is reused without resending", /inviteAction === "reuse_confirmed"[\s\S]*invitedUserId = existingInvite\.id/i.test(edge)],
  ["Edge Function never deletes an invite accepted during finalization", /getUserById\(invitedUserId\)[\s\S]*!cleanupUser\.user\.email_confirmed_at[\s\S]*deleteUser\(invitedUserId\)/i.test(edge)],
  ["Partner finalizer validates Auth email and request metadata", /lower\(u\.email\) = lower\(r\.email\)[\s\S]*raw_user_meta_data ->> 'nextway_conversion_request_id' = r\.id::text/i.test(finalize)],
  ["Partner finalizer refuses incompatible pre-existing profiles and details", /v_profile\.role::text <> 'partner'[\s\S]*profilo incompatibile[\s\S]*v_partner\.nextway_conversion_request_id is distinct from r\.id/i.test(finalize)],
  ["Partner membership is created as invited, never active by finalizer", /workspace_role, membership_status, invited_by\)[\s\S]*'workspace_member', 'invited'/i.test(finalize) && !/membership_status\s*=\s*'active'/i.test(finalize)],
  ["Workspace membership activation requires confirmed Auth email", /body\.membership_status === "active"[\s\S]*!authUser\.user\.email_confirmed_at[\s\S]*deve prima accettare l'invito/i.test(workspaceAdmin)],
  ["Workspace activation requires a pre-existing invited membership", /if \(body\.membership_status === "active"\)[\s\S]*!existing \|\| !\["invited", "active"\]\.includes\(existing\.membership_status\)/i.test(workspaceAdmin)],
  ["Conversion-created Partner activation is bound to its request and workspace", /partner_details[\s\S]*nextway_conversion_request_id[\s\S]*nextway_lead_conversion_requests[\s\S]*status !== "activated"[\s\S]*activation_user_id !== body\.user_id[\s\S]*workspace_id !== body\.workspace_id/i.test(workspaceAdmin)],
  ["Edge Function does not accept workspace_id", !/body\.workspace_id/i.test(edge)],
  ["Edge Function uses the shared Partner invite lifecycle classifier", /classifyPartnerInvite\(existingInvite, email, requestId\)/i.test(edge) && /from "\.\/invite-lifecycle\.mjs"/i.test(edge)],
  ["Partner invite classifier fails closed on email and request metadata mismatch", /actualEmail !== email/i.test(inviteLifecycle) && /nextway_conversion_request_id !== requestId/i.test(inviteLifecycle)],
  ["Partner invite unit tests cover create, resend, accepted, email mismatch and request mismatch", /"create"/i.test(inviteUnitTest) && /"resend"/i.test(inviteUnitTest) && /"reuse_confirmed"/i.test(inviteUnitTest) && /different email/i.test(inviteUnitTest) && /another conversion/i.test(inviteUnitTest)],
  ["transactional test creates requests through authenticated RPC", /nextway_create_lead_conversion_request\([\s\S]*nextway\.test\.lead_a[\s\S]*nextway_create_lead_conversion_request\([\s\S]*nextway\.test\.lead_b/i.test(isolation)],
  ["transactional test includes admin review", /status='ready_for_activation'[\s\S]*reviewed_by=v_admin[\s\S]*reviewed_at=now\(\)/i.test(isolation)],
  ["transactional test sets authenticated JWT role explicitly", /request\.jwt\.claim\.role','authenticated'/i.test(isolation)],
  ["transactional SQL DO blocks have balanced dollar delimiters", (isolation.match(/^\s*do \$\$/gm) || []).length === (isolation.match(/^\$\$;/gm) || []).length && !/^\s*do \$$/m.test(isolation)],
  ["transactional test claims both requests as service_role", /nextway_claim_conversion_activation\([\s\S]*nextway\.test\.request_a[\s\S]*nextway_claim_conversion_activation\([\s\S]*nextway\.test\.request_b/i.test(isolation)],
  ["transactional test avoids direct request inserts", !/insert into public\.nextway_lead_conversion_requests/i.test(isolation)],
  ["transactional test checks request visibility after Lead transfer", /Trasferimento amministrativo successivo del Lead A[\s\S]*nextway_lead_conversion_requests where id=v_req_a/i.test(isolation)],
  ["transactional test performs Lead workspace changes under admin JWT", /Le modifiche di workspace ai Lead[\s\S]*request\.jwt\.claim\.sub',v_admin[\s\S]*Trasferimento amministrativo successivo del Lead A[\s\S]*request\.jwt\.claim\.sub',current_setting\('nextway\.test\.admin'/i.test(isolation)],
  ["transactional test requires two partner profiles and one eligible Lead each", /servono due partner con partner_details e un Lead convertibile libero ciascuno/i.test(isolation)],
  ["transactional test rolls back all fixtures", /begin;[\s\S]*rollback;/i.test(isolation)],
  ["cross-workspace members are denied the opposite workspace", /Membro B accede al workspace B senza membership[\s\S]*Membro A accede al workspace A senza membership/i.test(isolation)],
  ["viewer and invited membership are denied", /workspace_viewer[\s\S]*membership_status='invited'[\s\S]*Membership invited ha letto/i.test(isolation)],
  ["attribution table direct access is denied", /nextway_client_workspace_attributions[\s\S]*insufficient_privilege/i.test(isolation)],
  ["workspace RPC checks both workspace directions", /nextway_list_workspace_clients\(v_ws_a\)[\s\S]*nextway_list_workspace_clients\(v_ws_b\)/i.test(isolation)],
  ["workspace key schema enforces lowercase key length and format", /workspace_key text not null unique[\s\S]*workspace_key ~ '\^\[a-z0-9\]\[a-z0-9_-\]\{1,62\}\$'/i.test(workspaceSchema)],
  ["workspace key fixtures use independent UUID suffixes", /'zztesta_' \|\| replace\(gen_random_uuid\(\)::text,'-',''\)[\s\S]*'zztestb_' \|\| replace\(gen_random_uuid\(\)::text,'-',''\)/i.test(isolation)],
  ["workspace name schema accepts the test names", /name text not null check \(length\(btrim\(name\)\) between 2 and 160\)/i.test(workspaceSchema) && /'NEXTWAY TEST Workspace A'[\s\S]*'NEXTWAY TEST Workspace B'/i.test(isolation)],
  ["workspace status active is an allowed value", /status text not null default 'draft'[\s\S]*'draft', 'active', 'archived'/i.test(workspaceSchema) && /'Test Partner A','active'\)/i.test(isolation)],
  ["workspace omitted columns are nullable or defaulted", /created_by uuid references auth\.users\(id\) on delete set null[\s\S]*created_at timestamptz not null default now\(\)[\s\S]*updated_at timestamptz not null default now\(\)/i.test(workspaceSchema) && /insert into public\.nextway_workspaces\(workspace_key,name,partner_name,status\)/i.test(isolation)],
  ["membership role and status values accept the fixture", /workspace_role text not null default 'workspace_member'[\s\S]*'workspace_owner'[\s\S]*'workspace_member'[\s\S]*membership_status text not null default 'invited'[\s\S]*'invited', 'active', 'suspended'/i.test(membershipSchema) && /'workspace_member','active',now\(\)/i.test(isolation)],
  ["active membership requires a non-null activation timestamp", /membership_status = 'active' and activated_at is not null/i.test(membershipSchema) && /'workspace_member','active',now\(\)/i.test(isolation)],
  ["membership uniqueness is scoped to workspace and user", /unique \(workspace_id, user_id\)/i.test(membershipSchema)],
  ["membership foreign keys target workspace and Auth user", /workspace_id uuid not null[\s\S]*references public\.nextway_workspaces\(id\) on delete restrict[\s\S]*user_id uuid not null[\s\S]*references auth\.users\(id\) on delete restrict/i.test(membershipSchema)],
  ["membership fixture supplies all non-default required columns", /workspace_id uuid not null[\s\S]*user_id uuid not null[\s\S]*workspace_role text not null default[\s\S]*membership_status text not null default/i.test(membershipSchema) && /insert into public\.nextway_workspace_memberships\s*\(workspace_id,user_id,workspace_role,membership_status,activated_at\)/i.test(isolation)],
  ["invited membership may have a null activation timestamp", /membership_status = 'active' and activated_at is not null[\s\S]*or membership_status <> 'active'/i.test(membershipSchema) && /membership_status='invited',activated_at=null/i.test(isolation)],
  ["membership fixture uses an allowed role and active status", /'workspace_member','active',now\(\)/i.test(isolation)],
];

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} | ${name}`);
}
assert.ok(checks.every(([, passed]) => passed), "NEXTWAY conversion workspace static checks failed");
console.log(`\nNEXTWAY conversion workspace: ${checks.filter(([, passed]) => passed).length}/${checks.length} static checks passed.`);
