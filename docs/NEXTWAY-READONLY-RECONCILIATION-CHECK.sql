-- NEXTWAY: verifica mirata in SOLA LETTURA di migrazioni e oggetti Setter.
-- Eseguire nel SQL Editor del progetto nextway-platform (ref obqwbtlltxjfeirstsya).
-- Non modifica dati o schema. Non contiene INSERT/UPDATE/DELETE/DDL.
-- Se la tabella supabase_migrations.schema_migrations non è accessibile,
-- interrompere e segnalare l'errore: non sostituire con altre tabelle.

begin transaction read only;

with expected_migrations(version, label) as (
  values
    ('20261110000100', 'Rate limit: tabella e prima RPC'),
    ('20261110000300', 'Rate limit: RPC a unità (firma text, integer)'),
    ('20261110000400', 'Retention idempotenza Setter legacy'),
    ('20261110000700', 'Pulizia output staged Setter legacy'),
    ('20261112020000', 'Isolamento tabella generation workspace'),
    ('20261112030000', 'RPC governance Setter workspace')
),
migration_status as (
  select
    'MIGRATION'::text as category,
    e.version as item,
    e.label as detail,
    exists (
      select 1
      from supabase_migrations.schema_migrations m
      where m.version = e.version
    ) as present
  from expected_migrations e
),
object_status as (
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
)
select category, item, detail, present
from migration_status
union all
select category, item, detail, present
from object_status
order by category, item;

commit;
