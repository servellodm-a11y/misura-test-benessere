-- NEXTWAY AI Setter generation persistence and workspace authorization.
-- Candidate only. Depends on workspace association + membership foundations.
-- No application rows are created, backfilled, or modified by this migration.

begin;

do $$
begin
  if to_regclass('public.nextway_setter_conversations') is null
     or to_regclass('public.nextway_setter_messages') is null
     or to_regclass('public.nextway_leads') is null then
    raise exception 'AI Setter conversation, message, or Lead table is missing.';
  end if;

  if to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') is null
     or to_regprocedure('public.nextway_is_platform_admin()') is null then
    raise exception 'Workspace membership authorization helpers are missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_setter_conversations'
      and column_name='workspace_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_leads'
      and column_name='workspace_id'
  ) then
    raise exception 'Workspace association columns are missing; apply the association foundation first.';
  end if;

  if not exists (
    select 1 from pg_class
    where oid='public.nextway_setter_conversations'::regclass and relrowsecurity
  ) or not exists (
    select 1 from pg_class
    where oid='public.nextway_setter_messages'::regclass and relrowsecurity
  ) then
    raise exception 'RLS must be enabled on AI Setter conversations and messages.';
  end if;
end;
$$;

create table if not exists public.nextway_setter_generation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.nextway_setter_conversations(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null default 'generating'
    check (status in ('generating','completed')),
  generated_output jsonb,
  cached_response jsonb,
  claimed_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint nextway_setter_generation_output_object
    check (generated_output is null or jsonb_typeof(generated_output)='object'),
  constraint nextway_setter_generation_response_object
    check (cached_response is null or jsonb_typeof(cached_response)='object'),
  constraint nextway_setter_generation_completion_state
    check (
      (status='completed' and completed_at is not null and cached_response is not null)
      or (status='generating' and completed_at is null and cached_response is null)
    ),
  constraint nextway_setter_generation_idempotency_unique
    unique (owner_profile_id,idempotency_key)
);

create index if not exists nextway_setter_generation_conversation_idx
  on public.nextway_setter_generation_requests(conversation_id,created_at desc);

alter table public.nextway_setter_generation_requests enable row level security;
revoke all on public.nextway_setter_generation_requests from public, anon, authenticated;
grant all on public.nextway_setter_generation_requests to service_role;

comment on table public.nextway_setter_generation_requests is
  'Private idempotency and staged-output store for AI Setter. Workspace is inherited from conversation_id; client access is RPC-only.';

-- Atomic claim. A generating claim expires after two minutes; a retry can
-- reclaim it and reuse generated_output if OpenAI already returned a result.
create or replace function public.nextway_begin_setter_generation(
  p_conversation_id uuid,
  p_idempotency_key uuid
)
returns table (
  claimed boolean,
  completed boolean,
  cached_response jsonb,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_conversation public.nextway_setter_conversations%rowtype;
  v_request public.nextway_setter_generation_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if p_conversation_id is null or p_idempotency_key is null then
    raise exception 'Identificativi generazione mancanti' using errcode='22023';
  end if;

  select c.* into v_conversation
  from public.nextway_setter_conversations c
  where c.id=p_conversation_id
  for update;

  if not found then
    raise exception 'Conversazione non trovata' using errcode='P0002';
  end if;
  if v_conversation.owner_profile_id is distinct from v_actor
     and not public.nextway_is_platform_admin() then
    raise exception 'Conversazione non autorizzata' using errcode='42501';
  end if;
  if not public.nextway_has_workspace_access(
    v_conversation.workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Membership workspace attiva richiesta' using errcode='42501';
  end if;
  if v_conversation.status in ('closed','archived') then
    raise exception 'La conversazione è chiusa o archiviata' using errcode='55000';
  end if;

  insert into public.nextway_setter_generation_requests
    (owner_profile_id,conversation_id,idempotency_key,status,claimed_at)
  values (v_actor,p_conversation_id,p_idempotency_key,'generating',v_now)
  on conflict (owner_profile_id,idempotency_key) do nothing;

  select r.* into v_request
  from public.nextway_setter_generation_requests r
  where r.owner_profile_id=v_actor
    and r.idempotency_key=p_idempotency_key
  for update;

  if not found then
    raise exception 'Claim generazione non recuperabile' using errcode='40001';
  end if;
  if v_request.conversation_id is distinct from p_conversation_id then
    raise exception 'Chiave idempotenza già associata a un’altra conversazione' using errcode='22023';
  end if;

  if v_request.status='completed' then
    return query select false,true,v_request.cached_response,0;
    return;
  end if;

  if v_request.claimed_at > v_now - interval '2 minutes' then
    return query select false,false,null::jsonb,
      greatest(1,ceil(extract(epoch from (v_request.claimed_at + interval '2 minutes' - v_now)))::integer);
    return;
  end if;

  update public.nextway_setter_generation_requests
  set claimed_at=v_now,updated_at=v_now
  where id=v_request.id;

  return query select true,false,null::jsonb,0;
end;
$$;

-- Persist OpenAI output before inserting the outgoing draft, allowing retries
-- to avoid a second paid provider call if the final transaction fails.
create or replace function public.nextway_store_setter_generation_output(
  p_idempotency_key uuid,
  p_generated_output jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.nextway_setter_generation_requests%rowtype;
  v_conversation public.nextway_setter_conversations%rowtype;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_generated_output)<>'object' then
    raise exception 'Output generato non valido' using errcode='22023';
  end if;

  select r.* into v_request
  from public.nextway_setter_generation_requests r
  where r.owner_profile_id=v_actor and r.idempotency_key=p_idempotency_key
  for update;
  if not found or v_request.status<>'generating' then
    raise exception 'Claim generazione non valido o scaduto' using errcode='55000';
  end if;

  select c.* into v_conversation
  from public.nextway_setter_conversations c
  where c.id=v_request.conversation_id
  for update;
  if not found
     or (v_conversation.owner_profile_id is distinct from v_actor and not public.nextway_is_platform_admin())
     or not public.nextway_has_workspace_access(
       v_conversation.workspace_id,
       array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
     ) then
    raise exception 'Conversazione non autorizzata' using errcode='42501';
  end if;
  if v_conversation.status in ('closed','archived') then
    raise exception 'La conversazione è chiusa o archiviata' using errcode='55000';
  end if;

  if v_request.generated_output is not null then
    return v_request.generated_output=p_generated_output;
  end if;

  update public.nextway_setter_generation_requests
  set generated_output=p_generated_output,updated_at=clock_timestamp()
  where id=v_request.id;
  return true;
end;
$$;

-- Read staged output only for the authenticated actor who owns the request
-- and still has access to the conversation's workspace.
create or replace function public.nextway_get_staged_setter_output(
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_conversation_id uuid;
  v_conversation public.nextway_setter_conversations%rowtype;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;

  select r.generated_output,r.conversation_id
    into v_result,v_conversation_id
  from public.nextway_setter_generation_requests r
  where r.owner_profile_id=v_actor
    and r.idempotency_key=p_idempotency_key
    and r.status='generating';

  if not found then
    return null;
  end if;

  select c.* into v_conversation
  from public.nextway_setter_conversations c
  where c.id=v_conversation_id;
  if not found
     or (v_conversation.owner_profile_id is distinct from v_actor and not public.nextway_is_platform_admin())
     or not public.nextway_has_workspace_access(
       v_conversation.workspace_id,
       array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
     ) then
    raise exception 'Conversazione non autorizzata' using errcode='42501';
  end if;
  return v_result;
end;
$$;

-- Insert the draft message and cache the exact response in one transaction.
create or replace function public.nextway_complete_setter_generation(
  p_idempotency_key uuid,
  p_message text,
  p_strategy text,
  p_objective text,
  p_tone text,
  p_next_step text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.nextway_setter_generation_requests%rowtype;
  v_conversation public.nextway_setter_conversations%rowtype;
  v_message_id uuid;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'Autenticazione richiesta' using errcode='28000';
  end if;
  if p_idempotency_key is null
     or nullif(btrim(p_message),'') is null
     or length(p_message)>10000
     or p_strategy is null or p_objective is null
     or p_tone is null or p_next_step is null then
    raise exception 'Dati bozza non validi' using errcode='22023';
  end if;

  select r.* into v_request
  from public.nextway_setter_generation_requests r
  where r.owner_profile_id=v_actor and r.idempotency_key=p_idempotency_key
  for update;
  if not found then
    raise exception 'Richiesta generazione non trovata' using errcode='P0002';
  end if;
  if v_request.status='completed' then
    return v_request.cached_response;
  end if;
  if v_request.generated_output is null
     or v_request.generated_output->>'message' is distinct from p_message
     or v_request.generated_output->>'strategy' is distinct from p_strategy
     or v_request.generated_output->>'objective' is distinct from p_objective
     or v_request.generated_output->>'tone' is distinct from p_tone
     or v_request.generated_output->>'next_step' is distinct from p_next_step then
    raise exception 'La bozza non corrisponde all’output temporaneo registrato' using errcode='22023';
  end if;

  select c.* into v_conversation
  from public.nextway_setter_conversations c
  where c.id=v_request.conversation_id
  for update;
  if not found
     or (v_conversation.owner_profile_id is distinct from v_actor and not public.nextway_is_platform_admin())
     or not public.nextway_has_workspace_access(
       v_conversation.workspace_id,
       array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
     ) then
    raise exception 'Conversazione non autorizzata' using errcode='42501';
  end if;
  if v_conversation.status in ('closed','archived') then
    raise exception 'La conversazione è chiusa o archiviata' using errcode='55000';
  end if;

  insert into public.nextway_setter_messages
    (conversation_id,owner_profile_id,direction,content,message_type,ai_generated)
  values
    (v_conversation.id,v_conversation.owner_profile_id,'outgoing',btrim(p_message),'text',true)
  returning id into v_message_id;

  update public.nextway_setter_conversations
  set last_message_at=clock_timestamp()
  where id=v_conversation.id;

  v_response := jsonb_build_object(
    'success',true,
    'conversation_id',v_conversation.id,
    'message_id',v_message_id,
    'message',btrim(p_message),
    'strategy',p_strategy,
    'objective',p_objective,
    'tone',p_tone,
    'next_step',p_next_step,
    'status','draft'
  );

  update public.nextway_setter_generation_requests
  set status='completed',
      cached_response=v_response,
      completed_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where id=v_request.id;

  return v_response;
end;
$$;

-- Keep the trigger-level ownership invariant and extend it to workspace equality.
create or replace function public.nextway_validate_setter_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
  v_workspace_id uuid;
begin
  select l.owner_profile_id,l.workspace_id
    into v_owner,v_workspace_id
  from public.nextway_leads l
  where l.id=new.lead_id;

  if not found or v_owner is null or v_owner is distinct from new.owner_profile_id then
    raise exception 'Il proprietario non corrisponde al prospect' using errcode='23514';
  end if;

  if new.workspace_id is distinct from v_workspace_id then
    raise exception 'Il workspace della conversazione deve corrispondere a quello del Lead'
      using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function public.nextway_begin_setter_generation(uuid,uuid) from public,anon;
revoke all on function public.nextway_store_setter_generation_output(uuid,jsonb) from public,anon;
revoke all on function public.nextway_get_staged_setter_output(uuid) from public,anon;
revoke all on function public.nextway_complete_setter_generation(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.nextway_begin_setter_generation(uuid,uuid) to authenticated,service_role;
grant execute on function public.nextway_store_setter_generation_output(uuid,jsonb) to authenticated,service_role;
grant execute on function public.nextway_get_staged_setter_output(uuid) to authenticated,service_role;
grant execute on function public.nextway_complete_setter_generation(uuid,text,text,text,text,text) to authenticated,service_role;

revoke all on function public.nextway_validate_setter_owner() from public,anon,authenticated;

comment on function public.nextway_begin_setter_generation(uuid,uuid) is
  'Atomic AI Setter idempotency claim; validates authenticated actor and active workspace membership before generation.';
comment on function public.nextway_store_setter_generation_output(uuid,jsonb) is
  'Persists staged AI output for a claimed request; workspace authorization is inherited from the conversation.';
comment on function public.nextway_get_staged_setter_output(uuid) is
  'Returns staged AI output only to its authenticated request owner with current workspace access.';
comment on function public.nextway_complete_setter_generation(uuid,text,text,text,text,text) is
  'Atomically inserts an outgoing AI draft and caches the idempotent response; never sends the message.';
comment on function public.nextway_validate_setter_owner() is
  'Trigger guard requiring conversation owner and workspace to match the linked Lead.';

commit;
