-- NEXTWAY: protected central identity merge and CRM duplicate lookup RPCs.
-- Candidate only. Depends on 20261116100000_nextway_prospect_identity_memory.sql.
-- No data backfill, inserts, updates, or deletes are performed by this migration.

begin;

do $$
begin
  if to_regclass('public.nextway_prospect_identity_archive') is null
     or to_regclass('public.nextway_search_query_cache') is null
     or to_regclass('public.nextway_leads') is null then
    raise exception 'NEXTWAY central memory tables and Lead table must exist before installing the RPCs.';
  end if;
  if to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') is null then
    raise exception 'NEXTWAY workspace access helper is missing.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nextway_leads'
      and column_name in ('workspace_id','source_url')
    group by table_schema, table_name
    having count(distinct column_name) = 2
  ) then
    raise exception 'NEXTWAY Lead workspace_id/source_url columns are required for authoritative CRM duplicate detection.';
  end if;
end;
$$;

create or replace function public.nextway_lookup_prospect_crm_matches(
  p_workspace_id uuid,
  p_source_urls text[]
)
returns table (
  canonical_url text,
  display_name text,
  company_name text,
  category text,
  lead_status text,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or p_workspace_id is null or not public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Membership attiva richiesta per verificare i Lead del workspace.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_source_urls), 0) > 25
     or exists (
       select 1 from unnest(coalesce(p_source_urls, '{}'::text[])) as u(url)
       where url is null or length(url) > 2048 or url !~* '^https?://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:[0-9]{1,5})?([/?#]|$)'
     ) then
    raise exception 'Elenco URL per la verifica CRM non valido.' using errcode = '22023';
  end if;

  return query
  select u.url, l.display_name, l.company_brand, l.category::text, l.status::text, l.archived_at
  from unnest(coalesce(p_source_urls, '{}'::text[])) as u(url)
  join public.nextway_leads l
    on (
      l.workspace_id = p_workspace_id
      or (l.workspace_id is null and l.owner_profile_id = auth.uid())
    )
   and lower(btrim(l.source_url)) = lower(btrim(u.url))
  order by u.url, l.created_at desc;
end;
$$;

alter function public.nextway_lookup_prospect_crm_matches(uuid,text[]) owner to postgres;
revoke all on function public.nextway_lookup_prospect_crm_matches(uuid,text[]) from public, anon;
grant execute on function public.nextway_lookup_prospect_crm_matches(uuid,text[]) to authenticated;

create or replace function public.nextway_merge_prospect_identity(
  p_actor_id uuid, p_workspace_id uuid, p_identity_fingerprints text[], p_canonical_url text,
  p_display_name text, p_company_name text, p_profile_data jsonb,
  p_public_contacts jsonb, p_source_evidence jsonb, p_target_type text,
  p_partner_segment text, p_archive_status text
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $
declare
  v_user_id uuid;
  v_existing public.nextway_prospect_identity_archive%rowtype;
  v_fingerprints text[];
  v_sources jsonb;
  v_id uuid;
  v_fingerprint text;
  v_effective_archive_status text := 'seen';
  v_match_count integer;
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null then
    raise exception 'Scrittura memoria identità consentita solo al servizio NEXTWAY autenticato.' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_set(
      coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb),
      '{sub}', to_jsonb(p_actor_id::text), true
    )::text,
    true
  );
  if auth.uid() is distinct from p_actor_id then
    raise exception 'Identità attore NEXTWAY non coerente.' using errcode = '42501';
  end if;
  v_user_id := p_actor_id;

  if p_workspace_id is null or v_user_id is null or not public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Membership attiva richiesta per aggiornare la memoria prospect.' using errcode = '42501';
  end if;

  if p_canonical_url is null or p_canonical_url !~* '^https?://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:[0-9]{1,5})?([/?#]|$)' or length(p_canonical_url) > 2048
     or p_display_name is null or length(btrim(p_display_name)) not between 1 and 240
     or coalesce(cardinality(p_identity_fingerprints), 0) > 20
     or array_position(coalesce(p_identity_fingerprints, '{}'::text[]), null) is not null
     or (coalesce(cardinality(p_identity_fingerprints), 0) > 0
         and array_to_string(p_identity_fingerprints, ',') !~ '^[a-f0-9]{64}(,[a-f0-9]{64})*$')
     or jsonb_typeof(coalesce(p_profile_data, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_public_contacts, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_public_contacts -> 'emails', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_public_contacts -> 'phones', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_public_contacts -> 'whatsapp', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_public_contacts -> 'socials', '[]'::jsonb)) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_public_contacts -> 'emails', '[]'::jsonb)) = 'array' then coalesce(p_public_contacts -> 'emails', '[]'::jsonb) else '[]'::jsonb end) c(value)
       where jsonb_typeof(c.value) <> 'string' or length(c.value #>> '{}') > 500
     )
     or exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_public_contacts -> 'phones', '[]'::jsonb)) = 'array' then coalesce(p_public_contacts -> 'phones', '[]'::jsonb) else '[]'::jsonb end) c(value)
       where jsonb_typeof(c.value) <> 'string' or length(c.value #>> '{}') > 100
     )
     or exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_public_contacts -> 'whatsapp', '[]'::jsonb)) = 'array' then coalesce(p_public_contacts -> 'whatsapp', '[]'::jsonb) else '[]'::jsonb end) c(value)
       where jsonb_typeof(c.value) <> 'string' or length(c.value #>> '{}') > 100
     )
     or exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_public_contacts -> 'socials', '[]'::jsonb)) = 'array' then coalesce(p_public_contacts -> 'socials', '[]'::jsonb) else '[]'::jsonb end) c(value)
       where jsonb_typeof(c.value) <> 'string' or length(c.value #>> '{}') > 500
     )
     or jsonb_typeof(coalesce(p_source_evidence, '[]'::jsonb)) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_source_evidence, '[]'::jsonb)) = 'array' then coalesce(p_source_evidence, '[]'::jsonb) else '[]'::jsonb end) e(value)
       where jsonb_typeof(e.value) <> 'object'
     ) then
    raise exception 'Dati della memoria prospect non validi.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_source_evidence, '[]'::jsonb)) > 12 then
    raise exception 'Troppe fonti nella memoria prospect.' using errcode = '22023';
  end if;
  if p_target_type not in ('potential_customer','potential_partner','unknown')
     or (p_partner_segment is not null and p_partner_segment not in (
       'wellness_professional','wellness_networker','other_networker','entrepreneur','extra_income'))
     or p_archive_status is distinct from 'seen' then
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

  select count(*) into v_match_count
  from public.nextway_prospect_identity_archive a
  where a.workspace_id = p_workspace_id
    and (a.canonical_url = p_canonical_url
      or (coalesce(cardinality(p_identity_fingerprints), 0) > 0
          and a.identity_fingerprints && p_identity_fingerprints));
  if v_match_count > 1 then
    raise exception 'Identità già presenti in più record: revisione manuale necessaria.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.nextway_leads l
    where (
        l.workspace_id = p_workspace_id
        or (l.workspace_id is null and l.owner_profile_id = v_user_id)
      )
      and lower(btrim(l.source_url)) = lower(btrim(p_canonical_url))
  ) then
    v_effective_archive_status := 'acquired';
  end if;

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
          when archive_status = 'acquired' or v_effective_archive_status = 'acquired' then 'acquired'
          when archive_status = 'ignored' then 'ignored'
          when archive_status = 'reviewed' then 'reviewed'
          else 'seen' end,
        last_seen_at = now(), seen_count = seen_count + 1,
        last_acquired_at = case when v_effective_archive_status = 'acquired' then coalesce(last_acquired_at, now()) else last_acquired_at end,
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
      p_target_type, p_partner_segment, v_effective_archive_status,
      case when v_effective_archive_status = 'acquired' then now() else null end
    ) returning id into v_id;
  end if;
  return v_id;
end;
$$;

alter function public.nextway_merge_prospect_identity(
  uuid, uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) owner to postgres;
revoke all on function public.nextway_merge_prospect_identity(
  uuid, uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.nextway_merge_prospect_identity(
  uuid, uuid, text[], text, text, text, jsonb, jsonb, jsonb, text, text, text
) to service_role;


create or replace function public.nextway_check_prospect_memory_ready(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if auth.role() is distinct from 'service_role'
     or p_actor_id is null
     or p_workspace_id is null then
    raise exception 'Preflight memoria NEXTWAY consentito solo al servizio autenticato.' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_set(
      coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb),
      '{sub}', to_jsonb(p_actor_id::text), true
    )::text,
    true
  );
  if auth.uid() is distinct from p_actor_id then
    raise exception 'Identità attore NEXTWAY non coerente.' using errcode = '42501';
  end if;

  if not public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Membership attiva non valida per il workspace selezionato.' using errcode = '42501';
  end if;

  if to_regclass('public.nextway_prospect_identity_archive') is null
     or to_regclass('public.nextway_search_query_cache') is null
     or to_regclass('public.nextway_leads') is null
     or to_regprocedure('public.nextway_store_search_query_cache(uuid,uuid,text,text,text,text,text,jsonb)') is null
     or to_regprocedure('public.nextway_lookup_prospect_crm_matches(uuid,text[])') is null
     or to_regprocedure('public.nextway_merge_prospect_identity(uuid,uuid,text[],text,text,text,jsonb,jsonb,jsonb,text,text,text)') is null then
    raise exception 'Memoria centrale NEXTWAY non completamente installata.' using errcode = '55000';
  end if;

  if not has_function_privilege('service_role',
       'public.nextway_store_search_query_cache(uuid,uuid,text,text,text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated',
       'public.nextway_lookup_prospect_crm_matches(uuid,text[])', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.nextway_merge_prospect_identity(uuid,uuid,text[],text,text,text,jsonb,jsonb,jsonb,text,text,text)', 'EXECUTE') then
    raise exception 'Permessi RPC memoria centrale NEXTWAY incompleti.' using errcode = '42501';
  end if;

  return true;
end;
$;

alter function public.nextway_check_prospect_memory_ready(uuid, uuid) owner to postgres;
revoke all on function public.nextway_check_prospect_memory_ready(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nextway_check_prospect_memory_ready(uuid, uuid) to service_role;

commit;
