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
assert.match(normalized, /owner_user_id = auth\.uid\(\)/,
  'ordinary members may create their own identity records');
assert.match(normalized, /create policy nextway_prospect_identity_read/,
  'identity archive must have an explicit read policy');
assert.match(normalized, /create policy nextway_prospect_identity_insert/,
  'identity archive must have an explicit insert policy');
assert.match(normalized, /create policy nextway_prospect_identity_update/,
  'identity archive must have an explicit update policy');
assert.match(normalized, /create policy nextway_prospect_identity_delete/,
  'identity archive must have an explicit delete policy');
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
assert.doesNotMatch(normalized, /insert into public\.(nextway_prospect_identity_archive|nextway_search_query_cache)/,
  'migration must not seed or import prospect data');
assert.doesNotMatch(normalized, /drop table|truncate table|delete from public\./,
  'migration must not delete operational data');

console.log('NEXTWAY central prospect identity memory SQL: 22 checks passed.');
