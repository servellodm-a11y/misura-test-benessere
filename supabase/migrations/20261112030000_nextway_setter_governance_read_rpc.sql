-- NEXTWAY AI Setter: expose approved workspace instructions and qualification criteria
-- to active workspace members through a narrow, read-only SECURITY DEFINER RPC.
-- Drafts and administrative metadata are never returned.

begin;

create or replace function public.nextway_get_active_setter_governance(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticazione richiesta' using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'Workspace obbligatorio' using errcode = '22023';
  end if;

  -- Archived and draft workspaces must never drive live AI generation,
  -- including when the caller is a central platform administrator.
  if not exists (
    select 1
    from public.nextway_workspaces w
    where w.id = p_workspace_id
      and w.status = 'active'
  ) then
    raise exception 'Workspace non attivo' using errcode = '42501';
  end if;

  if not public.nextway_has_workspace_access(
    p_workspace_id,
    array[
      'workspace_owner',
      'workspace_admin',
      'workspace_manager',
      'workspace_member'
    ]::text[]
  ) then
    raise exception 'Accesso al workspace non autorizzato' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'prompts',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'prompt_key', p.prompt_key,
          'version', p.version,
          'purpose', p.purpose,
          'prompt_body', p.prompt_body
        ) order by p.prompt_key, p.version desc
      )
      from (
        select prompt_key, version, purpose, prompt_body
        from public.nextway_workspace_prompts
        where workspace_id = p_workspace_id
          and status = 'active'
        order by prompt_key, version desc
        limit 10
      ) p
    ), '[]'::jsonb),
    'criteria',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'criteria_key', c.criteria_key,
          'version', c.version,
          'name', c.name,
          'description', c.description,
          'config', c.config
        ) order by c.criteria_key, c.version desc
      )
      from (
        select criteria_key, version, name, description, config
        from public.nextway_workspace_prospect_criteria
        where workspace_id = p_workspace_id
          and status = 'active'
        order by criteria_key, version desc
        limit 10
      ) c
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.nextway_get_active_setter_governance(uuid)
  from public, anon;
grant execute on function public.nextway_get_active_setter_governance(uuid)
  to authenticated;

comment on function public.nextway_get_active_setter_governance(uuid) is
  'Returns only active AI Setter prompts and qualification criteria for an active workspace member or platform_admin. Drafts and admin-only management remain private.';

commit;
