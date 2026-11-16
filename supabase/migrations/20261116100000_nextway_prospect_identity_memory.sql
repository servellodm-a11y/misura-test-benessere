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

-- Workspace and owner scope are immutable for ordinary members. This prevents
-- moving identity/contact data between tenants by editing workspace_id directly.
create or replace function public.nextway_guard_prospect_memory_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if public.nextway_is_platform_admin() then
    return new;
  end if;

  if to_jsonb(new) -> 'workspace_id' is distinct from to_jsonb(old) -> 'workspace_id' then
    raise exception 'Solo platform_admin può trasferire dati della memoria tra workspace.'
      using errcode = '42501';
  end if;

  if tg_table_name = 'nextway_prospect_identity_archive'
     and to_jsonb(new) -> 'owner_user_id' is distinct from to_jsonb(old) -> 'owner_user_id' then
    raise exception 'Il proprietario della memoria identità non può essere modificato.'
      using errcode = '42501';
  end if;

  if tg_table_name = 'nextway_search_query_cache'
     and (
       to_jsonb(new) -> 'fetched_by' is distinct from to_jsonb(old) -> 'fetched_by'
       or to_jsonb(new) -> 'query_fingerprint' is distinct from to_jsonb(old) -> 'query_fingerprint'
     ) then
    raise exception 'Identità e autore della query cache non possono essere modificati.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.nextway_guard_prospect_memory_scope() from public, anon, authenticated;

drop trigger if exists nextway_prospect_identity_scope_guard on public.nextway_prospect_identity_archive;
create trigger nextway_prospect_identity_scope_guard
  before update on public.nextway_prospect_identity_archive
  for each row execute function public.nextway_guard_prospect_memory_scope();

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
drop trigger if exists nextway_search_query_cache_scope_guard on public.nextway_search_query_cache;
create trigger nextway_search_query_cache_scope_guard
  before update on public.nextway_search_query_cache
  for each row execute function public.nextway_guard_prospect_memory_scope();

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
  using (public.nextway_has_workspace_access(
    workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ))
  with check (public.nextway_has_workspace_access(
    workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ));

comment on table public.nextway_search_query_cache is
  'NEXTWAY workspace-scoped cache of successful public search responses. Maximum TTL is seven days; only explicit query execution may populate it.';


create or replace function public.nextway_list_accessible_workspaces()
returns table (workspace_id uuid, workspace_name text, workspace_role text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select w.id, w.name,
    case when public.nextway_is_platform_admin() then 'platform_admin' else m.workspace_role end
  from public.nextway_workspaces w
  left join public.nextway_workspace_memberships m
    on m.workspace_id = w.id and m.user_id = auth.uid() and m.membership_status = 'active'
  where auth.uid() is not null and w.status = 'active'
    and (
      public.nextway_is_platform_admin()
      or (
        m.id is not null
        and m.workspace_role = any(array[
          'workspace_owner','workspace_admin','workspace_manager','workspace_member'
        ]::text[])
      )
    )
  order by w.name, w.id;
$$;

revoke all on function public.nextway_list_accessible_workspaces() from public, anon;
grant execute on function public.nextway_list_accessible_workspaces() to authenticated;

create or replace function public.nextway_merge_prospect_identity(
  p_workspace_id uuid, p_identity_fingerprints text[], p_canonical_url text,
  p_display_name text, p_company_name text, p_profile_data jsonb,
  p_public_contacts jsonb, p_source_evidence jsonb, p_target_type text,
  p_partner_segment text, p_archive_status text
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.nextway_prospect_identity_archive%rowtype;
  v_fingerprints text[];
  v_sources jsonb;
  v_id uuid;
  v_fingerprint text;
begin
  if p_workspace_id is null or v_user_id is null or not public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Membership attiva richiesta per aggiornare la memoria prospect.' using errcode = '42501';
  end if;

  if p_canonical_url is null or p_canonical_url !~* '^https?://' or length(p_canonical_url) > 2048
     or p_display_name is null or length(btrim(p_display_name)) not between 1 and 240
     or coalesce(cardinality(p_identity_fingerprints), 0) > 20
     or (coalesce(cardinality(p_identity_fingerprints), 0) > 0
         and array_to_string(p_identity_fingerprints, ',') !~ '^[a-f0-9]{64}(,[a-f0-9]{64})*$')
     or jsonb_typeof(coalesce(p_profile_data, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_public_contacts, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_source_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'Dati della memoria prospect non validi.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_source_evidence, '[]'::jsonb)) > 12 then
    raise exception 'Troppe fonti nella memoria prospect.' using errcode = '22023';
  end if;
  if p_target_type not in ('potential_customer','potential_partner','unknown')
     or (p_partner_segment is not null and p_partner_segment not in (
       'wellness_professional','wellness_networker','other_networker','entrepreneur','extra_income'))
     or p_archive_status not in ('seen','reviewed','acquired','ignored') then
    raise exception 'Classificazione della memoria prospect non valida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':url:' || p_canonical_url, 0));
  for v_fingerprint in
    select distinct fingerprint
    from unnest(coalesce(p_identity_fingerprints, '{}'::text[])) as keys(fingerprint)
    order by fingerprint
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      p_workspace_id::text || ':identity:' || v_fingerprint, 0
    ));
  end loop;

  select * into v_existing
  from public.nextway_prospect_identity_archive a
  where a.workspace_id = p_workspace_id
    and (a.canonical_url = p_canonical_url
      or (coalesce(cardinality(p_identity_fingerprints), 0) > 0
          and a.identity_fingerprints && p_identity_fingerprints))
  order by case when a.canonical_url = p_canonical_url then 0 else 1 end, a.last_seen_at desc
  limit 1 for update;

  if found then
    select coalesce(array_agg(fp order by fp), '{}'::text[]) into v_fingerprints
    from (select distinct unnest(
      coalesce(v_existing.identity_fingerprints, '{}'::text[]) ||
      coalesce(p_identity_fingerprints, '{}'::text[])
    ) as fp order by fp limit 20) merged;

    select coalesce(jsonb_agg(source_value order by source_order desc), '[]'::jsonb)
      into v_sources
    from (
      select value as source_value, ordinality as source_order
      from jsonb_array_elements(coalesce(v_existing.source_evidence, '[]'::jsonb) ||
        coalesce(p_source_evidence, '[]'::jsonb)) with ordinality
      order by ordinality desc limit 12
    ) recent;

    update public.nextway_prospect_identity_archive
    set identity_fingerprints = v_fingerprints,
        canonical_url = coalesce(v_existing.canonical_url, p_canonical_url),
        display_name = case
          when p_display_name <> 'Prospect senza nome' then left(btrim(p_display_name), 240)
          else display_name
        end,
        company_name = coalesce(nullif(left(btrim(p_company_name), 240), ''), company_name),
        profile_data = profile_data || coalesce(p_profile_data, '{}'::jsonb),
        public_contacts = jsonb_build_object(
          'emails', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'emails', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'emails', '[]'::jsonb)
              ) limit 5
            ) merged_emails
          ), '[]'::jsonb),
          'phones', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'phones', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'phones', '[]'::jsonb)
              ) limit 5
            ) merged_phones
          ), '[]'::jsonb),
          'whatsapp', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'whatsapp', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'whatsapp', '[]'::jsonb)
              ) limit 5
            ) merged_whatsapp
          ), '[]'::jsonb),
          'socials', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'socials', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'socials', '[]'::jsonb)
              ) limit 5
            ) merged_socials
          ), '[]'::jsonb)
        ),
        source_evidence = v_sources,
        target_type = case when target_type = 'unknown' then p_target_type else target_type end,
        partner_segment = coalesce(partner_segment, p_partner_segment),
        archive_status = case
          when archive_status = 'acquired' or p_archive_status = 'acquired' then 'acquired'
          when archive_status = 'ignored' then 'ignored'
          when archive_status = 'reviewed' or p_archive_status = 'reviewed' then 'reviewed'
          else 'seen' end,
        last_seen_at = now(), seen_count = seen_count + 1,
        last_acquired_at = case when p_archive_status = 'acquired' then now() else last_acquired_at end,
        updated_at = now()
    where id = v_existing.id returning id into v_id;
  else
    insert into public.nextway_prospect_identity_archive (
      workspace_id, owner_user_id, identity_fingerprints, canonical_url, display_name,
      company_name, profile_data, public_contacts, source_evidence, target_type,
      partner_segment, archive_status, last_acquired_at
    ) values (
      p_workspace_id, v_user_id, coalesce(p_identity_fingerprints, '{}'::text[]),
      p_canonical_url, left(btrim(p_display_name), 240),
      nullif(left(btrim(p_company_name), 240), ''), coalesce(p_profile_data, '{}'::jsonb),
      coalesce(p_public_contacts, '{}'::jsonb), coalesce(p_source_evidence, '[]'::jsonb),
      p_target_type, p_partner_segment, p_archive_status,
      case when p_archive_status = 'acquired' then now() else null end
    ) returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.nextway_merge_prospect_identity(
  uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) from public, anon;
grant execute on function public.nextway_merge_prospect_identity(
  uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) to authenticated;

commit;
)
     or jsonb_typeof(coalesce(p_profile_data, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_public_contacts, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_source_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'Dati della memoria prospect non validi.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_source_evidence, '[]'::jsonb)) > 12 then
    raise exception 'Troppe fonti nella memoria prospect.' using errcode = '22023';
  end if;
  if p_target_type not in ('potential_customer','potential_partner','unknown')
     or (p_partner_segment is not null and p_partner_segment not in (
       'wellness_professional','wellness_networker','other_networker','entrepreneur','extra_income'))
     or p_archive_status not in ('seen','reviewed','acquired','ignored') then
    raise exception 'Classificazione della memoria prospect non valida.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':url:' || p_canonical_url, 0));
  for v_fingerprint in
    select distinct fingerprint
    from unnest(coalesce(p_identity_fingerprints, '{}'::text[])) as keys(fingerprint)
    order by fingerprint
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      p_workspace_id::text || ':identity:' || v_fingerprint, 0
    ));
  end loop;

  select * into v_existing
  from public.nextway_prospect_identity_archive a
  where a.workspace_id = p_workspace_id
    and (a.canonical_url = p_canonical_url
      or (coalesce(cardinality(p_identity_fingerprints), 0) > 0
          and a.identity_fingerprints && p_identity_fingerprints))
  order by case when a.canonical_url = p_canonical_url then 0 else 1 end, a.last_seen_at desc
  limit 1 for update;

  if found then
    select coalesce(array_agg(fp order by fp), '{}'::text[]) into v_fingerprints
    from (select distinct unnest(
      coalesce(v_existing.identity_fingerprints, '{}'::text[]) ||
      coalesce(p_identity_fingerprints, '{}'::text[])
    ) as fp order by fp limit 20) merged;

    select coalesce(jsonb_agg(source_value order by source_order desc), '[]'::jsonb)
      into v_sources
    from (
      select value as source_value, ordinality as source_order
      from jsonb_array_elements(coalesce(v_existing.source_evidence, '[]'::jsonb) ||
        coalesce(p_source_evidence, '[]'::jsonb)) with ordinality
      order by ordinality desc limit 12
    ) recent;

    update public.nextway_prospect_identity_archive
    set identity_fingerprints = v_fingerprints,
        canonical_url = coalesce(v_existing.canonical_url, p_canonical_url),
        display_name = case
          when p_display_name <> 'Prospect senza nome' then left(btrim(p_display_name), 240)
          else display_name
        end,
        company_name = coalesce(nullif(left(btrim(p_company_name), 240), ''), company_name),
        profile_data = profile_data || coalesce(p_profile_data, '{}'::jsonb),
        public_contacts = jsonb_build_object(
          'emails', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'emails', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'emails', '[]'::jsonb)
              ) limit 5
            ) merged_emails
          ), '[]'::jsonb),
          'phones', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'phones', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'phones', '[]'::jsonb)
              ) limit 5
            ) merged_phones
          ), '[]'::jsonb),
          'whatsapp', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'whatsapp', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'whatsapp', '[]'::jsonb)
              ) limit 5
            ) merged_whatsapp
          ), '[]'::jsonb),
          'socials', coalesce((
            select jsonb_agg(contact) from (
              select distinct value as contact
              from jsonb_array_elements_text(
                coalesce(public_contacts -> 'socials', '[]'::jsonb) ||
                coalesce(p_public_contacts -> 'socials', '[]'::jsonb)
              ) limit 5
            ) merged_socials
          ), '[]'::jsonb)
        ),
        source_evidence = v_sources,
        target_type = case when target_type = 'unknown' then p_target_type else target_type end,
        partner_segment = coalesce(partner_segment, p_partner_segment),
        archive_status = case
          when archive_status = 'acquired' or p_archive_status = 'acquired' then 'acquired'
          when archive_status = 'ignored' then 'ignored'
          when archive_status = 'reviewed' or p_archive_status = 'reviewed' then 'reviewed'
          else 'seen' end,
        last_seen_at = now(), seen_count = seen_count + 1,
        last_acquired_at = case when p_archive_status = 'acquired' then now() else last_acquired_at end,
        updated_at = now()
    where id = v_existing.id returning id into v_id;
  else
    insert into public.nextway_prospect_identity_archive (
      workspace_id, owner_user_id, identity_fingerprints, canonical_url, display_name,
      company_name, profile_data, public_contacts, source_evidence, target_type,
      partner_segment, archive_status, last_acquired_at
    ) values (
      p_workspace_id, v_user_id, coalesce(p_identity_fingerprints, '{}'::text[]),
      p_canonical_url, left(btrim(p_display_name), 240),
      nullif(left(btrim(p_company_name), 240), ''), coalesce(p_profile_data, '{}'::jsonb),
      coalesce(p_public_contacts, '{}'::jsonb), coalesce(p_source_evidence, '[]'::jsonb),
      p_target_type, p_partner_segment, p_archive_status,
      case when p_archive_status = 'acquired' then now() else null end
    ) returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.nextway_merge_prospect_identity(
  uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) from public, anon;
grant execute on function public.nextway_merge_prospect_identity(
  uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) to authenticated;

commit;
