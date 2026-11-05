-- NEXTWAY AI - schema iniziale Lead
-- Eseguire nel Supabase SQL Editor dopo aver verificato il progetto corretto.
-- Non modifica profiles, partner_details o clients esistenti.

create table if not exists public.nextway_leads (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  profession text,
  company_brand text,
  location text,
  category text not null check (category in ('potential_partner','final_customer','wellness_professional')),
  partner_type text,
  discovery_mode text,
  public_signal text,
  source_name text not null,
  source_url text not null,
  public_evidence text not null,
  verified_at date,
  identity_check text not null default 'pending' check (identity_check in ('pending','confirmed','uncertain')),
  qualification text not null default 'Da approfondire' check (qualification in ('Da approfondire','Qualificato','Escluso')),
  score_fit smallint not null default 0 check (score_fit between 0 and 30),
  score_activity smallint not null default 0 check (score_activity between 0 and 20),
  score_presence smallint not null default 0 check (score_presence between 0 and 15),
  score_interest smallint not null default 0 check (score_interest between 0 and 20),
  score_approach smallint not null default 0 check (score_approach between 0 and 15),
  status text not null default 'Da verificare' check (status in ('Da verificare','Verificato','Escluso','Contattato')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nextway_qualified_identity_check check (
    qualification <> 'Qualificato' or
    (identity_check = 'confirmed' and
     score_fit + score_activity + score_presence + score_interest + score_approach >= 50)
  )
);

create index if not exists nextway_leads_owner_created_idx
  on public.nextway_leads (owner_profile_id, created_at desc);
create index if not exists nextway_leads_owner_status_idx
  on public.nextway_leads (owner_profile_id, status);
create index if not exists nextway_leads_owner_score_idx
  on public.nextway_leads (
    owner_profile_id,
    (score_fit + score_activity + score_presence + score_interest + score_approach) desc
  );

create unique index if not exists nextway_leads_owner_source_url_uidx
  on public.nextway_leads (owner_profile_id, lower(btrim(source_url)));

create or replace function public.nextway_set_lead_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nextway_leads_updated_at on public.nextway_leads;
create trigger nextway_leads_updated_at
before update on public.nextway_leads
for each row execute function public.nextway_set_lead_updated_at();

alter table public.nextway_leads enable row level security;

drop policy if exists "nextway_leads_select_owner_or_admin" on public.nextway_leads;
create policy "nextway_leads_select_owner_or_admin"
on public.nextway_leads for select to authenticated
using (
  owner_profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  )
);

drop policy if exists "nextway_leads_insert_owner_or_admin" on public.nextway_leads;
create policy "nextway_leads_insert_owner_or_admin"
on public.nextway_leads for insert to authenticated
with check (
  owner_profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  )
);

drop policy if exists "nextway_leads_update_owner_or_admin" on public.nextway_leads;
create policy "nextway_leads_update_owner_or_admin"
on public.nextway_leads for update to authenticated
using (
  owner_profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  )
)
with check (
  owner_profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  )
);

drop policy if exists "nextway_leads_delete_owner_or_admin" on public.nextway_leads;
create policy "nextway_leads_delete_owner_or_admin"
on public.nextway_leads for delete to authenticated
using (
  owner_profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  )
);

-- Nota: non vengono aggiunti dati personali di contatto né accesso ai lead
-- degli altri partner. Il browser locale resta indipendente finché non si
-- implementa e testa il client Supabase nell'applicazione.
