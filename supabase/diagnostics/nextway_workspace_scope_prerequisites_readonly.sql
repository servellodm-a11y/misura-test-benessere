-- NEXTWAY workspace-scope prerequisites: READ-ONLY diagnostic
-- Run in the SQL Editor of the correct Supabase project.
-- Returns schema metadata, RLS policies, grants, triggers and SQL function definitions only.
-- Does NOT read application rows or change data, schema, policies, roles or configuration.

-- 1) Columns for Leads, AI Setter conversations/messages and idempotency records.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = any(array[
    'nextway_leads',
    'nextway_setter_conversations',
    'nextway_setter_messages',
    'nextway_setter_generation_requests',
    'nextway_lead_creation_requests',
    'nextway_knowledge_documents'
  ])
order by table_name, ordinal_position;

-- 2) Primary, unique, check and foreign-key constraints for Setter tables.
select
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'nextway_setter_conversations',
    'nextway_setter_messages',
    'nextway_setter_generation_requests',
    'nextway_lead_creation_requests'
  ])
order by c.relname, con.contype, con.conname;

-- 3) RLS state, FORCE RLS and effective policies for conversations/messages.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'policy', p.policyname,
      'permissive', p.permissive,
      'roles', p.roles,
      'command', p.cmd,
      'using', p.qual,
      'with_check', p.with_check
    ) order by p.policyname)
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = c.relname
  ), '[]'::jsonb) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'nextway_setter_conversations',
    'nextway_setter_messages',
    'nextway_setter_generation_requests',
    'nextway_lead_creation_requests'
  ])
  and c.relkind = 'r'
order by c.relname;

-- 4) Client grants on the same tables.
select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = any(array[
    'nextway_setter_conversations',
    'nextway_setter_messages',
    'nextway_setter_generation_requests',
    'nextway_lead_creation_requests'
  ])
  and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
order by table_name, grantee, privilege_type;

-- 5) Actual function definitions used by Lead creation and AI Setter.
-- Function bodies are source code, not application data.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'nextway_create_lead_with_conversation',
    'nextway_create_lead_with_conversation_idempotent',
    'nextway_begin_setter_generation',
    'nextway_complete_setter_generation',
    'nextway_store_setter_generation_output',
    'nextway_get_staged_setter_output'
  ])
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 6) Triggers attached to conversations/messages.
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_orientation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('nextway_setter_conversations','nextway_setter_messages')
order by event_object_table, trigger_name, event_manipulation;
