-- NEXTWAY: verifica mirata in SOLA LETTURA di oggetti Setter e registro migrazioni.
-- Eseguire nel SQL Editor del progetto nextway-platform (ref obqwbtlltxjfeirstsya).
-- Non modifica dati o schema. Contiene esclusivamente SELECT sui cataloghi.
-- Non si presume uno schema o un nome specifico per il registro:
-- la ricerca viene effettuata soltanto sui cataloghi PostgreSQL.

-- RISULTATO 1: cerca eventuali tabelle di registro migrazioni senza presumere
-- schema o nome. L'assenza di righe significa che non è stato trovato un
-- registro con questi nomi convenzionali, non che le migrazioni non siano state applicate.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind as relation_kind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and (
    c.relname ilike '%migration%'
    or n.nspname ilike '%migration%'
  )
  and n.nspname not in ('pg_catalog', 'information_schema')
order by n.nspname, c.relname;

-- RISULTATO 2: stato degli oggetti richiesti dal codice Setter.
select category, item, detail, present
from (
  select 'TABLE'::text as category,
         'public.nextway_setter_generation_requests'::text as item,
         'Store legacy Setter'::text as detail,
         to_regclass('public.nextway_setter_generation_requests') is not null as present
  union all
  select 'TABLE', 'public.nextway_setter_workspace_generation_requests',
         'Store Setter workspace',
         to_regclass('public.nextway_setter_workspace_generation_requests') is not null
  union all
  select 'TABLE', 'public.nextway_api_rate_limits',
         'Contatori rate limit',
         to_regclass('public.nextway_api_rate_limits') is not null
  union all
  select 'FUNCTION', 'public.nextway_consume_api_rate_limit(text,integer)',
         'RPC rate limit usata da nextway-ai-setter',
         to_regprocedure('public.nextway_consume_api_rate_limit(text,integer)') is not null
  union all
  select 'FUNCTION', 'public.nextway_get_active_setter_governance(uuid)',
         'RPC governance usata per conversazioni workspace',
         to_regprocedure('public.nextway_get_active_setter_governance(uuid)') is not null
  union all
  select 'FUNCTION', 'public.nextway_clear_stale_setter_output()',
         'Pulizia output staged su riassegnazione lease',
         to_regprocedure('public.nextway_clear_stale_setter_output()') is not null
  union all
  select 'TRIGGER', 'nextway_clear_stale_setter_output_trg',
         'Trigger sulla tabella legacy',
         exists (
           select 1
           from pg_catalog.pg_trigger t
           where t.tgname = 'nextway_clear_stale_setter_output_trg'
             and t.tgrelid = to_regclass('public.nextway_setter_generation_requests')
             and not t.tgisinternal
         )
  union all
  select 'FUNCTION', 'public.nextway_prune_setter_generation_requests()',
         'RPC manuale admin-only per retention legacy',
         to_regprocedure('public.nextway_prune_setter_generation_requests()') is not null
) as object_status
order by category, item;
