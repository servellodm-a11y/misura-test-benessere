-- NEXTWAY CRM: prerequisiti conversione multi-workspace (READ-ONLY).
-- Restituisce UNA SOLA riga JSON compatta. Nessuna lettura di record personali.
-- Nessuna modifica a schema, dati, policy, ruoli o permessi.
-- Eseguire nel SQL Editor del progetto NEXTWAY; non richiede output da copiare in più blocchi.

with target(table_name) as (
  values ('clients'), ('partner_details'), ('profiles'),
         ('nextway_leads'), ('nextway_lead_conversion_requests'),
         ('nextway_workspace_memberships'), ('nextway_workspaces')
),
tables as (
  select t.table_name,
         to_regclass(format('public.%I',t.table_name)) is not null as table_exists,
         coalesce(c.relrowsecurity,false) as rls_enabled,
         coalesce(c.relforcerowsecurity,false) as rls_forced,
         case when c.oid is null then null else pg_get_userbyid(c.relowner) end as owner
  from target t
  left join pg_class c on c.oid=to_regclass(format('public.%I',t.table_name))
),
columns as (
  select table_name,
    jsonb_agg(jsonb_build_object(
      'name',column_name,'type',data_type,'udt',udt_name,
      'nullable',is_nullable='YES','default',column_default
    ) order by ordinal_position) as items
  from information_schema.columns
  where table_schema='public'
    and table_name in (select table_name from target)
  group by table_name
),
constraints as (
  select c.relname as table_name,
    jsonb_agg(jsonb_build_object(
      'name',con.conname,
      'type',case con.contype when 'p' then 'PK' when 'u' then 'UNIQUE'
        when 'f' then 'FK' when 'c' then 'CHECK' else con.contype::text end,
      'definition',pg_get_constraintdef(con.oid,true)
    ) order by con.conname) as items
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (select table_name from target)
  group by c.relname
),
indexes as (
  select tablename as table_name,
    jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname) as items
  from pg_indexes
  where schemaname='public' and tablename in (select table_name from target)
  group by tablename
),
policies as (
  select tablename as table_name,
    jsonb_agg(jsonb_build_object(
      'name',policyname,'command',cmd,'roles',roles,
      'using',qual,'check',with_check
    ) order by policyname) as items
  from pg_policies
  where schemaname='public' and tablename in (select table_name from target)
  group by tablename
),
triggers as (
  select c.relname as table_name,
    jsonb_agg(jsonb_build_object(
      'name',tg.tgname,'enabled',tg.tgenabled,
      'definition',pg_get_triggerdef(tg.oid,true)
    ) order by tg.tgname) as items
  from pg_trigger tg
  join pg_class c on c.oid=tg.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not tg.tgisinternal
    and c.relname in (select table_name from target)
  group by c.relname
),
functions as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name',p.proname,
    'arguments',pg_get_function_identity_arguments(p.oid),
    'security_definer',p.prosecdef,
    'owner',pg_get_userbyid(p.proowner)
  ) order by p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) as items
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (p.prosrc ilike '%partner_details%'
      or p.prosrc ilike '%public.clients%'
      or p.proname ilike '%conversion%')
)
select jsonb_pretty(jsonb_build_object(
  'audit','NEXTWAY_CONVERSION_WORKSPACE_PREFLIGHT_READ_ONLY',
  'tables',(select jsonb_agg(
    to_jsonb(t) || jsonb_build_object(
      'columns',coalesce(c.items,'[]'::jsonb),
      'constraints',coalesce(k.items,'[]'::jsonb),
      'indexes',coalesce(i.items,'[]'::jsonb),
      'policies',coalesce(p.items,'[]'::jsonb),
      'triggers',coalesce(g.items,'[]'::jsonb)
    ) order by t.table_name)
    from tables t
    left join columns c using(table_name)
    left join constraints k using(table_name)
    left join indexes i using(table_name)
    left join policies p using(table_name)
    left join triggers g using(table_name)),
  'related_functions',(select items from functions),
  'interpretation','Metadata only. No customer/partner rows, emails, phones, tokens or credentials are returned.'
)) as nextway_conversion_workspace_preflight;
