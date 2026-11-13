-- NEXTWAY: annullamento amministrativo sicuro delle richieste di conversione.
-- Solo preparazione su branch: NON applicare al database reale senza staging e autorizzazione.
begin;

alter table public.nextway_lead_conversion_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid
    references public.profiles(id) on delete restrict,
  add column if not exists cancellation_reason text;

alter table public.nextway_lead_conversion_requests
  drop constraint if exists nextway_lead_conversion_requests_status_check;
alter table public.nextway_lead_conversion_requests
  add constraint nextway_lead_conversion_requests_status_check
  check (status in (
    'pending',
    'ready_for_activation',
    'provisioning',
    'rejected',
    'activated',
    'cancelled'
  ));

alter table public.nextway_lead_conversion_requests
  drop constraint if exists nextway_conversion_review_state_check;
alter table public.nextway_lead_conversion_requests
  add constraint nextway_conversion_review_state_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (
      status = 'cancelled'
      and (
        (reviewed_by is null and reviewed_at is null)
        or (reviewed_by is not null and reviewed_at is not null)
      )
    )
    or (
      status not in ('pending','cancelled')
      and reviewed_by is not null
      and reviewed_at is not null
    )
  );

alter table public.nextway_lead_conversion_requests
  drop constraint if exists nextway_conversion_cancellation_state_check;
alter table public.nextway_lead_conversion_requests
  add constraint nextway_conversion_cancellation_state_check check (
    (
      status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
      and cancellation_reason is not null
      and char_length(btrim(cancellation_reason)) between 1 and 1000
    )
    or (
      status <> 'cancelled'
      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
  );

-- La guard mantiene tutte le transizioni già ammesse e aggiunge un unico
-- percorso di cancellazione: platform_admin autenticato tramite RPC.
create or replace function public.nextway_guard_conversion_request_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_cancel_actor boolean := auth.uid() is not null
    and coalesce(public.nextway_is_platform_admin(), false);
begin
  if new.status = 'cancelled' then
    if old.status not in ('pending','ready_for_activation','provisioning')
       or not v_cancel_actor
       or new.cancelled_by is distinct from auth.uid()
       or new.cancelled_at is null
       or new.cancelled_at > now() + interval '1 minute'
       or new.cancellation_reason is null
       or char_length(btrim(new.cancellation_reason)) not between 1 and 1000 then
      raise exception 'Annullamento conversione non autorizzato o non valido.';
    end if;

    if new.activation_claim_token is not null
       or new.activation_claimed_at is not null
       or new.activation_user_id is not null
       or new.activated_at is not null then
      raise exception 'Una richiesta annullata non può mantenere dati di attivazione.';
    end if;

    if new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.review_notes is distinct from old.review_notes then
      raise exception 'L’annullamento non può modificare i dati della revisione.';
    end if;

    if old.cancelled_at is not null
       or old.cancelled_by is not null
       or old.cancellation_reason is not null then
      raise exception 'I metadati di annullamento sono immutabili.';
    end if;
  else
    if new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancellation_reason is distinct from old.cancellation_reason then
      raise exception 'I metadati di annullamento non possono essere modificati.';
    end if;

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
      if not v_service then
        raise exception 'Rilascio provisioning non autorizzato.';
      end if;
    elsif old.status = 'provisioning' and new.status = 'activated' then
      if not v_service or new.activation_claim_token is not null
         or new.activated_at is null then
        raise exception 'Finalizzazione provisioning non autorizzata.';
      end if;
    else
      raise exception 'Transizione di stato conversione non consentita.';
    end if;

    if old.status <> 'pending' and (
      new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_notes is distinct from old.review_notes
    ) then
      raise exception 'I dati della revisione sono immutabili dopo l’approvazione.';
    end if;
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
    or new.workspace_id is distinct from old.workspace_id
    or new.created_at is distinct from old.created_at then
    raise exception 'I dati originari della richiesta non possono essere modificati.';
  end if;

  return new;
end;
$function$;

revoke all on function public.nextway_guard_conversion_request_review()
  from public, anon, authenticated;

create or replace function public.nextway_cancel_conversion_activation(
  p_request_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  r public.nextway_lead_conversion_requests%rowtype;
  v_cancelled_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta.';
  end if;
  if not coalesce(public.nextway_is_platform_admin(), false) then
    raise exception 'Operazione riservata al platform_admin.';
  end if;
  if p_request_id is null then
    raise exception 'Identificativo richiesta mancante.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Il motivo dell’annullamento è obbligatorio (massimo 1.000 caratteri).';
  end if;

  -- Stesso lock usato dal claim e dal finalizer: vince una sola transizione.
  select * into r
  from public.nextway_lead_conversion_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Richiesta conversione non trovata.';
  end if;

  if r.status = 'cancelled' then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'request_id', r.id,
      'status', r.status,
      'cancelled_at', r.cancelled_at
    );
  end if;

  if r.status = 'activated' then
    raise exception 'La conversione è già attiva: utilizzare il processo di offboarding.';
  end if;
  if r.status = 'rejected' then
    raise exception 'La richiesta è già stata rifiutata e non può essere annullata.';
  end if;
  if r.status not in ('pending','ready_for_activation','provisioning') then
    raise exception 'Stato richiesta non annullabile.';
  end if;

  v_cancelled_at := clock_timestamp();

  update public.nextway_lead_conversion_requests
  set status = 'cancelled',
      activation_claim_token = null,
      activation_claimed_at = null,
      activation_user_id = null,
      activated_at = null,
      cancelled_at = v_cancelled_at,
      cancelled_by = v_actor,
      cancellation_reason = btrim(p_reason)
  where id = r.id;

  return jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'request_id', r.id,
    'status', 'cancelled',
    'cancelled_at', v_cancelled_at
  );
end;
$function$;

revoke all on function public.nextway_cancel_conversion_activation(uuid,text)
  from public, anon, service_role;
grant execute on function public.nextway_cancel_conversion_activation(uuid,text)
  to authenticated;

comment on column public.nextway_lead_conversion_requests.cancelled_at is
  'Data/ora dell’annullamento amministrativo della richiesta.';
comment on column public.nextway_lead_conversion_requests.cancelled_by is
  'Profilo platform_admin che ha annullato la richiesta.';
comment on column public.nextway_lead_conversion_requests.cancellation_reason is
  'Motivazione obbligatoria dell’annullamento amministrativo.';
comment on function public.nextway_cancel_conversion_activation(uuid,text) is
  'Annulla una richiesta non finalizzata, invalida il claim e serializza l’operazione con il finalizer tramite lock della richiesta.';

commit;
