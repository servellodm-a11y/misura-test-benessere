-- NEXTWAY workspace migration preflight
-- Read-only, single-result diagnostic. Does not inspect application rows except
-- checking whether at least one platform_admin profile exists. No schema/data writes.

with required_tables(table_name) as (
  values
    ('nextway_leads'),
    ('nextway_lead_activities'),
    ('nextway_lead_conversion_requests'),
    ('nextway_lead_audit_logs'),
    ('nextway_setter_conversations'),
    ('nextway_setter_messages'),
    ('nextway_lead_creation_requests')
),
table_state as (
  select
    r.table_name,
    to_regclass(format('public.%I', r.table_name)) is not null as is_present,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    coalesce(c.relforcerowsecurity, false) as rls_forced
  from required_tables r
  left join pg_class c
    on c.oid = to_regclass(format('public.%I', r.table_name))
),
required_columns(table_name, column_name) as (
  values
    ('profiles','id'),
    ('profiles','role'),
    ('nextway_leads','id'),
    ('nextway_leads','owner_profile_id'),
    ('nextway_lead_activities','lead_id'),
    ('nextway_lead_conversion_requests','lead_id'),
    ('nextway_lead_audit_logs','lead_id'),
    ('nextway_lead_audit_logs','lead_owner_profile_id'),
    ('nextway_lead_audit_logs','actor_profile_id'),
    ('nextway_lead_audit_logs','action'),
    ('nextway_lead_audit_logs','changed_fields'),
    ('nextway_lead_audit_logs','before_data'),
    ('nextway_lead_audit_logs','after_data'),
    ('nextway_lead_audit_logs','created_at'),
    ('nextway_setter_conversations','id'),
    ('nextway_setter_conversations','lead_id'),
    ('nextway_setter_conversations','owner_profile_id'),
    ('nextway_setter_messages','conversation_id'),
    ('nextway_setter_messages','owner_profile_id'),
    ('nextway_setter_messages','direction'),
    ('nextway_setter_messages','content'),
    ('nextway_setter_messages','message_type'),
    ('nextway_setter_messages','ai_generated'),
    ('nextway_setter_messages','approved_by'),
    ('nextway_setter_messages','sent_at'),
    ('nextway_lead_creation_requests','owner_profile_id'),
    ('nextway_lead_creation_requests','request_id'),
    ('nextway_lead_creation_requests','request_hash'),
    ('nextway_lead_creation_requests','response')
),
column_state as (
  select
    r.table_name,
    r.column_name,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = r.table_name
        and c.column_name = r.column_name
    ) as is_present
  from required_columns r
),
required_functions(function_signature) as (
  values
    ('public.nextway_is_platform_admin()'),
    ('public.nextway_validate_setter_owner()'),
    ('public.nextway_setter_touch()'),
    ('public.nextway_create_lead_with_conversation(text,text,text,text,text,text,text)'),
    ('public.nextway_create_lead_with_conversation_idempotent(uuid,text,text,text,text,text,text,text,text)')
),
function_state as (
  select
    function_signature,
    to_regprocedure(function_signature) is not null as is_present
  from required_functions
),
trigger_state as (
  select
    'nextway_validate_setter_owner' as function_name,
    exists (
      select 1
      from pg_trigger t
      where t.tgrelid = to_regclass('public.nextway_setter_conversations')
        and not t.tgisinternal
        and t.tgfoid = to_regprocedure('public.nextway_validate_setter_owner()')
    ) as is_present
  union all
  select
    'nextway_setter_touch',
    exists (
      select 1
      from pg_trigger t
      where t.tgrelid = to_regclass('public.nextway_setter_conversations')
        and not t.tgisinternal
        and t.tgfoid = to_regprocedure('public.nextway_setter_touch()')
    )
),
workspace_column_state as (
  select
    t.table_name,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t.table_name
        and c.column_name = 'workspace_id'
    ) as already_present
  from (values
    ('nextway_leads'),
    ('nextway_knowledge_documents'),
    ('nextway_setter_conversations')
  ) as t(table_name)
),
policy_state as (
  select
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'nextway_leads',
      'nextway_lead_activities',
      'nextway_lead_conversion_requests',
      'nextway_lead_audit_logs',
      'nextway_setter_conversations',
      'nextway_setter_messages',
      'nextway_lead_creation_requests'
    )
),
checks as (
  select
    coalesce(bool_and(is_present and rls_enabled), false) as tables_ready
  from table_state
),
column_checks as (
  select coalesce(bool_and(is_present), false) as columns_ready
  from column_state
),
function_checks as (
  select coalesce(bool_and(is_present), false) as functions_ready
  from function_state
),
trigger_checks as (
  select coalesce(bool_and(is_present), false) as triggers_ready
  from trigger_state
)
select jsonb_build_object(
  'diagnostic', 'NEXTWAY workspace migration preflight',
  'read_only', true,
  'base_schema_ready',
    (select tables_ready from checks)
    and (select columns_ready from column_checks)
    and (select functions_ready from function_checks)
    and (select triggers_ready from trigger_checks)
    and exists (
      select 1 from public.profiles p where p.role = 'platform_admin'
    )
    and to_regclass('storage.buckets') is not null
    and to_regclass('storage.objects') is not null,
  'tables', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.table_name), '[]'::jsonb)
    from table_state s
  ),
  'columns', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.table_name, s.column_name), '[]'::jsonb)
    from column_state s
  ),
  'functions', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.function_signature), '[]'::jsonb)
    from function_state s
  ),
  'triggers', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.function_name), '[]'::jsonb)
    from trigger_state s
  ),
  'workspace_columns_before_association', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.table_name), '[]'::jsonb)
    from workspace_column_state s
  ),
  'platform_admin_profile_present',
    exists (select 1 from public.profiles p where p.role = 'platform_admin'),
  'storage_prerequisites', jsonb_build_object(
    'storage_buckets_exists', to_regclass('storage.buckets') is not null,
    'storage_objects_exists', to_regclass('storage.objects') is not null
  ),
  'policies', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.tablename, s.policyname), '[]'::jsonb)
    from policy_state s
  )
) as nextway_preflight_result;
