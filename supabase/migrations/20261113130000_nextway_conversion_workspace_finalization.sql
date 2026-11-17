-- NEXTWAY: finalizzazione conversione coerente con lo snapshot workspace.
-- Crea partner + membership invited oppure cliente + attribuzione workspace
-- nella stessa transazione della conversione Lead. Nessun accesso diretto alla tabella
-- attribuzioni: i clienti workspace sono esposti solo tramite RPC a proiezione limitata.
-- Preparata sul branch; NON applicare al database remoto senza autorizzazione esplicita.

begin;

create table if not exists public.nextway_client_workspace_attributions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  workspace_id uuid not null references public.nextway_workspaces(id) on delete restrict,
  conversion_request_id uuid not null unique
    references public.nextway_lead_conversion_requests(id) on delete restrict,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint nextway_client_workspace_attribution_client_unique unique (client_id)
);

create index if not exists nextway_client_workspace_attributions_workspace_idx
  on public.nextway_client_workspace_attributions (workspace_id, created_at desc);

alter table public.nextway_client_workspace_attributions enable row level security;
revoke all on table public.nextway_client_workspace_attributions from public, anon, authenticated, service_role;

create or replace function public.nextway_list_workspace_clients(p_workspace_id uuid)
returns table (
  client_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  acquisition_date date,
  source text,
  status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Autenticazione richiesta.';
  end if;
  if p_workspace_id is null or not public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Accesso ai clienti del workspace non autorizzato.';
  end if;

  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone,
         c.acquisition_date, c.source, c.status
  from public.nextway_client_workspace_attributions a
  join public.clients c on c.id = a.client_id
  join public.nextway_workspaces w on w.id = a.workspace_id
  where a.workspace_id = p_workspace_id
    and w.status = 'active'
  order by c.acquisition_date desc nulls last, c.first_name, c.last_name;
end;
$function$;

revoke all on function public.nextway_list_workspace_clients(uuid) from public, anon, service_role;
grant execute on function public.nextway_list_workspace_clients(uuid) to authenticated;

create or replace function public.nextway_finalize_conversion_activation(
  p_request_id uuid,
  p_claim_token uuid,
  p_auth_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  r public.nextway_lead_conversion_requests%rowtype;
  l public.nextway_leads%rowtype;
  v_profile public.profiles%rowtype;
  v_partner public.partner_details%rowtype;
  v_first text;
  v_last text;
  v_client_id uuid;
  v_lead_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operazione riservata al servizio di provisioning.';
  end if;

  select * into r
  from public.nextway_lead_conversion_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Richiesta conversione non trovata.';
  end if;

  if r.status = 'activated' then
    select c.id into v_client_id
    from public.clients c
    where c.nextway_conversion_request_id = r.id;
    return jsonb_build_object(
      'success', true,
      'already_activated', true,
      'request_id', r.id,
      'conversion_type', r.conversion_type,
      'activation_user_id', r.activation_user_id,
      'client_id', v_client_id,
      'workspace_id', r.workspace_id
    );
  end if;

  if r.status <> 'provisioning'
    or r.activation_claim_token is distinct from p_claim_token then
    raise exception 'Claim provisioning non valido o scaduto.';
  end if;

  select * into l
  from public.nextway_leads
  where id = r.lead_id
  for update;

  if not found
    or l.owner_profile_id is distinct from r.owner_profile_id
    or l.status <> 'In valutazione'
    or l.archived_at is not null then
    raise exception 'Il Lead non è più disponibile per la conversione.';
  end if;

  if l.workspace_id is distinct from r.workspace_id then
    raise exception 'Il workspace del Lead è cambiato dopo la richiesta: conversione bloccata per revisione.';
  end if;

  if r.workspace_id is not null and not exists (
    select 1 from public.nextway_workspaces w
    where w.id = r.workspace_id and w.status = 'active'
  ) then
    raise exception 'Il workspace della richiesta non è attivo.';
  end if;

  update public.nextway_leads
  set status = case
    when r.conversion_type = 'partner' then 'Convertito partner'
    else 'Convertito cliente'
  end
  where id = r.lead_id
    and owner_profile_id = r.owner_profile_id
    and status = 'In valutazione'
    and archived_at is null
    and workspace_id is not distinct from r.workspace_id
  returning id into v_lead_id;

  if v_lead_id is null then
    raise exception 'Impossibile aggiornare il Lead: conversione annullata.';
  end if;

  v_first := split_part(btrim(r.full_name), ' ', 1);
  v_last := nullif(btrim(substr(btrim(r.full_name), length(v_first) + 1)), '');

  if r.conversion_type = 'partner' then
    if p_auth_user_id is null or not exists (
      select 1
      from auth.users u
      where u.id = p_auth_user_id
        and lower(u.email) = lower(r.email)
        and u.raw_user_meta_data ->> 'nextway_conversion_request_id' = r.id::text
    ) then
      raise exception 'Account Auth invitato non trovato o non associato a questa richiesta.';
    end if;

    -- Il trigger Auth può aver già creato il profilo. Lo si completa solo se
    -- è già un profilo partner compatibile; ruoli/sponsor/dati non vengono sovrascritti.
    select * into v_profile
    from public.profiles
    where id = p_auth_user_id
    for update;

    if found then
      if v_profile.role is null or v_profile.role::text <> 'partner'
        or (v_profile.email is not null and lower(v_profile.email) <> lower(r.email))
        or (nullif(btrim(v_profile.full_name), '') is not null and v_profile.full_name <> r.full_name)
        or (v_profile.sponsor_id is not null and v_profile.sponsor_id <> r.sponsor_profile_id) then
        raise exception 'Esiste già un profilo incompatibile: nessun dato è stato sovrascritto.';
      end if;

      update public.profiles
      set email = coalesce(email, r.email),
          full_name = coalesce(nullif(btrim(full_name), ''), r.full_name),
          sponsor_id = coalesce(sponsor_id, r.sponsor_profile_id)
      where id = p_auth_user_id;
    else
      insert into public.profiles (id, email, full_name, role, sponsor_id)
      values (p_auth_user_id, r.email, r.full_name, 'partner', r.sponsor_profile_id);
    end if;

    select * into v_partner
    from public.partner_details
    where profile_id = p_auth_user_id
    for update;

    if found then
      if v_partner.nextway_conversion_request_id is distinct from r.id
        or v_partner.sponsor_profile_id is distinct from r.sponsor_profile_id
        or v_partner.first_name is distinct from v_first
        or v_partner.last_name is distinct from v_last
        or v_partner.phone is distinct from r.phone
        or v_partner.status <> 'active' then
        raise exception 'Esistono già dettagli partner incompatibili: nessun dato è stato sovrascritto.';
      end if;
    else
      insert into public.partner_details
        (profile_id, first_name, last_name, phone, language,
         sponsor_profile_id, team_side, status, nextway_conversion_request_id)
      values
        (p_auth_user_id, v_first, v_last, r.phone, 'it',
         r.sponsor_profile_id, null, 'active', r.id);
    end if;

    if r.workspace_id is not null then
      if exists (
        select 1 from public.nextway_workspace_memberships m
        where m.workspace_id = r.workspace_id and m.user_id = p_auth_user_id
      ) then
        raise exception 'Esiste già una membership per questo utente nel workspace: richiesta da verificare.';
      end if;

      insert into public.nextway_workspace_memberships
        (workspace_id, user_id, workspace_role, membership_status, invited_by)
      values
        (r.workspace_id, p_auth_user_id, 'workspace_member', 'invited', r.owner_profile_id);
    end if;

  elsif r.conversion_type = 'customer' then
    if p_auth_user_id is not null then
      raise exception 'Un cliente non deve avere un account Auth NEXTWAY.';
    end if;

    insert into public.clients
      (partner_profile_id, first_name, last_name, email, phone, source, status,
       nextway_conversion_request_id)
    values
      (r.owner_profile_id, v_first, v_last, r.email, r.phone,
       'NEXTWAY CRM', 'potential', r.id)
    returning id into v_client_id;

    if r.workspace_id is not null then
      insert into public.nextway_client_workspace_attributions
        (client_id, workspace_id, conversion_request_id, owner_profile_id)
      values (v_client_id, r.workspace_id, r.id, r.owner_profile_id);
    end if;
  else
    raise exception 'Tipo conversione non supportato.';
  end if;

  update public.nextway_lead_conversion_requests
  set status = 'activated',
      activation_user_id = p_auth_user_id,
      activated_at = now(),
      activation_claim_token = null,
      activation_claimed_at = null
  where id = r.id;

  return jsonb_build_object(
    'success', true,
    'already_activated', false,
    'request_id', r.id,
    'conversion_type', r.conversion_type,
    'activation_user_id', p_auth_user_id,
    'client_id', v_client_id,
    'lead_id', v_lead_id,
    'workspace_id', r.workspace_id
  );
end;
$function$;

revoke all on function public.nextway_finalize_conversion_activation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.nextway_finalize_conversion_activation(uuid, uuid, uuid)
  to service_role;

comment on table public.nextway_client_workspace_attributions is
  'Attribuzione controllata cliente-workspace. Nessun accesso diretto: lettura tramite nextway_list_workspace_clients.';
comment on function public.nextway_list_workspace_clients(uuid) is
  'Elenca una proiezione limitata dei clienti attribuiti al workspace per membership active non-viewer.';
comment on function public.nextway_finalize_conversion_activation(uuid, uuid, uuid) is
  'Finalizza in modo atomico Lead, cliente/partner, membership invited o attribuzione cliente, e richiesta; non sovrascrive profili incompatibili.';

commit;
