import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import * as pdfjs from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import mammoth from "npm:mammoth@1.9.0";

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
const BUCKET = "nextway-knowledge";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 500_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(["application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"]);

function respond(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders, "Content-Type": "application/json",
      ...(origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    },
  });
}

function safeFilename(value: string) {
  const base = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(-100);
  return base || "document";
}

async function extractPdf(bytes: Uint8Array) {
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 250) throw new Error("PDF oltre il limite di 250 pagine");
    const pages: string[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const line = content.items
        .map((item: any) => typeof item.str === "string" ? item.str : "")
        .filter(Boolean).join(" ");
      pages.push(line);
      total += line.length;
      if (total > MAX_EXTRACTED_CHARS) {
        throw new Error("Testo estratto oltre il limite consentito");
      }
    }
    return pages.join("\n\n").trim();
  } finally {
    await pdf.destroy();
  }
}

async function extractText(bytes: Uint8Array, extension: string) {
  if (extension === ".pdf") {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("Firma PDF non valida");
    }
    return await extractPdf(bytes);
  }
  if (extension === ".docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error("Archivio DOCX non valido");
    }
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return String(result.value ?? "").trim();
  }
  if (extension === ".txt") {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  }
  throw new Error("Formato non supportato");
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
  if (!token || token === authorization) return respond({ error: "Autenticazione richiesta" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("NEXTWAY_SERVICE_ROLE_KEY");
  let publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  if (publicKey.trim()) {
    try {
      const parsed = JSON.parse(publicKey);
      publicKey = typeof parsed === "string" ? parsed :
        (parsed.default ?? parsed[Object.keys(parsed)[0]] ?? "");
    } catch {
      publicKey = publicKey.trim();
    }
  }
  publicKey = publicKey || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceKey || !publicKey) {
    return respond({ error: "Servizio di caricamento non configurato" }, 503, origin);
  }

  const caller = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let uploadedPath: string | null = null;
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FILE_BYTES + 256_000) {
      return respond({ error: "Richiesta oltre il limite consentito" }, 413, origin);
    }
    const { data: authData, error: authError } = await caller.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Sessione non valida" }, 401, origin);
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "platform_admin") {
      return respond({ error: "Operazione riservata a platform_admin" }, 403, origin);
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return respond({ error: "File mancante" }, 400, origin);
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      return respond({ error: "Il file deve avere dimensione compresa tra 1 byte e 12 MB" }, 413, origin);
    }

    const originalName = file.name || "document";
    const extension = originalName.toLowerCase().slice(originalName.lastIndexOf("."));
    const expectedMime = extension === ".pdf" ? "application/pdf" :
      extension === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
      extension === ".txt" ? "text/plain" : "";
    if (!expectedMime || !ALLOWED_TYPES.has(expectedMime)) {
      return respond({ error: "Sono ammessi esclusivamente PDF, DOCX e TXT" }, 415, origin);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractText(bytes, extension);
    if (!extracted || extracted.length < 20) {
      return respond({ error: "Non è stato possibile estrarre testo sufficiente. I PDF scansiti richiedono OCR, non ancora disponibile." }, 422, origin);
    }
    if (extracted.length > MAX_EXTRACTED_CHARS) {
      return respond({ error: "Testo estratto oltre il limite di 500.000 caratteri" }, 413, origin);
    }

    const workspaceId = String(form.get("workspace_id") ?? "").trim();
    if (!uuidPattern.test(workspaceId)) {
      return respond({ error: "workspace_id obbligatorio e non valido" }, 400, origin);
    }
    const moduleKey = String(form.get("module_key") ?? "general").trim();
    const title = String(form.get("title") ?? originalName).trim();
    const sourceType = String(form.get("source_type") ?? "official_document").trim();
    const languageCode = String(form.get("language_code") ?? "it").trim();
    const versionLabel = String(form.get("version_label") ?? "").trim();
    const validFrom = String(form.get("valid_from") ?? "").trim();
    const validUntil = String(form.get("valid_until") ?? "").trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(moduleKey)) {
      return respond({ error: "module_key non valido" }, 400, origin);
    }
    if (!title || title.length > 240 || languageCode !== "it") {
      return respond({ error: "Titolo o lingua non validi: la V1 supporta italiano" }, 400, origin);
    }

    const objectName = `source-files/${workspaceId}/${moduleKey}/${crypto.randomUUID()}-${safeFilename(originalName)}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectName, bytes, {
      contentType: expectedMime, upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedPath = objectName;

    const ingestResponse = await fetch(`${supabaseUrl}/functions/v1/nextway-knowledge-ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        module_key: moduleKey,
        title,
        source_type: sourceType,
        language_code: languageCode,
        source_reference: originalName,
        version_label: versionLabel || null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        content: extracted,
      }),
    });
    const ingestResult = await ingestResponse.json();
    if (!ingestResponse.ok || !ingestResult.success) {
      await admin.storage.from(BUCKET).remove([objectName]);
      uploadedPath = null;
      return respond({ error: ingestResult.error ?? "Indicizzazione non completata" }, ingestResponse.status || 500, origin);
    }
    if (ingestResult.duplicate) {
      await admin.storage.from(BUCKET).remove([objectName]);
      uploadedPath = null;
      return respond(ingestResult, 200, origin);
    }

    const { error: linkError } = await admin
      .from("nextway_knowledge_documents")
      .update({ storage_path: objectName })
      .eq("id", ingestResult.document_id);
    if (linkError) {
      await admin.from("nextway_knowledge_documents").delete().eq("id", ingestResult.document_id);
      await admin.storage.from(BUCKET).remove([objectName]);
      uploadedPath = null;
      throw linkError;
    }

    uploadedPath = null;
    return respond({
      ...ingestResult,
      original_filename: originalName,
      storage_bucket: BUCKET,
      extraction: extension.slice(1),
      ocr_required: false,
    }, 201, origin);
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await admin.storage.from(BUCKET).remove([uploadedPath]);
      if (cleanupError) console.error("Knowledge source cleanup failed", cleanupError.name);
    }
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error("NEXTWAY knowledge upload failed", {
      code: typeof details.code === "string" ? details.code.slice(0, 32) : undefined,
      name: typeof details.name === "string" ? details.name.slice(0, 64) : undefined,
    });
    return respond({ error: "Caricamento o estrazione non completati" }, 500, origin);
  }
});
