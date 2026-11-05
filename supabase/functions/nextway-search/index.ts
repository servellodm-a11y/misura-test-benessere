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
  const allowedOrigins = (Deno.env.get("NEXTWAY_ALLOWED_ORIGINS") ??
    "https://misura-test-benessere.netlify.app")
    .split(",").map((x) => x.trim()).filter(Boolean);

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
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) {
    return json({ error: "Sessione scaduta o non autorizzata." }, 401, responseOrigin);
  }

  let body: { queries?: unknown; max_results?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo JSON non valido." }, 400, responseOrigin);
  }

  const queries = Array.isArray(body.queries)
    ? body.queries.map((q) => typeof q === "string" ? q.trim() : "")
      .filter((q) => q.length > 0 && q.length <= 400).slice(0, 5)
    : [];
  if (queries.length === 0) {
    return json({ error: "Inserire da 1 a 5 query valide." }, 400, responseOrigin);
  }
  const requestedMax = Number(body.max_results ?? 5);
  const maxResults = Number.isFinite(requestedMax)
    ? Math.max(1, Math.min(10, Math.floor(requestedMax)))
    : 5;

  const results = [];
  for (const query of queries) {
    const upstream = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        topic: "general",
        search_depth: "basic",
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json({
        error: status === 429
          ? "Limite temporaneo del servizio di ricerca raggiunto."
          : "Il servizio di ricerca non ha risposto correttamente.",
        provider_status: upstream.status,
      }, status, responseOrigin);
    }

    const payload = await upstream.json();
    const items = Array.isArray(payload.results) ? payload.results : [];
    results.push({
      query,
      results: items.map((item: Record<string, unknown>) => ({
        title: String(item.title ?? ""),
        url: String(item.url ?? ""),
        snippet: String(item.content ?? "").slice(0, 1200),
        score: Number(item.score ?? 0),
        published_date: item.published_date ? String(item.published_date) : null,
      })),
    });
  }

  return json({
    provider: "tavily",
    queries_completed: results.length,
    results,
    note: "Risultati di ricerca pubblici: verificare manualmente identità, fonte ed evidenza prima di creare un Lead.",
  }, 200, responseOrigin);
});
