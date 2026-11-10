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
