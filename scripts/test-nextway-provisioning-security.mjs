import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const fn = read("../supabase/functions/nextway-conversion-provisioning/index.ts");
const cloud = read("../nextway-cloud.js");

const authHeader = fn.indexOf('req.headers.get("authorization")');
const userVerification = fn.indexOf("caller.auth.getUser(token)");
const roleLookup = fn.indexOf('.from("profiles").select("role")');
const roleGate = fn.indexOf('profile?.role !== "platform_admin"');
const claim = fn.indexOf('"nextway_claim_conversion_activation"');
const invite = fn.indexOf("inviteUserByEmail");
const finalize = fn.indexOf('"nextway_finalize_conversion_activation"');

assert.ok(authHeader >= 0, "Provisioning must require an Authorization header");
assert.ok(userVerification > authHeader, "JWT must be verified after the Authorization header is read");
assert.ok(roleLookup > userVerification, "Profile role must be read only after JWT verification");
assert.ok(roleGate > roleLookup, "The platform_admin role gate must follow the profile lookup");
assert.ok(claim > roleGate, "No activation claim may happen before the platform_admin gate");
assert.ok(invite > roleGate, "No Auth invite may happen before the platform_admin gate");
assert.ok(finalize > roleGate, "No activation finalization may happen before the platform_admin gate");

assert.match(fn, /NEXTWAY_SERVICE_ROLE_KEY/);
assert.doesNotMatch(fn, /Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE_KEY["']\)/);
assert.match(fn, /createClient\(supabaseUrl, serviceKey/);
assert.match(fn, /createClient\(supabaseUrl, publicKey/);
assert.match(fn, /uuidPattern\.test\(requestId\)/);
assert.match(fn, /nextway_release_conversion_activation/);
assert.doesNotMatch(fn, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/i);

assert.match(cloud, /functions\.invoke\('nextway-conversion-provisioning',\{body:\{request_id:req\.id\}\}\)/);
assert.doesNotMatch(cloud, /NEXTWAY_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY|inviteUserByEmail|auth\.admin\./);


const cleanupMigration = read("../supabase/migrations/20261111150000_nextway_conversion_claim_cleanup.sql");
assert.match(cleanupMigration, /activation_claim_token\s*=\s*null\s*,\s*activation_claimed_at\s*=\s*null/);
assert.doesNotMatch(cleanupMigration, /set activation_claimed_at\s*=\s*null\s+where status\s*=\s*'activated'/i, "Migration must not rewrite immutable historical activated requests");
assert.match(cleanupMigration, /status\s*=\s*'activated'[\s\S]*?activation_claim_token\s+is\s+null[\s\S]*?activated_at\s+is\s+not\s+null/);



const integrityMigration = read("../supabase/migrations/20261112170000_nextway_conversion_activation_integrity.sql");
assert.match(integrityMigration, /create or replace function public\.nextway_finalize_conversion_activation/);
assert.match(integrityMigration, /from public\.nextway_leads l[\s\S]*?for update/i,
  "The Lead row must be locked before conversion");
assert.match(integrityMigration, /l\.owner_profile_id = r\.owner_profile_id[\s\S]*?l\.status = 'In valutazione'[\s\S]*?l\.archived_at is null/i,
  "Finalization must revalidate Lead ownership, status, and archive state");
assert.match(integrityMigration, /update public\.nextway_leads[\s\S]*?returning id into v_lead_id[\s\S]*?if v_lead_id is null then[\s\S]*?raise exception/i,
  "Lead state transition must affect a row or abort the transaction");
const leadUpdatePosition = integrityMigration.indexOf("update public.nextway_leads");
const partnerInsertPosition = integrityMigration.indexOf("insert into public.partner_details");
const clientInsertPosition = integrityMigration.indexOf("insert into public.clients");
assert.ok(leadUpdatePosition > 0 && leadUpdatePosition < partnerInsertPosition,
  "Partner provisioning must follow the successful Lead transition");
assert.ok(leadUpdatePosition > 0 && leadUpdatePosition < clientInsertPosition,
  "Customer provisioning must follow the successful Lead transition");
assert.match(integrityMigration, /begin;[\s\S]*?commit;/i,
  "Conversion integrity migration must be transactional");
assert.match(integrityMigration, /revoke all on function public\.nextway_finalize_conversion_activation\(uuid, uuid, uuid\)[\s\S]*?grant execute on function public\.nextway_finalize_conversion_activation\(uuid, uuid, uuid\)\s+to service_role/i,
  "Finalization RPC must remain service_role-only");

assert.match(fn, /function safeErrorCode\(error: unknown\)/,
  "Provisioning errors must be reduced to safe diagnostic codes");
assert.doesNotMatch(fn, /safeMessage\(error\)|error\.message|deleteError\.message/,
  "Raw exception messages must not be logged or returned");
assert.match(fn, /request_id: requestId,[\s\S]*?code: safeErrorCode\(error\)/,
  "Server logs must use request correlation and a sanitized error code");
assert.match(fn, /error: "Operazione di provisioning non completata[\s\S]*?request_id: requestId[\s\S]*?}, 500, origin/,
  "Client must receive a generic error and correlation ID, not internal details");

console.log("NEXTWAY provisioning security contract: PASS");
console.log("JWT verification and platform_admin authorization precede all provisioning side effects");
console.log("Service-role key remains server-side; browser sends only the conversion request ID");
