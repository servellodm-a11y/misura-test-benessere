-- NEXTWAY staging: preflight read-only della baseline core.
-- Eseguire SOLO sul progetto staging, dopo aver caricato la baseline schema-only.
-- Non legge righe applicative, Auth users, contenuti o segreti; consulta solo cataloghi.

with required_columns(schema_name, table_name, column_name) as (
  values
    ('auth','users','id'),
    ('auth','users','email'),
    ('auth','users','email_confirmed_at'),
    ('auth','users','raw_user_meta_data'),
    ('public','profiles','id'),
    ('public','profiles','role'),
    ('public','nextway_leads','id'),
    ('public','nextway_leads','owner_profile_id'),
    ('public','nextway_leads','status'),
    ('public','nextway_leads','archived_at'),
    ('public','nextway_setter_conversations','id'),
    ('public','nextway_setter_conversations','owner_profile_id'),
    ('public','nextway_setter_conversations','lead_id'),
    ('public','nextway_setter_conversations','status'),
    ('public','nextway_setter_conversations','last_message_at'),
    ('public','nextway_setter_messages','id'),
    ('public','nextway_setter_messages','conversation_id'),
    ('public','nextway_setter_messages','owner_profile_id'),
    ('public','nextway_setter_messages','direction'),
    ('public','nextway_setter_messages','content'),
    ('public','nextway_setter_messages','message_type'),
    ('public','nextway_setter_messages','ai_generated'),
    ('public','nextway_setter_messages','created_at'),
    ('public','partner_details','profile_id'),
    ('public','partner_details','first_name'),
    ('public','partner_details','last_name'),
    ('public','partner_details','phone'),
    ('public','partner_details','language'),
    ('public','partner_details','sponsor_profile_id'),
    ('public','partner_details','team_side'),
    ('public','partner_details','status'),
    ('public','partner_details','nextway_conversion_request_id'),
    ('public','clients','id'),
    ('public','clients','partner_profile_id'),
    ('public','clients','first_name'),
    ('public','clients','last_name'),
    ('public','clients','email'),
    ('public','clients','phone'),
    ('public','clients','acquisition_date'),
    ('public','clients','source'),
    ('public','clients','status'),
    ('public','clients','nextway_conversion_request_id')
),
checks as (
  select
    r.schema_name,
    r.table_name,
    r.column_name,
    case
      when t.table_name is null then 'TABLE_MISSING'
      when c.column_name is null then 'COLUMN_MISSING'
      else 'OK'
    end as result
  from required_columns r
  left join information_schema.tables t
    on t.table_schema=r.schema_name
   and t.table_name=r.table_name
   and t.table_type='BASE TABLE'
  left join information_schema.columns c
    on c.table_schema=r.schema_name
   and c.table_name=r.table_name
   and c.column_name=r.column_name
)
select schema_name, table_name, column_name, result
from checks
order by schema_name, table_name, column_name;

-- RLS inventory for the six public application-core tables.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='r'
  and c.relname in (
    'profiles',
    'nextway_leads',
    'nextway_setter_conversations',
    'nextway_setter_messages',
    'partner_details',
    'clients'
  )
order by c.relname;

-- Deliberately no SELECT from application tables or auth.users.
