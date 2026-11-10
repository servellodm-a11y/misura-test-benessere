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
