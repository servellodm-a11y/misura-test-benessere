-- NEXTWAY workspace membership and authorization foundation
-- Candidate only. No memberships are seeded and no operational RLS policies are changed.

begin;

create table if not exists public.nextway_workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.nextway_workspaces(id) on delete restrict,
  user_id uuid not null
    references auth.users(id) on delete restrict,
  workspace_role text not null default 'workspace_member'
    check (workspace_role in (
      'workspace_owner',
      'workspace_admin',
      'workspace_manager',
      'workspace_member',
      'workspace_viewer'
    )),
  membership_status text not null default 'invited'
    check (membership_status in ('invited', 'active', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  constraint nextway_workspace_membership_activation_check
    check (
      (membership_status = 'active' and activated_at is not null)
      or membership_status <> 'active'
    )
);

create unique index if not exists nextway_workspace_one_owner_uidx
  on public.nextway_workspace_memberships(workspace_id)
  where workspace_role = 'workspace_owner'
    and membership_status in ('invited', 'active');

create index if not exists nextway_workspace_memberships_user_status_idx
  on public.nextway_workspace_memberships(user_id, membership_status, workspace_id);

alter table public.nextway_workspace_memberships enable row level security;

revoke all on public.nextway_workspace_memberships from public, anon;
grant select, insert, update, delete
  on public.nextway_workspace_memberships to authenticated, service_role;

drop policy if exists nextway_workspace_memberships_admin_all
  on public.nextway_workspace_memberships;
create policy nextway_workspace_memberships_admin_all
  on public.nextway_workspace_memberships
  for all to authenticated
  using (public.nextway_is_platform_admin())
  with check (public.nextway_is_platform_admin());

drop policy if exists nextway_workspace_memberships_self_read
  on public.nextway_workspace_memberships;
create policy nextway_workspace_memberships_self_read
  on public.nextway_workspace_memberships
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.nextway_has_workspace_access(
  p_workspace_id uuid,
  p_allowed_roles text[] default array[
    'workspace_owner',
    'workspace_admin',
    'workspace_manager',
    'workspace_member',
    'workspace_viewer'
  ]::text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    auth.uid() is not null
    and (
      public.nextway_is_platform_admin()
      or (
        p_workspace_id is not null
        and exists (
        select 1
        from public.nextway_workspace_memberships m
        where m.workspace_id = p_workspace_id
          and m.user_id = auth.uid()
          and m.membership_status = 'active'
          and m.workspace_role = any(coalesce(p_allowed_roles, array[]::text[]))
        )
      )
    );
$$;

create or replace function public.nextway_can_manage_workspace(
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner', 'workspace_admin']::text[]
  );
$$;

revoke all on function public.nextway_has_workspace_access(uuid, text[]) from public, anon;
revoke all on function public.nextway_can_manage_workspace(uuid) from public, anon;
grant execute on function public.nextway_has_workspace_access(uuid, text[]) to authenticated, service_role;
grant execute on function public.nextway_can_manage_workspace(uuid) to authenticated, service_role;

comment on table public.nextway_workspace_memberships is
  'Workspace membership registry. Only platform_admin can create or change memberships; members can read their own membership rows.';
comment on function public.nextway_has_workspace_access(uuid, text[]) is
  'Returns true for platform_admin or an active membership with one of the requested workspace roles.';
comment on function public.nextway_can_manage_workspace(uuid) is
  'Returns true for platform_admin or an active workspace_owner/workspace_admin membership.';

commit;
