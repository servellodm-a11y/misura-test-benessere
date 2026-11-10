-- NEXTWAY: rate limit atomico e condiviso per utente.
-- Finestra fissa di 60 secondi; i limiti sono definiti lato database e non dal client.
-- La tabella non è direttamente leggibile/scrivibile dagli utenti applicativi.

create table if not exists public.nextway_api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('ai_setter', 'public_search')),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

alter table public.nextway_api_rate_limits enable row level security;
revoke all on table public.nextway_api_rate_limits from public, anon, authenticated;

create or replace function public.nextway_consume_api_rate_limit(p_scope text)
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

  case p_scope
    when 'ai_setter' then v_limit := 5;
    when 'public_search' then v_limit := 3;
    else
      raise exception 'Ambito rate limit non valido' using errcode = '22023';
  end case;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 60) * 60
  );

  insert into public.nextway_api_rate_limits as current_limit
    (user_id, scope, window_start, request_count, updated_at)
  values
    (v_user_id, p_scope, v_window_start, 1, clock_timestamp())
  on conflict (user_id, scope) do update
    set window_start = excluded.window_start,
        request_count = case
          when current_limit.window_start = excluded.window_start
            then current_limit.request_count + 1
          else 1
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

revoke all on function public.nextway_consume_api_rate_limit(text) from public, anon;
grant execute on function public.nextway_consume_api_rate_limit(text) to authenticated;

comment on table public.nextway_api_rate_limits is
  'Contatori atomici per rate limit NEXTWAY per utente e ambito, finestra fissa di 60 secondi.';
comment on function public.nextway_consume_api_rate_limit(text) is
  'Consuma una richiesta nel limite server-side: 5/minuto AI Setter, 3/minuto ricerca pubblica.';
