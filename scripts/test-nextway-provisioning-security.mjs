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
assert.doesNotMatch(cleanupMigration, /update public\.nextway_lead_conversion_requests[\s\S]*?where status = 'activated'/i, "Migration must not rewrite immutable historical activated requests");
assert.match(cleanupMigration, /status\s*=\s*'activated'[\s\S]*?activation_claim_token\s+is\s+null[\s\S]*?activated_at\s+is\s+not\s+null/);
assert.match(cleanupMigration, /status\s*=\s*'activated'[\s\S]*?activation_claim_token\s+is\s+null[\s\S]*?activation_claimed_at\s+is\s+null[\s\S]*?activated_at\s+is\s+not\s+null/);

console.log("NEXTWAY provisioning security contract: PASS");
console.log("JWT verification and platform_admin authorization precede all provisioning side effects");
console.log("Service-role key remains server-side; browser sends only the conversion request ID");
