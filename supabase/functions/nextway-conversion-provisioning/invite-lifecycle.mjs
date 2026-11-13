export function classifyPartnerInvite(existingUser, expectedEmail, requestId) {
  if (!existingUser) return "create";
  const actualEmail = String(existingUser.email ?? "").trim().toLowerCase();
  const email = String(expectedEmail ?? "").trim().toLowerCase();
  if (!email || actualEmail !== email) {
    throw new Error("L'account Auth esistente non corrisponde all'email della richiesta.");
  }
  if (existingUser.user_metadata?.nextway_conversion_request_id !== requestId) {
    throw new Error("L'account Auth esistente non è associato alla richiesta di conversione.");
  }
  return existingUser.email_confirmed_at ? "reuse_confirmed" : "resend";
}
