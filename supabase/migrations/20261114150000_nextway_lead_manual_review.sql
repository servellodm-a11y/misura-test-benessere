-- NEXTWAY: human review required before a Lead can be qualified.
-- Candidate migration only. Do not apply without a separate authorization.
begin;
alter table public.nextway_leads
  add column if not exists manual_reviewed_at timestamptz,
  add column if not exists manual_reviewed_by uuid;
comment on column public.nextway_leads.manual_reviewed_by is 'UUID immutabile del revisore autenticato; non FK, per conservare l attribuzione storica anche se il profilo viene eliminato.';
-- Existing qualifications have no stored human-review evidence: return them to review.
-- Temporarily disable the legacy auto-qualification trigger for this one-time backfill.
alter table public.nextway_leads disable trigger nextway_qualification_v1;
update public.nextway_leads set qualification='Da approfondire',manual_reviewed_at=null,manual_reviewed_by=null where qualification='Qualificato';
alter table public.nextway_leads enable trigger nextway_qualification_v1;
alter table public.nextway_leads drop constraint if exists nextway_qualified_manual_review_check;
alter table public.nextway_leads add constraint nextway_qualified_manual_review_check
 check (qualification <> 'Qualificato' or (manual_reviewed_at is not null and manual_reviewed_by is not null)) not valid;
alter table public.nextway_leads validate constraint nextway_qualified_manual_review_check;

create or replace function public.nextway_guard_manual_lead_review()
returns trigger language plpgsql set search_path=''
as $function$
declare v_review_rpc boolean := coalesce(current_setting('nextway.manual_review_rpc',true),'')='on';
begin
 if v_review_rpc then
  -- A custom GUC alone is not an authorization boundary: require the SECURITY DEFINER owner context too.
  if current_user is distinct from 'postgres' or auth.uid() is null or new.manual_reviewed_by is distinct from auth.uid()
   or new.manual_reviewed_at is null or new.qualification is distinct from 'Qualificato'
   or new.identity_check is distinct from 'confirmed'
   or (coalesce(new.score_fit,0)+coalesce(new.score_activity,0)+coalesce(new.score_presence,0)+coalesce(new.score_interest,0)+coalesce(new.score_approach,0))<50 then
   raise exception 'Revisione manuale NEXTWAY non valida.' using errcode='42501';
  end if;
  return new;
 end if;
 if tg_op='INSERT' then
  if new.manual_reviewed_at is not null or new.manual_reviewed_by is not null then
   raise exception 'La revisione manuale deve essere registrata tramite la procedura NEXTWAY.' using errcode='42501';
  end if;
  if new.qualification='Qualificato' then new.qualification:='Da approfondire'; end if;
  return new;
 end if;
 if new.manual_reviewed_at is distinct from old.manual_reviewed_at
  or new.manual_reviewed_by is distinct from old.manual_reviewed_by then
  raise exception 'I dati di revisione possono essere modificati solo tramite la procedura NEXTWAY.' using errcode='42501';
 end if;
 if new.identity_check is distinct from old.identity_check
  or new.score_fit is distinct from old.score_fit
  or new.score_activity is distinct from old.score_activity
  or new.score_presence is distinct from old.score_presence
  or new.score_interest is distinct from old.score_interest
  or new.score_approach is distinct from old.score_approach then
  new.manual_reviewed_at:=null; new.manual_reviewed_by:=null;
  if new.qualification='Qualificato' then new.qualification:='Da approfondire'; end if;
 elsif old.qualification is distinct from 'Qualificato' and new.qualification='Qualificato' then
  new.qualification:='Da approfondire';
 elsif new.qualification is distinct from 'Qualificato' then
  new.manual_reviewed_at:=null; new.manual_reviewed_by:=null;
 end if;
 return new;
end;
$function$;

drop trigger if exists zzzz_nextway_lead_manual_review_guard on public.nextway_leads;
create trigger zzzz_nextway_lead_manual_review_guard
before insert or update of identity_check,qualification,score_fit,score_activity,score_presence,score_interest,score_approach,manual_reviewed_at,manual_reviewed_by
on public.nextway_leads for each row execute function public.nextway_guard_manual_lead_review();

create or replace function public.nextway_confirm_lead_manual_review(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public'
as $function$
declare v_lead public.nextway_leads%rowtype;
begin
 if auth.uid() is null then raise exception 'Autenticazione richiesta.' using errcode='28000'; end if;
 select * into v_lead from public.nextway_leads where id=p_lead_id for update;
 if not found then raise exception 'Lead non trovato o non accessibile.' using errcode='P0002'; end if;
 if v_lead.owner_profile_id is distinct from auth.uid() and not public.nextway_is_platform_admin() then
  raise exception 'Non autorizzato a revisionare questo Lead.' using errcode='42501';
 end if;
 if v_lead.archived_at is not null then raise exception 'Un Lead archiviato non può essere qualificato.' using errcode='22023'; end if;
 if v_lead.identity_check is distinct from 'confirmed'
  or (coalesce(v_lead.score_fit,0)+coalesce(v_lead.score_activity,0)+coalesce(v_lead.score_presence,0)+coalesce(v_lead.score_interest,0)+coalesce(v_lead.score_approach,0))<50 then
  raise exception 'Identità confermata e almeno 50 punti sono necessari.' using errcode='22023';
 end if;
 perform set_config('nextway.manual_review_rpc','on',true);
 update public.nextway_leads set qualification='Qualificato',manual_reviewed_at=clock_timestamp(),manual_reviewed_by=auth.uid()
 where id=p_lead_id returning * into v_lead;
 return jsonb_build_object('lead_id',v_lead.id,'qualification',v_lead.qualification,'manual_reviewed_at',v_lead.manual_reviewed_at,'manual_reviewed_by',v_lead.manual_reviewed_by,'updated_at',v_lead.updated_at);
end;
$function$;
revoke all on function public.nextway_confirm_lead_manual_review(uuid) from public,anon;
grant execute on function public.nextway_confirm_lead_manual_review(uuid) to authenticated;
commit;
