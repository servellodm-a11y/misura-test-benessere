import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const allowedOrigins = (Deno.env.get("NEXTWAY_ALLOWED_ORIGINS") ??
  "https://misura-test-benessere.netlify.app").split(",").map((v) => v.trim()).filter(Boolean);
const keyPattern = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 100_000;

function respond(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    },
  });
}
function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}
function validObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return respond({}, 200, origin);
  if (req.method !== "POST") return respond({ error: "Metodo non consentito" }, 405, origin);
  if (origin && !allowedOrigins.includes(origin)) return respond({ error: "Origine non autorizzata" }, 403, origin);

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) return respond({ error: "Autenticazione richiesta" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("NEXTWAY_SERVICE_ROLE_KEY");
  let publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  if (publicKey.trim()) {
    try {
      const parsed = JSON.parse(publicKey);
      publicKey = typeof parsed === "string" ? parsed :
        (parsed.default ?? parsed[Object.keys(parsed)[0]] ?? "");
    } catch { publicKey = publicKey.trim(); }
  }
  publicKey = publicKey || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceKey || !publicKey) {
    return respond({ error: "Servizio amministrativo non configurato" }, 503, origin);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return respond({ error: "Richiesta troppo grande" }, 413, origin);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ error: "Richiesta troppo grande" }, 413, origin);
    const parsed = JSON.parse(raw);
    if (!validObject(parsed)) throw new Error("JSON");
    body = parsed;
  } catch { return respond({ error: "JSON non valido" }, 400, origin); }

  const caller = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await caller.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Sessione non valida" }, 401, origin);
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "platform_admin") return respond({ error: "Operazione riservata a platform_admin" }, 403, origin);

    const action = body.action;
    if (action === "list_workspaces") {
      const { data, error } = await admin.from("nextway_workspaces")
        .select("id,workspace_key,name,partner_name,sector,description,website_url,market_country,language_code,status,settings,created_at,updated_at")
        .order("name").limit(200);
      if (error) throw error;
      return respond({ success: true, workspaces: data ?? [] }, 200, origin);
    }

    if (action === "list_memberships") {
      if (typeof body.workspace_id !== "string" || !uuidPattern.test(body.workspace_id)) {
        return respond({ error: "workspace_id non valido" }, 400, origin);
      }
      const { data, error } = await admin.from("nextway_workspace_memberships")
        .select("id,workspace_id,user_id,workspace_role,membership_status,invited_by,activated_at,created_at,updated_at")
        .eq("workspace_id", body.workspace_id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return respond({ success: true, memberships: data ?? [] }, 200, origin);
    }

    // Creates or updates a membership record. "invited" is only a database
    // status: this action does not send an email or create an Auth account.
    // Suspension is reversible and is used instead of hard deletion.
    if (action === "set_membership") {
      if (typeof body.workspace_id !== "string" || !uuidPattern.test(body.workspace_id) ||
          typeof body.user_id !== "string" || !uuidPattern.test(body.user_id)) {
        return respond({ error: "workspace_id o user_id non validi" }, 400, origin);
      }
      const allowedRoles = [
        "workspace_owner",
        "workspace_admin",
        "workspace_manager",
        "workspace_member",
        "workspace_viewer",
      ];
      const allowedStatuses = ["invited", "active", "suspended"];
      if (!allowedRoles.includes(String(body.workspace_role)) ||
          !allowedStatuses.includes(String(body.membership_status))) {
        return respond({ error: "Ruolo o stato membership non valido" }, 400, origin);
      }

      const { data: workspace, error: workspaceError } = await admin.from("nextway_workspaces")
        .select("id,status").eq("id", body.workspace_id).maybeSingle();
      if (workspaceError) throw workspaceError;
      if (!workspace) return respond({ error: "Workspace non trovato" }, 404, origin);
      if (body.membership_status === "active" && workspace.status !== "active") {
        return respond({ error: "Attiva prima il workspace per attivare una membership" }, 409, origin);
      }

      const { data: authUser, error: userError } = await admin.auth.admin.getUserById(body.user_id);
      if (userError || !authUser.user) {
        return respond({ error: "Utente NEXTWAY non trovato" }, 404, origin);
      }

      const { data: existing, error: existingError } = await admin.from("nextway_workspace_memberships")
        .select("id,membership_status,activated_at")
        .eq("workspace_id", body.workspace_id)
        .eq("user_id", body.user_id)
        .maybeSingle();
      if (existingError) throw existingError;

      const membershipStatus = String(body.membership_status);
      const activatedAt = membershipStatus === "active"
        ? (existing?.membership_status === "active" && existing.activated_at
          ? existing.activated_at
          : new Date().toISOString())
        : null;

      const { data, error } = await admin.from("nextway_workspace_memberships").upsert({
        workspace_id: body.workspace_id,
        user_id: body.user_id,
        workspace_role: body.workspace_role,
        membership_status: membershipStatus,
        invited_by: authData.user.id,
        activated_at: activatedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,user_id" })
        .select("id,workspace_id,user_id,workspace_role,membership_status,invited_by,activated_at,created_at,updated_at")
        .single();

      if (error?.code === "23505") {
        return respond({ error: "Esiste già un owner attivo o invitato per questo workspace. Sospendi o modifica l'owner attuale prima di assegnarne un altro." }, 409, origin);
      }
      if (error) throw error;
      return respond({ success: true, membership: data }, 200, origin);
    }

    if (action === "list_prompts" || action === "list_criteria") {
      if (typeof body.workspace_id !== "string" || !uuidPattern.test(body.workspace_id)) {
        return respond({ error: "workspace_id non valido" }, 400, origin);
      }
      const table = action === "list_prompts" ? "nextway_workspace_prompts" : "nextway_workspace_prospect_criteria";
      const columns = action === "list_prompts"
        ? "id,workspace_id,prompt_key,version,purpose,prompt_body,status,approved_by,approved_at,created_at,updated_at"
        : "id,workspace_id,criteria_key,version,name,description,config,status,approved_by,approved_at,created_at,updated_at";
      const { data, error } = await admin.from(table).select(columns)
        .eq("workspace_id", body.workspace_id).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return respond({ success: true, items: data ?? [] }, 200, origin);
    }

    if (action === "create_workspace") {
      const key = body.workspace_key;
      if (typeof key !== "string" || !keyPattern.test(key) ||
          !validText(body.name, 2, 160)) return respond({ error: "workspace_key o name non validi" }, 400, origin);
      const language = body.language_code ?? "it";
      if (typeof language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
        return respond({ error: "language_code non valido" }, 400, origin);
      }
      const settings = body.settings ?? {};
      if (!validObject(settings)) return respond({ error: "settings deve essere un oggetto JSON" }, 400, origin);
      const payload = {
        workspace_key: key, name: body.name.trim(),
        partner_name: validText(body.partner_name, 1, 160) ? body.partner_name.trim() : null,
        sector: validText(body.sector, 1, 120) ? body.sector.trim() : null,
        description: validText(body.description, 1, 2000) ? body.description.trim() : null,
        website_url: validText(body.website_url, 1, 500) ? body.website_url.trim() : null,
        market_country: validText(body.market_country, 1, 120) ? body.market_country.trim() : null,
        language_code: language, settings, status: "draft", created_by: authData.user.id,
      };
      const { data, error } = await admin.from("nextway_workspaces").insert(payload)
        .select("id,workspace_key,name,status,created_at").single();
      if (error?.code === "23505") return respond({ error: "workspace_key gia utilizzata" }, 409, origin);
      if (error) throw error;
      return respond({ success: true, workspace: data }, 201, origin);
    }

    if (action === "update_workspace") {
      if (typeof body.workspace_id !== "string" || !uuidPattern.test(body.workspace_id)) {
        return respond({ error: "workspace_id non valido" }, 400, origin);
      }
      const patch: Record<string, unknown> = {};
      for (const field of ["name", "partner_name", "sector", "description", "website_url", "market_country"]) {
        if (field in body) {
          const value = body[field];
          const max = field === "description" ? 2000 : field === "website_url" ? 500 : field === "name" ? 160 : 120;
          if (value !== null && !validText(value, field === "name" ? 2 : 1, max)) return respond({ error: `Campo ${field} non valido` }, 400, origin);
          patch[field] = typeof value === "string" ? value.trim() : null;
        }
      }
      if ("language_code" in body) {
        if (typeof body.language_code !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(body.language_code)) return respond({ error: "language_code non valido" }, 400, origin);
        patch.language_code = body.language_code;
      }
      if ("settings" in body) {
        if (!validObject(body.settings)) return respond({ error: "settings non valido" }, 400, origin);
        patch.settings = body.settings;
      }
      if ("status" in body) {
        if (!["draft", "active", "archived"].includes(String(body.status))) return respond({ error: "status non valido" }, 400, origin);
        patch.status = body.status;
      }
      if (!Object.keys(patch).length) return respond({ error: "Nessun campo modificabile" }, 400, origin);
      patch.updated_at = new Date().toISOString();
      const { data, error } = await admin.from("nextway_workspaces").update(patch)
        .eq("id", body.workspace_id).select("id,workspace_key,name,status,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "Workspace non trovato" }, 404, origin);
      return respond({ success: true, workspace: data }, 200, origin);
    }

    if (action === "save_prompt_draft" || action === "save_criteria_draft") {
      if (typeof body.workspace_id !== "string" || !uuidPattern.test(body.workspace_id)) return respond({ error: "workspace_id non valido" }, 400, origin);
      const { data: workspace, error: workspaceError } = await admin.from("nextway_workspaces")
        .select("id").eq("id", body.workspace_id).maybeSingle();
      if (workspaceError) throw workspaceError;
      if (!workspace) return respond({ error: "Workspace non trovato" }, 404, origin);

      if (action === "save_prompt_draft") {
        if (typeof body.prompt_key !== "string" || !keyPattern.test(body.prompt_key) ||
            !validText(body.purpose, 2, 240) || !validText(body.prompt_body, 1, 50000) ||
            !Number.isInteger(body.version) || Number(body.version) < 1) {
          return respond({ error: "Dati prompt non validi" }, 400, origin);
        }
        const { data, error } = await admin.from("nextway_workspace_prompts").insert({
          workspace_id: body.workspace_id, prompt_key: body.prompt_key, version: Number(body.version),
          purpose: body.purpose.trim(), prompt_body: body.prompt_body.trim(),
          status: "draft", created_by: authData.user.id,
        }).select("id,workspace_id,prompt_key,version,status,created_at").single();
        if (error?.code === "23505") return respond({ error: "Versione prompt gia esistente" }, 409, origin);
        if (error) throw error;
        return respond({ success: true, prompt: data }, 201, origin);
      }

      if (typeof body.criteria_key !== "string" || !keyPattern.test(body.criteria_key) ||
          !validText(body.name, 2, 160) || !Number.isInteger(body.version) || Number(body.version) < 1 ||
          (body.description != null && !validText(body.description, 1, 2000)) ||
          !validObject(body.config ?? {})) return respond({ error: "Dati criteri non validi" }, 400, origin);
      const { data, error } = await admin.from("nextway_workspace_prospect_criteria").insert({
        workspace_id: body.workspace_id, criteria_key: body.criteria_key, version: Number(body.version),
        name: body.name.trim(), description: typeof body.description === "string" ? body.description.trim() : null,
        config: body.config ?? {}, status: "draft", created_by: authData.user.id,
      }).select("id,workspace_id,criteria_key,version,status,created_at").single();
      if (error?.code === "23505") return respond({ error: "Versione criteri gia esistente" }, 409, origin);
      if (error) throw error;
      return respond({ success: true, criteria: data }, 201, origin);
    }

    if (action === "activate_prompt" || action === "activate_criteria" ||
        action === "archive_prompt" || action === "archive_criteria") {
      if (typeof body.item_id !== "string" || !uuidPattern.test(body.item_id)) return respond({ error: "item_id non valido" }, 400, origin);
      const table = action.endsWith("prompt") ? "nextway_workspace_prompts" : "nextway_workspace_prospect_criteria";
      const { data: item, error: itemError } = await admin.from(table)
        .select("id,workspace_id,status").eq("id", body.item_id).maybeSingle();
      if (itemError) throw itemError;
      if (!item) return respond({ error: "Versione non trovata" }, 404, origin);
      if (action.startsWith("activate_")) {
        const rpc = action === "activate_prompt" ? "nextway_activate_workspace_prompt" : "nextway_activate_workspace_criteria";
        const { error } = await admin.rpc(rpc, { p_item_id: body.item_id, p_admin_user_id: authData.user.id });
        if (error) throw error;
        return respond({ success: true, status: "active", item_id: body.item_id }, 200, origin);
      }
      const { data, error } = await admin.from(table).update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", body.item_id).neq("status", "active").select("id,status").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "Una versione attiva deve essere sostituita tramite una nuova attivazione approvata" }, 409, origin);
      return respond({ success: true, item: data }, 200, origin);
    }

    return respond({ error: "Azione non supportata" }, 400, origin);
  } catch (error) {
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error("NEXTWAY workspace admin failed", {
      code: typeof details.code === "string" ? details.code.slice(0, 32) : undefined,
      name: typeof details.name === "string" ? details.name.slice(0, 64) : undefined,
    });
    return respond({ error: "Operazione amministrativa non completata" }, 500, origin);
  }
});
