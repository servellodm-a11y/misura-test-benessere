-- NEXTWAY AI Setter: manutenzione controllata delle chiavi idempotenti.
-- Le chiavi completate vengono conservate 30 giorni; le prenotazioni pending
-- scadute da almeno 24 ore possono essere eliminate.
-- Nessun job automatico viene creato: la manutenzione è manuale e admin-only.

create index if not exists nextway_setter_generation_requests_completed_retention_idx
  on public.nextway_setter_generation_requests (updated_at)
  where status = 'completed';

create index if not exists nextway_setter_generation_requests_pending_retention_idx
  on public.nextway_setter_generation_requests (lease_expires_at)
  where status = 'pending';

create or replace function public.nextway_prune_setter_generation_requests()
returns table (
  deleted_completed integer,
  deleted_abandoned_pending integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_completed integer := 0;
  v_pending integer := 0;
begin
  if v_user_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'platform_admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Operazione riservata a platform_admin'
      using errcode = '42501';
  end if;

  delete from public.nextway_setter_generation_requests
  where status = 'completed'
    and updated_at < clock_timestamp() - interval '30 days';
  get diagnostics v_completed = row_count;

  delete from public.nextway_setter_generation_requests
  where status = 'pending'
    and lease_expires_at < clock_timestamp() - interval '24 hours';
  get diagnostics v_pending = row_count;

  return query select v_completed, v_pending;
end;
$$;

revoke all on function public.nextway_prune_setter_generation_requests() from public, anon;
grant execute on function public.nextway_prune_setter_generation_requests() to authenticated;

comment on function public.nextway_prune_setter_generation_requests() is
  'Manutenzione manuale admin-only: elimina chiavi completate oltre 30 giorni e pending scadute da oltre 24 ore.';
