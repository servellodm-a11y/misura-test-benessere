-- NEXTWAY | DEFINIZIONI HELPER WORKSPACE E GOVERNANCE
-- SOLA LETTURA: una sola cella di testo, nessuna modifica a schema o dati.

WITH targets AS (
  SELECT p.oid, n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_functiondef(p.oid) AS definition,
         pg_get_userbyid(p.proowner) AS owner,
         p.prosecdef AS security_definer,
         p.proconfig AS settings,
         COALESCE((
           SELECT string_agg(
             CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                  ELSE pg_get_userbyid(a.grantee) END
             || ':' || a.privilege_type,
             ', ' ORDER BY a.grantee, a.privilege_type
           )
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE a.privilege_type = 'EXECUTE'
         ), 'Nessun EXECUTE esplicito') AS execute_privileges
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('nextway_is_platform_admin', 'nextway_has_workspace_access')
),
sections AS (
  SELECT
    proname || '(' || arguments || ')' || E'\n' ||
    'OWNER: ' || owner || E'\n' ||
    'SECURITY DEFINER: ' || CASE WHEN security_definer THEN 'SI' ELSE 'NO' END || E'\n' ||
    'SETTINGS: ' || COALESCE(settings::text, '-') || E'\n' ||
    'EXECUTE: ' || execute_privileges || E'\n' ||
    'DEFINITION:' || E'\n' || definition AS section
  FROM targets
)
SELECT COALESCE(
  string_agg(section, E'\n\n==============================\n\n' ORDER BY section),
  'NESSUNA FUNZIONE HELPER TROVATA'
) AS report_unico
FROM sections;
