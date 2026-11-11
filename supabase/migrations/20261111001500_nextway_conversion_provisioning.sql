-- NEXTWAY CRM: provisioning controllato delle richieste di conversione approvate.
-- Additiva e transazionale. Nessun account viene creato da questa migrazione.
begin;

alter table public.nextway_lead_conversion_requests
  drop constraint if exists nextway_lead_conversion_requests_status_check;
alter table public.nextway_lead_conversion_requests
  add constraint nextway_lead_conversion_requests_status_check
  check (status in ('pending','ready_for_activation','provisioning','rejected','activated'));

alter table public.nextway_lead_conversion_requests
  add column if not exists activation_claim_token uuid,
  add column if not exists activation_claimed_at timestamptz,
  add column if not exists activation_user_id uuid references auth.users(id) on delete set null,
  add column if not exists activated_at timestamptz;

alter table public.nextway_lead_conversion_requests
  drop constraint if exists nextway_conversion_activation_state_check;
alter table public.nextway_lead_conversion_requests
  add constraint nextway_conversion_activation_state_check check (
    (
      status = 'provisioning'
      and activation_claim_token is not null
      and activation_claimed_at is not null
      and activated_at is null
      and activation_user_id is null
    )
    or (
      status = 'activated'
      and activation_claim_token is null
      and activated_at is not null
    )
    or (
      status not in ('provisioning','activated')
      and activation_claim_token is null
      and activation_claimed_at is null
      and activation_user_id is null
      and activated_at is null
    )
  );

alter table public.partner_details
  add column if not exists nextway_conversion_request_id uuid
    references public.nextway_lead_conversion_requests(id) on delete restrict;
create unique index if not exists partner_details_nextway_conversion_request_uidx
  on public.partner_details(nextway_conversion_request_id)
  where nextway_conversion_request_id is not null;

alter table public.clients
  add column if not exists nextway_conversion_request_id uuid
    references public.nextway_lead_conversion_requests(id) on delete restrict;
create unique index if not exists clients_nextway_conversion_request_uidx
  on public.clients(nextway_conversion_request_id)
  where nextway_conversion_request_id is not null;

create or replace function public.nextway_guard_conversion_request_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  if old.status = 'pending' then
    if auth.uid() is null or new.reviewed_by is distinct from auth.uid() then
      raise exception 'Revisore non valido.';
    end if;
    if new.status not in ('ready_for_activation','rejected') or new.reviewed_at is null then
      raise exception 'Esito di revisione non valido.';
    end if;
    if new.status = 'rejected' and nullif(btrim(new.review_notes), '') is null then
      raise exception 'La motivazione del rifiuto è obbligatoria.';
    end if;
  elsif old.status = 'ready_for_activation' and new.status = 'provisioning' then
    if not v_service or new.activation_claim_token is null or new.activation_claimed_at is null then
      raise exception 'Claim provisioning non autorizzato.';
    end if;
  elsif old.status = 'provisioning' and new.status = 'provisioning' then
    if not v_service or old.activation_claimed_at > now() - interval '10 minutes'
       or new.activation_claim_token is null then
      raise exception 'Rinnovo claim provisioning non autorizzato.';
    end if;
  elsif old.status = 'provisioning' and new.status = 'ready_for_activation' then
    if not v_service then raise exception 'Rilascio provisioning non autorizzato.'; end if;
  elsif old.status = 'provisioning' and new.status = 'activated' then
    if not v_service or new.activation_claim_token is not null
       or new.activated_at is null then
      raise exception 'Finalizzazione provisioning non autorizzata.';
    end if;
  else
    raise exception 'Transizione di stato conversione non consentita.';
  end if;

  if new.id is distinct from old.id
    or new.lead_id is distinct from old.lead_id
    or new.owner_profile_id is distinct from old.owner_profile_id
    or new.sponsor_profile_id is distinct from old.sponsor_profile_id
    or new.created_by is distinct from old.created_by
    or new.conversion_type is distinct from old.conversion_type
    or new.full_name is distinct from old.full_name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.created_at is distinct from old.created_at then
    raise exception 'I dati originari della richiesta non possono essere modificati.';
  end if;
  if old.status <> 'pending' and (
    new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_notes is distinct from old.review_notes
  ) then
    raise exception 'I dati della revisione sono immutabili dopo l’approvazione.';
  end if;
  return new;
end;
$$;

create or replace function public.nextway_claim_conversion_activation(
  p_request_id uuid,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.nextway_lead_conversion_requests%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operazione riservata al servizio di provisioning.';
  end if;
  if p_request_id is null or p_claim_token is null then
    raise exception 'Identificativi provisioning mancanti.';
  end if;
  select * into r
  from public.nextway_lead_conversion_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Richiesta conversione non trovata.'; end if;
  if r.status = 'activated' then
    return jsonb_build_object('already_activated', true,
      'request_id', r.id, 'conversion_type', r.conversion_type,
      'activation_user_id', r.activation_user_id);
  end if;
  if r.status = 'provisioning' and r.activation_claimed_at > now() - interval '10 minutes' then
    raise exception 'Provisioning già in corso per questa richiesta.';
  end if;
  if r.status not in ('ready_for_activation','provisioning') then
    raise exception 'La richiesta non è pronta per l’attivazione.';
  end if;
  update public.nextway_lead_conversion_requests
  set status = 'provisioning',
      activation_claim_token = p_claim_token,
      activation_claimed_at = now()
  where id = p_request_id;
  return jsonb_build_object(
    'already_activated', false,
    'request_id', r.id,
    'conversion_type', r.conversion_type,
    'full_name', r.full_name,
    'email', r.email,
    'phone', r.phone,
    'owner_profile_id', r.owner_profile_id,
    'sponsor_profile_id', r.sponsor_profile_id,
    'claim_token', p_claim_token
  );
end;
$$;

create or replace function public.nextway_finalize_conversion_activation(
  p_request_id uuid,
  p_claim_token uuid,
  p_auth_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  r public.nextway_lead_conversion_requests%rowtype;
  v_first text;
  v_last text;
  v_client_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operazione riservata al servizio di provisioning.';
  end if;
  select * into r
  from public.nextway_lead_conversion_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Richiesta conversione non trovata.'; end if;
  if r.status = 'activated' then
    return jsonb_build_object('success', true, 'already_activated', true,
      'request_id', r.id, 'activation_user_id', r.activation_user_id);
  end if;
  if r.status <> 'provisioning' or r.activation_claim_token is distinct from p_claim_token then
    raise exception 'Claim provisioning non valido o scaduto.';
  end if;

  v_first := split_part(btrim(r.full_name), ' ', 1);
  v_last := nullif(btrim(substr(btrim(r.full_name), length(v_first) + 1)), '');

  if r.conversion_type = 'partner' then
    if p_auth_user_id is null or not exists(select 1 from auth.users u where u.id=p_auth_user_id and lower(u.email)=lower(r.email)) then
      raise exception 'Account Auth invitato non trovato o email non corrispondente.';
    end if;

    insert into public.profiles (id, email, full_name, role, sponsor_id)
    values (p_auth_user_id, r.email, r.full_name, 'partner', r.sponsor_profile_id)
    on conflict (id) do update
      set email=excluded.email, full_name=excluded.full_name,
          role='partner', sponsor_id=excluded.sponsor_id, updated_at=now();

    insert into public.partner_details
      (profile_id, first_name, last_name, phone, language,
       sponsor_profile_id, team_side, status, nextway_conversion_request_id)
    values
      (p_auth_user_id, v_first, v_last, r.phone, 'it',
       r.sponsor_profile_id, null, 'active', r.id)
    on conflict (profile_id) do update
      set first_name=excluded.first_name,
          last_name=excluded.last_name,
          phone=excluded.phone,
          sponsor_profile_id=excluded.sponsor_profile_id,
          status='active',
          nextway_conversion_request_id=coalesce(
            public.partner_details.nextway_conversion_request_id,
            excluded.nextway_conversion_request_id
          );

  elsif r.conversion_type = 'customer' then
    if p_auth_user_id is not null then
      raise exception 'Un cliente non deve avere un account Auth NEXTWAY.';
    end if;
    insert into public.clients
      (partner_profile_id, first_name, last_name, email, phone, source, status, nextway_conversion_request_id)
    values
      (r.owner_profile_id, v_first, v_last, r.email, r.phone,
       'NEXTWAY CRM', 'potential', r.id)
    on conflict (nextway_conversion_request_id) where nextway_conversion_request_id is not null
    do update set updated_at=now()
    returning id into v_client_id;
  else
    raise exception 'Tipo conversione non supportato.';
  end if;

  update public.nextway_lead_conversion_requests
  set status='activated',
      activation_user_id=p_auth_user_id,
      activated_at=now(),
      activation_claim_token=null
  where id=r.id;

  update public.nextway_leads
  set status = case when r.conversion_type='partner' then 'Convertito partner' else 'Convertito cliente' end
  where id=r.lead_id and owner_profile_id=r.owner_profile_id
    and status='In valutazione' and archived_at is null;

  return jsonb_build_object('success', true, 'already_activated', false,
    'request_id', r.id, 'conversion_type', r.conversion_type,
    'activation_user_id', p_auth_user_id, 'client_id', v_client_id);
end;
$$;

create or replace function public.nextway_release_conversion_activation(
  p_request_id uuid,
  p_claim_token uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operazione riservata al servizio di provisioning.';
  end if;
  update public.nextway_lead_conversion_requests
  set status='ready_for_activation', activation_claim_token=null, activation_claimed_at=null
  where id=p_request_id and status='provisioning' and activation_claim_token=p_claim_token;
  return found;
end;
$$;

revoke all on function public.nextway_claim_conversion_activation(uuid,uuid) from public, anon, authenticated;
revoke all on function public.nextway_finalize_conversion_activation(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.nextway_release_conversion_activation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.nextway_claim_conversion_activation(uuid,uuid) to service_role;
grant execute on function public.nextway_finalize_conversion_activation(uuid,uuid,uuid) to service_role;
grant execute on function public.nextway_release_conversion_activation(uuid,uuid) to service_role;

comment on column public.partner_details.nextway_conversion_request_id is
  'Richiesta NEXTWAY che ha creato il profilo partner; vincolo univoco per idempotenza.';
comment on column public.clients.nextway_conversion_request_id is
  'Richiesta NEXTWAY che ha creato il cliente; vincolo univoco per idempotenza.';

commit;
