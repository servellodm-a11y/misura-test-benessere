-- NEXTWAY central prospect identity memory and workspace query cache.
-- Candidate only: prepare and review; do NOT apply automatically.
-- No existing rows are backfilled, changed, or deleted by this migration.

begin;

do $$
begin
  if to_regclass('public.nextway_workspaces') is null
     or to_regclass('public.nextway_workspace_memberships') is null
     or to_regclass('public.nextway_leads') is null then
    raise exception 'NEXTWAY workspace, membership, or Lead foundation is missing.';
  end if;
  if to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') is null
     or to_regprocedure('public.nextway_can_manage_workspace(uuid)') is null
     or to_regprocedure('public.nextway_is_platform_admin()') is null then
    raise exception 'NEXTWAY workspace authorization helpers are missing.';
  end if;
end;
$$;

create table if not exists public.nextway_prospect_identity_archive (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.nextway_workspaces(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  identity_fingerprints text[] not null default '{}',
  canonical_url text,
  display_name text not null check (length(btrim(display_name)) between 1 and 240),
  company_name text,
  profile_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(profile_data) = 'object' and pg_column_size(profile_data) <= 16384),
  public_contacts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_contacts) = 'object' and pg_column_size(public_contacts) <= 8192),
  source_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_evidence) = 'array' and jsonb_array_length(source_evidence) <= 12
      and pg_column_size(source_evidence) <= 24576),
  target_type text not null default 'unknown'
    check (target_type in ('potential_customer','potential_partner','unknown')),
  partner_segment text
    check (partner_segment is null or partner_segment in (
      'wellness_professional','wellness_networker','other_networker','entrepreneur','extra_income'
    )),
  archive_status text not null default 'seen'
    check (archive_status in ('seen','reviewed','acquired','ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1 check (seen_count > 0),
  last_acquired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nextway_identity_fingerprints_limit
    check (
      cardinality(identity_fingerprints) <= 20
      and (
        cardinality(identity_fingerprints) = 0
        or array_to_string(identity_fingerprints, ',') ~ '^[a-f0-9]{64}(,[a-f0-9]{64})*$'
      )
    ),
  constraint nextway_identity_canonical_url_check
    check (canonical_url is null or canonical_url ~* '^https?://')
);

create index if not exists nextway_prospect_identity_workspace_seen_idx
  on public.nextway_prospect_identity_archive(workspace_id, last_seen_at desc)
  where workspace_id is not null;
create index if not exists nextway_prospect_identity_owner_seen_idx
  on public.nextway_prospect_identity_archive(owner_user_id, last_seen_at desc);
create index if not exists nextway_prospect_identity_fingerprints_gin_idx
  on public.nextway_prospect_identity_archive using gin(identity_fingerprints);
create index if not exists nextway_prospect_identity_contacts_gin_idx
  on public.nextway_prospect_identity_archive using gin(public_contacts);
create index if not exists nextway_prospect_identity_status_idx
  on public.nextway_prospect_identity_archive(workspace_id, archive_status, last_seen_at desc);
create unique index if not exists nextway_prospect_identity_workspace_url_uidx
  on public.nextway_prospect_identity_archive(workspace_id, canonical_url)
  where workspace_id is not null and canonical_url is not null;
create unique index if not exists nextway_prospect_identity_personal_url_uidx
  on public.nextway_prospect_identity_archive(owner_user_id, canonical_url)
  where workspace_id is null and canonical_url is not null;

alter table public.nextway_prospect_identity_archive enable row level security;
revoke all on public.nextway_prospect_identity_archive from public, anon;
grant select, insert, update, delete on public.nextway_prospect_identity_archive to authenticated;
grant all on public.nextway_prospect_identity_archive to service_role;

drop policy if exists nextway_prospect_identity_read on public.nextway_prospect_identity_archive;
create policy nextway_prospect_identity_read
  on public.nextway_prospect_identity_archive
  for select to authenticated
  using (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and public.nextway_has_workspace_access(
        workspace_id,
        array['workspace_owner','workspace_admin','workspace_manager','workspace_member','workspace_viewer']::text[]
      )
    )
  );

drop policy if exists nextway_prospect_identity_insert on public.nextway_prospect_identity_archive;
create policy nextway_prospect_identity_insert
  on public.nextway_prospect_identity_archive
  for insert to authenticated
  with check (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and owner_user_id = auth.uid()
      and public.nextway_has_workspace_access(
        workspace_id,
        array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
      )
    )
  );

drop policy if exists nextway_prospect_identity_update on public.nextway_prospect_identity_archive;
create policy nextway_prospect_identity_update
  on public.nextway_prospect_identity_archive
  for update to authenticated
  using (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and (
        owner_user_id = auth.uid()
        or public.nextway_can_manage_workspace(workspace_id)
      )
      and public.nextway_has_workspace_access(
        workspace_id,
        array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
      )
    )
  )
  with check (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and public.nextway_has_workspace_access(
        workspace_id,
        array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
      )
      and (
        owner_user_id = auth.uid()
        or public.nextway_can_manage_workspace(workspace_id)
      )
    )
  );

drop policy if exists nextway_prospect_identity_delete on public.nextway_prospect_identity_archive;
create policy nextway_prospect_identity_delete
  on public.nextway_prospect_identity_archive
  for delete to authenticated
  using (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and (
        owner_user_id = auth.uid()
        or public.nextway_can_manage_workspace(workspace_id)
      )
      and public.nextway_has_workspace_access(
        workspace_id,
        array['workspace_owner','workspace_admin','workspace_manager']::text[]
      )
    )
  );

comment on table public.nextway_prospect_identity_archive is
  'NEXTWAY central prospect identity memory. Workspace-scoped; stores only public/professional prospect evidence. No automatic CRM promotion.';
comment on column public.nextway_prospect_identity_archive.identity_fingerprints is
  'Up to 20 lowercase SHA-256 hex fingerprints of normalized identity keys. Do not store raw email/phone identifiers here.';
comment on column public.nextway_prospect_identity_archive.public_contacts is
  'Publicly disclosed professional contact details only; JSON object, maximum 8 KB.';
comment on column public.nextway_prospect_identity_archive.source_evidence is
  'Capped source URL/title/snippet/evidence records; JSON array, maximum 12 entries and 24 KB.';

-- Workspace-scoped cache for successful external search results. Cache reads
-- are available to active workspace members; writes exclude read-only viewers.
create table if not exists public.nextway_search_query_cache (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.nextway_workspaces(id) on delete restrict,
  query_fingerprint text not null check (query_fingerprint ~ '^[a-f0-9]{64}$'),
  query_text text not null check (length(btrim(query_text)) between 1 and 400),
  segment_key text not null check (length(btrim(segment_key)) between 1 and 80),
  market_key text not null default '' check (length(market_key) <= 120),
  provider_key text not null default 'tavily' check (provider_key in ('tavily')),
  results jsonb not null default '[]'::jsonb
    check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 10
      and pg_column_size(results) <= 98304),
  fetched_by uuid not null references auth.users(id) on delete restrict,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nextway_search_cache_expiry_window
    check (expires_at > fetched_at and expires_at <= fetched_at + interval '7 days')
);

create unique index if not exists nextway_search_query_cache_scope_uidx
  on public.nextway_search_query_cache(workspace_id, query_fingerprint, segment_key, market_key, provider_key);
create index if not exists nextway_search_query_cache_expiry_idx
  on public.nextway_search_query_cache(workspace_id, expires_at);
alter table public.nextway_search_query_cache enable row level security;
revoke all on public.nextway_search_query_cache from public, anon;
grant select, insert, update on public.nextway_search_query_cache to authenticated;
grant all on public.nextway_search_query_cache to service_role;

drop policy if exists nextway_search_query_cache_read on public.nextway_search_query_cache;
create policy nextway_search_query_cache_read
  on public.nextway_search_query_cache
  for select to authenticated
  using (
    public.nextway_has_workspace_access(
      workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member','workspace_viewer']::text[]
    )
  );

drop policy if exists nextway_search_query_cache_insert on public.nextway_search_query_cache;
create policy nextway_search_query_cache_insert
  on public.nextway_search_query_cache
  for insert to authenticated
  with check (
    fetched_by = auth.uid()
    and public.nextway_has_workspace_access(
      workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    )
  );

drop policy if exists nextway_search_query_cache_update on public.nextway_search_query_cache;
create policy nextway_search_query_cache_update
  on public.nextway_search_query_cache
  for update to authenticated
  using (
    public.nextway_has_workspace_access(
      workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    )
  )
  with check (
    public.nextway_has_workspace_access(
      workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    )
  );

comment on table public.nextway_search_query_cache is
  'NEXTWAY workspace-scoped cache of successful public search responses. Maximum TTL is seven days; only explicit query execution may populate it.';

commit;
