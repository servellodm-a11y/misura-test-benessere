-- NEXTWAY: diagnostica read-only autorizzazioni conversazioni e messaggi AI Setter.
-- Eseguire nel SQL Editor del progetto Supabase corretto.
-- Restituisce solo metadati di schema, RLS, policy, grants e foreign key.
-- Non legge righe applicative e non modifica dati, schema, policy o permessi.

-- 1. Tabelle e colonne presenti per conversazioni/messaggi NEXTWAY.
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'nextway_setter_conversations',
    'nextway_setter_messages'
  )
order by c.table_name, c.ordinal_position;

-- 2. Stato RLS e FORCE RLS.
select
  n.nspname as schema_name,
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as force_rls
from pg_class cls
join pg_namespace n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'nextway_setter_conversations',
    'nextway_setter_messages'
  )
  and cls.relkind = 'r'
order by cls.relname;

-- 3. Policy effettive: comando, ruoli, USING e WITH CHECK.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'nextway_setter_conversations',
    'nextway_setter_messages'
  )
order by tablename, policyname;

-- 4. Privilegi SQL assegnati ai ruoli client.
select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'nextway_setter_conversations',
    'nextway_setter_messages'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 5. Relazioni tra conversazioni e messaggi.
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as referenced_table,
  ccu.column_name as referenced_column,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_schema = kcu.constraint_schema
 and tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_schema = ccu.constraint_schema
 and tc.constraint_name = ccu.constraint_name
where tc.constraint_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name in (
    'nextway_setter_conversations',
    'nextway_setter_messages'
  )
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;


-- 6. Metadati delle RPC richieste dall'AI Setter e della RPC di creazione Lead.
-- Include firma, SECURITY DEFINER, search_path e privilegi EXECUTE effettivi.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any (array[
    'nextway_create_lead_with_conversation',
    'nextway_consume_api_rate_limit',
    'nextway_begin_setter_generation',
    'nextway_complete_setter_generation',
    'nextway_store_setter_generation_output',
    'nextway_get_staged_setter_output',
    'nextway_prune_setter_generation_requests',
    'nextway_clear_stale_setter_output',
    'nextway_create_lead_with_conversation_idempotent',
    'nextway_prune_lead_creation_requests'
  ])
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 7. Stato RLS e FORCE RLS delle tabelle di servizio.
select
  n.nspname as schema_name,
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as force_rls
from pg_class cls
join pg_namespace n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'nextway_setter_generation_requests',
    'nextway_api_rate_limits',
    'nextway_lead_creation_requests'
  )
  and cls.relkind = 'r'
order by cls.relname;

-- 8. Colonne delle tabelle di servizio, senza leggere righe applicative.
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'nextway_setter_generation_requests',
    'nextway_api_rate_limits'
  )
order by c.table_name, c.ordinal_position;

-- 9. Policy e grants delle tabelle di servizio.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'nextway_setter_generation_requests',
    'nextway_api_rate_limits'
  )
order by tablename, policyname;

select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'nextway_setter_generation_requests',
    'nextway_api_rate_limits'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 10. Indici univoci e indici di retention/idempotenza.
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'nextway_setter_generation_requests',
    'nextway_api_rate_limits'
  )
order by tablename, indexname;
