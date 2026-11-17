-- NEXTWAY | DRAFT RIPRISTINO P0
-- NON ESEGUIRE IN PRODUZIONE SENZA REVISIONE E AUTORIZZAZIONE ESPLICITA.
-- Basato sulle migrazioni originali 20261110000100 + 20261110000300 + 20261112030000.
-- Crea solo oggetti mancanti; nessun dato applicativo viene inserito/eliminato.
-- La tabella rate limit sarà vuota alla creazione.

begin;

do $preflight$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('auth.users') is null then
    v_missing := array_append(v_missing, 'auth.users');
  end if;
  if to_regclass('public.profiles') is null then
    v_missing := array_append(v_missing, 'public.profiles');
  end if;
  if to_regclass('public.nextway_workspaces') is null then
    v_missing := array_append(v_missing, 'public.nextway_workspaces');
  end if;
  if to_regclass('public.nextway_workspace_prompts') is null then
    v_missing := array_append(v_missing, 'public.nextway_workspace_prompts');
  end if;
  if to_regclass('public.nextway_workspace_prospect_criteria') is null then
    v_missing := array_append(v_missing, 'public.nextway_workspace_prospect_criteria');
  end if;
  if to_regprocedure('public.nextway_has_workspace_access(uuid,text[])') is null then
    v_missing := array_append(v_missing, 'public.nextway_has_workspace_access(uuid,text[])');
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_workspaces' and column_name='status') then
    v_missing := array_append(v_missing, 'nextway_workspaces.status');
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_workspace_prompts'
      and column_name in ('workspace_id','prompt_key','version','purpose','prompt_body','status')
    group by table_name having count(*)=6) then
    v_missing := array_append(v_missing, 'colonne richieste nextway_workspace_prompts');
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='nextway_workspace_prospect_criteria'
      and column_name in ('workspace_id','criteria_key','version','name','description','config','status')
    group by table_name having count(*)=7) then
    v_missing := array_append(v_missing, 'colonne richieste nextway_workspace_prospect_criteria');
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Pre-flight P0 fallito; oggetti/colonne mancanti: %', array_to_string(v_missing, ', ');
  end if;

  if to_regclass('public.nextway_api_rate_limits') is not null then
    raise exception 'Tabella nextway_api_rate_limits già presente: fermarsi e riconciliare.';
  end if;
  if to_regprocedure('public.nextway_consume_api_rate_limit(text,integer)') is not null
     or to_regprocedure('public.nextway_consume_api_rate_limit(text)') is not null then
    raise exception 'Una firma della RPC rate limit è già presente: fermarsi e riconciliare.';
  end if;
  if to_regprocedure('public.nextway_get_active_setter_governance(uuid)') is not null then
    raise exception 'RPC nextway_get_active_setter_governance(uuid) già presente: fermarsi e riconciliare.';
  end if;
end;
$preflight$;

create table public.nextway_api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('ai_setter', 'public_search')),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

alter table public.nextway_api_rate_limits enable row level security;
revoke all on table public.nextway_api_rate_limits from public, anon, authenticated;

create or replace function public.nextway_consume_api_rate_limit(
  p_scope text,
  p_units integer default 1
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_window_start timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;
  if p_units is null or p_units < 1 or p_units > 5 then
    raise exception 'Numero di unità non valido' using errcode = '22023';
  end if;

  case p_scope
    when 'ai_setter' then
      v_limit := 5;
      if p_units <> 1 then
        raise exception 'Unità non valide per AI Setter' using errcode = '22023';
      end if;
    when 'public_search' then
      v_limit := 10;
    else
      raise exception 'Ambito rate limit non valido' using errcode = '22023';
  end case;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 60) * 60
  );

  insert into public.nextway_api_rate_limits as current_limit
    (user_id, scope, window_start, request_count, updated_at)
  values
    (v_user_id, p_scope, v_window_start, p_units, clock_timestamp())
  on conflict (user_id, scope) do update
    set window_start = excluded.window_start,
        request_count = case
          when current_limit.window_start = excluded.window_start
            then least(current_limit.request_count + excluded.request_count, v_limit + 1)
          else excluded.request_count
        end,
        updated_at = clock_timestamp()
  returning request_count into v_count;

  return query
    select (v_count <= v_limit),
      greatest(v_limit - v_count, 0),
      v_window_start + interval '60 seconds';
end;
$$;

revoke all on function public.nextway_consume_api_rate_limit(text, integer)
  from public, anon;
grant execute on function public.nextway_consume_api_rate_limit(text, integer)
  to authenticated;

comment on table public.nextway_api_rate_limits is
  'Contatori atomici NEXTWAY per utente e ambito, finestra fissa di 60 secondi.';
comment on function public.nextway_consume_api_rate_limit(text, integer) is
  'Rate limit atomico per unità: AI Setter 5 generazioni/minuto; ricerca Tavily 10 query/minuto per utente.';

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
  if not exists (
    select 1 from public.nextway_workspaces w
    where w.id = p_workspace_id and w.status = 'active'
  ) then
    raise exception 'Workspace non attivo' using errcode = '42501';
  end if;
  if not public.nextway_has_workspace_access(
    p_workspace_id,
    array['workspace_owner','workspace_admin','workspace_manager','workspace_member']::text[]
  ) then
    raise exception 'Accesso al workspace non autorizzato' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'prompts',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'prompt_key', p.prompt_key,
        'version', p.version,
        'purpose', p.purpose,
        'prompt_body', p.prompt_body
      ) order by p.prompt_key, p.version desc)
      from (
        select prompt_key, version, purpose, prompt_body
        from public.nextway_workspace_prompts
        where workspace_id = p_workspace_id and status = 'active'
        order by prompt_key, version desc
        limit 10
      ) p
    ), '[]'::jsonb),
    'criteria',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'criteria_key', c.criteria_key,
        'version', c.version,
        'name', c.name,
        'description', c.description,
        'config', c.config
      ) order by c.criteria_key, c.version desc)
      from (
        select criteria_key, version, name, description, config
        from public.nextway_workspace_prospect_criteria
        where workspace_id = p_workspace_id and status = 'active'
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
  'Restituisce solo prompt e criteri attivi a membri autorizzati di un workspace attivo.';

commit;

-- NOTA: questo script non crea le vecchie colonne user_id/lease_expires_at.
-- La tabella legacy attuale usa owner_profile_id/claimed_at: le migrazioni
-- cleanup/retention della vecchia generazione non sono compatibili e non vanno applicate.
