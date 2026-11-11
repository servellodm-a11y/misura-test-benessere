-- NEXTWAY Knowledge Base — private source-file storage
-- Additive candidate migration. Apply only after reviewing the base Knowledge Base migration.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nextway-knowledge',
  'nextway-knowledge',
  false,
  12582912,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nextway_knowledge_storage_admin_select on storage.objects;
create policy nextway_knowledge_storage_admin_select
on storage.objects for select to authenticated
using (bucket_id = 'nextway-knowledge' and public.nextway_is_platform_admin());

drop policy if exists nextway_knowledge_storage_admin_insert on storage.objects;
create policy nextway_knowledge_storage_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'nextway-knowledge' and public.nextway_is_platform_admin());

drop policy if exists nextway_knowledge_storage_admin_update on storage.objects;
create policy nextway_knowledge_storage_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'nextway-knowledge' and public.nextway_is_platform_admin())
with check (bucket_id = 'nextway-knowledge' and public.nextway_is_platform_admin());

drop policy if exists nextway_knowledge_storage_admin_delete on storage.objects;
create policy nextway_knowledge_storage_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'nextway-knowledge' and public.nextway_is_platform_admin());

commit;
