import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const spec = read("../docs/NEXTWAY-PARTNER-CANCELLATION-TECHNICAL-SPEC.md");
const lifecycle = read("../docs/NEXTWAY-PARTNER-CONVERSION-LIFECYCLE-TEST-PLAN.md");
const provisioning = read("../supabase/migrations/20261111001500_nextway_conversion_provisioning.sql");
const snapshot = read("../supabase/migrations/20261113120000_nextway_conversion_request_workspace_snapshot.sql");
const finalization = read("../supabase/migrations/20261113130000_nextway_conversion_workspace_finalization.sql");
const edge = read("../supabase/functions/nextway-conversion-provisioning/index.ts");

// The specification must cover the complete request-state and cancellation metadata model.
for (const token of [
  "`pending`", "`ready_for_activation`", "`provisioning`", "`activated`",
  "`rejected`", "`cancelled`", "cancelled_at", "cancelled_by",
  "cancellation_reason", "nextway_guard_conversion_request_review",
  "nextway_cancel_conversion_activation", "FOR UPDATE",
]) {
  assert.ok(spec.includes(token), `Cancellation specification is missing: ${token}`);
}

assert.match(spec, /Caso A[\s\S]*annullamento[\s\S]*finalizer/i);
assert.match(spec, /Caso B[\s\S]*finalizzazione[\s\S]*annullamento/i);
assert.match(spec, /Non eliminare account recuperati[\s\S]*né account con email confermata/i);
assert.match(spec, /membership[\s\S]*viene creato dalla finalizzazione annullata/i);
assert.match(lifecycle, /NEXTWAY-PARTNER-CANCELLATION-TECHNICAL-SPEC\.md/);

// Existing claim and release paths must already fail closed after cancellation invalidates a claim.
assert.match(provisioning, /r\.status not in \('ready_for_activation','provisioning'\)/i);
assert.match(provisioning, /where id=p_request_id and status='provisioning' and activation_claim_token=p_claim_token/i);

// Finalization must serialize on the request row and require the still-current provisioning claim.
assert.match(finalization, /from public\.nextway_lead_conversion_requests[\s\S]*?for update/i);
assert.match(finalization, /r\.status <> 'provisioning'[\s\S]*?activation_claim_token is distinct from p_claim_token/i);

// Workspace snapshot and request origin are immutable under the existing trigger guard.
assert.match(snapshot, /new\.workspace_id is distinct from old\.workspace_id/i);
assert.match(snapshot, /I dati originari della richiesta non possono essere modificati/i);

// Compensating deletion must remain restricted to an invite created by this execution and not confirmed.
assert.match(edge, /invitedUserId && inviteCreatedByThisAttempt/);
assert.match(edge, /cleanupUser\.user && !cleanupUser\.user\.email_confirmed_at/);
assert.match(edge, /current\?\.status === "activated"/);

console.log("NEXTWAY Partner cancellation specification: PASS");
console.log("State model, cancellation races, claim invalidation, finalizer lock, and Auth cleanup safeguards are documented and statically cross-checked.");
console.log("This is a static contract test; it does not execute PostgreSQL locks or Supabase Auth.");
