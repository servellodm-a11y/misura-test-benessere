import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const allowedOrigins = (Deno.env.get("NEXTWAY_ALLOWED_ORIGINS") ??
  "https://misura-test-benessere.netlify.app").split(",").map((v) => v.trim()).filter(Boolean);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modulePattern = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const allowedSourceTypes = new Set([
  "official_document", "scientific_publication", "training_material", "faq", "policy", "other",
]);
const MAX_BODY_BYTES = 4_000_000;
const MAX_CONTENT_CHARS = 500_000;
const CHUNK_SIZE = 9_000;
const CHUNK_OVERLAP = 500;

function respond(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(origin && allowedOrigins.includes(origin)
        ? { "Access-Control-Allow-Origin": origin }
        : {}),
    },
  });
}

function chunkText(input: string) {
  const text = input.replace(/\r\n?/g, "\n").replace(/[\t ]+\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n\n", end);
      const sentence = text.lastIndexOf(". ", end);
      const candidate = Math.max(boundary, sentence);
      if (candidate > start + Math.floor(CHUNK_SIZE * 0.6)) end = candidate + 1;
    }
    const part = text.slice(start, end).trim();
    if (part) chunks.push(part);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return respond({}, 200, origin);
  if (req.method !== "POST") return respond({ error: "Metodo non consentito" }, 405, origin);
  if (origin && !allowedOrigins.includes(origin)) {
    return respond({ error: "Origine non autorizzata" }, 403, origin);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) {
    return respond({ error: "Autenticazione richiesta" }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("NEXTWAY_SERVICE_ROLE_KEY");
  let publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  if (publicKey.trim()) {
    try {
      const parsed = JSON.parse(publicKey);
      publicKey = typeof parsed === "string"
        ? parsed
        : (parsed.default ?? parsed[Object.keys(parsed)[0]] ?? "");
    } catch {
      publicKey = publicKey.trim();
    }
  }
  publicKey = publicKey || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceKey || !publicKey) {
    return respond({ error: "Servizio di ingestione non configurato" }, 503, origin);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return respond({ error: "Richiesta troppo grande" }, 413, origin);
  let raw = "";
  try {
    raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return respond({ error: "Richiesta troppo grande" }, 413, origin);
    }
  } catch {
    return respond({ error: "Corpo della richiesta non leggibile" }, 400, origin);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON");
    body = parsed as Record<string, unknown>;
  } catch {
    return respond({ error: "JSON non valido" }, 400, origin);
  }

  const moduleKey = body.module_key;
  const title = body.title;
  const sourceType = body.source_type;
  const languageCode = body.language_code ?? "it";
  const content = body.content;
  if (typeof moduleKey !== "string" || !modulePattern.test(moduleKey)) {
    return respond({ error: "module_key non valido" }, 400, origin);
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 240) {
    return respond({ error: "Titolo non valido" }, 400, origin);
  }
  if (typeof sourceType !== "string" || !allowedSourceTypes.has(sourceType)) {
    return respond({ error: "source_type non valido" }, 400, origin);
  }
  if (languageCode !== "it") {
    return respond({ error: "La prima versione della Knowledge Base supporta documenti in italiano (it)" }, 400, origin);
  }
  if (typeof content !== "string" || !content.trim() || content.length > MAX_CONTENT_CHARS) {
    return respond({ error: "Contenuto vuoto o oltre il limite di 500.000 caratteri" }, 400, origin);
  }
  const sourceReference = typeof body.source_reference === "string"
    ? body.source_reference.trim().slice(0, 1000) || null : null;
  const versionLabel = typeof body.version_label === "string"
    ? body.version_label.trim().slice(0, 80) || null : null;
  const validFrom = typeof body.valid_from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.valid_from)
    ? body.valid_from : null;
  const validUntil = typeof body.valid_until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.valid_until)
    ? body.valid_until : null;
  if (body.valid_from != null && !validFrom) return respond({ error: "valid_from non valida" }, 400, origin);
  if (body.valid_until != null && !validUntil) return respond({ error: "valid_until non valida" }, 400, origin);
  if (validFrom && validUntil && validUntil < validFrom) {
    return respond({ error: "Intervallo di validita non valido" }, 400, origin);
  }

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
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "platform_admin") {
      return respond({ error: "Operazione riservata a platform_admin" }, 403, origin);
    }

    const normalizedContent = content.replace(/\r\n?/g, "\n").trim();
    const hash = await sha256(normalizedContent);
    const { data: existing, error: existingError } = await admin
      .from("nextway_knowledge_documents")
      .select("id, title, approval_status")
      .eq("module_key", moduleKey)
      .eq("content_sha256", hash)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return respond({
        success: true, duplicate: true, document_id: existing.id,
        title: existing.title, approval_status: existing.approval_status,
        message: "Contenuto gia registrato: nessun duplicato creato",
      }, 200, origin);
    }

    const parts = chunkText(normalizedContent);
    if (!parts.length) return respond({ error: "Nessun testo indicizzabile" }, 400, origin);
    const { data: document, error: insertError } = await admin
      .from("nextway_knowledge_documents")
      .insert({
        module_key: moduleKey, title: title.trim(), source_type: sourceType,
        source_reference: sourceReference, language_code: languageCode,
        version_label: versionLabel, valid_from: validFrom, valid_until: validUntil,
        approval_status: "pending", content_sha256: hash, uploaded_by: authData.user.id,
      })
      .select("id")
      .single();
    if (insertError?.code === "23505") {
      const { data: raced, error: raceReadError } = await admin
        .from("nextway_knowledge_documents")
        .select("id, title, approval_status")
        .eq("module_key", moduleKey)
        .eq("content_sha256", hash)
        .maybeSingle();
      if (raceReadError) throw raceReadError;
      if (raced) {
        return respond({
          success: true, duplicate: true, document_id: raced.id,
          title: raced.title, approval_status: raced.approval_status,
          message: "Contenuto gia registrato: nessun duplicato creato",
        }, 200, origin);
      }
    }
    if (insertError || !document) throw insertError ?? new Error("Documento non creato");

    const chunkRows = parts.map((part, index) => ({
      document_id: document.id,
      chunk_index: index,
      content: part,
      token_estimate: Math.ceil(part.length / 4),
    }));
    const { error: chunksError } = await admin.from("nextway_knowledge_chunks").insert(chunkRows);
    if (chunksError) {
      const { error: cleanupError } = await admin
        .from("nextway_knowledge_documents").delete().eq("id", document.id);
      if (cleanupError) console.error("Knowledge ingest cleanup failed", cleanupError.code ?? "unknown");
      throw new Error("Indicizzazione non completata; documento non pubblicato");
    }

    return respond({
      success: true, duplicate: false, document_id: document.id,
      approval_status: "pending", chunk_count: parts.length,
      content_sha256: hash,
      message: "Documento acquisito e indicizzato. Richiede approvazione amministrativa.",
    }, 201, origin);
  } catch (error) {
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error("NEXTWAY knowledge ingestion failed", {
      code: typeof details.code === "string" ? details.code.slice(0, 32) : undefined,
    });
    return respond({ error: "Ingestione non completata" }, 500, origin);
  }
});
