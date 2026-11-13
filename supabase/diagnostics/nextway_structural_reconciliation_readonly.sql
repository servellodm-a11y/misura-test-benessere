-- NEXTWAY: riconciliazione strutturale completa, sola lettura.
-- Eseguire nel SQL Editor del progetto Supabase corretto.
-- Restituisce una sola riga/cella JSON con metadati dello schema public.
-- Non legge righe applicative, corpi delle funzioni, segreti o contenuti utente.
-- Non contiene DDL/DML e non modifica schema, dati o privilegi.

with
public_relations as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relacl, c.relnamespace,
         c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f')
),
columns_data as (
  select c.relname as table_name,
         jsonb_agg(jsonb_build_object(
           'ordinal', a.attnum,
           'column', a.attname,
           'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'identity', nullif(a.attidentity,''),
           'generated', nullif(a.attgenerated,''),
           'default', pg_get_expr(ad.adbin, ad.adrelid)
         ) order by a.attnum) as items
  from public_relations c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
  where c.relkind in ('r','p','v','m','f')
  group by c.relname
),
constraints_data as (
  select c.relname as table_name,
         jsonb_agg(jsonb_build_object(
           'name', con.conname,
           'type', case con.contype when 'p' then 'PRIMARY KEY'
             when 'f' then 'FOREIGN KEY' when 'u' then 'UNIQUE'
             when 'c' then 'CHECK' when 'x' then 'EXCLUDE'
             else con.contype::text end,
           'definition', pg_get_constraintdef(con.oid, true),
           'validated', con.convalidated,
           'deferrable', con.condeferrable,
           'initially_deferred', con.condeferred
         ) order by con.conname) as items
  from public_relations c
  join pg_constraint con on con.conrelid = c.oid
  group by c.relname
),
relations_data as (
  select c.relname as object_name, c.relkind,
         jsonb_build_object(
           'kind', case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
             when 'v' then 'view' when 'm' then 'materialized_view'
             when 'S' then 'sequence' when 'f' then 'foreign_table' else c.relkind::text end,
           'owner', pg_get_userbyid(c.relowner),
           'rls_enabled', case when c.relkind in ('r','p') then c.relrowsecurity end,
           'rls_forced', case when c.relkind in ('r','p') then c.relforcerowsecurity end
         ) as details
  from public_relations c
),
table_grants as (
  select c.relname as object_name,
         jsonb_agg(jsonb_build_object(
           'grantee', case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
           'grantor', pg_get_userbyid(x.grantor),
           'privilege', x.privilege_type,
           'grantable', x.is_grantable
         ) order by x.grantee, x.privilege_type) as items
  from public_relations c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault(
    case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end, c.relowner
  ))) x
  where c.relkind in ('r','p','v','m','S','f')
  group by c.relname
),
sequences_data as (
  select s.relname as sequence_name,
         jsonb_build_object(
           'owner', pg_get_userbyid(s.relowner),
           'data_type', format_type(ps.seqtypid, null),
           'start', ps.seqstart, 'increment', ps.seqincrement,
           'min', ps.seqmin, 'max', ps.seqmax, 'cache', ps.seqcache, 'cycle', ps.seqcycle,
           'owned_by', (
             select jsonb_build_object('table', t.relname, 'column', a.attname,
               'dependency_type', d.deptype::text)
             from pg_depend d
             join pg_class t on t.oid = d.refobjid
             join pg_namespace tn on tn.oid = t.relnamespace and tn.nspname = 'public'
             join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
             where d.classid = 'pg_class'::regclass and d.objid = s.oid
               and d.refclassid = 'pg_class'::regclass and d.deptype in ('a','i')
             limit 1
           )
         ) as details
  from public_relations s
  join pg_sequence ps on ps.seqrelid = s.oid
  where s.relkind = 'S'
),
functions_data as (
  select p.oid, p.proname,
         jsonb_build_object(
           'identity_arguments', pg_get_function_identity_arguments(p.oid),
           'arguments', pg_get_function_arguments(p.oid),
           'return_type', pg_get_function_result(p.oid),
           'language', l.lanname,
           'owner', pg_get_userbyid(p.proowner),
           'security_definer', p.prosecdef,
           'volatility', case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end,
           'parallel', p.proparallel,
           'settings', p.proconfig,
           'acl', coalesce((
             select jsonb_agg(jsonb_build_object(
               'grantee', case x.grantee when 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
               'grantor', pg_get_userbyid(x.grantor),
               'privilege', x.privilege_type,
               'grantable', x.is_grantable
             ) order by x.grantee, x.privilege_type)
             from aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) x
           ), '[]'::jsonb)
         ) as details
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
),
triggers_data as (
  select t.tgname as trigger_name, c.relname as table_name,
         jsonb_build_object(
           'table', c.relname,
           'enabled', t.tgenabled,
           'internal', t.tgisinternal,
           'definition', pg_get_triggerdef(t.oid, true),
           'function', pn.nspname || '.' || p.proname,
           'function_owner', pg_get_userbyid(p.proowner),
           'function_security_definer', p.prosecdef
         ) as details
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'public'
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
),
schemas_data as (
  select jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'owner', pg_get_userbyid(n.nspowner),
    'usage_authenticated', has_schema_privilege('authenticated', n.oid, 'USAGE'),
    'create_authenticated', has_schema_privilege('authenticated', n.oid, 'CREATE'),
    'usage_anon', has_schema_privilege('anon', n.oid, 'USAGE'),
    'create_anon', has_schema_privilege('anon', n.oid, 'CREATE')
  ) order by n.nspname) as items
  from pg_namespace n
  where n.nspname in ('public')
)
select jsonb_pretty(jsonb_build_object(
  'report_version', 1,
  'scope', 'public schema metadata only',
  'schemas', coalesce((select items from schemas_data), '[]'::jsonb),
  'relations', coalesce((select jsonb_agg(jsonb_build_object(
    'name', r.object_name, 'details', r.details,
    'columns', coalesce(cd.items, '[]'::jsonb),
    'constraints', coalesce(kd.items, '[]'::jsonb),
    'grants', coalesce(tg.items, '[]'::jsonb)
  ) order by r.object_name) from relations_data r
    left join columns_data cd on cd.table_name = r.object_name
    left join constraints_data kd on kd.table_name = r.object_name
    left join table_grants tg on tg.object_name = r.object_name), '[]'::jsonb),
  'sequences', coalesce((select jsonb_agg(jsonb_build_object(
    'name', sequence_name, 'details', details) order by sequence_name)
    from sequences_data), '[]'::jsonb),
  'functions', coalesce((select jsonb_agg(jsonb_build_object(
    'name', proname, 'details', details)
    order by proname, details->>'identity_arguments') from functions_data), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(jsonb_build_object(
    'name', trigger_name, 'details', details)
    order by table_name, trigger_name) from triggers_data), '[]'::jsonb)
)) as report;
