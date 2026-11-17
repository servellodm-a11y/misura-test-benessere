-- NEXTWAY | PRE-FLIGHT RIPRISTINO P0/P1/P2
-- Una sola riga / una sola cella "report".
-- Solo lettura: nessun DDL/DML, nessuna modifica a produzione.

WITH required AS (
  SELECT *
  FROM (VALUES
    ('BASE', 'public.profiles', to_regclass('public.profiles') IS NOT NULL),
    ('BASE', 'auth.users', to_regclass('auth.users') IS NOT NULL),
    ('BASE', 'public.nextway_setter_generation_requests', to_regclass('public.nextway_setter_generation_requests') IS NOT NULL),
    ('BASE', 'public.nextway_setter_conversations', to_regclass('public.nextway_setter_conversations') IS NOT NULL),
    ('BASE', 'public.nextway_leads', to_regclass('public.nextway_leads') IS NOT NULL),
    ('WORKSPACE', 'public.nextway_workspaces', to_regclass('public.nextway_workspaces') IS NOT NULL),
    ('WORKSPACE', 'public.nextway_workspace_prompts', to_regclass('public.nextway_workspace_prompts') IS NOT NULL),
    ('WORKSPACE', 'public.nextway_workspace_prospect_criteria', to_regclass('public.nextway_workspace_prospect_criteria') IS NOT NULL),
    ('WORKSPACE', 'public.nextway_has_workspace_access(uuid,text[])', to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') IS NOT NULL),
    ('WORKSPACE', 'public.nextway_is_platform_admin()', to_regprocedure('public.nextway_is_platform_admin()') IS NOT NULL)
  ) AS x(priority, object_name, present)
),
required_columns AS (
  SELECT *
  FROM (VALUES
    ('LEGACY', 'nextway_setter_generation_requests', 'user_id'),
    ('LEGACY', 'nextway_setter_generation_requests', 'idempotency_key'),
    ('LEGACY', 'nextway_setter_generation_requests', 'conversation_id'),
    ('LEGACY', 'nextway_setter_generation_requests', 'generated_output'),
    ('LEGACY', 'nextway_setter_generation_requests', 'status'),
    ('LEGACY', 'nextway_setter_generation_requests', 'updated_at'),
    ('LEGACY', 'nextway_setter_generation_requests', 'lease_expires_at'),
    ('CONVERSATION', 'nextway_setter_conversations', 'workspace_id'),
    ('CONVERSATION', 'nextway_setter_conversations', 'owner_profile_id'),
    ('LEAD', 'nextway_leads', 'workspace_id')
  ) AS x(priority, table_name, column_name)
),
column_results AS (
  SELECT
    priority,
    table_name || '.' || column_name AS object_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = required_columns.table_name
        AND c.column_name = required_columns.column_name
    ) AS present
  FROM required_columns
),
rls_results AS (
  SELECT
    'RLS'::text AS priority,
    v.table_name::text AS object_name,
    COALESCE(c.relrowsecurity, false) AS present
  FROM (VALUES
    ('nextway_setter_generation_requests'),
    ('nextway_setter_conversations'),
    ('nextway_leads'),
    ('nextway_workspaces'),
    ('nextway_workspace_prompts'),
    ('nextway_workspace_prospect_criteria')
  ) v(table_name)
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || v.table_name)
),
all_checks AS (
  SELECT priority, object_name, present FROM required
  UNION ALL
  SELECT priority, object_name, present FROM column_results
  UNION ALL
  SELECT priority, object_name, present FROM rls_results
)
SELECT
  'NEXTWAY - PRE-FLIGHT RIPRISTINO' || E'\n\n' ||
  string_agg(
    priority || ' | ' || object_name || ' | ' ||
    CASE WHEN present THEN 'OK' ELSE 'MANCANTE / DA VERIFICARE' END,
    E'\n' ORDER BY priority, object_name
  ) ||
  E'\n\nRPC/FUNZIONI TARGET (atteso assente prima del ripristino):' ||
  E'\nRate limit: ' ||
  CASE WHEN to_regprocedure('public.nextway_consume_api_rate_limit(text,integer)') IS NULL THEN 'ASSENTE' ELSE 'GIA PRESENTE' END ||
  E'\nGovernance: ' ||
  CASE WHEN to_regprocedure('public.nextway_get_active_setter_governance(uuid)') IS NULL THEN 'ASSENTE' ELSE 'GIA PRESENTE' END ||
  E'\nCleanup staged: ' ||
  CASE WHEN to_regprocedure('public.nextway_clear_stale_setter_output()') IS NULL THEN 'ASSENTE' ELSE 'GIA PRESENTE' END ||
  E'\nRetention: ' ||
  CASE WHEN to_regprocedure('public.nextway_prune_setter_generation_requests()') IS NULL THEN 'ASSENTE' ELSE 'GIA PRESENTE' END ||
  E'\n\nNOTA: controllo read-only. Non applicare migrazioni se una dipendenza è mancante o se un oggetto target risulta già presente.' AS report
FROM all_checks;
