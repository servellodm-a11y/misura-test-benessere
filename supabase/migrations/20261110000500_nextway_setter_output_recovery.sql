-- NEXTWAY AI Setter: persistenza temporanea dell'output AI prima del commit finale.
-- Se il salvataggio finale fallisce dopo una risposta OpenAI valida, il retry
-- può recuperare il risultato senza sostenere una seconda chiamata al provider.

alter table public.nextway_setter_generation_requests
  add column if not exists generated_output jsonb;

create or replace function public.nextway_store_setter_generation_output(
  p_idempotency_key uuid,
  p_generated_output jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.nextway_setter_generation_requests%rowtype;
  v_owner_id uuid;
  v_is_admin boolean := false;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;

  if p_generated_output is null
    or jsonb_typeof(p_generated_output) <> 'object'
    or jsonb_typeof(p_generated_output -> 'message') is distinct from 'string'
    or jsonb_typeof(p_generated_output -> 'strategy') is distinct from 'string'
    or jsonb_typeof(p_generated_output -> 'objective') is distinct from 'string'
    or jsonb_typeof(p_generated_output -> 'tone') is distinct from 'string'
    or jsonb_typeof(p_generated_output -> 'next_step') is distinct from 'string'
    or (p_generated_output - array['message','strategy','objective','tone','next_step']) <> '{}'::jsonb
    or length(btrim(p_generated_output ->> 'message')) = 0
    or length(p_generated_output ->> 'message') > 10000
    or length(p_generated_output ->> 'strategy') > 2000
    or length(p_generated_output ->> 'objective') > 1000
    or length(p_generated_output ->> 'tone') > 200
    or length(p_generated_output ->> 'next_step') > 2000 then
    raise exception 'Output generato non valido' using errcode = '22023';
  end if;

  select r.* into v_request
  from public.nextway_setter_generation_requests r
  where r.user_id = v_user_id
    and r.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'Richiesta idempotente non trovata' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending'
    or v_request.lease_expires_at <= clock_timestamp() then
    raise exception 'Prenotazione generazione non più valida' using errcode = '40001';
  end if;

  select c.owner_profile_id
  into v_owner_id
  from public.nextway_setter_conversations c
  where c.id = v_request.conversation_id
  for update;

  select exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'platform_admin'
  ) into v_is_admin;

  if v_owner_id is null or (v_owner_id <> v_user_id and not v_is_admin) then
    raise exception 'Conversazione non autorizzata' using errcode = '42501';
  end if;

  update public.nextway_setter_generation_requests
  set generated_output = p_generated_output,
      updated_at = clock_timestamp()
  where id = v_request.id;

  return true;
end;
$$;

create or replace function public.nextway_get_staged_setter_output(
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_output jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;

  select r.generated_output into v_output
  from public.nextway_setter_generation_requests r
  where r.user_id = v_user_id
    and r.idempotency_key = p_idempotency_key
    and r.status = 'pending'
    and r.lease_expires_at > clock_timestamp();

  return v_output;
end;
$$;

revoke all on function public.nextway_store_setter_generation_output(uuid, jsonb) from public, anon;
revoke all on function public.nextway_get_staged_setter_output(uuid) from public, anon;
grant execute on function public.nextway_store_setter_generation_output(uuid, jsonb) to authenticated;
grant execute on function public.nextway_get_staged_setter_output(uuid) to authenticated;

comment on column public.nextway_setter_generation_requests.generated_output is
  'Output strutturato OpenAI temporaneo, conservato per recuperare il completamento senza rigenerare.';
comment on function public.nextway_store_setter_generation_output(uuid, jsonb) is
  'Salva output AI validato sulla prenotazione pending del chiamante, prima del commit della bozza.';
comment on function public.nextway_get_staged_setter_output(uuid) is
  'Recupera output AI temporaneo della prenotazione pending del chiamante per retry senza nuova chiamata OpenAI.';
