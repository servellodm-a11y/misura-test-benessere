import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const setter = read("../supabase/functions/nextway-ai-setter/index.ts");
const search = read("../supabase/functions/nextway-search/index.ts");

function ordered(source, labels) {
  let previous = -1;
  for (const [label, token] of labels) {
    const position = source.indexOf(token);
    assert.ok(position >= 0, `Missing ${label}`);
    assert.ok(position > previous, `${label} is out of the required security order`);
    previous = position;
  }
}

// AI Setter: origin, method, bearer authentication and JWT validation precede data access.
assert.match(setter, /NEXTWAY_ALLOWED_ORIGINS/);
assert.match(setter, /allowedOrigins\.includes\(origin\)/);
assert.doesNotMatch(setter, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/i);
assert.match(setter, /req\.method !== "POST"/);
assert.match(setter, /authorization\?\.startsWith\("Bearer "\)/);
ordered(setter, [
  ["Bearer token extraction", 'req.headers.get("Authorization")'],
  ["JWT verification", "supabase.auth.getUser(token)"],
  ["request body parsing", "JSON.parse(rawBody)"],
  ["rate limit", '"nextway_consume_api_rate_limit"'],
  ["conversation RLS lookup", '.from("nextway_setter_conversations")'],
  ["Lead RLS lookup", '.from("nextway_leads")'],
  ["idempotency claim", '"nextway_begin_setter_generation"'],
  ["OpenAI request", "https://api.openai.com/v1/responses"],
  ["output staging", '"nextway_store_setter_generation_output"'],
  ["atomic completion", '"nextway_complete_setter_generation"'],
]);
assert.match(setter, /content-length/);
assert.match(setter, /totalBytes > 16_384/);
assert.match(setter, /uuidPattern\.test\(conversationId\)/);
assert.match(setter, /uuidPattern\.test\(requestId\)/);
assert.match(setter, /goals\.includes\(goal\)/);
assert.match(setter, /p_scope: "ai_setter", p_units: 1/);
assert.match(setter, /if \(!rateLimit\.allowed\)/);
assert.match(setter, /return respond\([\s\S]*?\}, 503, responseOrigin\)/);
assert.match(setter, /conversation\.status === "closed" \|\| conversation\.status === "archived"/);
assert.match(setter, /claim\.completed && claim\.cached_response/);
assert.match(setter, /if \(!claim\.claimed\)/);
assert.match(setter, /AbortSignal\.timeout\(60000\)/);
assert.match(setter, /max_output_tokens: 1200/);
assert.match(setter, /type: "json_schema"/);
assert.match(setter, /strict: true/);
assert.match(setter, /signal: AbortSignal\.timeout/);
assert.match(setter, /function sanitizeModelText/);
assert.match(setter, /\[email rimosso\]/);
assert.match(setter, /\[collegamento rimosso\]/);
assert.match(setter, /\[numero rimosso\]/);
assert.match(setter, /if \(stagedOutput\)/);
assert.match(setter, /if \(completeError\)/);
assert.match(setter, /return respond\(completedResponse, 200, responseOrigin\)/);
assert.match(setter, /error: "Operazione non completata"/);
assert.doesNotMatch(setter, /Deno\.env\.get\(["'](?:SUPABASE_SERVICE_ROLE_KEY|NEXTWAY_SERVICE_ROLE_KEY)["']\)/);
assert.doesNotMatch(setter, /fetch\(["']https?:\/\/[^"']*(?:whatsapp|twilio|sendgrid)[^"']*["']/i);
assert.match(setter, /Non inviarla: deve rimanere una bozza/);

const setterContext = setter.match(/const context = \{([\s\S]*?)\n    \};/);
assert.ok(setterContext, "AI Setter provider context allowlist missing");
assert.doesNotMatch(setterContext[1], /\bnotes\b/);
assert.match(setterContext[1], /history:/);
console.log("AI Setter Edge Function: auth, origin, input bounds, RLS order, rate limit, idempotency, minimization and draft-only contract: PASS");

// Public search: same authenticated boundary, bounded input and per-query quota.
assert.match(search, /NEXTWAY_ALLOWED_ORIGINS/);
assert.match(search, /allowedOrigins\.includes\(origin\)/);
assert.doesNotMatch(search, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/i);
assert.match(search, /req\.method !== "POST"/);
assert.match(search, /Authorization/);
assert.match(search, /auth\.getUser\(token\)/);
assert.match(search, /totalBytes > 16_384/);
assert.match(search, /body\.queries\.length < 1 \|\| body\.queries\.length > 5/);
assert.match(search, /q\.length === 0 \|\| q\.length > 400/);
assert.match(search, /p_scope: "public_search", p_units: queries\.length/);
assert.match(search, /if \(!rateLimit\.allowed\)/);
assert.match(search, /AbortSignal\.timeout\(20000\)/);
assert.match(search, /api\.tavily\.com\/search/);
assert.match(search, /provider_rate_limited/);
assert.match(search, /invalid_provider_json/);
assert.match(search, /queries_requested/);
assert.match(search, /queries_completed/);
assert.match(search, /queries_failed/);
assert.match(search, /partial/);
assert.doesNotMatch(search, /Deno\.env\.get\(["'](?:SUPABASE_SERVICE_ROLE_KEY|NEXTWAY_SERVICE_ROLE_KEY)["']\)/);
console.log("NEXTWAY Search Edge Function: authenticated boundary, query limits, distributed quota and provider resilience contract: PASS");
