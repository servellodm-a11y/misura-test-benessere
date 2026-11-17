-- NEXTWAY workspace-scoped commercial configuration reader.
-- Candidate migration only: do not apply until the PR chain is reviewed and approved.
-- This function reads settings.commercial without exposing workspace settings to the browser.

begin;

do $$
begin
  if to_regclass('public.nextway_workspaces') is null
     or to_regclass('public.nextway_workspace_memberships') is null
     or to_regprocedure('public.nextway_is_platform_admin()') is null then
    raise exception 'NEXTWAY workspace foundation and platform-admin helper are required.';
  end if;
end;
$$;

create or replace function public.nextway_get_workspace_commercial_config(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace public.nextway_workspaces%rowtype;
  v_allowed boolean := false;
begin
  if auth.uid() is null or p_workspace_id is null then
    raise exception 'Autenticazione e workspace richiesti.' using errcode = '42501';
  end if;

  select * into v_workspace
  from public.nextway_workspaces
  where id = p_workspace_id and status = 'active';

  if not found then
    raise exception 'Workspace attivo non disponibile.' using errcode = '42501';
  end if;

  if public.nextway_is_platform_admin() then
    v_allowed := true;
  else
    select exists (
      select 1
      from public.nextway_workspace_memberships m
      where m.workspace_id = p_workspace_id
        and m.user_id = auth.uid()
        and m.membership_status = 'active'
        and m.workspace_role = any(array[
          'workspace_owner','workspace_admin','workspace_manager','workspace_member'
        ]::text[])
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'Membership attiva con permesso di ricerca richiesta.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'workspace_id', v_workspace.id,
    'workspace_key', v_workspace.workspace_key,
    'workspace_name', v_workspace.name,
    'partner_name', v_workspace.partner_name,
    'sector', v_workspace.sector,
    'website_url', v_workspace.website_url,
    'market_country', v_workspace.market_country,
    'language_code', v_workspace.language_code,
    'commercial_config', coalesce(v_workspace.settings -> 'commercial', '{}'::jsonb)
  );
end;
$$;

alter function public.nextway_get_workspace_commercial_config(uuid) owner to postgres;
revoke all on function public.nextway_get_workspace_commercial_config(uuid) from public, anon;
grant execute on function public.nextway_get_workspace_commercial_config(uuid) to authenticated;

comment on function public.nextway_get_workspace_commercial_config(uuid) is
  'Returns only the commercial configuration for an active workspace after checking platform-admin or active search-capable membership. Reads settings.commercial; performs no writes.';

commit;
