import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261113140000_nextway_partner_conversion_cancellation.sql");
const provisioning = read("../supabase/migrations/20261111001500_nextway_conversion_provisioning.sql");
const snapshot = read("../supabase/migrations/20261113120000_nextway_conversion_request_workspace_snapshot.sql");
const finalization = read("../supabase/migrations/20261113130000_nextway_conversion_workspace_finalization.sql");

const required = [
  "cancelled_at timestamptz",
  "cancelled_by uuid",
  "cancellation_reason text",
  "'cancelled'",
  "nextway_conversion_review_state_check",
  "nextway_conversion_cancellation_state_check",
  "nextway_guard_conversion_request_review",
  "nextway_cancel_conversion_activation",
  "SECURITY DEFINER",
  "set search_path = pg_catalog, public",
  "grant execute on function public.nextway_cancel_conversion_activation(uuid,text)",
  "to authenticated",
  "for update",
  "activation_claim_token = null",
  "activation_claimed_at = null",
  "cancelled_by = v_actor",
];
for (const token of required) {
  assert.ok(migration.toLowerCase().includes(token.toLowerCase()), `Cancellation migration missing: ${token}`);
}

assert.match(migration, /status in \([\s\S]*?'pending'[\s\S]*?'ready_for_activation'[\s\S]*?'provisioning'[\s\S]*?'rejected'[\s\S]*?'activated'[\s\S]*?'cancelled'/i);
assert.match(migration, /status = 'cancelled'[\s\S]*?cancelled_at is not null[\s\S]*?cancelled_by is not null[\s\S]*?cancellation_reason is not null/i);
assert.match(migration, /status = 'cancelled'[\s\S]*?\(reviewed_by is null and reviewed_at is null\)[\s\S]*?\(reviewed_by is not null and reviewed_at is not null\)/i);
assert.match(migration, /old\.status not in \('pending','ready_for_activation','provisioning'\)/i);
assert.match(migration, /auth\.uid\(\) is not null[\s\S]*?nextway_is_platform_admin/i);
assert.match(migration, /new\\.activation_claim_token is not null[\\s\\S]*?new\\.activation_claimed_at is not null[\\s\\S]*?new\\.activation_user_id is not null[\\s\\S]*?new\\.activated_at is not null/i);
assert.match(migration, /activation_claim_token = null[\\s\\S]*?activation_claimed_at = null[\\s\\S]*?activation_user_id = null[\\s\\S]*?activated_at = null/i);

// The pre-existing activation-state CHECK must accept cancelled rows with all
// activation fields NULL (its generic non-provisioning/non-activated branch).
assert.match(provisioning, /add constraint nextway_conversion_activation_state_check check[\\s\\S]*?status not in \\('provisioning','activated'\\)[\\s\\S]*?activation_claim_token is null[\\s\\S]*?activation_claimed_at is null[\\s\\S]*?activation_user_id is null[\\s\\S]*?activated_at is null/i);

// Cancellation must not remove any pre-existing provisioning transitions.
assert.match(migration, /old\\.status = 'pending'[\\s\\S]*?new\\.status not in \\('ready_for_activation','rejected'\\)/i);
assert.match(migration, /old\\.status = 'ready_for_activation' and new\\.status = 'provisioning'/i);
assert.match(migration, /old\\.status = 'provisioning' and new\\.status = 'provisioning'/i);
assert.match(migration, /old\\.status = 'provisioning' and new\\.status = 'ready_for_activation'/i);
assert.match(migration, /old\\.status = 'provisioning' and new\\.status = 'activated'/i);
assert.match(migration, /new\.reviewed_by is distinct from old\.reviewed_by[\s\S]*?new\.reviewed_at is distinct from old\.reviewed_at[\s\S]*?new\.review_notes is distinct from old\.review_notes/i);
assert.match(migration, /if r\.status = 'cancelled'[\s\S]*?already_cancelled/i);
assert.match(migration, /if r\.status = 'activated'[\s\S]*?offboarding/i);
assert.match(migration, /if r\.status = 'rejected'[\s\S]*?non può essere annullata/i);
assert.match(migration, /revoke all on function public\.nextway_cancel_conversion_activation\(uuid,text\)[\s\S]*?from public, anon, service_role/i);
assert.match(migration, /grant execute on function public\.nextway_cancel_conversion_activation\(uuid,text\)[\s\S]*?to authenticated/i);

// Existing provisioning and finalization paths must remain compatible with claim invalidation.
assert.match(provisioning, /r\.status not in \('ready_for_activation','provisioning'\)/i);
assert.match(provisioning, /where id=p_request_id and status='provisioning' and activation_claim_token=p_claim_token/i);
assert.match(finalization, /from public\.nextway_lead_conversion_requests[\s\S]*?for update/i);
assert.match(finalization, /r\.status <> 'provisioning'[\s\S]*?activation_claim_token is distinct from p_claim_token/i);
assert.match(snapshot, /new\.workspace_id is distinct from old\.workspace_id/i);

console.log("NEXTWAY Partner cancellation SQL contract: PASS");
console.log("State/review/cancellation constraints, admin-only RPC, immutable review data, claim invalidation and finalizer serialization are statically cross-checked.");
console.log("This test does not execute PostgreSQL, RLS, Auth or concurrent transactions.");
