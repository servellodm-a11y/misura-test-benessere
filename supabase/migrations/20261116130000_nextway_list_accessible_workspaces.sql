-- NEXTWAY: list only active workspaces the signed-in user may search.
-- Platform administrators can select any active workspace; other users need
-- an active membership with a role permitted to run prospect searches.
-- Read-only RPC. No workspace or membership rows are created or modified.

begin;

do $$
begin
  if to_regclass('public.nextway_workspaces') is null
     or to_regclass('public.nextway_workspace_memberships') is null then
    raise exception 'NEXTWAY workspace and membership tables are required.';
  end if;
  if to_regprocedure('public.nextway_is_platform_admin()') is null then
    raise exception 'NEXTWAY platform administrator helper is required.';
  end if;
end;
$$;

create or replace function public.nextway_list_accessible_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select w.id, w.name, 'platform_admin'::text
  from public.nextway_workspaces w
  where auth.uid() is not null
    and w.status = 'active'
    and public.nextway_is_platform_admin()

  union all

  select w.id, w.name, m.workspace_role
  from public.nextway_workspaces w
  join public.nextway_workspace_memberships m
    on m.workspace_id = w.id
  where auth.uid() is not null
    and not public.nextway_is_platform_admin()
    and w.status = 'active'
    and m.user_id = auth.uid()
    and m.membership_status = 'active'
    and m.workspace_role = any(array[
      'workspace_owner','workspace_admin','workspace_manager','workspace_member'
    ]::text[])
  order by workspace_name, workspace_id;
$$;

alter function public.nextway_list_accessible_workspaces() owner to postgres;
revoke all on function public.nextway_list_accessible_workspaces() from public, anon;
grant execute on function public.nextway_list_accessible_workspaces() to authenticated;

comment on function public.nextway_list_accessible_workspaces() is
  'Lists active search workspaces for the current user: all active workspaces for platform_admin, otherwise active memberships with search-capable roles.';

commit;
