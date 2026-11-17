-- NEXTWAY: rende atomica la conversione Lead -> cliente/partner.
-- La riga Lead viene bloccata e verificata prima di creare il record di destinazione.
-- Se il Lead non è più convertibile, l'intera transazione viene annullata.
begin;

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
    return jsonb_build_object(
      'success', true,
      'already_activated', true,
      'request_id', r.id,
      'activation_user_id', r.activation_user_id
    );
  end if;

  if r.status <> 'provisioning'
    or r.activation_claim_token is distinct from p_claim_token then
    raise exception 'Claim provisioning non valido o scaduto.';
  end if;

  -- Lock pessimista: serializza la finalizzazione con archiviazione e cambi di stato Lead.
  select l.id into v_lead_id
  from public.nextway_leads l
  where l.id = r.lead_id
    and l.owner_profile_id = r.owner_profile_id
    and l.status = 'In valutazione'
    and l.archived_at is null
  for update;

  if not found then
    raise exception 'Il Lead non è più disponibile per la conversione.';
  end if;

  -- Verifica nuovamente la transizione e richiede una riga effettivamente aggiornata.
  update public.nextway_leads
  set status = case
    when r.conversion_type = 'partner' then 'Convertito partner'
    else 'Convertito cliente'
  end
  where id = r.lead_id
    and owner_profile_id = r.owner_profile_id
    and status = 'In valutazione'
    and archived_at is null
  returning id into v_lead_id;

  if v_lead_id is null then
    raise exception 'Impossibile aggiornare lo stato del Lead: conversione annullata.';
  end if;

  v_first := split_part(btrim(r.full_name), ' ', 1);
  v_last := nullif(btrim(substr(btrim(r.full_name), length(v_first) + 1)), '');

  if r.conversion_type = 'partner' then
    if p_auth_user_id is null or not exists (
      select 1
      from auth.users u
      where u.id = p_auth_user_id
        and lower(u.email) = lower(r.email)
    ) then
      raise exception 'Account Auth invitato non trovato o email non corrispondente.';
    end if;

    insert into public.profiles (id, email, full_name, role, sponsor_id)
    values (p_auth_user_id, r.email, r.full_name, 'partner', r.sponsor_profile_id)
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          role = 'partner',
          sponsor_id = excluded.sponsor_id,
          updated_at = now();

    insert into public.partner_details
      (profile_id, first_name, last_name, phone, language,
       sponsor_profile_id, team_side, status, nextway_conversion_request_id)
    values
      (p_auth_user_id, v_first, v_last, r.phone, 'it',
       r.sponsor_profile_id, null, 'active', r.id)
    on conflict (profile_id) do update
      set first_name = excluded.first_name,
          last_name = excluded.last_name,
          phone = excluded.phone,
          sponsor_profile_id = excluded.sponsor_profile_id,
          status = 'active',
          nextway_conversion_request_id = coalesce(
            public.partner_details.nextway_conversion_request_id,
            excluded.nextway_conversion_request_id
          );

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
    on conflict (nextway_conversion_request_id)
      where nextway_conversion_request_id is not null
    do update set updated_at = now()
    returning id into v_client_id;
  else
    raise exception 'Tipo conversione non supportato.';
  end if;

  update public.nextway_lead_conversion_requests
  set status = 'activated',
      activation_user_id = p_auth_user_id,
      activated_at = now(),
      activation_claim_token = null
  where id = r.id;

  return jsonb_build_object(
    'success', true,
    'already_activated', false,
    'request_id', r.id,
    'conversion_type', r.conversion_type,
    'activation_user_id', p_auth_user_id,
    'client_id', v_client_id,
    'lead_id', v_lead_id
  );
end;
$$;

revoke all on function public.nextway_finalize_conversion_activation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.nextway_finalize_conversion_activation(uuid, uuid, uuid)
  to service_role;

comment on function public.nextway_finalize_conversion_activation(uuid, uuid, uuid) is
  'Finalizza la conversione in modo atomico: blocca e valida il Lead, aggiorna il suo stato e crea il record cliente/partner nella stessa transazione.';

commit;
