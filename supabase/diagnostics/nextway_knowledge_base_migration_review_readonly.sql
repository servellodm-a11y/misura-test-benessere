-- NEXTWAY Knowledge Base migration conflict review (read-only).
-- Run before applying 20261111170000_nextway_knowledge_base.sql.
-- Returns one JSONB cell. Does not read document/chunk contents or modify anything.

with target_tables as (
  select unnest(array[
    'nextway_knowledge_documents',
    'nextway_knowledge_chunks'
  ]) as table_name
),
table_state as (
  select
    t.table_name,
    to_regclass(format('public.%I', t.table_name)) is not null as is_present,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    coalesce(c.relforcerowsecurity, false) as rls_forced
  from target_tables t
  left join pg_class c
    on c.oid = to_regclass(format('public.%I', t.table_name))
),
row_counts as (
  select jsonb_object_agg(table_name, row_count) as counts
  from (
    select
      t.table_name,
      case
        when to_regclass(format('public.%I', t.table_name)) is null then null
        else (
          case t.table_name
            when 'nextway_knowledge_documents' then
              (select count(*) from public.nextway_knowledge_documents)
            when 'nextway_knowledge_chunks' then
              (select count(*) from public.nextway_knowledge_chunks)
          end
        )
      end as row_count
    from target_tables t
  ) s
),
relevant_policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'tablename', tablename,
    'policyname', policyname,
    'cmd', cmd,
    'roles', roles,
    'permissive', permissive,
    'qual', qual,
    'with_check', with_check
  ) order by tablename, policyname), '[]'::jsonb) as items
  from pg_policies
  where schemaname = 'public'
    and tablename in ('nextway_knowledge_documents','nextway_knowledge_chunks')
),
function_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'identity', p.oid::regprocedure::text,
    'definition', pg_get_functiondef(p.oid),
    'owner', pg_get_userbyid(p.proowner),
    'security_definer', p.prosecdef,
    'search_path', p.proconfig,
    'acl', coalesce(p.proacl::text, 'default')
  ) order by p.oid), '[]'::jsonb) as items
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'nextway_search_knowledge'
),
column_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', c.table_name,
    'column_name', c.column_name,
    'data_type', c.data_type
  ) order by c.table_name, c.ordinal_position), '[]'::jsonb) as items
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('nextway_knowledge_documents','nextway_knowledge_chunks')
),
index_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', t.relname,
    'index_name', i.relname,
    'definition', pg_get_indexdef(i.oid)
  ) order by t.relname, i.relname), '[]'::jsonb) as items
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  join pg_index x on x.indrelid = t.oid
  join pg_class i on i.oid = x.indexrelid
  where n.nspname = 'public'
    and t.relname in ('nextway_knowledge_documents','nextway_knowledge_chunks')
)
select jsonb_build_object(
  'diagnostic', 'NEXTWAY Knowledge Base migration review',
  'read_only', true,
  'tables', (select jsonb_agg(to_jsonb(table_state) order by table_name) from table_state),
  'row_counts', (select counts from row_counts),
  'columns', (select items from column_state),
  'policies', (select items from relevant_policies),
  'functions', (select items from function_state),
  'indexes', (select items from index_state),
  'migration_conflict_flags', jsonb_build_object(
    'documents_table_exists', coalesce((select is_present from table_state where table_name='nextway_knowledge_documents'), false),
    'chunks_table_exists', coalesce((select is_present from table_state where table_name='nextway_knowledge_chunks'), false),
    'search_function_exists', exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='nextway_search_knowledge'
    ),
    'policies_with_migration_target_names_exist', exists (
      select 1 from pg_policies
      where schemaname='public'
        and policyname in (
          'nextway_knowledge_documents_admin_all',
          'nextway_knowledge_documents_approved_read',
          'nextway_knowledge_chunks_admin_all',
          'nextway_knowledge_chunks_approved_read'
        )
    )
  )
) as nextway_knowledge_review_result;
