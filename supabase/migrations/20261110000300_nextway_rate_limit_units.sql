-- NEXTWAY: conteggio del rate limit in unità di consumo.
-- AI Setter consuma 1 unità per generazione.
-- Ricerca pubblica consuma 1 unità per ogni query inoltrata a Tavily.
-- Il limite Tavily è 10 query/minuto per utente.

drop function if exists public.nextway_consume_api_rate_limit(text);

create or replace function public.nextway_consume_api_rate_limit(
  p_scope text,
  p_units integer default 1
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
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
            then current_limit.request_count + excluded.request_count
          else excluded.request_count
        end,
        updated_at = clock_timestamp()
  returning request_count into v_count;

  return query
    select
      (v_count <= v_limit),
      greatest(v_limit - v_count, 0),
      v_window_start + interval '60 seconds';
end;
$$;

revoke all on function public.nextway_consume_api_rate_limit(text, integer) from public, anon;
grant execute on function public.nextway_consume_api_rate_limit(text, integer) to authenticated;

comment on function public.nextway_consume_api_rate_limit(text, integer) is
  'Rate limit atomico per unità: AI Setter 5 generazioni/minuto; ricerca Tavily 10 query/minuto per utente.';
