-- NEXTWAY AI Setter: idempotenza server-side per generazione bozze.
-- Una chiave UUID identifica una singola operazione logica.
-- La bozza e la risposta idempotente vengono salvate nella stessa transazione.

create table if not exists public.nextway_setter_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.nextway_setter_conversations(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending','completed')),
  lease_expires_at timestamptz not null default (now() + interval '2 minutes'),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check ((status = 'completed' and response is not null) or status = 'pending')
);

create index if not exists nextway_setter_generation_requests_created_idx
  on public.nextway_setter_generation_requests (created_at);

-- Impedisce due generazioni simultanee sulla stessa conversazione anche
-- quando schede o dispositivi differenti usano chiavi distinte.
create unique index if not exists nextway_setter_one_pending_per_conversation_uidx
  on public.nextway_setter_generation_requests (user_id, conversation_id)
  where status = 'pending';

alter table public.nextway_setter_generation_requests enable row level security;
revoke all on table public.nextway_setter_generation_requests from public, anon, authenticated;

create or replace function public.nextway_begin_setter_generation(
  p_conversation_id uuid,
  p_idempotency_key uuid
)
returns table (
  claimed boolean,
  completed boolean,
  cached_response jsonb,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_is_admin boolean := false;
  v_inserted_id uuid;
  v_request public.nextway_setter_generation_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;
  if p_conversation_id is null or p_idempotency_key is null then
    raise exception 'Identificativi richiesta mancanti' using errcode = '22023';
  end if;

  select c.owner_profile_id into v_owner_id
  from public.nextway_setter_conversations c
  where c.id = p_conversation_id;

  if v_owner_id is null then
    raise exception 'Conversazione non trovata' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'platform_admin'
  ) into v_is_admin;

  if v_owner_id <> v_user_id and not v_is_admin then
    raise exception 'Conversazione non autorizzata' using errcode = '42501';
  end if;

  insert into public.nextway_setter_generation_requests
    (user_id, conversation_id, idempotency_key)
  values
    (v_user_id, p_conversation_id, p_idempotency_key)
  on conflict do nothing
  returning id into v_inserted_id;

  -- La richiesta appena inserita è già stata acquisita: non deve essere
  -- scambiata per una richiesta concorrente con lease ancora attiva.
  if v_inserted_id is not null then
    return query select true, false, null::jsonb, 0;
    return;
  end if;

  select r.* into v_request
  from public.nextway_setter_generation_requests r
  where r.user_id = v_user_id
    and r.idempotency_key = p_idempotency_key
  for update;

  if not found then
    -- Un'altra chiave può già detenere la prenotazione pending della stessa
    -- conversazione: blocca la seconda scheda/dispositivo.
    select r.* into v_request
    from public.nextway_setter_generation_requests r
    where r.user_id = v_user_id
      and r.conversation_id = p_conversation_id
      and r.status = 'pending'
    for update;

    if found then
      return query select
        false,
        false,
        null::jsonb,
        greatest(1, ceil(extract(epoch from (v_request.lease_expires_at - clock_timestamp())))::integer);
      return;
    end if;

    raise exception 'Impossibile acquisire la prenotazione di generazione'
      using errcode = '40001';
  end if;

  if v_request.conversation_id <> p_conversation_id then
    raise exception 'Chiave idempotenza già associata a un''altra conversazione'
      using errcode = '22023';
  end if;

  if v_request.status = 'completed' then
    return query select false, true, v_request.response, 0;
    return;
  end if;

  if v_request.lease_expires_at > clock_timestamp() then
    return query select
      false,
      false,
      null::jsonb,
      greatest(1, ceil(extract(epoch from (v_request.lease_expires_at - clock_timestamp())))::integer);
    return;
  end if;

  update public.nextway_setter_generation_requests
  set lease_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
  where id = v_request.id;

  return query select true, false, null::jsonb, 0;
end;
$$;

create or replace function public.nextway_complete_setter_generation(
  p_idempotency_key uuid,
  p_message text,
  p_strategy text,
  p_objective text,
  p_tone text,
  p_next_step text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.nextway_setter_generation_requests%rowtype;
  v_owner_id uuid;
  v_is_admin boolean := false;
  v_saved_id uuid;
  v_saved_content text;
  v_saved_at timestamptz;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;
  if p_message is null or length(btrim(p_message)) = 0 or length(p_message) > 10000 then
    raise exception 'Testo bozza non valido' using errcode = '22023';
  end if;

  select r.* into v_request
  from public.nextway_setter_generation_requests r
  where r.user_id = v_user_id and r.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'Richiesta idempotente non trovata' using errcode = 'P0002';
  end if;

  if v_request.status = 'completed' then
    return v_request.response;
  end if;

  if v_request.lease_expires_at <= clock_timestamp() then
    raise exception 'Prenotazione generazione scaduta' using errcode = '40001';
  end if;

  select c.owner_profile_id into v_owner_id
  from public.nextway_setter_conversations c
  where c.id = v_request.conversation_id;

  select exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'platform_admin'
  ) into v_is_admin;

  if v_owner_id is null or (v_owner_id <> v_user_id and not v_is_admin) then
    raise exception 'Conversazione non autorizzata' using errcode = '42501';
  end if;

  insert into public.nextway_setter_messages (
    conversation_id,
    owner_profile_id,
    direction,
    content,
    message_type,
    ai_generated,
    approved_by,
    sent_at
  ) values (
    v_request.conversation_id,
    v_owner_id,
    'outgoing',
    btrim(p_message),
    'text',
    true,
    null,
    null
  )
  returning id, content, created_at
  into v_saved_id, v_saved_content, v_saved_at;

  v_response := jsonb_build_object(
    'success', true,
    'draft_id', v_saved_id,
    'message', v_saved_content,
    'strategy', coalesce(p_strategy, ''),
    'objective', coalesce(p_objective, ''),
    'tone', coalesce(p_tone, ''),
    'next_step', coalesce(p_next_step, ''),
    'sent', false,
    'approved', false,
    'created_at', v_saved_at
  );

  update public.nextway_setter_generation_requests
  set status = 'completed',
      response = v_response,
      updated_at = clock_timestamp()
  where id = v_request.id;

  return v_response;
end;
$$;

revoke all on function public.nextway_begin_setter_generation(uuid, uuid) from public, anon;
revoke all on function public.nextway_complete_setter_generation(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.nextway_begin_setter_generation(uuid, uuid) to authenticated;
grant execute on function public.nextway_complete_setter_generation(uuid, text, text, text, text, text) to authenticated;

comment on table public.nextway_setter_generation_requests is
  'Chiavi idempotenti per impedire doppie generazioni AI Setter dello stesso utente.';
