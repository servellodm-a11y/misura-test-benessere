-- NEXTWAY legacy Lead creation idempotency hardening.
-- Keeps the legacy route platform_admin-only and prevents replay of workspace-bound requests.
-- Depends on 20261112000000_nextway_lead_creation_workspace.sql.

begin;

do $$
begin
  if to_regprocedure('public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)') is null
     or to_regclass('public.nextway_lead_creation_requests') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public'
         and table_name='nextway_lead_creation_requests'
         and column_name='workspace_id'
     ) then
    raise exception 'Lead creation workspace migration prerequisites are missing.';
  end if;
end;
$$;

create or replace function public.nextway_create_lead_with_conversation_idempotent(
  p_request_id uuid,
  p_request_hash text,
  p_display_name text,
  p_category text,
  p_source_name text,
  p_source_url text,
  p_public_evidence text,
  p_objective text default 'Valutare il prospect e preparare il primo contatto',
  p_channel text default 'manual'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted boolean := false;
  v_existing_hash text;
  v_existing_response jsonb;
  v_existing_workspace_id uuid;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if not public.nextway_is_platform_admin() then
    raise exception 'Seleziona un workspace operativo per creare un nuovo Lead.'
      using errcode='42501';
  end if;
  if p_request_id is null or p_request_hash is null
     or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chiave idempotenza non valida' using errcode='22023';
  end if;

  insert into public.nextway_lead_creation_requests(owner_profile_id,request_id,request_hash)
  values (v_user_id,p_request_id,p_request_hash)
  on conflict (owner_profile_id,request_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted,false) then
    select r.request_hash,r.response,r.workspace_id
      into v_existing_hash,v_existing_response,v_existing_workspace_id
    from public.nextway_lead_creation_requests r
    where r.owner_profile_id=v_user_id and r.request_id=p_request_id
    for update;

    if not found then
      raise exception 'Richiesta concorrente non recuperabile; riprovare' using errcode='40001';
    end if;
    if v_existing_hash is distinct from p_request_hash
       or v_existing_workspace_id is not null then
      return jsonb_build_object(
        'success',false,
        'error','La chiave di richiesta esiste già con dati differenti o appartiene a un workspace. Avvia una nuova richiesta.'
      );
    end if;
    if v_existing_response is null then
      raise exception 'Richiesta in elaborazione; riprovare tra qualche secondo' using errcode='40001';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay',true);
  end if;

  v_response := public.nextway_create_lead_with_conversation(
    p_display_name,p_category,p_source_name,p_source_url,p_public_evidence,p_objective,p_channel
  );

  if v_response is null
     or coalesce((v_response->>'success')::boolean,false) is not true
     or nullif(v_response->>'lead_id','') is null
     or nullif(v_response->>'conversation_id','') is null then
    raise exception 'Creazione Lead non confermata: %',
      coalesce(v_response->>'error','risposta incompleta') using errcode='P0001';
  end if;

  update public.nextway_lead_creation_requests
  set response=v_response,completed_at=clock_timestamp()
  where owner_profile_id=v_user_id and request_id=p_request_id;

  return v_response || jsonb_build_object('idempotent_replay',false);
end;
$$;

revoke all on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)
  from public,anon;
grant execute on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)
  to authenticated;

comment on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text) is
  'Legacy unassigned Lead creation is platform_admin-only; workspace-bound idempotency requests cannot be replayed through this route.';

commit;
