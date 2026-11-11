-- NEXTWAY CRM: verifica READ-ONLY dei prerequisiti prima di applicare le migrazioni.
-- Restituisce un solo JSON e non modifica dati, schema o permessi.

select jsonb_build_object(
  'LEAD_REQUIRED_COLUMNS',
  (select jsonb_object_agg(required.column_name,
      (cols.column_name is not null))
   from (values
      ('owner_profile_id'),
      ('status'),
      ('created_at'),
      ('archived_at'),
      ('archived_by'),
      ('archive_reason')
   ) as required(column_name)
   left join information_schema.columns cols
     on cols.table_schema = 'public'
    and cols.table_name = 'nextway_leads'
    and cols.column_name = required.column_name),

  'LEAD_STATUS_CHECKS',
  (select coalesce(jsonb_agg(pg_get_constraintdef(c.oid) order by c.conname), '[]'::jsonb)
   from pg_constraint c
   join pg_class t on t.oid = c.conrelid
   join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'nextway_leads'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%status%'),

  'RELATED_TABLES',
  jsonb_build_object(
    'nextway_lead_activities', to_regclass('public.nextway_lead_activities') is not null,
    'nextway_lead_conversion_requests', to_regclass('public.nextway_lead_conversion_requests') is not null,
    'nextway_lead_creation_requests', to_regclass('public.nextway_lead_creation_requests') is not null
  ),

  'REQUIRED_FUNCTIONS',
  (select coalesce(jsonb_agg(jsonb_build_object(
      'function', p.proname,
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef
    ) order by p.proname), '[]'::jsonb)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'nextway_create_lead_with_conversation',
       'nextway_create_lead_with_conversation_idempotent'
     ))
) as nextway_crm_prerequisites;
