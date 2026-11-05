-- NEXTWAY AI Assistant — foundation schema (draft migration)
-- Date: 2026-11-05
-- IMPORTANT: additive only. Review the existing Supabase schema before execution.
-- No existing tables are altered. RLS is enabled with deny-by-default policies.
-- Access is intentionally not granted to browser clients in this first migration.
-- Use a trusted server-side service role only; never expose it in frontend code.

begin;

create table if not exists public.nw_contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone_e164 text,
  preferred_language text not null default 'it',
  contact_status text not null default 'active'
    check (contact_status in ('active', 'inactive', 'do_not_contact', 'archived')),
  source text,
  source_detail text,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nw_contacts_phone_format check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

create unique index if not exists nw_contacts_phone_e164_uidx
  on public.nw_contacts(phone_e164) where phone_e164 is not null;
create index if not exists nw_contacts_email_lower_idx
  on public.nw_contacts(lower(email)) where email is not null;
create index if not exists nw_contacts_owner_idx on public.nw_contacts(owner_user_id);

create table if not exists public.nw_contact_channels (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.nw_contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'web', 'email', 'phone', 'other')),
  channel_identifier text not null,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, channel_identifier)
);
create index if not exists nw_contact_channels_contact_idx
  on public.nw_contact_channels(contact_id);

create table if not exists public.nw_opportunity_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  module_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now()
);

insert into public.nw_opportunity_modules (module_key, module_name, description)
values ('zinzino', 'Zinzino', 'Primo modulo operativo NEXTWAY AI: prodotti, test, attività e formazione')
on conflict (module_key) do nothing;

create table if not exists public.nw_contact_interests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.nw_contacts(id) on delete cascade,
  interest_key text not null,
  interest_label text not null,
  interest_source text not null default 'declared'
    check (interest_source in ('declared', 'observed', 'imported', 'inferred')),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  notes text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists nw_contact_interests_contact_idx
  on public.nw_contact_interests(contact_id);
create index if not exists nw_contact_interests_key_idx
  on public.nw_contact_interests(interest_key);

create table if not exists public.nw_contact_skills (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.nw_contacts(id) on delete cascade,
  skill_name text not null,
  proficiency_note text,
  skill_source text not null default 'declared'
    check (skill_source in ('declared', 'observed', 'imported')),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists nw_contact_skills_contact_idx
  on public.nw_contact_skills(contact_id);

create table if not exists public.nw_contact_opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.nw_contacts(id) on delete cascade,
  module_id uuid not null references public.nw_opportunity_modules(id) on delete restrict,
  opportunity_status text not null default 'identified'
    check (opportunity_status in ('identified', 'interested', 'in_discussion', 'customer', 'partner', 'not_interested', 'closed')),
  interest_level text check (interest_level is null or interest_level in ('low', 'medium', 'high')),
  source text,
  notes text,
  first_linked_at timestamptz not null default now(),
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, module_id)
);
create index if not exists nw_contact_opportunities_contact_idx
  on public.nw_contact_opportunities(contact_id);
create index if not exists nw_contact_opportunities_module_idx
  on public.nw_contact_opportunities(module_id, opportunity_status);

create table if not exists public.nw_consent_records (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.nw_contacts(id) on delete cascade,
  purpose_key text not null,
  purpose_label text not null,
  legal_basis text not null
    check (legal_basis in ('consent', 'contract', 'legitimate_interest', 'legal_obligation', 'other')),
  decision text not null check (decision in ('granted', 'denied', 'withdrawn', 'objected')),
  notice_version text,
  collection_channel text,
  evidence_reference text,
  decided_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nw_consent_records_contact_purpose_idx
  on public.nw_consent_records(contact_id, purpose_key, decided_at desc);

create table if not exists public.nw_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.nw_contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'web', 'email', 'other')),
  external_conversation_id text,
  module_key text not null default 'zinzino',
  conversation_status text not null default 'open'
    check (conversation_status in ('open', 'human_handoff', 'closed')),
  started_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index if not exists nw_conversations_contact_idx
  on public.nw_conversations(contact_id, last_message_at desc);

create table if not exists public.nw_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nw_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  message_text text,
  provider_message_id text,
  delivery_status text not null default 'received'
    check (delivery_status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  created_at timestamptz not null default now()
);
create unique index if not exists nw_messages_provider_message_uidx
  on public.nw_messages(provider_message_id) where provider_message_id is not null;
create index if not exists nw_messages_conversation_created_idx
  on public.nw_messages(conversation_id, created_at);

create table if not exists public.nw_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  module_key text not null default 'zinzino',
  title text not null,
  source_type text not null check (source_type in ('official_document', 'scientific_publication', 'training_material', 'faq', 'other')),
  source_reference text,
  language_code text not null default 'it',
  version_label text,
  valid_from date,
  valid_until date,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'superseded')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nw_knowledge_sources_module_status_idx
  on public.nw_knowledge_sources(module_key, approval_status);

create table if not exists public.nw_handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nw_conversations(id) on delete cascade,
  reason text not null,
  handoff_status text not null default 'pending'
    check (handoff_status in ('pending', 'assigned', 'resolved', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Deny browser/API-role access until ownership and role policies are explicitly designed.
do $$
declare
  t text;
begin
  foreach t in array array[
    'nw_contacts',
    'nw_contact_channels',
    'nw_opportunity_modules',
    'nw_contact_interests',
    'nw_contact_skills',
    'nw_contact_opportunities',
    'nw_consent_records',
    'nw_conversations',
    'nw_messages',
    'nw_knowledge_sources',
    'nw_handoffs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

commit;
