-- NEXTWAY workspace scope prerequisites: single-result read-only diagnostic
-- Eseguire UNA SOLA VOLTA nel SQL Editor Supabase.
-- Restituisce una sola riga JSONB con tutte le sezioni; non legge righe applicative
-- e non modifica schema, dati, grants, policy o funzioni.

with target_tables(table_name) as (
  values
    ('nextway_setter_conversations'),
    ('nextway_setter_messages'),
    ('nextway_setter_generation_requests'),
    ('nextway_lead_creation_requests'),
    ('nextway_leads')
),
table_presence as (
  select t.table_name,
         to_regclass(format('public.%I', t.table_name)) is not null as exists
  from target_tables t
),
columns_data as (
  select c.table_name,
         jsonb_agg(jsonb_build_object(
           'column', c.column_name,
           'type', c.data_type,
           'udt', c.udt_name,
           'nullable', c.is_nullable,
           'default', c.column_default
         ) order by c.ordinal_position) as columns
  from information_schema.columns c
  join target_tables t on t.table_name = c.table_name
  where c.table_schema = 'public'
  group by c.table_name
),
constraints_data as (
  select cl.relname as table_name,
         jsonb_agg(jsonb_build_object(
           'name', con.conname,
           'type', con.contype,
           'definition', pg_get_constraintdef(con.oid, true)
         ) order by con.conname) as constraints
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace ns on ns.oid = cl.relnamespace
  where ns.nspname = 'public'
    and cl.relname in (select table_name from target_tables)
  group by cl.relname
),
policies_data as (
  select schemaname, tablename,
         jsonb_agg(jsonb_build_object(
           'name', policyname,
           'command', cmd,
           'roles', roles,
           'using', qual,
           'with_check', with_check
         ) order by policyname) as policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
  group by schemaname, tablename
),
rls_data as (
  select n.nspname as schema_name, c.relname as table_name,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (select table_name from target_tables)
),
grants_data as (
  select table_name,
         jsonb_agg(jsonb_build_object(
           'grantee', grantee,
           'privilege', privilege_type,
           'grantable', is_grantable
         ) order by grantee, privilege_type) as grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
  group by table_name
),
trigger_data as (
  select c.relname as table_name,
         jsonb_agg(jsonb_build_object(
           'trigger', t.tgname,
           'enabled', t.tgenabled,
           'definition', pg_get_triggerdef(t.oid, true),
           'function', p.proname,
           'function_definition', pg_get_functiondef(p.oid)
         ) order by t.tgname) as triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where n.nspname = 'public'
    and not t.tgisinternal
    and c.relname in (select table_name from target_tables)
  group by c.relname
),
setter_functions as (
  select jsonb_agg(jsonb_build_object(
    'signature', p.oid::regprocedure::text,
    'language', l.lanname,
    'security_definer', p.prosecdef,
    'volatility', p.provolatile,
    'config', p.proconfig,
    'owner', r.rolname,
    'definition', pg_get_functiondef(p.oid),
    'acl', coalesce(p.proacl::text, 'default')
  ) order by p.proname, p.oid::regprocedure::text) as functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  join pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and p.proname in (
      'nextway_begin_setter_generation',
      'nextway_complete_setter_generation',
      'nextway_store_setter_generation_output',
      'nextway_get_staged_setter_output',
      'nextway_create_lead_with_conversation',
      'nextway_create_lead_with_conversation_idempotent',
      'nextway_setter_touch',
      'nextway_validate_setter_owner'
    )
),
sequence_info as (
  select jsonb_agg(jsonb_build_object(
    'table', table_name,
    'exists', exists
  ) order by table_name) as tables
  from table_presence
)
select jsonb_pretty(jsonb_build_object(
  'diagnostic', 'NEXTWAY workspace scope prerequisites',
  'read_only', true,
  'generated_at', clock_timestamp(),
  'table_presence', (select tables from sequence_info),
  'columns', coalesce((select jsonb_object_agg(table_name, columns) from columns_data), '{}'::jsonb),
  'constraints_and_foreign_keys', coalesce((select jsonb_object_agg(table_name, constraints) from constraints_data), '{}'::jsonb),
  'rls', coalesce((select jsonb_agg(to_jsonb(r) order by r.table_name) from rls_data r), '[]'::jsonb),
  'policies', coalesce((select jsonb_object_agg(tablename, policies) from policies_data), '{}'::jsonb),
  'table_grants', coalesce((select jsonb_object_agg(table_name, grants) from grants_data), '{}'::jsonb),
  'triggers', coalesce((select jsonb_object_agg(table_name, triggers) from trigger_data), '{}'::jsonb),
  'setter_function_definitions', coalesce((select functions from setter_functions), '[]'::jsonb)
)) as nextway_diagnostic_result;
