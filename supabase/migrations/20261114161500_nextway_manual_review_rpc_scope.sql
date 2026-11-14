-- NEXTWAY: scope the manual-review guard flag to the RPC's own UPDATE only.
-- Candidate migration. Do not apply without separate authorization.
begin;

create or replace function public.nextway_confirm_lead_manual_review(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $function$
declare
 v_lead public.nextway_leads%rowtype;
begin
 if auth.uid() is null then
  raise exception 'Autenticazione richiesta.' using errcode='28000';
 end if;

 select * into v_lead
 from public.nextway_leads
 where id=p_lead_id
 for update;

 if not found then
  raise exception 'Lead non trovato o non accessibile.' using errcode='P0002';
 end if;

 if v_lead.owner_profile_id is distinct from auth.uid()
  and not public.nextway_is_platform_admin() then
  raise exception 'Non autorizzato a revisionare questo Lead.' using errcode='42501';
 end if;

 if v_lead.archived_at is not null then
  raise exception 'Un Lead archiviato non può essere qualificato.' using errcode='22023';
 end if;

 if v_lead.identity_check is distinct from 'confirmed'
  or (coalesce(v_lead.score_fit,0)
   +coalesce(v_lead.score_activity,0)
   +coalesce(v_lead.score_presence,0)
   +coalesce(v_lead.score_interest,0)
   +coalesce(v_lead.score_approach,0))<50 then
  raise exception 'Identità confermata e almeno 50 punti sono necessari.' using errcode='22023';
 end if;

 -- Enable the trigger exception only for the guarded UPDATE below.
 perform set_config('nextway.manual_review_rpc','on',true);

 update public.nextway_leads
 set qualification='Qualificato',
     manual_reviewed_at=clock_timestamp(),
     manual_reviewed_by=auth.uid()
 where id=p_lead_id
 returning * into v_lead;

 -- Critical: clear the transaction-local flag before returning.
 -- Later statements in the same transaction must not inherit RPC privilege.
 perform set_config('nextway.manual_review_rpc','off',true);

 return jsonb_build_object(
  'lead_id',v_lead.id,
  'qualification',v_lead.qualification,
  'manual_reviewed_at',v_lead.manual_reviewed_at,
  'manual_reviewed_by',v_lead.manual_reviewed_by,
  'updated_at',v_lead.updated_at
 );
end;
$function$;

alter function public.nextway_confirm_lead_manual_review(uuid) owner to postgres;
revoke all on function public.nextway_confirm_lead_manual_review(uuid) from public,anon;
grant execute on function public.nextway_confirm_lead_manual_review(uuid) to authenticated;

commit;
