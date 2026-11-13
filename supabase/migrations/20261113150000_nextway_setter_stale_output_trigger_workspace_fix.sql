-- NEXTWAY AI Setter: sposta la protezione stale-output sulla tabella workspace corretta.
-- Forward-only: non riscrive le migrazioni storiche 20261110000700 o 20261112020000.
-- La tabella legacy usa user_id/response; generated_output appartiene alla tabella workspace.

begin;

do $$
begin
  if to_regclass('public.nextway_setter_generation_requests') is null then
    raise exception 'Tabella legacy nextway_setter_generation_requests assente.';
  end if;
  if to_regclass('public.nextway_setter_workspace_generation_requests') is null then
    raise exception 'Tabella workspace nextway_setter_workspace_generation_requests assente; applicare prima la migrazione 20261112020000.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='nextway_setter_workspace_generation_requests'
      and column_name='generated_output'
  ) then
    raise exception 'Colonna generated_output assente dalla tabella workspace.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='nextway_setter_workspace_generation_requests'
      and column_name in ('owner_profile_id','idempotency_key','conversation_id')
    group by table_schema,table_name
    having count(*)=3
  ) then
    raise exception 'Colonne chiave workspace generation non coerenti.';
  end if;
end;
$$;

-- Rimuove il trigger storico che tentava di usare NEW.generated_output
-- sulla tabella legacy, che conserva invece la colonna response.
drop trigger if exists nextway_clear_stale_setter_output_trg
  on public.nextway_setter_generation_requests;

-- La funzione storica resta disponibile per compatibilità, ma non è più
-- collegata alla tabella legacy. Revoca l'esecuzione diretta dei client.
revoke all on function public.nextway_clear_stale_setter_output()
  from public, anon, authenticated;

create or replace function public.nextway_clear_stale_workspace_setter_output()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.owner_profile_id is distinct from old.owner_profile_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.conversation_id is distinct from old.conversation_id then
    new.generated_output := null;
  end if;
  return new;
end;
$$;

drop trigger if exists nextway_clear_stale_workspace_setter_output_trg
  on public.nextway_setter_workspace_generation_requests;

create trigger nextway_clear_stale_workspace_setter_output_trg
before update of owner_profile_id, idempotency_key, conversation_id
on public.nextway_setter_workspace_generation_requests
for each row
execute function public.nextway_clear_stale_workspace_setter_output();

revoke all on function public.nextway_clear_stale_workspace_setter_output()
  from public, anon, authenticated;

comment on function public.nextway_clear_stale_workspace_setter_output() is
  'Azzera l output AI temporaneo quando una richiesta workspace cambia proprietario, chiave idempotenza o conversazione.';

commit;
