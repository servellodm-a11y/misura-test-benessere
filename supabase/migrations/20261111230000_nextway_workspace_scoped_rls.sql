-- NEXTWAY workspace-scoped authorization for versioned operational tables.
-- Candidate only: do not apply until reviewed with the current Supabase schema.
-- Preserves legacy owner-based access for records with workspace_id IS NULL.
-- Workspace-assigned records require active membership; platform_admin retains central access.

begin;

do $$
declare
  v_table text;
  v_required text[] := array[
    'nextway_workspaces',
    'nextway_workspace_memberships',
    'nextway_leads',
    'nextway_lead_activities',
    'nextway_lead_conversion_requests',
    'nextway_lead_audit_logs',
    'nextway_knowledge_documents',
    'nextway_knowledge_chunks'
  ];
begin
  foreach v_table in array v_required loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Required NEXTWAY table public.% is missing; do not apply this migration.', v_table;
    end if;

    if not exists (
      select 1 from pg_class c
      where c.oid = to_regclass(format('public.%I', v_table))
        and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%; stop before applying workspace policies.', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nextway_leads'
      and column_name = 'workspace_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nextway_knowledge_documents'
      and column_name = 'workspace_id'
  ) then
    raise exception 'workspace_id association columns are missing; apply the data association migration first.';
  end if;

  if to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') is null then
    raise exception 'Workspace access helper is missing; apply the membership foundation first.';
  end if;
end;
$$;

-- The immutable Lead audit log must retain the workspace context after a Lead
-- is deleted. Existing historical rows stay NULL and remain owner/admin-readable.
alter table public.nextway_lead_audit_logs
  add column if not exists workspace_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nextway_lead_audit_logs'::regclass
      and conname = 'nextway_lead_audit_logs_workspace_id_fkey'
  ) then
    alter table public.nextway_lead_audit_logs
      add constraint nextway_lead_audit_logs_workspace_id_fkey
      foreign key (workspace_id)
      references public.nextway_workspaces(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists nextway_lead_audit_logs_workspace_created_idx
  on public.nextway_lead_audit_logs(workspace_id, created_at desc)
  where workspace_id is not null;

-- Keep audit data minimization: notes and public_evidence never enter snapshots.
-- For a workspace transfer, the event remains attached to the previous workspace
-- so the new workspace cannot inspect the previous workspace's before-state.
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
  v_workspace_id uuid;
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    v_after_full := to_jsonb(new);
    v_after_snapshot := v_after_full - 'notes' - 'public_evidence';
    v_owner := new.owner_profile_id;
    v_workspace_id := new.workspace_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_after_full) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, workspace_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (new.id, v_owner, v_workspace_id, auth.uid(), 'INSERT', v_fields, null, v_after_snapshot);
    return new;
  elsif tg_op = 'UPDATE' then
    v_before_full := to_jsonb(old);
    v_after_full := to_jsonb(new);
    v_before_snapshot := v_before_full - 'notes' - 'public_evidence';
    v_after_snapshot := v_after_full - 'notes' - 'public_evidence';
    v_owner := old.owner_profile_id;
    v_workspace_id := coalesce(old.workspace_id, new.workspace_id);
    select coalesce(array_agg(n.key order by n.key), '{}'::text[])
      into v_fields
      from jsonb_each(v_after_full) n
      where n.key <> 'updated_at'
        and v_before_full -> n.key is distinct from n.value;
    if cardinality(v_fields) > 0 then
      insert into public.nextway_lead_audit_logs
        (lead_id, lead_owner_profile_id, workspace_id, actor_profile_id, action,
         changed_fields, before_data, after_data)
      values
        (new.id, v_owner, v_workspace_id, auth.uid(), 'UPDATE', v_fields,
         v_before_snapshot, v_after_snapshot);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    v_before_full := to_jsonb(old);
    v_before_snapshot := v_before_full - 'notes' - 'public_evidence';
    v_owner := old.owner_profile_id;
    v_workspace_id := old.workspace_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_before_full) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, workspace_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (old.id, v_owner, v_workspace_id, auth.uid(), 'DELETE', v_fields,
       v_before_snapshot, null);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.nextway_capture_lead_audit() from public, anon, authenticated;

-- Non-admin users cannot detach or move an existing Lead between workspaces.
-- New assigned Leads require active membership; NULL remains a transitional
-- compatibility path until the Lead creation RPC accepts workspace_id.
create or replace function public.nextway_guard_lead_workspace_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or public.nextway_is_platform_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'Solo platform_admin può trasferire un Lead tra workspace.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
    and new.workspace_id is not null
    and not public.nextway_has_workspace_access(
      new.workspace_id,
      array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
    ) then
    raise exception 'Membership attiva nel workspace richiesta per creare il Lead.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.nextway_guard_lead_workspace_assignment() from public, anon, authenticated;

drop trigger if exists nextway_leads_workspace_assignment_guard on public.nextway_leads;
create trigger nextway_leads_workspace_assignment_guard
before insert or update of workspace_id on public.nextway_leads
for each row execute function public.nextway_guard_lead_workspace_assignment();

-- Leads: workspace members can read workspace Leads; existing owner/admin
-- policies continue to govern unassigned records and all write operations.
drop policy if exists nextway_leads_workspace_select on public.nextway_leads;
create policy nextway_leads_workspace_select
  on public.nextway_leads
  as permissive
  for select to authenticated
  using (
    workspace_id is not null
    and public.nextway_has_workspace_access(workspace_id)
  );

drop policy if exists nextway_leads_workspace_scope on public.nextway_leads;
create policy nextway_leads_workspace_scope
  on public.nextway_leads
  as restrictive
  for all to authenticated
  using (
    workspace_id is null
    or public.nextway_has_workspace_access(workspace_id)
  )
  with check (
    workspace_id is null
    or public.nextway_has_workspace_access(workspace_id)
  );

-- Activities and conversion requests inherit the workspace from their Lead.
drop policy if exists nextway_lead_activities_workspace_select on public.nextway_lead_activities;
create policy nextway_lead_activities_workspace_select
  on public.nextway_lead_activities
  as permissive
  for select to authenticated
  using (
    exists (
      select 1 from public.nextway_leads l
      where l.id = nextway_lead_activities.lead_id
        and l.workspace_id is not null
        and public.nextway_has_workspace_access(l.workspace_id)
    )
  );

drop policy if exists nextway_lead_activities_workspace_scope on public.nextway_lead_activities;
create policy nextway_lead_activities_workspace_scope
  on public.nextway_lead_activities
  as restrictive
  for all to authenticated
  using (
    exists (
      select 1 from public.nextway_leads l
      where l.id = nextway_lead_activities.lead_id
        and (l.workspace_id is null or public.nextway_has_workspace_access(l.workspace_id))
    )
  )
  with check (
    exists (
      select 1 from public.nextway_leads l
      where l.id = nextway_lead_activities.lead_id
        and (l.workspace_id is null or public.nextway_has_workspace_access(l.workspace_id))
    )
  );

drop policy if exists nextway_conversion_workspace_select on public.nextway_lead_conversion_requests;
create policy nextway_conversion_workspace_select
  on public.nextway_lead_conversion_requests
  as permissive
  for select to authenticated
  using (
    exists (
      select 1 from public.nextway_leads l
      where l.id = nextway_lead_conversion_requests.lead_id
        and l.workspace_id is not null
        and public.nextway_has_workspace_access(l.workspace_id)
    )
  );

drop policy if exists nextway_conversion_workspace_scope on public.nextway_lead_conversion_requests;
create policy nextway_conversion_workspace_scope
  on public.nextway_lead_conversion_requests
  as restrictive
  for all to authenticated
  using (
    exists (
      select 1 from public.nextway_leads l
      where l.id = nextway_lead_conversion_requests.lead_id
        and (l.workspace_id is null or public.nextway_has_workspace_access(l.workspace_id))
    )
  )
  with check (
    exists (
      select 1 from public.nextway_leads l
      where l.id = nextway_lead_conversion_requests.lead_id
        and (l.workspace_id is null or public.nextway_has_workspace_access(l.workspace_id))
    )
  );

-- Historical audit rows with NULL workspace_id remain governed by the original
-- owner/admin policy. New events carry the Lead workspace via the trigger above.
drop policy if exists nextway_lead_audit_logs_workspace_select on public.nextway_lead_audit_logs;
create policy nextway_lead_audit_logs_workspace_select
  on public.nextway_lead_audit_logs
  as permissive
  for select to authenticated
  using (
    workspace_id is not null
    and public.nextway_has_workspace_access(workspace_id)
  );

drop policy if exists nextway_lead_audit_logs_workspace_scope on public.nextway_lead_audit_logs;
create policy nextway_lead_audit_logs_workspace_scope
  on public.nextway_lead_audit_logs
  as restrictive
  for select to authenticated
  using (
    workspace_id is null
    or public.nextway_has_workspace_access(workspace_id)
  );

-- Knowledge Base: approved documents/chunks are visible only inside their
-- assigned workspace. Unassigned sources are central-admin-only until assigned.
drop policy if exists nextway_knowledge_documents_workspace_scope on public.nextway_knowledge_documents;
create policy nextway_knowledge_documents_workspace_scope
  on public.nextway_knowledge_documents
  as restrictive
  for all to authenticated
  using (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and public.nextway_has_workspace_access(workspace_id)
    )
  )
  with check (
    public.nextway_is_platform_admin()
    or (
      workspace_id is not null
      and public.nextway_has_workspace_access(workspace_id)
    )
  );

drop policy if exists nextway_knowledge_chunks_workspace_scope on public.nextway_knowledge_chunks;
create policy nextway_knowledge_chunks_workspace_scope
  on public.nextway_knowledge_chunks
  as restrictive
  for all to authenticated
  using (
    public.nextway_is_platform_admin()
    or exists (
      select 1
      from public.nextway_knowledge_documents d
      where d.id = nextway_knowledge_chunks.document_id
        and d.workspace_id is not null
        and public.nextway_has_workspace_access(d.workspace_id)
    )
  )
  with check (
    public.nextway_is_platform_admin()
    or exists (
      select 1
      from public.nextway_knowledge_documents d
      where d.id = nextway_knowledge_chunks.document_id
        and d.workspace_id is not null
        and public.nextway_has_workspace_access(d.workspace_id)
    )
  );

-- Disable the legacy cross-workspace search signature. It has no workspace
-- parameter and therefore must not remain callable by workspace members.
revoke all on function public.nextway_search_knowledge(text, text, text, integer)
  from public, anon, authenticated, service_role;

create or replace function public.nextway_search_knowledge(
  p_workspace_id uuid,
  p_query text,
  p_module_key text default 'zinzino',
  p_language_code text default 'it',
  p_limit integer default 5
)
returns table (
  document_id uuid,
  document_title text,
  module_key text,
  language_code text,
  version_label text,
  source_reference text,
  chunk_id uuid,
  chunk_index integer,
  content text,
  relevance real
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    d.id,
    d.title,
    d.module_key,
    d.language_code,
    d.version_label,
    d.source_reference,
    c.id,
    c.chunk_index,
    c.content,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('italian'::regconfig, p_query))::real
  from public.nextway_knowledge_chunks c
  join public.nextway_knowledge_documents d on d.id = c.document_id
  where auth.uid() is not null
    and p_workspace_id is not null
    and public.nextway_has_workspace_access(p_workspace_id)
    and nullif(btrim(p_query), '') is not null
    and d.workspace_id = p_workspace_id
    and d.approval_status = 'approved'
    and (d.valid_from is null or d.valid_from <= current_date)
    and (d.valid_until is null or d.valid_until >= current_date)
    and d.module_key = p_module_key
    and d.language_code = p_language_code
    and c.search_vector @@ websearch_to_tsquery('italian'::regconfig, p_query)
  order by ts_rank_cd(c.search_vector, websearch_to_tsquery('italian'::regconfig, p_query)) desc,
           d.title asc,
           c.chunk_index asc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.nextway_search_knowledge(uuid, text, text, text, integer)
  from public, anon, service_role;
grant execute on function public.nextway_search_knowledge(uuid, text, text, text, integer)
  to authenticated;

comment on function public.nextway_search_knowledge(uuid, text, text, text, integer) is
  'Ricerca full-text limitata a un workspace esplicito e a una membership attiva; non restituisce fonti globali/non assegnate.';

comment on function public.nextway_guard_lead_workspace_assignment() is
  'Impedisce agli utenti non platform_admin di trasferire o scollegare Lead da un workspace; richiede membership attiva per assegnare un nuovo Lead.';

commit;
