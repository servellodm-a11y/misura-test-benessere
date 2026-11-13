import assert from "node:assert/strict";
import { classifyPartnerInvite } from "../supabase/functions/nextway-conversion-provisioning/invite-lifecycle.mjs";

const email = "partner@example.test";
const requestId = "a1b2c3d4-e5f6-4789-8123-123456789abc";
const baseUser = {
  id: "11111111-2222-4333-8444-555555555555",
  email,
  user_metadata: { nextway_conversion_request_id: requestId },
};

assert.equal(classifyPartnerInvite(null, email, requestId), "create",
  "a request without an Auth user must create a new invitation");

assert.equal(classifyPartnerInvite({
  ...baseUser,
  email_confirmed_at: null,
}, email, requestId), "resend",
  "an existing unconfirmed invite must be resent to the same Auth user");

assert.equal(classifyPartnerInvite({
  ...baseUser,
  email_confirmed_at: "2026-11-13T10:00:00.000Z",
}, email, requestId), "reuse_confirmed",
  "an accepted invitation must be reused without another email");

assert.throws(
  () => classifyPartnerInvite({ ...baseUser, email: "other@example.test" }, email, requestId),
  /non corrisponde all'email/,
  "an Auth user with a different email must fail closed",
);

assert.throws(
  () => classifyPartnerInvite({
    ...baseUser,
    user_metadata: { nextway_conversion_request_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  }, email, requestId),
  /non è associato alla richiesta/,
  "an Auth user linked to another conversion must fail closed",
);

assert.throws(
  () => classifyPartnerInvite(baseUser, email, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  /non è associato alla richiesta/,
  "a retry must not cross conversion request boundaries",
);

console.log("NEXTWAY Partner invite lifecycle: 6/6 unit tests passed.");
