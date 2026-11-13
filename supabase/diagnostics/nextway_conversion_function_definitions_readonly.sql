-- NEXTWAY: definizioni delle funzioni e policy conversione (sola lettura)
-- Restituisce il DDL delle RPC e delle funzioni trigger coinvolte.
-- Non legge righe CRM e non modifica schema, dati o permessi.
with target_functions as (
  select p.oid, n.nspname as schema_name, p.proname as function_name,
         pg_get_function_identity_arguments(p.oid) as identity_arguments,
         pg_get_functiondef(p.oid) as definition,
         p.prosecdef as security_definer,
         p.proconfig as function_settings
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'nextway_claim_conversion_activation',
      'nextway_finalize_conversion_activation',
      'nextway_release_conversion_activation',
      'nextway_guard_conversion_request_review',
      'nextway_set_conversion_request_updated_at'
    )
),
target_policies as (
  select schemaname, tablename, policyname, permissive, roles,
         cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'nextway_lead_conversion_requests',
      'nextway_leads',
      'clients',
      'partner_details',
      'nextway_workspace_memberships',
      'nextway_workspaces'
    )
)
select jsonb_pretty(jsonb_build_object(
  'audit', 'NEXTWAY_CONVERSION_FUNCTION_DEFINITIONS_READ_ONLY',
  'functions', coalesce((select jsonb_agg(to_jsonb(f) order by f.function_name, f.identity_arguments) from target_functions f), '[]'::jsonb),
  'policies', coalesce((select jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname) from target_policies p), '[]'::jsonb),
  'interpretation', 'DDL and catalog metadata only. No application rows are read or changed.'
)) as nextway_conversion_function_definitions;
