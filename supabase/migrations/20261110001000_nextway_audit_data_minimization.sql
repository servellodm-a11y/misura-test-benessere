-- NEXTWAY: minimizzazione dei dati personali nel registro audit.
-- Da applicare dopo 20261110000900_nextway_lead_audit_trail.sql.
-- I valori di notes e public_evidence non vengono più copiati negli snapshot.
-- I nomi dei campi restano in changed_fields per mantenere la tracciabilità.
-- Gli eventi storici già scritti non vengono modificati.

create or replace function public.nextway_capture_lead_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before_full jsonb;
  v_after_full jsonb;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_owner uuid;
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    v_after_full := to_jsonb(new);
    v_after_snapshot := v_after_full - 'notes' - 'public_evidence';
    v_owner := new.owner_profile_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_after_full) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (new.id, v_owner, auth.uid(), 'INSERT', v_fields, null, v_after_snapshot);
    return new;
  elsif tg_op = 'UPDATE' then
    v_before_full := to_jsonb(old);
    v_after_full := to_jsonb(new);
    v_before_snapshot := v_before_full - 'notes' - 'public_evidence';
    v_after_snapshot := v_after_full - 'notes' - 'public_evidence';
    v_owner := old.owner_profile_id;
    select coalesce(array_agg(n.key order by n.key), '{}'::text[])
      into v_fields
      from jsonb_each(v_after_full) n
      where n.key <> 'updated_at'
        and v_before_full -> n.key is distinct from n.value;
    if cardinality(v_fields) > 0 then
      insert into public.nextway_lead_audit_logs
        (lead_id, lead_owner_profile_id, actor_profile_id, action,
         changed_fields, before_data, after_data)
      values
        (new.id, v_owner, auth.uid(), 'UPDATE', v_fields,
         v_before_snapshot, v_after_snapshot);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    v_before_full := to_jsonb(old);
    v_before_snapshot := v_before_full - 'notes' - 'public_evidence';
    v_owner := old.owner_profile_id;
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields from jsonb_object_keys(v_before_full) as keys(key);
    insert into public.nextway_lead_audit_logs
      (lead_id, lead_owner_profile_id, actor_profile_id, action,
       changed_fields, before_data, after_data)
    values
      (old.id, v_owner, auth.uid(), 'DELETE', v_fields,
       v_before_snapshot, null);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.nextway_capture_lead_audit() from public, anon, authenticated;

comment on function public.nextway_capture_lead_audit() is
  'Audit Lead con snapshot minimizzati: notes e public_evidence esclusi dai nuovi eventi.';
