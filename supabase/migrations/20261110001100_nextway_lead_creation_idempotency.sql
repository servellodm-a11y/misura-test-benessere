-- NEXTWAY AI Setter: idempotenza atomica della creazione Lead + conversazione.
-- La chiave e l'hash sono per utente; il payload personale NON viene memorizzato.
-- La funzione wrapper richiama la RPC esistente nella stessa transazione.
-- Non applicare prima di verificare la firma live della RPC sottostante.

create table if not exists public.nextway_lead_creation_requests (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (owner_profile_id, request_id),
  constraint nextway_lead_creation_response_check check (
    response is null or (
      response->>'success' = 'true'
      and nullif(response->>'lead_id', '') is not null
      and nullif(response->>'conversation_id', '') is not null
    )
  )
);

create index if not exists nextway_lead_creation_requests_created_idx
  on public.nextway_lead_creation_requests (created_at);

alter table public.nextway_lead_creation_requests enable row level security;

drop policy if exists nextway_lead_creation_requests_select_owner
  on public.nextway_lead_creation_requests;
create policy nextway_lead_creation_requests_select_owner
  on public.nextway_lead_creation_requests
  for select to authenticated
  using (owner_profile_id = auth.uid());

drop policy if exists nextway_lead_creation_requests_insert_owner
  on public.nextway_lead_creation_requests;
create policy nextway_lead_creation_requests_insert_owner
  on public.nextway_lead_creation_requests
  for insert to authenticated
  with check (owner_profile_id = auth.uid());

drop policy if exists nextway_lead_creation_requests_update_owner
  on public.nextway_lead_creation_requests;
create policy nextway_lead_creation_requests_update_owner
  on public.nextway_lead_creation_requests
  for update to authenticated
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

revoke all on table public.nextway_lead_creation_requests from public, anon;
grant select, insert, update on table public.nextway_lead_creation_requests to authenticated;

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
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;

  if p_request_id is null
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chiave idempotenza non valida' using errcode = '22023';
  end if;

  insert into public.nextway_lead_creation_requests (
    owner_profile_id, request_id, request_hash
  )
  values (v_user_id, p_request_id, p_request_hash)
  on conflict (owner_profile_id, request_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    select r.request_hash, r.response
      into v_existing_hash, v_existing_response
    from public.nextway_lead_creation_requests r
    where r.owner_profile_id = v_user_id
      and r.request_id = p_request_id;

    if not found then
      raise exception 'Richiesta concorrente non recuperabile; riprovare'
        using errcode = '40001';
    end if;

    if v_existing_hash <> p_request_hash then
      return jsonb_build_object(
        'success', false,
        'error', 'La chiave di richiesta esiste già con dati differenti. Avvia una nuova richiesta.'
      );
    end if;

    if v_existing_response is null then
      raise exception 'Richiesta in elaborazione; riprovare tra qualche secondo'
        using errcode = '40001';
    end if;

    return v_existing_response || jsonb_build_object('idempotent_replay', true);
  end if;

  -- La RPC esistente e la registrazione della risposta appartengono alla
  -- stessa transazione: se una fase fallisce, anche la chiave viene rollbackata.
  v_response := public.nextway_create_lead_with_conversation(
    p_display_name,
    p_category,
    p_source_name,
    p_source_url,
    p_public_evidence,
    p_objective,
    p_channel
  );

  if v_response is null
    or coalesce((v_response->>'success')::boolean, false) is not true
    or nullif(v_response->>'lead_id', '') is null
    or nullif(v_response->>'conversation_id', '') is null then
    -- L'eccezione annulla l'intera transazione, inclusa la chiave appena inserita.
    raise exception 'Creazione Lead non confermata dalla procedura sottostante: %',
      coalesce(v_response->>'error', 'risposta incompleta')
      using errcode = 'P0001';
  end if;

  update public.nextway_lead_creation_requests
  set response = v_response,
      completed_at = clock_timestamp()
  where owner_profile_id = v_user_id
    and request_id = p_request_id;

  return v_response || jsonb_build_object('idempotent_replay', false);
end;
$$;

revoke all on function public.nextway_create_lead_with_conversation_idempotent(
  uuid, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.nextway_create_lead_with_conversation_idempotent(
  uuid, text, text, text, text, text, text, text, text
) to authenticated;

comment on table public.nextway_lead_creation_requests is
  'Chiavi idempotenza per creazione Lead/conversazione; conserva hash e soli ID di risposta, non il payload personale.';
comment on function public.nextway_create_lead_with_conversation_idempotent(
  uuid, text, text, text, text, text, text, text, text
) is
  'Wrapper idempotente transazionale della RPC nextway_create_lead_with_conversation; stessa chiave e stesso hash restituiscono la risposta originale.';

-- Pulizia manuale delle chiavi oltre 30 giorni, riservata a platform_admin.
-- Non viene creato alcun job automatico.
create or replace function public.nextway_prune_lead_creation_requests()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_deleted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'platform_admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Operazione riservata a platform_admin'
      using errcode = '42501';
  end if;

  delete from public.nextway_lead_creation_requests
  where created_at < clock_timestamp() - interval '30 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.nextway_prune_lead_creation_requests() from public, anon;
grant execute on function public.nextway_prune_lead_creation_requests() to authenticated;

comment on function public.nextway_prune_lead_creation_requests() is
  'Pulizia manuale admin-only delle chiavi idempotenti di creazione Lead più vecchie di 30 giorni.';
