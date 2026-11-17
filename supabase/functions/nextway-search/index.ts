import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

type SearchResult = Record<string, unknown>;
type SearchGroup = { query: string; results: SearchResult[]; cached?: boolean };

function json(data: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanString(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref", "source"]
      .forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const normalized = url.toString().replace(/\/$/, "");
    return normalized.length <= 2048 ? normalized : "";
  } catch {
    return "";
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stringArray(value: unknown, maxItems = 5, maxLength = 300): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, maxItems);
}

function publicContacts(prospect: Record<string, unknown>) {
  const emails = stringArray(prospect.emails, 5, 254)
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  const phones = stringArray(prospect.phones, 5, 40)
    .filter((value) => (value.match(/\d/g) ?? []).length >= 9);
  const whatsapp = stringArray(prospect.whatsapp, 5, 500).map(safeUrl).filter(Boolean);
  const socials = stringArray(prospect.socials, 5, 500).map(safeUrl).filter(Boolean);
  return { emails, phones, whatsapp, socials };
}

function safeProfile(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const profile = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of ["name", "profession", "organization", "location", "identity_status", "source_domain"]) {
    const v = cleanString(profile[key], key === "location" ? 120 : 180);
    if (v) output[key] = v;
  }
  return output;
}

function safeSources(prospect: Record<string, unknown>, fallbackUrl: string) {
  const raw = Array.isArray(prospect.source_evidence) ? prospect.source_evidence : [];
  const sources = raw.slice(0, 3).flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const url = safeUrl(source.url);
    if (!url) return [];
    return [{
      url,
      title: cleanString(source.title, 180),
      snippet: cleanString(source.snippet, 700),
      evidence: cleanString(source.evidence, 900),
      collected_at: cleanString(source.collected_at, 40) || new Date().toISOString(),
    }];
  });
  if (!sources.length && fallbackUrl) {
    sources.push({
      url: fallbackUrl,
      title: cleanString(prospect.title, 180),
      snippet: cleanString(prospect.evidence_summary, 700),
      evidence: cleanString(prospect.reason, 700),
      collected_at: new Date().toISOString(),
    });
  }
  return sources.slice(0, 3);
}

function partnerSegment(value: unknown): string | null {
  const segment = String(value ?? "");
  const map: Record<string, string> = {
    wellness_pro: "wellness_professional",
    wellness_networker: "wellness_networker",
    new_networker: "other_networker",
    exnetworker: "other_networker",
    other_networker: "other_networker",
    entrepreneur: "entrepreneur",
    side_income: "extra_income",
    business_seeking: "extra_income",
  };
  return map[segment] ?? null;
}

async function parseBody(req: Request): Promise<Record<string, unknown> | Response> {
  const reader = req.body?.getReader();
  if (!reader) return new Response("missing-body", { status: 400 });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 262_144) {
      await reader.cancel();
      return new Response("body-too-large", { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Response("invalid-json-object", { status: 400 });
    }
    return parsed as Record<string, unknown>;
  } catch {
    return new Response("invalid-json", { status: 400 });
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const configuredOrigins = (Deno.env.get("NEXTWAY_ALLOWED_ORIGINS") ??
    "https://misura-test-benessere.netlify.app")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = [...new Set([...configuredOrigins, "http://localhost:8000"])];
  if (origin && !allowedOrigins.includes(origin)) {
    return json({ error: "Origin non autorizzata." }, 403, allowedOrigins[0] ?? "");
  }
  const responseOrigin = origin || allowedOrigins[0] || "";
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Origin": responseOrigin } });
  }
  if (req.method !== "POST") return json({ error: "Metodo non consentito." }, 405, responseOrigin);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === authorization) {
    return json({ error: "Sessione non valida: autenticazione richiesta." }, 401, responseOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const rawPublishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  let publishableKey: string | undefined;
  if (rawPublishable.trim()) {
    try {
      const parsed = JSON.parse(rawPublishable);
      publishableKey = typeof parsed === "string" ? parsed : (parsed.default ?? parsed[Object.keys(parsed)[0]]);
    } catch {
      publishableKey = rawPublishable.trim();
    }
  }
  publishableKey = publishableKey || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) {
    return json({ error: "Configurazione server Supabase incompleta." }, 503, responseOrigin);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) {
    return json({ error: "Sessione scaduta o non autorizzata." }, 401, responseOrigin);
  }

  // The service-role client is kept server-side and used only for validated, scoped write RPCs.
  // All workspace reads and membership checks continue through the caller's JWT-scoped client.
  const serviceRoleKey = Deno.env.get("NEXTWAY_SERVICE_ROLE_KEY");
  const trustedWriter = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : null;

  const parsedBody = await parseBody(req);
  if (parsedBody instanceof Response) {
    const message = parsedBody.status === 413 ? "Richiesta troppo grande." :
      parsedBody.status === 400 ? "Corpo JSON non valido." : "Corpo della richiesta mancante.";
    return json({ error: message }, parsedBody.status, responseOrigin);
  }
  const body = parsedBody;
  const action = cleanString(body.action, 40) || "search";
  const workspaceId = cleanString(body.workspace_id, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return json({ error: "Seleziona un workspace attivo prima di procedere." }, 400, responseOrigin);
  }

  const { data: access, error: accessError } = await supabase.rpc("nextway_has_workspace_access", {
    p_workspace_id: workspaceId,
    p_allowed_roles: ["workspace_owner", "workspace_admin", "workspace_manager", "workspace_member"],
  });
  if (accessError || access !== true) {
    return json({ error: "Non hai una membership attiva con permessi di ricerca in questo workspace." }, 403, responseOrigin);
  }

  if (!trustedWriter) {
    return json({ error: "Servizio di scrittura centrale non configurato: ricerca e acquisizione sospese." }, 503, responseOrigin);
  }
  const { data: memoryReady, error: memoryPreflightError } = await trustedWriter.rpc(
    "nextway_check_prospect_memory_ready",
    { p_actor_id: userData.user.id, p_workspace_id: workspaceId },
  );
  if (memoryPreflightError || memoryReady !== true) {
    console.error("NEXTWAY central memory preflight failed:", memoryPreflightError?.code ?? "not_ready");
    return json({
      error: "Memoria centrale o permessi non pronti: nessuna ricerca esterna è stata avviata.",
      reason: "central_memory_not_ready",
    }, 503, responseOrigin);
  }
  const { data: crmPreflight, error: crmPreflightError } = await supabase.rpc(
    "nextway_lookup_prospect_crm_matches",
    { p_workspace_id: workspaceId, p_source_urls: [] },
  );
  if (crmPreflightError || !Array.isArray(crmPreflight)) {
    console.error("NEXTWAY CRM lookup preflight failed:", crmPreflightError?.code ?? "not_ready");
    return json({ error: "Verifica CRM non pronta: nessuna ricerca esterna è stata avviata." }, 503, responseOrigin);
  }
  const { error: archiveReadPreflightError } = await supabase
    .from("nextway_prospect_identity_archive")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (archiveReadPreflightError) {
    console.error("NEXTWAY identity archive read preflight failed:", archiveReadPreflightError.code ?? "not_ready");
    return json({ error: "Lettura archivio centrale non pronta: nessuna ricerca esterna è stata avviata." }, 503, responseOrigin);
  }

  if (action === "confirm_crm_acquisition") {
    if (!trustedWriter) {
      return json({ error: "Servizio di conferma memoria non configurato: acquisizione centrale in sospeso." }, 503, responseOrigin);
    }
    const leadId = cleanString(body.lead_id, 36);
    const sourceUrl = cleanString(body.source_url, 2048);
    const canonicalUrl = safeUrl(sourceUrl);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId) ||
        !canonicalUrl || !sourceUrl || sourceUrl.length > 2048) {
      return json({ error: "Riferimenti del Lead non validi: conferma acquisizione sospesa." }, 400, responseOrigin);
    }
    const { data, error } = await trustedWriter.rpc("nextway_mark_prospect_identity_acquired", {
      p_actor_id: userData.user.id,
      p_workspace_id: workspaceId,
      p_lead_id: leadId,
      p_source_url: sourceUrl,
      p_canonical_url: canonicalUrl,
    });
    if (error || !Array.isArray(data) || data.length !== 1 || typeof data[0]?.identity_id !== "string") {
      console.error("NEXTWAY central acquisition confirmation failed:", error?.code ?? "not_confirmed");
      return json({ error: "Lead CRM salvato, ma conferma nella memoria centrale non completata.", reason: "central_acquisition_pending" }, 503, responseOrigin);
    }
    return json({
      confirmed: true,
      identity_id: data[0].identity_id,
      last_acquired_at: data[0].last_acquired_at,
      note: "Acquisizione CRM confermata nella memoria centrale dopo verifica del Lead e del workspace.",
    }, 200, responseOrigin);
  }

  if (action === "lookup_prospects") {
    if (!Array.isArray(body.prospects) || body.prospects.length > 25) {
      return json({ error: "Richiesta di confronto non valida: massimo 25 prospect." }, 400, responseOrigin);
    }
    const inputs = await Promise.all(body.prospects.map(async (item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return { index, url: "", fingerprints: [] as string[] };
      const prospect = item as Record<string, unknown>;
      const url = safeUrl(prospect.url);
      const keys = stringArray(prospect.identity_keys, 19, 500).map((key) =>
        key.normalize("NFKC").toLocaleLowerCase("it").replace(/\s+/g, " ").trim()
      );
      const normalizedKeys = [...new Set([...(url ? ["url:" + url] : []), ...keys])];
      return { index, url, fingerprints: await Promise.all(normalizedKeys.map(sha256)) };
    }));
    const urls = [...new Set(inputs.map(item => item.url).filter(Boolean))];
    const fingerprints = [...new Set(inputs.flatMap(item => item.fingerprints))];
    const columns = "id,canonical_url,identity_fingerprints,display_name,company_name,target_type,partner_segment,archive_status,first_seen_at,last_seen_at,seen_count,last_acquired_at";
    const records = new Map<string, Record<string, unknown>>();
    for (let offset = 0; offset < urls.length; offset += 5) {
      const urlBatch = urls.slice(offset, offset + 5);
      const { data, error } = await supabase.from("nextway_prospect_identity_archive")
        .select(columns).eq("workspace_id", workspaceId).in("canonical_url", urlBatch);
      if (error) {
        console.error("NEXTWAY central identity URL lookup failed:", error.code ?? "unknown");
        return json({ error: "Archivio centrale non leggibile: confronto identità non completato.", reason: "central_identity_lookup_failed" }, 503, responseOrigin);
      }
      for (const row of data ?? []) records.set(String(row.id), row as Record<string, unknown>);
    }
    for (let offset = 0; offset < fingerprints.length; offset += 80) {
      const fingerprintBatch = fingerprints.slice(offset, offset + 80);
      const { data, error } = await supabase.from("nextway_prospect_identity_archive")
        .select(columns).eq("workspace_id", workspaceId).overlaps("identity_fingerprints", fingerprintBatch);
      if (error) {
        console.error("NEXTWAY central identity fingerprint lookup failed:", error.code ?? "unknown");
        return json({ error: "Archivio centrale non leggibile: confronto identità non completato.", reason: "central_identity_lookup_failed" }, 503, responseOrigin);
      }
      for (const row of data ?? []) records.set(String(row.id), row as Record<string, unknown>);
    }
    const { data: crmRows, error: crmLookupError } = await supabase.rpc("nextway_lookup_prospect_crm_matches", {
      p_workspace_id: workspaceId,
      p_source_urls: urls,
    });
    if (crmLookupError || !Array.isArray(crmRows)) {
      console.error("NEXTWAY CRM duplicate lookup failed:", crmLookupError?.code ?? "unknown");
      return json({ error: "Verifica dei Lead CRM non disponibile: acquisizione sospesa.", reason: "crm_duplicate_lookup_failed" }, 503, responseOrigin);
    }
    const matches: Array<Record<string, unknown>> = [];
    for (const input of inputs) {
      const candidates = [...records.values()].filter(record => {
        const storedFingerprints = record.identity_fingerprints;
        return (!!input.url && record.canonical_url === input.url) ||
          (Array.isArray(storedFingerprints) &&
            input.fingerprints.some(fingerprint => (storedFingerprints as string[]).includes(fingerprint)));
      });
      const crmMatches = (crmRows as Array<Record<string, unknown>>).filter(row =>
        typeof row.canonical_url === "string" &&
        !!input.url &&
        String(row.canonical_url).trim().toLocaleLowerCase("it") === input.url.trim().toLocaleLowerCase("it")
      );
      if (candidates.length > 1 || crmMatches.length > 1) {
        matches.push({ index: input.index, ambiguous: true, matched_records: Math.max(candidates.length, crmMatches.length) });
        continue;
      }
      if (crmMatches.length === 1) {
        const crm = crmMatches[0];
        const archived = candidates[0];
        matches.push({
          index: input.index,
          record: {
            display_name: archived?.display_name ?? crm.display_name,
            company_name: archived?.company_name ?? crm.company_name,
            target_type: archived?.target_type ?? (String(crm.category).includes("customer") ? "potential_customer" : "potential_partner"),
            partner_segment: archived?.partner_segment ?? null,
            archive_status: "acquired",
            first_seen_at: archived?.first_seen_at ?? null,
            last_seen_at: archived?.last_seen_at ?? null,
            seen_count: archived?.seen_count ?? 0,
            last_acquired_at: archived?.last_acquired_at ?? null,
            crm_match: true,
            crm_archived: crm.archived_at !== null,
          },
        });
        continue;
      }
      if (!candidates.length) continue;
      const match = candidates[0];
      matches.push({
        index: input.index,
        record: {
          display_name: match.display_name,
          company_name: match.company_name,
          target_type: match.target_type,
          partner_segment: match.partner_segment,
          archive_status: match.archive_status,
          first_seen_at: match.first_seen_at,
          last_seen_at: match.last_seen_at,
          seen_count: match.seen_count,
          last_acquired_at: match.last_acquired_at,
          crm_match: false,
        },
      });
    }
    return json({
      matches,
      matched_count: matches.length,
      note: "Confronto limitato al workspace selezionato; nessun Lead viene creato o modificato.",
    }, 200, responseOrigin);
  }

  if (action === "archive_prospects") {
    if (!trustedWriter) {
      return json({ error: "Servizio di scrittura memoria non configurato: nessun dato è stato archiviato." }, 503, responseOrigin);
    }
    if (!Array.isArray(body.prospects) || body.prospects.length > 25) {
      return json({ error: "Archivio non valido: inviare al massimo 25 prospect per volta." }, 400, responseOrigin);
    }
    const archived: string[] = [];
    const failures: Array<{ index: number; reason: string }> = [];
    for (let index = 0; index < body.prospects.length; index++) {
      const item = body.prospects[index];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        failures.push({ index, reason: "invalid_record" });
        continue;
      }
      const prospect = item as Record<string, unknown>;
      const url = safeUrl(prospect.url);
      if (!url) {
        failures.push({ index, reason: "missing_public_source_url" });
        continue;
      }
      const profile = safeProfile(prospect.profile);
      const displayName = cleanString(profile.name || prospect.title, 240) || "Prospect senza nome";
      const identityKeys = stringArray(prospect.identity_keys, 19, 500);
      const normalizedKeys = [...new Set([ "url:" + url, ...identityKeys.map((key) =>
        key.normalize("NFKC").toLocaleLowerCase("it").replace(/\s+/g, " ").trim()
      )])].filter(Boolean).slice(0, 20);
      const fingerprints = await Promise.all(normalizedKeys.map(sha256));
      const classification = cleanString(prospect.classification, 80).toLocaleLowerCase("it");
      const requestedTargetType = cleanString(prospect.target_type, 40);
      const targetType = requestedTargetType === "potential_partner" || requestedTargetType === "potential_customer"
        ? requestedTargetType
        : classification.includes("partner") ? "potential_partner" :
          (classification.includes("client") || classification.includes("cliente")) ? "potential_customer" : "unknown";
      // The client cannot attest CRM acquisition or human review. The protected RPC accepts only "seen";
      // existing trusted states (acquired/reviewed/ignored) are preserved by the database merge.
      const archiveStatus = "seen";
      const rpcArgs = {
        p_actor_id: userData.user.id,
        p_workspace_id: workspaceId,
        p_identity_fingerprints: fingerprints,
        p_canonical_url: url,
        p_display_name: displayName,
        p_company_name: cleanString(profile.organization, 240),
        p_profile_data: profile,
        p_public_contacts: publicContacts(prospect),
        p_source_evidence: safeSources(prospect, url),
        p_target_type: targetType,
        p_partner_segment: partnerSegment(prospect.segment),
        p_archive_status: archiveStatus,
      };
      const { data, error } = await trustedWriter.rpc("nextway_merge_prospect_identity", rpcArgs);
      if (error || typeof data !== "string") {
        failures.push({ index, reason: "central_archive_write_failed" });
        continue;
      }
      archived.push(data);
    }
    return json({
      archived_count: archived.length,
      failed_count: failures.length,
      archive_ids: archived,
      failures,
      note: "La memoria centrale registra identità e fonti; non crea né qualifica automaticamente Lead.",
    }, failures.length ? 207 : 200, responseOrigin);
  }

  if (action !== "search") {
    return json({ error: "Azione non riconosciuta." }, 400, responseOrigin);
  }
  if (!Array.isArray(body.queries) || body.queries.length < 1 || body.queries.length > 5) {
    return json({ error: "Inserire da 1 a 5 query valide." }, 400, responseOrigin);
  }
  const queries = body.queries.map((query) => typeof query === "string" ? query.trim() : "");
  if (queries.some((query) => query.length === 0 || query.length > 400)) {
    return json({ error: "Ogni query deve contenere da 1 a 400 caratteri." }, 400, responseOrigin);
  }
  const requestedMax = Number(body.max_results ?? 5);
  const maxResults = Number.isFinite(requestedMax) ? Math.max(1, Math.min(10, Math.floor(requestedMax))) : 5;
  const segmentKey = cleanString(body.segment_key, 80);
  const marketKey = cleanString(body.market_key, 120);
  const companyId = cleanString(body.company_id, 80);
  if (!segmentKey || !marketKey) {
    return json({ error: "Segmento e mercato sono obbligatori per isolare la cache." }, 400, responseOrigin);
  }

  const cachedGroups: SearchGroup[] = [];
  const uncached: Array<{ query: string; fingerprint: string }> = [];
  const now = new Date();
  for (const query of queries) {
    const normalized = query.normalize("NFKC").toLocaleLowerCase("it").replace(/\s+/g, " ").trim();
    const fingerprint = await sha256(JSON.stringify({
      query: normalized, max_results: maxResults, company_id: companyId,
    }));
    const { data: cacheRow, error: cacheError } = await supabase
      .from("nextway_search_query_cache")
      .select("id, results, expires_at")
      .eq("workspace_id", workspaceId)
      .eq("query_fingerprint", fingerprint)
      .eq("segment_key", segmentKey)
      .eq("market_key", marketKey)
      .eq("provider_key", "tavily")
      .maybeSingle();
    if (cacheError) {
      console.error("NEXTWAY central query cache read failed:", cacheError.code ?? "unknown");
      return json({
        error: "Cache centrale non disponibile. La ricerca esterna è stata bloccata per evitare costi e duplicati.",
        reason: "central_cache_unavailable",
      }, 503, responseOrigin);
    }
    if (cacheRow && Date.parse(String(cacheRow.expires_at)) > now.getTime() && Array.isArray(cacheRow.results)) {
      cachedGroups.push({ query, results: cacheRow.results as SearchResult[], cached: true });
    } else {
      uncached.push({ query, fingerprint });
    }
  }

  const results: SearchGroup[] = [...cachedGroups];
  const failures: Array<{ query: string; reason: string; provider_status?: number }> = [];
  let cacheWriteFailures = 0;

  if (uncached.length > 0) {
    if (!trustedWriter) {
      return json({ error: "Servizio di scrittura centrale non configurato: ricerca esterna bloccata per evitare consumo di crediti senza archiviazione affidabile." }, 503, responseOrigin);
    }
    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    if (!tavilyKey) {
      return json({ error: "TAVILY_API_KEY non configurata: nessuna ricerca esterna è stata avviata." }, 503, responseOrigin);
    }
    const { data: limitRows, error: limitError } = await supabase.rpc(
      "nextway_consume_api_rate_limit",
      { p_scope: "public_search", p_units: uncached.length },
    );
    const rateLimit = Array.isArray(limitRows) ? limitRows[0] : null;
    if (limitError || !rateLimit) {
      console.error("Rate limit check failed:", limitError?.code ?? "unknown");
      return json({ error: "Controllo di sicurezza temporaneamente non disponibile." }, 503, responseOrigin);
    }
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((new Date(rateLimit.reset_at).getTime() - Date.now()) / 1000));
      return json({
        error: "Limite NEXTWAY Ricerca raggiunto. Riprova tra poco.",
        retry_after_seconds: retryAfter,
        remaining: 0,
        cached_queries: cachedGroups.length,
      }, 429, responseOrigin);
    }

    for (const entry of uncached) {
      let upstream: Response;
      try {
        upstream = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            api_key: tavilyKey,
            query: entry.query,
            topic: "general",
            search_depth: "basic",
            max_results: maxResults,
            include_answer: false,
            include_raw_content: "markdown",
          }),
        });
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        failures.push({ query: entry.query, reason: timedOut ? "timeout" : "provider_unreachable" });
        continue;
      }
      if (!upstream.ok) {
        failures.push({
          query: entry.query,
          reason: upstream.status === 429 ? "provider_rate_limited" : "provider_error",
          provider_status: upstream.status,
        });
        continue;
      }
      let payload: { results?: unknown } | null;
      try {
        payload = await upstream.json();
      } catch {
        failures.push({ query: entry.query, reason: "invalid_provider_json" });
        continue;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        failures.push({ query: entry.query, reason: "invalid_provider_payload" });
        continue;
      }
      const items = Array.isArray(payload.results) ? payload.results : [];
      const safeItems = items.flatMap((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const url = safeUrl(record.url);
        if (!url) return [];
        const score = Number(record.score ?? 0);
        return [{
          title: cleanString(record.title, 300),
          url,
          snippet: cleanString(record.content, 1200),
          page_content: cleanString(record.raw_content, 2500),
          score: Number.isFinite(score) ? score : 0,
          published_date: cleanString(record.published_date, 40) || null,
        }];
      });
      results.push({ query: entry.query, results: safeItems, cached: false });

      const cacheWrite = trustedWriter
        ? await trustedWriter.rpc("nextway_store_search_query_cache", {
        p_actor_id: userData.user.id,
        p_workspace_id: workspaceId,
        p_query_fingerprint: entry.fingerprint,
        p_query_text: entry.query,
        p_segment_key: segmentKey,
        p_market_key: marketKey,
        p_provider_key: "tavily",
        p_results: safeItems,
      })
        : { data: null, error: { code: "trusted_writer_unavailable" } };
      if (cacheWrite.error || typeof cacheWrite.data !== "string") {
        cacheWriteFailures++;
        console.error("NEXTWAY central query cache write failed:", cacheWrite.error?.code ?? "unknown");
      }
    }
  }

  if (results.length === 0) {
    const allRateLimited = failures.length > 0 && failures.every((failure) => failure.reason === "provider_rate_limited");
    return json({
      error: allRateLimited ? "Limite temporaneo del servizio di ricerca raggiunto." :
        "Nessuna ricerca è stata completata correttamente.",
      failures,
      cached_queries: cachedGroups.length,
    }, allRateLimited ? 429 : 502, responseOrigin);
  }

  return json({
    provider: uncached.length ? "tavily" : "central_cache",
    queries_requested: queries.length,
    queries_completed: results.length,
    queries_failed: failures.length,
    cached_queries: cachedGroups.length,
    externally_searched_queries: uncached.length - failures.length,
    cache_write_failures: cacheWriteFailures,
    results,
    failures,
    partial: failures.length > 0,
    note: "Risultati pubblici: verificare manualmente identità, fonte ed evidenza prima di creare un Lead.",
  }, 200, responseOrigin);
});
