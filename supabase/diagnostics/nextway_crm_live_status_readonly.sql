-- NEXTWAY CRM: verifica mirata READ-ONLY di policy Lead e migrazioni.
-- Un solo risultato JSON. Non modifica schema, dati, policy o permessi.

select jsonb_build_object(
  'LEAD_TABLE',
  (select jsonb_build_object(
      'exists', c.oid is not null,
      'rls_enabled', coalesce(c.relrowsecurity, false),
      'rls_forced', coalesce(c.relforcerowsecurity, false)
    )
   from (select to_regclass('public.nextway_leads') as oid) t
   left join pg_class c on c.oid = t.oid),

  'LEAD_POLICIES',
  (select coalesce(jsonb_agg(jsonb_build_object(
      'policy', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'with_check', with_check
    ) order by policyname), '[]'::jsonb)
   from pg_policies
   where schemaname = 'public'
     and tablename = 'nextway_leads'),

  'REQUIRED_TABLES',
  jsonb_build_object(
    'nextway_lead_activities', to_regclass('public.nextway_lead_activities') is not null,
    'nextway_lead_conversion_requests', to_regclass('public.nextway_lead_conversion_requests') is not null
  ),

  'MIGRATIONS_008_TO_014',
  (select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
   from supabase_migrations.schema_migrations
   where version in (
     '20261110000800',
     '20261110000900',
     '20261110001000',
     '20261110001100',
     '20261110001200',
     '20261110001300',
     '20261110001400'
   ))
) as nextway_crm_live_status;
