import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  new URL("../supabase/migrations/20261111170000_nextway_knowledge_base.sql", import.meta.url),
  "utf8",
);

assert.match(sql, /create table if not exists public\.nextway_knowledge_documents/i);
assert.match(sql, /create table if not exists public\.nextway_knowledge_chunks/i);
assert.match(sql, /approval_status text not null default 'pending'/i);
assert.match(sql, /approved_at is not null and approved_by is not null/i);
assert.match(sql, /valid_until is null or valid_until >= valid_from/i);
assert.match(sql, /content_sha256[\s\S]*?\^\[a-f0-9\]\{64\}\$/i);
assert.match(sql, /search_vector tsvector generated always as \(to_tsvector\('italian'::regconfig, content\)\) stored/i);
assert.match(sql, /using gin\(search_vector\)/i);
assert.match(sql, /alter table public\.nextway_knowledge_documents enable row level security/i);
assert.match(sql, /alter table public\.nextway_knowledge_chunks enable row level security/i);
assert.match(sql, /revoke all on public\.nextway_knowledge_documents from public, anon/i);
assert.match(sql, /revoke all on public\.nextway_knowledge_chunks from public, anon/i);
assert.match(sql, /create policy nextway_knowledge_documents_admin_all[\s\S]*?public\.nextway_is_platform_admin\(\)/i);
assert.match(sql, /create policy nextway_knowledge_documents_approved_read[\s\S]*?approval_status = 'approved'/i);
assert.match(sql, /create policy nextway_knowledge_chunks_approved_read[\s\S]*?d\.approval_status = 'approved'/i);
assert.match(sql, /create or replace function public\.nextway_search_knowledge\(/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /auth\.uid\(\) is not null/i);
assert.match(sql, /d\.module_key = p_module_key/i);
assert.match(sql, /d\.language_code = p_language_code/i);
assert.match(sql, /websearch_to_tsquery\('italian'::regconfig, p_query\)/i);
assert.match(sql, /limit greatest\(1, least\(coalesce\(p_limit, 5\), 10\)\)/i);
assert.match(sql, /revoke all on function public\.nextway_search_knowledge\(text, text, text, integer\)[\s\S]*?from public, anon/i);
assert.match(sql, /grant execute on function public\.nextway_search_knowledge\(text, text, text, integer\)[\s\S]*?to authenticated, service_role/i);
assert.match(sql, /begin;[\s\S]*commit;/i);
assert.doesNotMatch(sql, /create extension|pg_cron|service_role_key/i);

console.log("NEXTWAY Knowledge Base SQL: document lifecycle, approved-only retrieval, RLS, Italian full-text search and bounded result count: PASS");
