-- NEXTWAY workspace/storage migration preflight (read-only).
-- Run before applying workspace foundation or Knowledge Base storage migrations.
-- Returns one JSONB value. Reads metadata and bucket object count only; no file contents.

with expected_tables as (
  select unnest(array[
    'nextway_workspaces',
    'nextway_workspace_prompts',
    'nextway_workspace_prospect_criteria',
    'nextway_workspace_memberships'
  ]) as table_name
),
table_state as (
  select
    e.table_name,
    to_regclass(format('public.%I', e.table_name)) is not null as is_present,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    coalesce(c.relforcerowsecurity, false) as rls_forced,
    case when c.oid is null then null else greatest(c.reltuples,0)::bigint end as estimated_rows
  from expected_tables e
  left join pg_class c
    on c.oid=to_regclass(format('public.%I',e.table_name))
),
workspace_policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'tablename',tablename,'policyname',policyname,'cmd',cmd,
    'roles',roles,'permissive',permissive,'qual',qual,'with_check',with_check
  ) order by tablename,policyname),'[]'::jsonb) as items
  from pg_policies
  where schemaname='public'
    and tablename in (
      'nextway_workspaces',
      'nextway_workspace_prompts',
      'nextway_workspace_prospect_criteria',
      'nextway_workspace_memberships'
    )
),
bucket_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'public',b.public,
    'file_size_limit',b.file_size_limit,
    'allowed_mime_types',b.allowed_mime_types
  ) order by b.id),'[]'::jsonb) as items
  from storage.buckets b
  where b.id='nextway-knowledge'
),
bucket_objects as (
  select count(*)::bigint as object_count
  from storage.objects
  where bucket_id='nextway-knowledge'
),
storage_policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'policyname',policyname,'cmd',cmd,'roles',roles,
    'permissive',permissive,'qual',qual,'with_check',with_check
  ) order by policyname),'[]'::jsonb) as items
  from pg_policies
  where schemaname='storage'
    and tablename='objects'
    and policyname like 'nextway_knowledge_storage_admin_%'
)
select jsonb_build_object(
  'diagnostic','NEXTWAY workspace and storage preflight',
  'read_only',true,
  'workspace_tables',(select jsonb_agg(to_jsonb(table_state) order by table_name) from table_state),
  'workspace_policies',(select items from workspace_policies),
  'knowledge_bucket',(select items from bucket_state),
  'knowledge_bucket_object_count',(select object_count from bucket_objects),
  'knowledge_storage_policies',(select items from storage_policies),
  'storage_metadata_tables_present',jsonb_build_object(
    'buckets',to_regclass('storage.buckets') is not null,
    'objects',to_regclass('storage.objects') is not null
  )
) as nextway_workspace_storage_preflight_result;
