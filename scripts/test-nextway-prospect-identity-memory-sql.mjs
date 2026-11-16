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
assert.match(normalized, /source_evidence jsonb/,
  'source evidence must be retained');
assert.match(normalized, /partner_segment in \(/,
  'the five partner segments must be represented distinctly');
assert.match(normalized, /workspace_id uuid references public\.nextway_workspaces\(id\)/,
  'identity memory must be workspace-scoped');
assert.match(normalized, /nextway_has_workspace_access\(/,
  'workspace reads and writes must require active membership');
assert.match(normalized, /nextway_is_platform_admin\(\)/,
  'platform administrators must retain central oversight');
assert.match(normalized, /workspace_id, owner_user_id, identity_fingerprints/,
  'the merge RPC must set the owning user on newly created identity records');
assert.match(normalized, /p_workspace_id, v_user_id, coalesce\(p_identity_fingerprints/,
  'new central identity rows must be owned by the authenticated caller');
assert.match(normalized, /create or replace function public\.nextway_guard_prospect_memory_scope/,
  'workspace and owner identifiers must be immutable for non-admins');
assert.match(normalized, /nextway_prospect_identity_scope_guard/,
  'identity records must have a workspace scope guard trigger');
assert.match(normalized, /nextway_search_query_cache_scope_guard/,
  'query cache records must have a workspace scope guard trigger');
assert.match(normalized, /create policy nextway_prospect_identity_read/,
  'identity archive must have an explicit read policy');
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
assert.match(normalized, /create policy nextway_search_query_cache_insert/,
  'query cache writes must be restricted to active non-viewer members');
assert.match(normalized, /create policy nextway_search_query_cache_update/,
  'query cache updates must be restricted to active non-viewer members');
assert.match(normalized, /begin;[\s\S]*commit;/,
  'migration must be transactional');
const ddlOnly = normalized.replace(/as \$\$[\s\S]*?\$\$;/g, '');
assert.doesNotMatch(ddlOnly, /insert into public\.(nextway_prospect_identity_archive|nextway_search_query_cache)/,
  'migration must not seed or import prospect data outside its callable RPCs');
assert.doesNotMatch(normalized, /drop table|truncate table|delete from public\./,
  'migration must not delete operational data');


assert.match(normalized, /as \$\$[\s\S]*?end;\s*\$\$;/,
  'PL/pgSQL trigger/function bodies must use valid dollar quoting');
assert.doesNotMatch(normalized, /as \$(?!\$)/,
  'single-dollar function delimiters are invalid');
assert.match(normalized, /nextway_list_accessible_workspaces/,
  'the authenticated UI must be able to list only accessible active workspaces');
assert.match(normalized, /m\.workspace_role = any\(array\[[\s\S]*?'workspace_member'[\s\S]*?\]\)/,
  'read-only workspace viewers must not be offered as prospect-search workspaces');
assert.match(normalized, /nextway_merge_prospect_identity/,
  'central identity writes must use the transactional merge RPC');
assert.equal((normalized.match(/create or replace function public\.nextway_merge_prospect_identity/g) || []).length, 1,
  'the migration must define exactly one central identity merge RPC');
assert.ok(normalized.includes("and array_to_string(p_identity_fingerprints, ',') !~ '^[a-f0-9]{64}(,[a-f0-9]{64})*$')"),
  'the merge RPC must validate complete SHA-256 fingerprints with correctly closed SQL string quoting');
assert.match(normalized, /pg_advisory_xact_lock/,
  'concurrent identity merges must serialize on stable identity material');
assert.match(normalized, /grant execute on function public\.nextway_merge_prospect_identity[\s\S]*?to authenticated/,
  'identity merge RPC must be callable by authenticated members');
assert.match(normalized, /create policy nextway_search_query_cache_update[\s\S]*?nextway_has_workspace_access/,
  'active workspace members must be able to refresh expired shared cache rows');

console.log('NEXTWAY central prospect identity memory SQL: contract checks passed.');
assert.match(normalized, /commit;\s*$/,
  'the transaction commit must be the final SQL statement with no orphaned code after it');

assert.match(normalized, /pg_advisory_xact_lock/,
  'concurrent identity merges must serialize on stable identity material');
assert.match(normalized, /grant execute on function public\.nextway_merge_prospect_identity[\s\S]*?to authenticated/,
  'identity merge RPC must be callable by authenticated members');
assert.match(normalized, /create policy nextway_search_query_cache_update[\s\S]*?nextway_has_workspace_access/,
  'active workspace members must be able to refresh expired shared cache rows');

console.log('NEXTWAY central prospect identity memory SQL: contract checks passed.');
