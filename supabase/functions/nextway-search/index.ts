import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
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

  if (origin && !allowedOrigins.includes(origin)) {
    return json({ error: "Origin non autorizzata." }, 403, allowedOrigins[0] ?? "");
  }
  const responseOrigin = origin || allowedOrigins[0] || "";

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Allow-Origin": responseOrigin },
    });
  }
  if (req.method !== "POST") return json({ error: "Metodo non consentito." }, 405, responseOrigin);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === authorization) {
    return json({ error: "Sessione non valida: autenticazione richiesta." }, 401, responseOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Accept either a JSON map of publishable keys or a single publishable/legacy anon key.
  const rawPublishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  let publishableKey: string | undefined;
  if (rawPublishable.trim()) {
    try {
      const parsed = JSON.parse(rawPublishable);
      publishableKey = typeof parsed === "string"
        ? parsed
        : (parsed.default ?? parsed[Object.keys(parsed)[0]]);
    } catch {
      publishableKey = rawPublishable.trim();
    }
  }
  publishableKey = publishableKey ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY");
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (!supabaseUrl || !publishableKey || !tavilyKey) {
    return json({ error: "Configurazione server incompleta. Verificare i secrets Supabase." }, 503, responseOrigin);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) {
    return json({ error: "Sessione scaduta o non autorizzata." }, 401, responseOrigin);
  }

  // Legge il body in streaming e interrompe la lettura appena supera 16 KB.
  const reader = req.body?.getReader();
  if (!reader) {
    return json({ error: "Corpo della richiesta mancante." }, 400, responseOrigin);
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 16_384) {
      await reader.cancel();
      return json({ error: "Richiesta troppo grande." }, 413, responseOrigin);
    }
    chunks.push(value);
  }
  const rawBytes = new Uint8Array(totalBytes);
  let byteOffset = 0;
  for (const chunk of chunks) {
    rawBytes.set(chunk, byteOffset);
    byteOffset += chunk.byteLength;
  }
  const rawBody = new TextDecoder().decode(rawBytes);

  let body: { queries?: unknown; max_results?: unknown };
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Corpo della richiesta non valido." }, 400, responseOrigin);
    }
    body = parsed as { queries?: unknown; max_results?: unknown };
  } catch {
    return json({ error: "Corpo JSON non valido." }, 400, responseOrigin);
  }

  if (!Array.isArray(body.queries) || body.queries.length < 1 || body.queries.length > 5) {
    return json({ error: "Inserire da 1 a 5 query valide." }, 400, responseOrigin);
  }
  const queries = body.queries.map((q) => typeof q === "string" ? q.trim() : "");
  if (queries.some((q) => q.length === 0 || q.length > 400)) {
    return json({ error: "Ogni query deve contenere da 1 a 400 caratteri." }, 400, responseOrigin);
  }
  const requestedMax = Number(body.max_results ?? 5);
  const maxResults = Number.isFinite(requestedMax)
    ? Math.max(1, Math.min(10, Math.floor(requestedMax)))
    : 5;

  // Rate limit atomico per utente: ogni query Tavily consuma un'unità; massimo 10/minuto.
  const { data: limitRows, error: limitError } = await supabase.rpc(
    "nextway_consume_api_rate_limit",
    { p_scope: "public_search", p_units: queries.length },
  );
  const rateLimit = Array.isArray(limitRows) ? limitRows[0] : null;
  if (limitError || !rateLimit) {
    console.error("Rate limit check failed:", limitError);
    return json({ error: "Controllo di sicurezza temporaneamente non disponibile." }, 503, responseOrigin);
  }
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(rateLimit.reset_at).getTime() - Date.now()) / 1000),
    );
    return json({
      error: "Limite NEXTWAY Ricerca raggiunto. Riprova tra poco.",
      retry_after_seconds: retryAfter,
      remaining: 0,
    }, 429, responseOrigin);
  }

  const results: Array<{ query: string; results: Array<Record<string, unknown>> }> = [];
  const failures: Array<{ query: string; reason: string; provider_status?: number }> = [];

  for (const query of queries) {
    let upstream: Response;
    try {
      upstream = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          topic: "general",
          search_depth: "basic",
          max_results: maxResults,
          include_answer: false,
          // Recupera il testo pubblico della pagina per consentire l'estrazione
          // locale e verificabile di recapiti e profili professionali.
          include_raw_content: "markdown",
        }),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      failures.push({
        query,
        reason: timedOut ? "timeout" : "provider_unreachable",
      });
      continue;
    }

    if (!upstream.ok) {
      failures.push({
        query,
        reason: upstream.status === 429 ? "provider_rate_limited" : "provider_error",
        provider_status: upstream.status,
      });
      continue;
    }

    let payload: { results?: unknown } | null;
    try {
      payload = await upstream.json();
    } catch {
      failures.push({ query, reason: "invalid_provider_json" });
      continue;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      failures.push({ query, reason: "invalid_provider_payload" });
      continue;
    }

    const items = Array.isArray(payload.results) ? payload.results : [];
    const safeItems = items.flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      let sourceUrl: URL;
      try {
        sourceUrl = new URL(String(record.url ?? ""));
      } catch {
        return [];
      }
      if (sourceUrl.protocol !== "https:" && sourceUrl.protocol !== "http:") return [];
      const rawScore = Number(record.score ?? 0);
      return [{
        title: String(record.title ?? "").slice(0, 300),
        url: sourceUrl.toString(),
        snippet: String(record.content ?? "").slice(0, 1200),
        page_content: String(record.raw_content ?? "").slice(0, 5000),
        score: Number.isFinite(rawScore) ? rawScore : 0,
        published_date: record.published_date ? String(record.published_date).slice(0, 40) : null,
      }];
    });
    results.push({ query, results: safeItems });
  }

  if (results.length === 0) {
    const allRateLimited = failures.length > 0 &&
      failures.every((failure) => failure.reason === "provider_rate_limited");
    return json({
      error: allRateLimited
        ? "Limite temporaneo del servizio di ricerca raggiunto."
        : "Nessuna ricerca è stata completata correttamente.",
      failures,
    }, allRateLimited ? 429 : 502, responseOrigin);
  }

  return json({
    provider: "tavily",
    queries_requested: queries.length,
    queries_completed: results.length,
    queries_failed: failures.length,
    results,
    failures,
    partial: failures.length > 0,
    note: "Risultati di ricerca pubblici: verificare manualmente identità, fonte ed evidenza prima di creare un Lead.",
  }, 200, responseOrigin);
});
