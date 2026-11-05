-- NEXTWAY AI - audit diagnostico read-only dello schema Supabase
-- Eseguire nel Supabase SQL Editor.
-- Questa query NON modifica dati, tabelle, policy o configurazioni.
-- Restituisce un unico risultato con colonne, stato RLS, policy e vincoli FK
-- di tutte le tabelle nello schema public.

WITH
columns_info AS (
  SELECT
    c.table_name,
    jsonb_agg(
      jsonb_build_object(
        'position', c.ordinal_position,
        'column', c.column_name,
        'type', c.data_type,
        'udt', c.udt_name,
        'nullable', c.is_nullable,
        'default', c.column_default
      ) ORDER BY c.ordinal_position
    ) AS details
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  GROUP BY c.table_name
),
rls_info AS (
  SELECT
    n.nspname AS table_schema,
    cl.relname AS table_name,
    cl.relrowsecurity AS rls_enabled,
    cl.relforcerowsecurity AS rls_forced
  FROM pg_class cl
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'public'
    AND cl.relkind IN ('r', 'p')
),
policy_info AS (
  SELECT
    schemaname,
    tablename,
    jsonb_agg(
      jsonb_build_object(
        'policy', policyname,
        'permissive', permissive,
        'roles', roles,
        'command', cmd,
        'using', qual,
        'with_check', with_check
      ) ORDER BY policyname
    ) AS details
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY schemaname, tablename
),
fk_info AS (
  SELECT
    tc.table_name,
    jsonb_agg(
      jsonb_build_object(
        'constraint', tc.constraint_name,
        'column', kcu.column_name,
        'references_table', ccu.table_name,
        'references_column', ccu.column_name
      ) ORDER BY tc.constraint_name, kcu.ordinal_position
    ) AS details
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_schema = kcu.constraint_schema
   AND tc.constraint_name = kcu.constraint_name
   AND tc.table_name = kcu.table_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_schema = tc.constraint_schema
   AND ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
  GROUP BY tc.table_name
)
SELECT
  'COLUMNS'::text AS audit_section,
  ci.table_name,
  ci.details
FROM columns_info ci

UNION ALL

SELECT
  'RLS'::text AS audit_section,
  ri.table_name,
  jsonb_build_object(
    'rls_enabled', ri.rls_enabled,
    'rls_forced', ri.rls_forced,
    'policies', COALESCE(pi.details, '[]'::jsonb)
  ) AS details
FROM rls_info ri
LEFT JOIN policy_info pi
  ON pi.schemaname = ri.table_schema
 AND pi.tablename = ri.table_name

UNION ALL

SELECT
  'FOREIGN_KEYS'::text AS audit_section,
  fi.table_name,
  fi.details
FROM fk_info fi

ORDER BY audit_section, table_name;
