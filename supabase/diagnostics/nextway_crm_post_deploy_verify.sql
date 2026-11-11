-- NEXTWAY CRM: verifica READ-ONLY dopo l'applicazione del bundle.
-- Restituisce un solo JSON. Non modifica schema, dati o permessi.

select jsonb_build_object(
  'TABLES',
  (select jsonb_object_agg(x.table_name, jsonb_build_object(
      'exists', c.oid is not null,
      'rls_enabled', coalesce(c.relrowsecurity,false),
      'rls_forced', coalesce(c.relforcerowsecurity,false)
    ))
   from (values
     ('nextway_leads'),
     ('nextway_lead_audit_logs'),
     ('nextway_lead_creation_requests'),
     ('nextway_lead_activities'),
     ('nextway_lead_conversion_requests')
   ) x(table_name)
   left join pg_namespace n on n.nspname='public'
   left join pg_class c on c.relnamespace=n.oid and c.relname=x.table_name),

  'ARCHIVE_COLUMNS',
  (select jsonb_object_agg(x.column_name, cols.column_name is not null)
   from (values ('archived_at'),('archived_by'),('archive_reason')) x(column_name)
   left join information_schema.columns cols
     on cols.table_schema='public' and cols.table_name='nextway_leads'
    and cols.column_name=x.column_name),

  'LEAD_STATUS_CHECKS',
  (select coalesce(jsonb_agg(pg_get_constraintdef(c.oid) order by c.conname),'[]'::jsonb)
   from pg_constraint c
   join pg_class t on t.oid=c.conrelid
   join pg_namespace n on n.oid=t.relnamespace
   where n.nspname='public' and t.relname='nextway_leads'
     and c.contype='c' and pg_get_constraintdef(c.oid) ilike '%status%'),

  'POLICIES',
  (select coalesce(jsonb_object_agg(x.table_name, coalesce(p.items,'[]'::jsonb)),'{}'::jsonb)
   from (values
     ('nextway_leads'),
     ('nextway_lead_audit_logs'),
     ('nextway_lead_creation_requests'),
     ('nextway_lead_activities'),
     ('nextway_lead_conversion_requests')
   ) x(table_name)
   left join lateral (
     select jsonb_agg(jsonb_build_object(
       'name', pol.policyname,
       'command', pol.cmd,
       'roles', pol.roles
     ) order by pol.policyname) as items
     from pg_policies pol
     where pol.schemaname='public' and pol.tablename=x.table_name
   ) p on true),

  'FUNCTIONS',
  (select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef
    ) order by p.proname),'[]'::jsonb)
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'nextway_create_lead_with_conversation',
       'nextway_create_lead_with_conversation_idempotent',
       'nextway_prune_lead_creation_requests',
       'nextway_set_lead_archive_metadata',
       'nextway_set_lead_activity_updated_at',
       'nextway_guard_conversion_request_review'
     ))
) as nextway_crm_post_deploy_verification;
