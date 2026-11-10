-- NEXTWAY: diagnostica read-only dei campi profilo.
-- Da eseguire nel Supabase SQL Editor del progetto corretto.
-- Non legge righe utente e non modifica dati, schema, policy o configurazioni.
-- Serve a identificare i campi adatti a mostrare nomi leggibili nel registro admin.

select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('profiles', 'partner_details')
order by c.table_name, c.ordinal_position;

-- Relazioni tra profili e dettagli partner: solo metadati dei vincoli.
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
  and tc.table_name in ('profiles', 'partner_details')
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;
