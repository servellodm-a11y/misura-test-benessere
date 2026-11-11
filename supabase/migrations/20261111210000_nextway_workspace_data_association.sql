-- NEXTWAY workspace association groundwork
-- Additive candidate only. Nullable links; no backfill, no RLS changes, no live isolation claim.
-- Lead activities/conversion requests inherit workspace through nextway_leads.
-- Setter messages/generation requests inherit workspace through their conversation.

begin;

do $$
declare
  v_table text;
  v_required text[] := array[
    'nextway_leads',
    'nextway_knowledge_documents'
  ];
  v_optional text[] := array[
    'nextway_setter_conversations'
  ];
begin
  if to_regclass('public.nextway_workspaces') is null then
    raise exception 'NEXTWAY workspace foundation is missing; apply its candidate migration first.';
  end if;

  foreach v_table in array v_required loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Required NEXTWAY table public.% is missing; review migration order and schema first.', v_table;
    end if;
  end loop;

  foreach v_table in array (v_required || v_optional) loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'alter table public.%I add column if not exists workspace_id uuid',
        v_table
      );

      if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = to_regclass(format('public.%I', v_table))
          and c.conname = format('%s_workspace_id_fkey', v_table)
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (workspace_id) references public.nextway_workspaces(id) on delete restrict',
          v_table,
          format('%s_workspace_id_fkey', v_table)
        );
      end if;

      execute format(
        'create index if not exists %I on public.%I (workspace_id) where workspace_id is not null',
        format('%s_workspace_id_idx', v_table),
        v_table
      );

      execute format(
        'comment on column public.%I.workspace_id is %L',
        v_table,
        'NEXTWAY workspace association. Nullable for legacy/unassigned records; workspace authorization is not enabled by this migration.'
      );
    end if;
  end loop;
end;
$$;

comment on table public.nextway_leads is
  'NEXTWAY prospect records. workspace_id is nullable groundwork; existing owner-based RLS remains unchanged.';
comment on table public.nextway_knowledge_documents is
  'NEXTWAY knowledge sources. workspace_id is nullable groundwork; approved-read policy remains global until membership/RLS design is implemented.';

commit;
