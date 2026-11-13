-- NEXTWAY: lettura sola dei privilegi EXECUTE delle funzioni di conversione e workspace.
-- Non legge dati CRM e non modifica schema, dati o permessi.

with targets as (
  select
    p.oid,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    p.proowner,
    coalesce(p.proacl, acldefault('f', p.proowner)) as effective_acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'nextway_claim_conversion_activation',
      'nextway_finalize_conversion_activation',
      'nextway_release_conversion_activation',
      'nextway_guard_conversion_request_review',
      'nextway_set_conversion_request_updated_at',
      'nextway_has_workspace_access',
      'nextway_is_platform_admin'
    )
)
select
  schema_name,
  function_name,
  identity_arguments,
  coalesce(grantee.rolname, 'PUBLIC') as grantee,
  acl.privilege_type,
  acl.is_grantable
from targets t
cross join lateral aclexplode(t.effective_acl) as acl
left join pg_roles grantee on grantee.oid = acl.grantee
order by function_name, identity_arguments, grantee, acl.privilege_type;

-- Inventario firme delle overload (anche se non hanno ACL esplicita).
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proacl is null as uses_default_acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'nextway_claim_conversion_activation',
    'nextway_finalize_conversion_activation',
    'nextway_release_conversion_activation',
    'nextway_guard_conversion_request_review',
    'nextway_set_conversion_request_updated_at',
    'nextway_has_workspace_access',
    'nextway_is_platform_admin'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);
