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
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
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

comment on table public.nextway_lead_conversion_requests is
  'Richieste di conversione CRM. Non crea account Auth, profiles, partner_details o clients; la futura attivazione richiede un processo server-side separato.';
