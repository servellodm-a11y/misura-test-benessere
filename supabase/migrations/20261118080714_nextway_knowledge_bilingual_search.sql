-- NEXTWAY Knowledge Base bilingual full-text search (Italian + English)
-- Additive: retains the existing Italian vector and adds an English vector.
begin;

alter table public.nextway_knowledge_documents
  drop constraint if exists nextway_knowledge_documents_language_code_check;

alter table public.nextway_knowledge_documents
  add constraint nextway_knowledge_documents_language_code_check
  check (language_code in ('it', 'en'));

alter table public.nextway_knowledge_chunks
  add column if not exists search_vector_en tsvector
  generated always as (to_tsvector('english'::regconfig, content)) stored;

create index if not exists nextway_knowledge_chunks_search_en_idx
  on public.nextway_knowledge_chunks using gin(search_vector_en);

create or replace function public.nextway_search_knowledge(
  p_workspace_id uuid,
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
  with search_input as (
    select
      case p_language_code
        when 'it' then websearch_to_tsquery('italian'::regconfig, p_query)
        when 'en' then websearch_to_tsquery('english'::regconfig, p_query)
        else null::tsquery
      end as query,
      p_language_code as language_code
  )
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
    ts_rank_cd(
      case s.language_code
        when 'it' then c.search_vector
        when 'en' then c.search_vector_en
      end,
      s.query
    )::real
  from public.nextway_knowledge_chunks c
  join public.nextway_knowledge_documents d on d.id = c.document_id
  cross join search_input s
  where auth.uid() is not null
    and p_workspace_id is not null
    and public.nextway_has_workspace_access(p_workspace_id)
    and nullif(btrim(p_query), '') is not null
    and s.query is not null
    and s.language_code in ('it', 'en')
    and d.workspace_id = p_workspace_id
    and d.approval_status = 'approved'
    and (d.valid_from is null or d.valid_from <= current_date)
    and (d.valid_until is null or d.valid_until >= current_date)
    and d.module_key = p_module_key
    and d.language_code = s.language_code
    and (
      (s.language_code = 'it' and c.search_vector @@ s.query)
      or
      (s.language_code = 'en' and c.search_vector_en @@ s.query)
    )
  order by
    ts_rank_cd(
      case s.language_code
        when 'it' then c.search_vector
        when 'en' then c.search_vector_en
      end,
      s.query
    ) desc,
    d.title asc,
    c.chunk_index asc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.nextway_search_knowledge(uuid, text, text, text, integer)
  from public, anon, service_role;
grant execute on function public.nextway_search_knowledge(uuid, text, text, text, integer)
  to authenticated;

comment on function public.nextway_search_knowledge(uuid, text, text, text, integer) is
  'Workspace-scoped approved Knowledge Base search; supports Italian and English language-specific vectors.';

commit;
