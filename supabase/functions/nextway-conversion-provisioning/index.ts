import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const configuredOrigins = (Deno.env.get("NEXTWAY_ALLOWED_ORIGINS") ??
  "https://misura-test-benessere.netlify.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Permette il test locale; autenticazione e autorizzazioni restano obbligatorie.
const allowedOrigins = [...new Set([
  ...configuredOrigins,
  "http://localhost:8000",
])];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json",
      ...(origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}) },
  });
}
function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_-]{1,32}$/.test(code)) {
      return code;
    }
  }
  return "UNCLASSIFIED";
}

async function findExistingInvite(admin: any, email: string, requestId: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user: any) =>
      String(user.email ?? "").toLowerCase() === email.toLowerCase() &&
      user.user_metadata?.nextway_conversion_request_id === requestId
    );
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return response({}, 200, origin);
  if (req.method !== "POST") return response({ error: "Metodo non consentito" }, 405, origin);
  if (origin && !allowedOrigins.includes(origin)) return response({ error: "Origine non autorizzata" }, 403, origin);

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) return response({ error: "Autenticazione richiesta" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("NEXTWAY_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !publicKey) {
    return response({ error: "Provisioning non configurato lato server" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return response({ error: "Richiesta troppo grande" }, 413, origin);
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("JSON non valido");
    body = parsed as Record<string, unknown>;
  } catch {
    return response({ error: "Corpo JSON non valido" }, 400, origin);
  }
  const requestId = String(body.request_id ?? "");
  if (!uuidPattern.test(requestId)) return response({ error: "request_id non valido" }, 400, origin);

  const caller = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await caller.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Sessione non valida" }, 401, origin);
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "platform_admin") return response({ error: "Operazione riservata a platform_admin" }, 403, origin);

    const claimToken = crypto.randomUUID();
    const { data: claim, error: claimError } = await admin.rpc(
      "nextway_claim_conversion_activation",
      { p_request_id: requestId, p_claim_token: claimToken },
    );
    if (claimError) throw claimError;
    if (claim?.already_activated) {
      return response({ success: true, already_activated: true,
        conversion_type: claim.conversion_type, request_id: requestId }, 200, origin);
    }

    let invitedUserId: string | null = null;
    let inviteCreatedByThisAttempt = false;
    try {
      if (claim.conversion_type === "partner") {
        const email = String(claim.email);
        // Recover an invite created by a previous timed-out attempt, but never attach
        // an unrelated Auth account that happens to use the same email address.
        const existingInvite = await findExistingInvite(admin, email, requestId);
        if (existingInvite) {
          invitedUserId = existingInvite.id;
        } else {
          const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
            email,
            { data: { full_name: String(claim.full_name),
                nextway_conversion_request_id: requestId } },
          );
          if (inviteError || !invite.user) throw inviteError ?? new Error("Invito Auth non creato");
          invitedUserId = invite.user.id;
          inviteCreatedByThisAttempt = true;
        }
      } else if (claim.conversion_type !== "customer") {
        throw new Error("Tipo conversione non supportato");
      }

      const { data: finalized, error: finalizeError } = await admin.rpc(
        "nextway_finalize_conversion_activation",
        { p_request_id: requestId, p_claim_token: claimToken,
          p_auth_user_id: invitedUserId },
      );
      if (finalizeError) {
        // Resolve an uncertain network result before any compensating deletion.
        const { data: current, error: currentError } = await admin
          .from("nextway_lead_conversion_requests")
          .select("status,activation_user_id")
          .eq("id", requestId).maybeSingle();
        if (currentError) throw finalizeError;
        if (current?.status === "activated") {
          return response({ success: true, already_activated: true,
            conversion_type: claim.conversion_type, request_id: requestId }, 200, origin);
        }
        // Delete only an invite created by this execution. A recovered invite may
        // belong to an earlier timed-out attempt and must remain available for retry.
        if (invitedUserId && inviteCreatedByThisAttempt) {
          // The invite may have been accepted while finalization was in flight.
          // Never delete an Auth account after its email has been confirmed.
          const { data: cleanupUser, error: cleanupLookupError } =
            await admin.auth.admin.getUserById(invitedUserId);
          if (cleanupLookupError) {
            console.error("Compensating Auth cleanup lookup failed", {
              request_id: requestId,
              code: safeErrorCode(cleanupLookupError),
            });
          } else if (cleanupUser.user && !cleanupUser.user.email_confirmed_at) {
            const { error: deleteError } = await admin.auth.admin.deleteUser(invitedUserId);
            if (deleteError) {
              console.error("Compensating Auth cleanup failed", {
                request_id: requestId,
                code: safeErrorCode(deleteError),
              });
            }
          }
        }
        await admin.rpc("nextway_release_conversion_activation", {
          p_request_id: requestId, p_claim_token: claimToken,
        });
        throw finalizeError;
      }
      return response({ success: true, already_activated: false,
        conversion_type: claim.conversion_type, request_id: requestId,
        auth_user_id: invitedUserId, result: finalized }, 200, origin);
    } catch (error) {
      // Release only our own claim. A completed activation is never reset.
      await admin.rpc("nextway_release_conversion_activation", {
        p_request_id: requestId, p_claim_token: claimToken,
      });
      throw error;
    }
  } catch (error) {
    console.error("NEXTWAY conversion provisioning failed", {
      request_id: requestId,
      code: safeErrorCode(error),
    });
    return response({
      error: "Operazione di provisioning non completata. Verifica lo stato della richiesta prima di riprovare.",
      request_id: requestId,
    }, 500, origin);
  }
});
