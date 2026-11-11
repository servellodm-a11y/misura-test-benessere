-- NEXTWAY AI Knowledge Base — initial document registry and text retrieval
-- Date: 2026-11-11
-- Additive migration candidate. Review and apply manually only after backup/schema review.
-- No existing tables are altered. No extension or external vector service is required.

begin;

create table if not exists public.nextway_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  module_key text not null,
  title text not null,
  source_type text not null
    check (source_type in ('official_document', 'scientific_publication', 'training_material', 'faq', 'policy', 'other')),
  source_reference text,
  storage_path text,
  language_code text not null default 'it'
    check (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  version_label text,
  valid_from date,
  valid_until date,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'superseded')),
  content_sha256 text
    check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nextway_knowledge_document_dates
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint nextway_knowledge_document_approval
    check (
      (approval_status = 'approved' and approved_at is not null and approved_by is not null)
      or approval_status <> 'approved'
    )
);

create index if not exists nextway_knowledge_documents_module_status_idx
  on public.nextway_knowledge_documents(module_key, approval_status, language_code);
create index if not exists nextway_knowledge_documents_validity_idx
  on public.nextway_knowledge_documents(valid_from, valid_until);

create table if not exists public.nextway_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.nextway_knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(btrim(content)) between 1 and 12000),
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, content)) stored,
  token_estimate integer check (token_estimate is null or token_estimate >= 0),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists nextway_knowledge_chunks_search_idx
  on public.nextway_knowledge_chunks using gin(search_vector);
create index if not exists nextway_knowledge_chunks_document_idx
  on public.nextway_knowledge_chunks(document_id, chunk_index);

alter table public.nextway_knowledge_documents enable row level security;
alter table public.nextway_knowledge_chunks enable row level security;

revoke all on public.nextway_knowledge_documents from public, anon;
revoke all on public.nextway_knowledge_chunks from public, anon;
grant select, insert, update, delete on public.nextway_knowledge_documents to authenticated, service_role;
grant select, insert, update, delete on public.nextway_knowledge_chunks to authenticated, service_role;

drop policy if exists nextway_knowledge_documents_admin_all
  on public.nextway_knowledge_documents;
create policy nextway_knowledge_documents_admin_all
  on public.nextway_knowledge_documents
  for all to authenticated
  using (public.nextway_is_platform_admin())
  with check (public.nextway_is_platform_admin());

drop policy if exists nextway_knowledge_documents_approved_read
  on public.nextway_knowledge_documents;
create policy nextway_knowledge_documents_approved_read
  on public.nextway_knowledge_documents
  for select to authenticated
  using (
    approval_status = 'approved'
    and (valid_from is null or valid_from <= current_date)
    and (valid_until is null or valid_until >= current_date)
  );

drop policy if exists nextway_knowledge_chunks_admin_all
  on public.nextway_knowledge_chunks;
create policy nextway_knowledge_chunks_admin_all
  on public.nextway_knowledge_chunks
  for all to authenticated
  using (public.nextway_is_platform_admin())
  with check (public.nextway_is_platform_admin());

drop policy if exists nextway_knowledge_chunks_approved_read
  on public.nextway_knowledge_chunks;
create policy nextway_knowledge_chunks_approved_read
  on public.nextway_knowledge_chunks
  for select to authenticated
  using (
    exists (
      select 1
      from public.nextway_knowledge_documents d
      where d.id = document_id
        and d.approval_status = 'approved'
        and (d.valid_from is null or d.valid_from <= current_date)
        and (d.valid_until is null or d.valid_until >= current_date)
    )
  );

create or replace function public.nextway_search_knowledge(
  p_query text,
  p_module_key text default 'zinzino',
  p_language_code text default 'it',
  p_limit integer default 5
)
returns table (
  document_id uuid,
  document_title text,
  module_key text,
  language_code text,
  version_label text,
  source_reference text,
  chunk_id uuid,
  chunk_index integer,
  content text,
  relevance real
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    d.id,
    d.title,
    d.module_key,
    d.language_code,
    d.version_label,
    d.source_reference,
    c.id,
    c.chunk_index,
    c.content,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('italian'::regconfig, p_query))::real
  from public.nextway_knowledge_chunks c
  join public.nextway_knowledge_documents d on d.id = c.document_id
  where auth.uid() is not null
    and nullif(btrim(p_query), '') is not null
    and d.approval_status = 'approved'
    and (d.valid_from is null or d.valid_from <= current_date)
    and (d.valid_until is null or d.valid_until >= current_date)
    and d.module_key = p_module_key
    and d.language_code = p_language_code
    and c.search_vector @@ websearch_to_tsquery('italian'::regconfig, p_query)
  order by ts_rank_cd(c.search_vector, websearch_to_tsquery('italian'::regconfig, p_query)) desc,
           d.title asc,
           c.chunk_index asc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.nextway_search_knowledge(text, text, text, integer)
  from public, anon;
grant execute on function public.nextway_search_knowledge(text, text, text, integer)
  to authenticated, service_role;

commit;
