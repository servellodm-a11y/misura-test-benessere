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
