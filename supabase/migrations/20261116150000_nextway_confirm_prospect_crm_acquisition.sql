-- NEXTWAY: confirm central prospect acquisition only after the CRM Lead exists.
-- This RPC is callable only by the trusted Edge Function service role.

begin;

create or replace function public.nextway_mark_prospect_identity_acquired(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_lead_id uuid,
  p_source_url text,
  p_canonical_url text
)
returns table (identity_id uuid, last_acquired_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_lead_id uuid;
  v_identity_id uuid;
  v_acquired_at timestamptz;
begin
  if auth.role() is distinct from 'service_role'
     or p_actor_id is null
     or p_workspace_id is null
     or p_lead_id is null then
    raise exception 'Conferma acquisizione consentita solo al servizio NEXTWAY autenticato.' using errcode = '42501';
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
    raise exception 'Membership attiva richiesta per confermare l’acquisizione.' using errcode = '42501';
  end if;

  if p_source_url is null or length(btrim(p_source_url)) > 2048
     or p_source_url !~* '^https?://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:[0-9]{1,5})?([/?#]|$)'
     or p_canonical_url is null or length(p_canonical_url) > 2048
     or p_canonical_url !~* '^https?://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:[0-9]{1,5})?([/?#]|$)' then
    raise exception 'URL della conferma acquisizione non valido.' using errcode = '22023';
  end if;

  -- A valid confirmation must refer to the exact Lead just committed by this user
  -- in this workspace. An archived Lead is still an acquired CRM Lead.
  select l.id into v_lead_id
  from public.nextway_leads l
  where l.id = p_lead_id
    and l.owner_profile_id = p_actor_id
    and l.workspace_id = p_workspace_id
    and lower(btrim(l.source_url)) = lower(btrim(p_source_url))
  for key share;

  if v_lead_id is null then
    raise exception 'Lead CRM non trovato o non coerente con workspace, proprietario e fonte.' using errcode = '42501';
  end if;

  update public.nextway_prospect_identity_archive a
     set archive_status = 'acquired',
         last_acquired_at = coalesce(a.last_acquired_at, clock_timestamp()),
         updated_at = clock_timestamp()
   where a.workspace_id = p_workspace_id
     and a.canonical_url = p_canonical_url
  returning a.id, a.last_acquired_at into v_identity_id, v_acquired_at;

  if v_identity_id is null then
    raise exception 'Identità non presente nella memoria centrale: conferma non registrata.' using errcode = 'P0002';
  end if;

  return query select v_identity_id, v_acquired_at;
end;
$$;

alter function public.nextway_mark_prospect_identity_acquired(uuid,uuid,uuid,text,text) owner to postgres;
revoke all on function public.nextway_mark_prospect_identity_acquired(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.nextway_mark_prospect_identity_acquired(uuid,uuid,uuid,text,text) to service_role;

-- The memory readiness preflight must include the final CRM acquisition write path.
create or replace function public.nextway_check_prospect_memory_ready(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null or p_workspace_id is null then
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
     or to_regprocedure('public.nextway_merge_prospect_identity(uuid,uuid,text[],text,text,text,jsonb,jsonb,jsonb,text,text,text)') is null
     or to_regprocedure('public.nextway_mark_prospect_identity_acquired(uuid,uuid,uuid,text,text)') is null then
    raise exception 'Memoria centrale NEXTWAY non completamente installata.' using errcode = '55000';
  end if;
  if not has_function_privilege('service_role', 'public.nextway_store_search_query_cache(uuid,uuid,text,text,text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.nextway_lookup_prospect_crm_matches(uuid,text[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.nextway_merge_prospect_identity(uuid,uuid,text[],text,text,text,jsonb,jsonb,jsonb,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.nextway_mark_prospect_identity_acquired(uuid,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'Permessi RPC memoria centrale NEXTWAY incompleti.' using errcode = '42501';
  end if;
  return true;
end;
$$;

alter function public.nextway_check_prospect_memory_ready(uuid,uuid) owner to postgres;
revoke all on function public.nextway_check_prospect_memory_ready(uuid,uuid) from public, anon, authenticated;
grant execute on function public.nextway_check_prospect_memory_ready(uuid,uuid) to service_role;

commit;
