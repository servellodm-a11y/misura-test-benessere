-- NEXTWAY CRM: applicazione controllata delle migrazioni 008-014.
-- Eseguire nel SQL Editor del progetto Supabase corretto.
-- Il blocco iniziale verifica le dipendenze e interrompe la transazione se mancano.
-- Script transazionale e ri-eseguibile: non elimina Lead né record cliente/partner.
begin;

do $$
begin
  if to_regclass('public.nextway_leads') is null then
    raise exception 'Prerequisito mancante: public.nextway_leads';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Prerequisito mancante: public.profiles';
  end if;
  if to_regprocedure('public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)') is null then
    raise exception 'Prerequisito mancante: RPC nextway_create_lead_with_conversation con sette parametri text';
  end if;
end;
$$;



-- ===== INIZIO supabase/migrations/20261110000800_nextway_leads_soft_archive.sql =====

-- NEXTWAY Lead lifecycle: archiviazione logica senza cancellazione fisica.
-- La proprietà resta owner_profile_id; le policy RLS esistenti continuano a
-- limitare partner ai propri record e platform_admin a tutti i record.

alter table public.nextway_leads
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.nextway_leads
  drop constraint if exists nextway_leads_archive_state_check;

alter table public.nextway_leads
  add constraint nextway_leads_archive_state_check
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or archived_at is not null
  );

create index if not exists nextway_leads_owner_active_created_idx
  on public.nextway_leads (owner_profile_id, created_at desc)
  where archived_at is null;

create index if not exists nextway_leads_owner_archived_created_idx
  on public.nextway_leads (owner_profile_id, archived_at desc)
  where archived_at is not null;

create or replace function public.nextway_set_lead_archive_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    if new.archived_at is null then
      new.archived_by := null;
      new.archive_reason := null;
    else
      if auth.uid() is null then
        raise exception 'Autenticazione richiesta per archiviare o ripristinare un Lead'
          using errcode = '28000';
      end if;
      new.archived_at := coalesce(new.archived_at, clock_timestamp());
      new.archived_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nextway_leads_archive_metadata on public.nextway_leads;

create trigger nextway_leads_archive_metadata
before update of archived_at on public.nextway_leads
for each row
execute function public.nextway_set_lead_archive_metadata();

revoke all on function public.nextway_set_lead_archive_metadata() from public, anon, authenticated;

comment on column public.nextway_leads.archived_at is
  'Timestamp archiviazione logica; NULL indica Lead attivo.';
comment on column public.nextway_leads.archived_by is
  'Profilo autenticato che ha eseguito l ultima archiviazione.';
comment on column public.nextway_leads.archive_reason is
  'Motivo facoltativo dell archiviazione, senza dati sensibili non necessari.';


-- ===== FINE supabase/migrations/20261110000800_nextway_leads_soft_archive.sql =====


-- ===== INIZIO supabase/migrations/20261110000900_nextway_lead_audit_trail.sql =====

-- NEXTWAY: audit trail immutabile per il ciclo di vita dei Lead.
-- Conserva una traccia anche dopo la cancellazione del Lead: lead_id non ha FK.
-- L'accesso in lettura è limitato al proprietario storico e a platform_admin.

create table if not exists public.nextway_lead_audit_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  lead_owner_profile_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_fields text[] not null default '{}',
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists nextway_lead_audit_logs_lead_created_idx
  on public.nextway_lead_audit_logs (lead_id, created_at desc);
create index if not exists nextway_lead_audit_logs_owner_created_idx
  on public.nextway_lead_audit_logs (lead_owner_profile_id, created_at desc);

alter table public.nextway_lead_audit_logs enable row level security;

drop policy if exists nextway_lead_audit_logs_select_owner_or_admin
  on public.nextway_lead_audit_logs;
create policy nextway_lead_audit_logs_select_owner_or_admin
  on public.nextway_lead_audit_logs
  for select to authenticated
  using (
    lead_owner_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'platform_admin'
    )
  );

revoke all on table public.nextway_lead_audit_logs from public, anon, authenticated;
grant select on table public.nextway_lead_audit_logs to authenticated;

create or replace function public.nextway_capture_lead_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_owner uuid;
  v_action text;
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_owner := new.owner_profile_id;
    v_action := 'INSERT';
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_after) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (new.id, v_owner, auth.uid(), v_action, v_fields, null, v_after);
    return new;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_owner := old.owner_profile_id;
    select coalesce(array_agg(n.key order by n.key), '{}'::text[])
      into v_fields
      from jsonb_each(v_after) n
      where n.key <> 'updated_at'
        and v_before -> n.key is distinct from n.value;
    if cardinality(v_fields) > 0 then
      insert into public.nextway_lead_audit_logs
        (lead_id, lead_owner_profile_id, actor_profile_id, action,
         changed_fields, before_data, after_data)
      values
        (new.id, v_owner, auth.uid(), 'UPDATE', v_fields, v_before, v_after);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_owner := old.owner_profile_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_before) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (old.id, v_owner, auth.uid(), 'DELETE', v_fields, v_before, null);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.nextway_capture_lead_audit() from public, anon, authenticated;

drop trigger if exists nextway_leads_audit_trail on public.nextway_leads;
create trigger nextway_leads_audit_trail
  after insert or update or delete on public.nextway_leads
  for each row execute function public.nextway_capture_lead_audit();

comment on table public.nextway_lead_audit_logs is
  'Registro cronologico delle modifiche Lead. Scrittura esclusiva tramite trigger; lettura RLS proprietario storico o platform_admin.';
comment on column public.nextway_lead_audit_logs.before_data is
  'Snapshot precedente della riga Lead; accessibile solo tramite RLS.';
comment on column public.nextway_lead_audit_logs.after_data is
  'Snapshot successivo della riga Lead; accessibile solo tramite RLS.';


-- ===== FINE supabase/migrations/20261110000900_nextway_lead_audit_trail.sql =====


-- ===== INIZIO supabase/migrations/20261110001000_nextway_audit_data_minimization.sql =====

-- NEXTWAY: minimizzazione dei dati personali nel registro audit.
-- Da applicare dopo 20261110000900_nextway_lead_audit_trail.sql.
-- I valori di notes e public_evidence non vengono più copiati negli snapshot.
-- I nomi dei campi restano in changed_fields per mantenere la tracciabilità.
-- Gli eventi storici già scritti non vengono modificati.

create or replace function public.nextway_capture_lead_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before_full jsonb;
  v_after_full jsonb;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_owner uuid;
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    v_after_full := to_jsonb(new);
    v_after_snapshot := v_after_full - 'notes' - 'public_evidence';
    v_owner := new.owner_profile_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_after_full) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (new.id, v_owner, auth.uid(), 'INSERT', v_fields, null, v_after_snapshot);
    return new;
  elsif tg_op = 'UPDATE' then
    v_before_full := to_jsonb(old);
    v_after_full := to_jsonb(new);
    v_before_snapshot := v_before_full - 'notes' - 'public_evidence';
    v_after_snapshot := v_after_full - 'notes' - 'public_evidence';
    v_owner := old.owner_profile_id;
    select coalesce(array_agg(n.key order by n.key), '{}'::text[])
      into v_fields
      from jsonb_each(v_after_full) n
      where n.key <> 'updated_at'
        and v_before_full -> n.key is distinct from n.value;
    if cardinality(v_fields) > 0 then
      insert into public.nextway_lead_audit_logs
        (lead_id, lead_owner_profile_id, actor_profile_id, action,
         changed_fields, before_data, after_data)
      values
        (new.id, v_owner, auth.uid(), 'UPDATE', v_fields,
         v_before_snapshot, v_after_snapshot);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    v_before_full := to_jsonb(old);
    v_before_snapshot := v_before_full - 'notes' - 'public_evidence';
    v_owner := old.owner_profile_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_before_full) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (old.id, v_owner, auth.uid(), 'DELETE', v_fields,
       v_before_snapshot, null);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.nextway_capture_lead_audit() from public, anon, authenticated;

comment on function public.nextway_capture_lead_audit() is
  'Audit Lead con snapshot minimizzati: notes e public_evidence esclusi dai nuovi eventi.';


-- ===== FINE supabase/migrations/20261110001000_nextway_audit_data_minimization.sql =====


-- ===== INIZIO supabase/migrations/20261110001100_nextway_lead_creation_idempotency.sql =====

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
as $$
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


-- ===== FINE supabase/migrations/20261110001100_nextway_lead_creation_idempotency.sql =====


-- ===== INIZIO supabase/migrations/20261110001200_nextway_lead_activities.sql =====

-- NEXTWAY CRM: registro delle interazioni e delle prossime azioni sui Lead.
-- Le attività sono collegate al Lead cloud e protette dalle stesse regole di proprietà.
-- Nessun deploy o applicazione automatica: eseguire solo dopo revisione nel progetto Supabase corretto.

create table if not exists public.nextway_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.nextway_leads(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  activity_type text not null check (activity_type in ('call','message','email','meeting','note','task')),
  subject text not null check (char_length(btrim(subject)) between 1 and 180),
  details text check (details is null or char_length(details) <= 4000),
  occurred_at timestamptz not null default now(),
  next_action_at timestamptz,
  next_action_status text not null default 'open'
    check (next_action_status in ('open','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nextway_lead_activities_next_action_check
    check (next_action_at is not null or next_action_status = 'open')
);

create index if not exists nextway_lead_activities_lead_created_idx
  on public.nextway_lead_activities (lead_id, occurred_at desc, id);
create index if not exists nextway_lead_activities_owner_next_action_idx
  on public.nextway_lead_activities (owner_profile_id, next_action_at)
  where next_action_at is not null and next_action_status = 'open';

create or replace function public.nextway_set_lead_activity_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nextway_lead_activities_updated_at
  on public.nextway_lead_activities;
create trigger nextway_lead_activities_updated_at
before update on public.nextway_lead_activities
for each row execute function public.nextway_set_lead_activity_updated_at();

alter table public.nextway_lead_activities enable row level security;

drop policy if exists nextway_lead_activities_select_owner_or_admin
  on public.nextway_lead_activities;
create policy nextway_lead_activities_select_owner_or_admin
on public.nextway_lead_activities for select to authenticated
using (
  exists (
    select 1 from public.nextway_leads l
    where l.id = lead_id
      and l.owner_profile_id = nextway_lead_activities.owner_profile_id
      and (
        l.owner_profile_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
      )
  )
);

drop policy if exists nextway_lead_activities_insert_owner_or_admin
  on public.nextway_lead_activities;
create policy nextway_lead_activities_insert_owner_or_admin
on public.nextway_lead_activities for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.nextway_leads l
    where l.id = lead_id
      and l.owner_profile_id = nextway_lead_activities.owner_profile_id
      and (
        l.owner_profile_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
      )
  )
);

drop policy if exists nextway_lead_activities_update_owner_or_admin
  on public.nextway_lead_activities;
create policy nextway_lead_activities_update_owner_or_admin
on public.nextway_lead_activities for update to authenticated
using (
  exists (
    select 1 from public.nextway_leads l
    where l.id = lead_id
      and l.owner_profile_id = nextway_lead_activities.owner_profile_id
      and (
        l.owner_profile_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
      )
  )
)
with check (
  exists (
    select 1 from public.nextway_leads l
    where l.id = lead_id
      and l.owner_profile_id = nextway_lead_activities.owner_profile_id
      and (
        l.owner_profile_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
      )
  )
);

revoke all on table public.nextway_lead_activities from public, anon, authenticated;
grant select, insert on table public.nextway_lead_activities to authenticated;
grant update (next_action_status) on table public.nextway_lead_activities to authenticated;
revoke all on function public.nextway_set_lead_activity_updated_at() from public, anon, authenticated;

comment on table public.nextway_lead_activities is
  'Registro CRM delle interazioni e delle prossime azioni. Accesso limitato al proprietario del Lead e a platform_admin; niente cancellazione client.';


-- ===== FINE supabase/migrations/20261110001200_nextway_lead_activities.sql =====


-- ===== INIZIO supabase/migrations/20261110001300_nextway_lead_lifecycle.sql =====

-- NEXTWAY CRM: estensione controllata delle fasi del ciclo commerciale Lead.
-- I valori esistenti restano validi; nessun record viene convertito o cancellato.
-- Applicare manualmente solo dopo verifica del progetto Supabase corretto.

alter table public.nextway_leads
  drop constraint if exists nextway_leads_status_check;

alter table public.nextway_leads
  add constraint nextway_leads_status_check
  check (status in (
    'Da verificare',
    'Verificato',
    'Contattato',
    'In follow-up',
    'In valutazione',
    'Convertito cliente',
    'Convertito partner',
    'Non interessato',
    'Escluso'
  ));

comment on column public.nextway_leads.status is
  'Fase operativa CRM: verifica, contatto, follow-up, valutazione, conversione o chiusura. La conversione è uno stato CRM e non crea automaticamente un record cliente o partner.';


-- ===== FINE supabase/migrations/20261110001300_nextway_lead_lifecycle.sql =====


-- ===== INIZIO supabase/migrations/20261110001400_nextway_lead_conversion_requests.sql =====

-- NEXTWAY CRM: richieste di conversione assistita Lead -> cliente/partner.
-- Questa tabella NON crea account Auth, profili o record clients/partner_details.
-- La richiesta viene verificata da platform_admin prima della futura attivazione.

create table if not exists public.nextway_lead_conversion_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.nextway_leads(id) on delete restrict,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  sponsor_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  conversion_type text not null check (conversion_type in ('customer','partner')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text not null check (char_length(btrim(email)) between 5 and 254 and position('@' in email) > 1),
  phone text check (phone is null or char_length(phone) <= 40),
  status text not null default 'pending'
    check (status in ('pending','ready_for_activation','rejected')),
  review_notes text check (review_notes is null or char_length(review_notes) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nextway_conversion_review_state_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint nextway_conversion_sponsor_owner_check check (sponsor_profile_id = owner_profile_id)
);

create unique index if not exists nextway_conversion_active_lead_unique
  on public.nextway_lead_conversion_requests (lead_id)
  where status in ('pending','ready_for_activation');
create unique index if not exists nextway_conversion_active_email_unique
  on public.nextway_lead_conversion_requests (lower(btrim(email)))
  where status in ('pending','ready_for_activation');
create index if not exists nextway_conversion_owner_created_idx
  on public.nextway_lead_conversion_requests (owner_profile_id, created_at desc);
create index if not exists nextway_conversion_status_created_idx
  on public.nextway_lead_conversion_requests (status, created_at asc);

create or replace function public.nextway_set_conversion_request_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nextway_conversion_requests_updated_at
  on public.nextway_lead_conversion_requests;
create trigger nextway_conversion_requests_updated_at
before update on public.nextway_lead_conversion_requests
for each row execute function public.nextway_set_conversion_request_updated_at();

alter table public.nextway_lead_conversion_requests enable row level security;

drop policy if exists nextway_conversion_select_owner_or_admin
  on public.nextway_lead_conversion_requests;
create policy nextway_conversion_select_owner_or_admin
on public.nextway_lead_conversion_requests for select to authenticated
using (
  owner_profile_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
);

drop policy if exists nextway_conversion_insert_owner_or_admin
  on public.nextway_lead_conversion_requests;
create policy nextway_conversion_insert_owner_or_admin
on public.nextway_lead_conversion_requests for insert to authenticated
with check (
  created_by = auth.uid()
  and sponsor_profile_id = owner_profile_id
  and exists (
    select 1 from public.nextway_leads l
    where l.id = lead_id
      and l.owner_profile_id = nextway_lead_conversion_requests.owner_profile_id
      and l.archived_at is null
      and l.status = 'In valutazione'
      and (
        l.owner_profile_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
      )
  )
);

drop policy if exists nextway_conversion_update_admin
  on public.nextway_lead_conversion_requests;
create policy nextway_conversion_update_admin
on public.nextway_lead_conversion_requests for update to authenticated
using (
  status = 'pending'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  and reviewed_by = auth.uid()
  and status in ('ready_for_activation','rejected')
  and reviewed_at is not null
);

revoke all on table public.nextway_lead_conversion_requests from public, anon, authenticated;
grant select, insert on table public.nextway_lead_conversion_requests to authenticated;
grant update (status, review_notes, reviewed_by, reviewed_at) on table public.nextway_lead_conversion_requests to authenticated;
revoke all on function public.nextway_set_conversion_request_updated_at() from public, anon, authenticated;
 
-- Una richiesta può essere revisionata una sola volta; i dati di origine sono immutabili.
create or replace function public.nextway_guard_conversion_request_review()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status <> 'pending' then
    raise exception 'La richiesta conversione è già stata revisionata.';
  end if;
  if auth.uid() is null or new.reviewed_by is distinct from auth.uid() then
    raise exception 'Revisore non valido.';
  end if;
  if new.status not in ('ready_for_activation','rejected') or new.reviewed_at is null then
    raise exception 'Esito di revisione non valido.';
  end if;
  if new.status = 'rejected' and nullif(btrim(new.review_notes), '') is null then
    raise exception 'La motivazione del rifiuto è obbligatoria.';
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
  return new;
end;
$$;

drop trigger if exists nextway_conversion_review_guard
  on public.nextway_lead_conversion_requests;
create trigger nextway_conversion_review_guard
before update on public.nextway_lead_conversion_requests
for each row execute function public.nextway_guard_conversion_request_review();

revoke all on function public.nextway_guard_conversion_request_review() from public, anon, authenticated;


comment on table public.nextway_lead_conversion_requests is
  'Richieste di conversione CRM. Non crea account Auth, profiles, partner_details o clients; la futura attivazione richiede un processo server-side separato.';


-- ===== FINE supabase/migrations/20261110001400_nextway_lead_conversion_requests.sql =====

-- Verifica strutturale finale minima prima del commit.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='nextway_leads' and column_name='archived_at') then
    raise exception 'Migrazione archiviazione non completata';
  end if;
  if to_regclass('public.nextway_lead_audit_logs') is null then
    raise exception 'Tabella audit Lead non creata';
  end if;
  if to_regclass('public.nextway_lead_creation_requests') is null then
    raise exception 'Tabella idempotenza creazione Lead non creata';
  end if;
  if to_regclass('public.nextway_lead_activities') is null then
    raise exception 'Tabella attività Lead non creata';
  end if;
  if to_regclass('public.nextway_lead_conversion_requests') is null then
    raise exception 'Tabella richieste conversione non creata';
  end if;
end;
$$;

commit;
