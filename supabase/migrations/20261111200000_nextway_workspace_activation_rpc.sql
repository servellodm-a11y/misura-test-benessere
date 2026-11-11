-- Transactional activation for versioned workspace prompts and prospect criteria.
-- Called only by the authenticated platform-admin Edge Function using service role.

begin;

create or replace function public.nextway_activate_workspace_prompt(
  p_item_id uuid,
  p_admin_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_prompt_key text;
  v_status text;
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_admin_user_id and p.role = 'platform_admin'
  ) then
    raise exception 'Operazione riservata a platform_admin' using errcode = '42501';
  end if;

  select workspace_id, prompt_key, status
    into v_workspace_id, v_prompt_key, v_status
  from public.nextway_workspace_prompts
  where id = p_item_id
  for update;

  if v_workspace_id is null then
    raise exception 'Versione prompt non trovata' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Solo una bozza puo essere attivata' using errcode = '22023';
  end if;

  perform 1 from public.nextway_workspaces where id = v_workspace_id for update;
  update public.nextway_workspace_prompts
    set status = 'archived', updated_at = now()
  where workspace_id = v_workspace_id
    and prompt_key = v_prompt_key
    and status = 'active';

  update public.nextway_workspace_prompts
    set status = 'active', approved_by = p_admin_user_id,
        approved_at = now(), updated_at = now()
  where id = p_item_id and status = 'draft';

  if not found then
    raise exception 'Attivazione prompt non riuscita' using errcode = '40001';
  end if;
end;
$$;

create or replace function public.nextway_activate_workspace_criteria(
  p_item_id uuid,
  p_admin_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_criteria_key text;
  v_status text;
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_admin_user_id and p.role = 'platform_admin'
  ) then
    raise exception 'Operazione riservata a platform_admin' using errcode = '42501';
  end if;

  select workspace_id, criteria_key, status
    into v_workspace_id, v_criteria_key, v_status
  from public.nextway_workspace_prospect_criteria
  where id = p_item_id
  for update;

  if v_workspace_id is null then
    raise exception 'Versione criteri non trovata' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Solo una bozza puo essere attivata' using errcode = '22023';
  end if;

  perform 1 from public.nextway_workspaces where id = v_workspace_id for update;
  update public.nextway_workspace_prospect_criteria
    set status = 'archived', updated_at = now()
  where workspace_id = v_workspace_id
    and criteria_key = v_criteria_key
    and status = 'active';

  update public.nextway_workspace_prospect_criteria
    set status = 'active', approved_by = p_admin_user_id,
        approved_at = now(), updated_at = now()
  where id = p_item_id and status = 'draft';

  if not found then
    raise exception 'Attivazione criteri non riuscita' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.nextway_activate_workspace_prompt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nextway_activate_workspace_criteria(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nextway_activate_workspace_prompt(uuid, uuid) to service_role;
grant execute on function public.nextway_activate_workspace_criteria(uuid, uuid) to service_role;

commit;
