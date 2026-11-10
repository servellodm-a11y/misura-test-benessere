-- NEXTWAY AI Setter: impedisce il riuso di output AI appartenenti a una prenotazione precedente.
-- Quando una lease pending scaduta viene trasferita a un nuovo utente/chiave,
-- l'eventuale output temporaneo precedente deve essere eliminato.

create or replace function public.nextway_clear_stale_setter_output()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.conversation_id is distinct from old.conversation_id then
    new.generated_output := null;
  end if;
  return new;
end;
$$;

drop trigger if exists nextway_clear_stale_setter_output_trg
  on public.nextway_setter_generation_requests;

create trigger nextway_clear_stale_setter_output_trg
before update of user_id, idempotency_key, conversation_id
on public.nextway_setter_generation_requests
for each row
execute function public.nextway_clear_stale_setter_output();

revoke all on function public.nextway_clear_stale_setter_output() from public, anon, authenticated;

comment on function public.nextway_clear_stale_setter_output() is
  'Azzera l output temporaneo quando una prenotazione idempotente cambia proprietario, chiave o conversazione.';
