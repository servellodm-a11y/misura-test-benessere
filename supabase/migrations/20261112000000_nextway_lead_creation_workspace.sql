-- NEXTWAY Lead + Setter creation RPCs with explicit workspace authorization.
-- Candidate only. Requires workspace association and membership foundations.
-- Existing admin-only legacy signature remains available for central, unassigned records.

begin;

do $$
begin
  if to_regclass('public.nextway_leads') is null
     or to_regclass('public.nextway_setter_conversations') is null
     or to_regclass('public.nextway_lead_creation_requests') is null then
    raise exception 'NEXTWAY Lead, Setter conversation, or idempotency table is missing.';
  end if;
  if to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') is null
     or to_regprocedure('public.nextway_is_platform_admin()') is null then
    raise exception 'Workspace authorization helpers are missing.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_leads' and column_name='workspace_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_setter_conversations' and column_name='workspace_id'
  ) then
    raise exception 'Workspace association columns are missing.';
  end if;
end;
$$;

alter table public.nextway_lead_creation_requests
  add column if not exists workspace_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.nextway_lead_creation_requests'::regclass
      and conname='nextway_lead_creation_requests_workspace_id_fkey'
  ) then
    alter table public.nextway_lead_creation_requests
      add constraint nextway_lead_creation_requests_workspace_id_fkey
      foreign key (workspace_id) references public.nextway_workspaces(id) on delete restrict;
  end if;
end;
$$;

-- Workspace members can discover only active workspaces they can access.
drop policy if exists nextway_workspaces_member_read on public.nextway_workspaces;
create policy nextway_workspaces_member_read
  on public.nextway_workspaces
  for select to authenticated
  using (
    status='active'
    and public.nextway_has_workspace_access(
      id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member','workspace_viewer']::text[]
    )
  );

-- Legacy seven-argument entry point remains central-admin-only. This prevents
-- non-admin callers from silently creating unassigned records outside a workspace.
create or replace function public.nextway_create_lead_with_conversation(
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
  v_owner uuid := auth.uid();
  v_lead_id uuid;
  v_conversation_id uuid;
begin
  if v_owner is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if not public.nextway_is_platform_admin() then
    raise exception 'Seleziona un workspace operativo per creare un nuovo Lead.'
      using errcode='42501';
  end if;
  if nullif(btrim(p_display_name),'') is null
     or nullif(btrim(p_source_name),'') is null
     or nullif(btrim(p_source_url),'') is null
     or p_source_url !~* '^https?://'
     or nullif(btrim(p_public_evidence),'') is null then
    raise exception 'I campi obbligatori non sono validi' using errcode='22023';
  end if;

  insert into public.nextway_leads (
    owner_profile_id,display_name,category,source_name,source_url,public_evidence,workspace_id
  ) values (
    v_owner,btrim(p_display_name),p_category,btrim(p_source_name),
    btrim(p_source_url),btrim(p_public_evidence),null
  ) returning id into v_lead_id;

  insert into public.nextway_setter_conversations (
    lead_id,owner_profile_id,channel,objective,workspace_id
  ) values (
    v_lead_id,v_owner,coalesce(nullif(btrim(p_channel),''),'manual'),
    coalesce(nullif(btrim(p_objective),''),'Valutare il prospect e preparare il primo contatto'),
    null
  ) returning id into v_conversation_id;

  return jsonb_build_object(
    'success',true,'lead_id',v_lead_id,'conversation_id',v_conversation_id,
    'workspace_id',null
  );
end;
$$;

-- Keep the legacy idempotency route bound to unassigned records only.
-- It cannot replay a request previously created in an explicit workspace.
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
as $
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
  if p_request_id is null or p_request_hash is null
     or p_request_hash !~ '^[a-f0-9]{64}
-- every other caller must supply an active workspace and active membership.
create or replace function public.nextway_create_lead_with_conversation_v2(
  p_workspace_id uuid,
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
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_lead_id uuid;
  v_conversation_id uuid;
  v_workspace_status text;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;

  if nullif(btrim(p_display_name),'') is null
     or nullif(btrim(p_source_name),'') is null
     or nullif(btrim(p_source_url),'') is null
     or p_source_url !~* '^https?://'
     or nullif(btrim(p_public_evidence),'') is null then
    raise exception 'I campi obbligatori non sono validi' using errcode='22023';
  end if;

  if p_category not in ('potential_partner','final_customer','wellness_professional') then
    raise exception 'Categoria Lead non valida' using errcode='22023';
  end if;
  if coalesce(nullif(btrim(p_channel),''),'manual') not in
     ('whatsapp','facebook','instagram','linkedin','email','phone','manual') then
    raise exception 'Canale conversazione non valido' using errcode='22023';
  end if;

  if p_workspace_id is null then
    if not public.nextway_is_platform_admin() then
      raise exception 'Un workspace è obbligatorio per questo profilo.'
        using errcode='42501';
    end if;
  else
    select w.status into v_workspace_status
    from public.nextway_workspaces w
    where w.id=p_workspace_id;
    if not found or v_workspace_status<>'active' then
      raise exception 'Workspace non trovato o non attivo' using errcode='22023';
    end if;
    if not public.nextway_has_workspace_access(
      p_workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    ) then
      raise exception 'Membership attiva non autorizzata per questo workspace'
        using errcode='42501';
    end if;
  end if;

  insert into public.nextway_leads (
    owner_profile_id,display_name,category,source_name,source_url,public_evidence,workspace_id
  ) values (
    v_actor,btrim(p_display_name),p_category,btrim(p_source_name),
    btrim(p_source_url),btrim(p_public_evidence),p_workspace_id
  ) returning id into v_lead_id;

  insert into public.nextway_setter_conversations (
    lead_id,owner_profile_id,channel,objective,workspace_id
  ) values (
    v_lead_id,v_actor,coalesce(nullif(btrim(p_channel),''),'manual'),
    coalesce(nullif(btrim(p_objective),''),'Valutare il prospect e preparare il primo contatto'),
    p_workspace_id
  ) returning id into v_conversation_id;

  return jsonb_build_object(
    'success',true,'lead_id',v_lead_id,'conversation_id',v_conversation_id,
    'workspace_id',p_workspace_id
  );
end;
$$;

-- Idempotent workspace-aware entry point. Workspace ID must be included in the
-- client request hash so retries cannot replay a request into another workspace.
create or replace function public.nextway_create_lead_with_conversation_idempotent_v2(
  p_request_id uuid,
  p_request_hash text,
  p_workspace_id uuid,
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
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_inserted boolean := false;
  v_existing_hash text;
  v_existing_response jsonb;
  v_existing_workspace_id uuid;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if p_request_id is null or p_request_hash is null
     or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chiave idempotenza non valida' using errcode='22023';
  end if;

  insert into public.nextway_lead_creation_requests(owner_profile_id,request_id,request_hash,workspace_id)
  values (v_actor,p_request_id,p_request_hash,p_workspace_id)
  on conflict (owner_profile_id,request_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted,false) then
    select r.request_hash,r.response,r.workspace_id
      into v_existing_hash,v_existing_response,v_existing_workspace_id
    from public.nextway_lead_creation_requests r
    where r.owner_profile_id=v_actor and r.request_id=p_request_id
    for update;

    if not found then
      raise exception 'Richiesta concorrente non recuperabile; riprovare' using errcode='40001';
    end if;
    if v_existing_hash is distinct from p_request_hash
       or v_existing_workspace_id is distinct from p_workspace_id then
      return jsonb_build_object(
        'success',false,
        'error','La chiave di richiesta esiste già con dati differenti. Avvia una nuova richiesta.'
      );
    end if;
    if v_existing_response is null then
      raise exception 'Richiesta in elaborazione; riprovare tra qualche secondo' using errcode='40001';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay',true);
  end if;

  v_response := public.nextway_create_lead_with_conversation_v2(
    p_workspace_id,p_display_name,p_category,p_source_name,p_source_url,
    p_public_evidence,p_objective,p_channel
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
  where owner_profile_id=v_actor and request_id=p_request_id;

  return v_response || jsonb_build_object('idempotent_replay',false);
end;
$$;

revoke all on function public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)
  from public,anon;
revoke all on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)
  from public,anon;
revoke all on function public.nextway_create_lead_with_conversation_v2(uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.nextway_create_lead_with_conversation_idempotent_v2(uuid,text,uuid,text,text,text,text,text,text,text)
  from public,anon;

grant execute on function public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)
  to authenticated;
grant execute on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)
  to authenticated;
grant execute on function public.nextway_create_lead_with_conversation_idempotent_v2(uuid,text,uuid,text,text,text,text,text,text,text)
  to authenticated;

comment on function public.nextway_create_lead_with_conversation_v2(uuid,text,text,text,text,text,text,text) is
  'Creates a Lead and Setter conversation in one explicit active workspace; NULL workspace is platform_admin-only.';
comment on function public.nextway_create_lead_with_conversation_idempotent_v2(uuid,text,uuid,text,text,text,text,text,text,text) is
  'Idempotent workspace-aware Lead and Setter conversation creation; request hash must cover workspace_id.';

commit;
 then
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
    where r.owner_profile_id=v_user_id and r.request_id=p_request_id;

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
$;

-- Workspace-aware creation. A NULL workspace is reserved to platform_admin;
-- every other caller must supply an active workspace and active membership.
create or replace function public.nextway_create_lead_with_conversation_v2(
  p_workspace_id uuid,
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
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_lead_id uuid;
  v_conversation_id uuid;
  v_workspace_status text;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;

  if nullif(btrim(p_display_name),'') is null
     or nullif(btrim(p_source_name),'') is null
     or nullif(btrim(p_source_url),'') is null
     or p_source_url !~* '^https?://'
     or nullif(btrim(p_public_evidence),'') is null then
    raise exception 'I campi obbligatori non sono validi' using errcode='22023';
  end if;

  if p_category not in ('potential_partner','final_customer','wellness_professional') then
    raise exception 'Categoria Lead non valida' using errcode='22023';
  end if;
  if coalesce(nullif(btrim(p_channel),''),'manual') not in
     ('whatsapp','facebook','instagram','linkedin','email','phone','manual') then
    raise exception 'Canale conversazione non valido' using errcode='22023';
  end if;

  if p_workspace_id is null then
    if not public.nextway_is_platform_admin() then
      raise exception 'Un workspace è obbligatorio per questo profilo.'
        using errcode='42501';
    end if;
  else
    select w.status into v_workspace_status
    from public.nextway_workspaces w
    where w.id=p_workspace_id;
    if not found or v_workspace_status<>'active' then
      raise exception 'Workspace non trovato o non attivo' using errcode='22023';
    end if;
    if not public.nextway_has_workspace_access(
      p_workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    ) then
      raise exception 'Membership attiva non autorizzata per questo workspace'
        using errcode='42501';
    end if;
  end if;

  insert into public.nextway_leads (
    owner_profile_id,display_name,category,source_name,source_url,public_evidence,workspace_id
  ) values (
    v_actor,btrim(p_display_name),p_category,btrim(p_source_name),
    btrim(p_source_url),btrim(p_public_evidence),p_workspace_id
  ) returning id into v_lead_id;

  insert into public.nextway_setter_conversations (
    lead_id,owner_profile_id,channel,objective,workspace_id
  ) values (
    v_lead_id,v_actor,coalesce(nullif(btrim(p_channel),''),'manual'),
    coalesce(nullif(btrim(p_objective),''),'Valutare il prospect e preparare il primo contatto'),
    p_workspace_id
  ) returning id into v_conversation_id;

  return jsonb_build_object(
    'success',true,'lead_id',v_lead_id,'conversation_id',v_conversation_id,
    'workspace_id',p_workspace_id
  );
end;
$$;

-- Idempotent workspace-aware entry point. Workspace ID must be included in the
-- client request hash so retries cannot replay a request into another workspace.
create or replace function public.nextway_create_lead_with_conversation_idempotent_v2(
  p_request_id uuid,
  p_request_hash text,
  p_workspace_id uuid,
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
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_inserted boolean := false;
  v_existing_hash text;
  v_existing_response jsonb;
  v_existing_workspace_id uuid;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if p_request_id is null or p_request_hash is null
     or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chiave idempotenza non valida' using errcode='22023';
  end if;

  insert into public.nextway_lead_creation_requests(owner_profile_id,request_id,request_hash,workspace_id)
  values (v_actor,p_request_id,p_request_hash,p_workspace_id)
  on conflict (owner_profile_id,request_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted,false) then
    select r.request_hash,r.response,r.workspace_id
      into v_existing_hash,v_existing_response,v_existing_workspace_id
    from public.nextway_lead_creation_requests r
    where r.owner_profile_id=v_actor and r.request_id=p_request_id
    for update;

    if not found then
      raise exception 'Richiesta concorrente non recuperabile; riprovare' using errcode='40001';
    end if;
    if v_existing_hash is distinct from p_request_hash
       or v_existing_workspace_id is distinct from p_workspace_id then
      return jsonb_build_object(
        'success',false,
        'error','La chiave di richiesta esiste già con dati differenti. Avvia una nuova richiesta.'
      );
    end if;
    if v_existing_response is null then
      raise exception 'Richiesta in elaborazione; riprovare tra qualche secondo' using errcode='40001';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay',true);
  end if;

  v_response := public.nextway_create_lead_with_conversation_v2(
    p_workspace_id,p_display_name,p_category,p_source_name,p_source_url,
    p_public_evidence,p_objective,p_channel
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
  where owner_profile_id=v_actor and request_id=p_request_id;

  return v_response || jsonb_build_object('idempotent_replay',false);
end;
$$;

revoke all on function public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)
  from public,anon;
revoke all on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)
  from public,anon;
revoke all on function public.nextway_create_lead_with_conversation_v2(uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.nextway_create_lead_with_conversation_idempotent_v2(uuid,text,uuid,text,text,text,text,text,text,text)
  from public,anon;

grant execute on function public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)
  to authenticated;
grant execute on function public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)
  to authenticated;
grant execute on function public.nextway_create_lead_with_conversation_idempotent_v2(uuid,text,uuid,text,text,text,text,text,text,text)
  to authenticated;

comment on function public.nextway_create_lead_with_conversation_v2(uuid,text,text,text,text,text,text,text) is
  'Creates a Lead and Setter conversation in one explicit active workspace; NULL workspace is platform_admin-only.';
comment on function public.nextway_create_lead_with_conversation_idempotent_v2(uuid,text,uuid,text,text,text,text,text,text,text) is
  'Idempotent workspace-aware Lead and Setter conversation creation; request hash must cover workspace_id.';

commit;
