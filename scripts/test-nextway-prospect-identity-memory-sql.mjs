import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = readFileSync('supabase/migrations/20261116100000_nextway_prospect_identity_memory.sql', 'utf8');
const normalized = sql.toLowerCase();

for (const table of ['nextway_prospect_identity_archive','nextway_search_query_cache']) {
  assert.match(normalized, new RegExp('create table if not exists public\\.' + table),
    table + ' must be created additively');
  assert.match(normalized, new RegExp('alter table public\\.' + table + ' enable row level security'),
    table + ' must have RLS enabled');
  assert.match(normalized, new RegExp('revoke all on public\\.' + table + ' from public, anon'),
    table + ' must revoke public and anonymous access');
}
assert.match(normalized, /identity_fingerprints text\[\]/,
  'identity keys must be stored as fingerprints, not raw contact identifiers');
assert.match(normalized, /array_to_string\(identity_fingerprints, ','\).*\{64\}/,
  'fingerprints must be SHA-256 hex strings');
assert.match(normalized, /public_contacts jsonb/,
  'professional public contact details must be retained');
assert.match(normalized, /jsonb_array_length\(case when jsonb_typeof\(source_evidence\) = 'array'/,
  'source evidence table constraints must not throw on malformed scalar JSON');
assert.match(normalized, /jsonb_array_length\(case when jsonb_typeof\(results\) = 'array'/,
  'query cache table constraints must not throw on malformed scalar JSON');
assert.match(normalized, /source_evidence jsonb/,
  'source evidence must be retained');
assert.match(normalized, /partner_segment in \(/,
  'the five partner segments must be represented distinctly');
assert.match(normalized, /workspace_id uuid references public\.nextway_workspaces\(id\)/,
  'identity memory must be workspace-scoped');
assert.ok(sql.includes("canonical_url ~* '^https?://(\\[[0-9a-f:.]+\\]|[a-z0-9.-]+)(:[0-9]{1,5})?([/?#]|$)'"),
  'canonical identity URLs must contain a valid domain or IP host');
assert.match(normalized, /nextway_has_workspace_access\(/,
  'workspace reads and writes must require active membership');
assert.match(normalized, /nextway_is_platform_admin\(\)/,
  'platform administrators must retain central oversight');

assert.match(normalized, /create or replace function public\.nextway_guard_prospect_memory_scope/,
  'workspace and owner identifiers must be immutable for non-admins');
assert.match(normalized, /alter function public\.nextway_store_search_query_cache\([\s\S]*owner to postgres/,
  'cache persistence must execute under the trusted database owner');
assert.match(normalized, /nextway_prospect_identity_scope_guard/,
  'identity records must have a workspace scope guard trigger');
assert.match(normalized, /nextway_search_query_cache_scope_guard/,
  'query cache records must have a workspace scope guard trigger');
assert.match(normalized, /revoke insert, update, delete on public\.nextway_prospect_identity_archive from authenticated/,
  'authenticated clients must not write identity rows directly');
assert.match(normalized, /grant select on public\.nextway_prospect_identity_archive to authenticated/,
  'authenticated members may read the shared identity archive');
assert.doesNotMatch(normalized, /create policy nextway_prospect_identity_(insert|update|delete)/,
  'all identity writes must go through the validated merge RPC');
assert.match(normalized, /expires_at <= fetched_at \+ interval '7 days'/,
  'query cache lifetime must be capped at seven days');
assert.match(normalized, /create policy nextway_search_query_cache_read/,
  'query cache must have an explicit workspace read policy');
assert.match(normalized, /current_setting\('nextway\.cache_write_rpc', true\) is distinct from 'on'/,
  'only the protected cache RPC may update the last-fetch actor');
assert.match(normalized, /perform set_config\('nextway\.cache_write_rpc', 'on', true\)/,
  'the trusted cache RPC must scope its permitted fetched_by update');
assert.match(normalized, /set_config\('request\.jwt\.claim\.sub', p_actor_id::text, true\)/,
  'the cache RPC must bind the verified actor ID to the request context');
assert.match(normalized, /set_config\(\s*'request\.jwt\.claims'/,
  'the cache RPC must update the claims JSON as well as the legacy sub setting');
assert.match(normalized, /auth\.uid\(\) is distinct from p_actor_id/,
  'the cache RPC must fail closed if Supabase does not resolve the verified actor');
assert.match(normalized, /fetched_by = excluded\.fetched_by/,
  'cache provenance must identify the latest successful fetcher');
assert.match(normalized, /revoke insert, update, delete on public\.nextway_search_query_cache from authenticated/,
  'authenticated clients must not modify central cache rows directly');
assert.match(normalized, /create or replace function public\.nextway_store_search_query_cache/,
  'query cache writes must pass through a validated server-side RPC');
assert.match(normalized, /revoke all on function public\.nextway_store_search_query_cache\([\s\S]*from public, anon, authenticated/,
  'authenticated clients must not be able to poison the shared cache');
assert.match(normalized, /grant execute on function public\.nextway_store_search_query_cache\([\s\S]*to service_role/,
  'only the trusted Edge Function role may write shared cache rows');
assert.match(normalized, /p_provider_key is distinct from 'tavily'/,
  'the cache RPC must validate the provider');
assert.match(normalized, /jsonb_array_elements\(case when jsonb_typeof\(coalesce\(p_results/,
  'the cache RPC must safely validate each result object');
assert.match(normalized, /coalesce\(jsonb_typeof\(item\.value -> 'score'\), ''\) <> 'number'/,
  'the cache RPC must reject results without a numeric relevance score');
assert.match(normalized, /v_now \+ interval '7 days'/,
  'the cache RPC must set expiry server-side');
assert.doesNotMatch(normalized, /create policy nextway_search_query_cache_(insert|update)/,
  'cache write policies must not permit client-side cache poisoning');
assert.match(normalized, /begin;[\s\S]*commit;/,
  'migration must be transactional');
assert.doesNotMatch(normalized, /insert into public\.nextway_prospect_identity_archive/,
  'migration must not seed or import prospect identities');
assert.match(normalized, /insert into public\.nextway_search_query_cache[\s\S]*on conflict/,
  'the only cache insert must be inside the validated upsert RPC, not a migration seed');
assert.doesNotMatch(normalized, /drop table|truncate table|delete from public\./,
  'migration must not delete operational data');

console.log('NEXTWAY central prospect identity memory SQL: contract checks passed.');
