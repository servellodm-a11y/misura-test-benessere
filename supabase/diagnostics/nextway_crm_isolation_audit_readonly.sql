-- NEXTWAY CRM: audit read-only dell'isolamento partner / platform_admin.
-- Solo metadati di schema, policy RLS e privilegi SQL. Non legge righe CRM.
-- Non modifica dati, schema, policy, ruoli o configurazioni.
-- Eseguire nel SQL Editor del progetto Supabase NEXTWAY corretto.

with target_tables(table_name) as (
  values
    ('nextway_leads'),
    ('nextway_lead_activities'),
    ('nextway_lead_creation_requests'),
    ('nextway_lead_conversion_requests'),
    ('nextway_lead_audit_logs'),
    ('profiles'),
    ('partner_details')
),
table_audit as (
  select
    t.table_name,
    to_regclass(format('public.%I', t.table_name)) is not null as exists,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    coalesce(c.relforcerowsecurity, false) as rls_forced,
    case when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('anon', format('public.%I', t.table_name), 'SELECT') end as anon_select,
    case when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('authenticated', format('public.%I', t.table_name), 'SELECT') end as authenticated_select,
    case when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('authenticated', format('public.%I', t.table_name), 'INSERT') end as authenticated_insert,
    case when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('authenticated', format('public.%I', t.table_name), 'UPDATE') end as authenticated_update,
    case when to_regclass(format('public.%I', t.table_name)) is null then false
      else has_table_privilege('authenticated', format('public.%I', t.table_name), 'DELETE') end as authenticated_delete
  from target_tables t
  left join pg_class c on c.oid = to_regclass(format('public.%I', t.table_name))
),
policy_audit as (
  select
    p.tablename as table_name,
    jsonb_agg(
      jsonb_build_object(
        'policy', p.policyname,
        'command', p.cmd,
        'roles', p.roles,
        'using', p.qual,
        'with_check', p.with_check
      ) order by p.policyname
    ) as policies
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (select table_name from target_tables)
  group by p.tablename
)
select jsonb_pretty(jsonb_build_object(
  'audit_type', 'READ_ONLY_RLS_ISOLATION_AUDIT',
  'tables', (
    select jsonb_agg(
      to_jsonb(a) || jsonb_build_object(
        'policies', coalesce(p.policies, '[]'::jsonb)
      ) order by a.table_name
    )
    from table_audit a
    left join policy_audit p using (table_name)
  ),
  'interpretation', jsonb_build_object(
    'partner_expected', 'Solo record con owner_profile_id = auth.uid(); nessuna visibilità gerarchica implicita.',
    'platform_admin_expected', 'Accesso trasversale solo dove la policy RLS lo concede esplicitamente.',
    'important', 'Questo audit verifica configurazione e privilegi, non prova l accesso effettivo con due sessioni utente distinte.'
  )
)) as nextway_isolation_audit;
