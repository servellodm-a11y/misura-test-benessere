-- NEXTWAY CRM: diagnostica READ-ONLY per preparare l'attivazione di una conversione.
-- Eseguire nel SQL Editor del progetto Supabase NEXTWAY.
-- Questo script NON modifica dati, schema, policy o permessi.
-- Non restituisce email o telefoni individuali: solo struttura e conteggi aggregati.

-- 1) Colonne, obbligatorietà, default e tipi reali.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  is_identity,
  is_generated
from information_schema.columns
where table_schema = 'public'
  and table_name in ('clients', 'profiles', 'partner_details', 'nextway_leads',
                     'nextway_lead_conversion_requests')
order by table_name, ordinal_position;

-- 2) Vincoli: primary key, unique, foreign key e check.
select
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('clients', 'profiles', 'partner_details',
                    'nextway_leads', 'nextway_lead_conversion_requests')
order by c.relname, constraint_type, con.conname;

-- 3) Indici univoci e non univoci: necessari per prevenire duplicati in modo atomico.
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('clients', 'profiles', 'partner_details',
                    'nextway_lead_conversion_requests')
order by tablename, indexname;

-- 4) RLS e policy effettive: la futura attivazione dovrà rispettare i permessi correnti.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'profiles', 'partner_details',
                    'nextway_lead_conversion_requests')
order by tablename, policyname;

-- 5) Stato RLS e privilegi tabella/colonna per i ruoli applicativi.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  grantee,
  privilege_type,
  is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join information_schema.role_table_grants g
  on g.table_schema = n.nspname and g.table_name = c.relname
where n.nspname = 'public'
  and c.relname in ('clients', 'profiles', 'partner_details',
                    'nextway_lead_conversion_requests')
order by c.relname, grantee, privilege_type;

-- 6) Conteggi aggregati di email duplicate (nessun indirizzo viene mostrato).
-- Se una tabella non possiede la colonna email, il relativo conteggio sarà NULL.
select
  (select count(*) from (
    select lower(btrim(email)) as normalized_email
    from public.clients
    where email is not null and btrim(email) <> ''
    group by lower(btrim(email))
    having count(*) > 1
  ) d) as duplicate_email_groups_clients,
  (select count(*) from (
    select lower(btrim(email)) as normalized_email
    from public.profiles
    where email is not null and btrim(email) <> ''
    group by lower(btrim(email))
    having count(*) > 1
  ) d) as duplicate_email_groups_profiles;
