-- NEXTWAY: snapshot immutabile del workspace sulle richieste di conversione.
-- La richiesta viene creata dal database: workspace e owner non sono fidati dal browser.
-- Migrazione preparatoria sul branch; NON applicare senza autorizzazione esplicita.

begin;

alter table public.nextway_lead_conversion_requests
  add column if not exists workspace_id uuid
  references public.nextway_workspaces(id) on delete restrict;

create index if not exists nextway_conversion_workspace_created_idx
  on public.nextway_lead_conversion_requests (workspace_id, created_at desc);

create or replace function public.nextway_create_lead_conversion_request(
  p_lead_id uuid,
  p_conversion_type text,
  p_full_name text,
  p_email text,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_lead public.nextway_leads%rowtype;
  v_request_id uuid;
  v_is_admin boolean;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta.';
  end if;

  if p_conversion_type is null or p_conversion_type not in ('customer', 'partner') then
    raise exception 'Tipo di conversione non valido.';
  end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 160 then
    raise exception 'Nome non valido.';
  end if;
  if p_email is null or char_length(btrim(p_email)) not between 5 and 254
     or position('@' in p_email) <= 1 then
    raise exception 'Email non valida.';
  end if;
  if p_phone is not null and char_length(p_phone) > 40 then
    raise exception 'Telefono non valido.';
  end if;

  v_is_admin := public.nextway_is_platform_admin();

  select l.* into v_lead
  from public.nextway_leads l
  where l.id = p_lead_id
  for update;

  if not found or v_lead.archived_at is not null
     or v_lead.status <> 'In valutazione' then
    raise exception 'Lead non disponibile per la conversione.';
  end if;

  if v_lead.workspace_id is null then
    if v_lead.owner_profile_id <> v_actor and not v_is_admin then
      raise exception 'Non autorizzato a proporre la conversione di questo Lead.';
    end if;
  else
    if not v_is_admin and not public.nextway_has_workspace_access(
      v_lead.workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    ) then
      raise exception 'Membership attiva non autorizzata per questo workspace.';
    end if;
    if not exists (
      select 1 from public.nextway_workspaces w
      where w.id = v_lead.workspace_id and w.status = 'active'
    ) then
      raise exception 'Workspace non attivo.';
    end if;
  end if;

  -- Serializza le richieste concorrenti con la stessa email e include lo stato
  -- provisioning, che gli indici legacy pending/ready non coprono.
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)), 0));

  if exists (
    select 1 from public.nextway_lead_conversion_requests q
    where q.lead_id = v_lead.id
      and q.status in ('pending','ready_for_activation','provisioning')
  ) then
    raise exception 'Esiste già una richiesta attiva per questo Lead.';
  end if;

  if exists (
    select 1 from public.nextway_lead_conversion_requests q
    where lower(btrim(q.email)) = lower(btrim(p_email))
      and q.status in ('pending','ready_for_activation','provisioning')
  ) then
    raise exception 'Esiste già una richiesta attiva per questo indirizzo email.';
  end if;

  insert into public.nextway_lead_conversion_requests (
    lead_id, owner_profile_id, sponsor_profile_id, created_by,
    conversion_type, full_name, email, phone, workspace_id
  ) values (
    v_lead.id, v_lead.owner_profile_id, v_lead.owner_profile_id, v_actor,
    p_conversion_type, btrim(p_full_name), lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''), v_lead.workspace_id
  )
  returning id into v_request_id;

  return v_request_id;
end;
$function$;

-- Impedisce INSERT diretti: tutte le nuove richieste passano dalla RPC che calcola lo snapshot.
revoke insert on table public.nextway_lead_conversion_requests from authenticated;
revoke all on function public.nextway_create_lead_conversion_request(uuid,text,text,text,text)
  from public, anon;
grant execute on function public.nextway_create_lead_conversion_request(uuid,text,text,text,text)
  to authenticated, service_role;

create or replace function public.nextway_guard_conversion_request_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
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
    or new.workspace_id is distinct from old.workspace_id
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
$function$;

revoke all on function public.nextway_guard_conversion_request_review()
  from public, anon, authenticated;

comment on column public.nextway_lead_conversion_requests.workspace_id is
  'Snapshot immutabile del workspace del Lead al momento della richiesta; NULL conserva il percorso legacy centrale.';
comment on function public.nextway_create_lead_conversion_request(uuid,text,text,text,text) is
  'Crea una richiesta conversione derivando owner e workspace dal Lead bloccato; non accetta workspace dal client.';

commit;
