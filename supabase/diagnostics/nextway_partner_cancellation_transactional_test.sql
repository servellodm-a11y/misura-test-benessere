-- NEXTWAY: test transazionale rollback-only dell'annullamento conversioni Partner.
-- ESEGUIRE SOLO in un progetto staging isolato dopo aver applicato le migrazioni candidate.
-- Prerequisiti: un profilo partner con partner_details, un Lead legacy (workspace_id NULL)
-- "In valutazione", non archiviato, e un profilo platform_admin.
-- Crea tre richieste temporanee tramite la RPC applicativa; non crea Auth users,
-- non invia inviti/email e non chiama Edge Functions. Sul percorso riuscito termina con ROLLBACK.
-- In caso di errore SQL, la transazione resta abortita: eseguire ROLLBACK prima di riutilizzare la sessione.
-- Se i prerequisiti o le migrazioni non sono presenti, si interrompe prima delle modifiche.

begin;

do $$
declare
  v_partner uuid;
  v_lead uuid;
  v_admin uuid;
begin
  if to_regprocedure('public.nextway_create_lead_conversion_request(uuid,text,text,text,text)') is null
     or to_regprocedure('public.nextway_cancel_conversion_activation(uuid,text)') is null
     or to_regprocedure('public.nextway_claim_conversion_activation(uuid,uuid)') is null
     or to_regprocedure('public.nextway_release_conversion_activation(uuid,uuid)') is null
     or to_regprocedure('public.nextway_finalize_conversion_activation(uuid,uuid,uuid)') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public'
         and table_name='nextway_lead_conversion_requests'
         and column_name in ('cancelled_at','cancelled_by','cancellation_reason')
       group by table_schema,table_name
       having count(*)=3
     ) then
    raise exception 'TEST INTERROTTO: migrazioni candidate non presenti nello staging.';
  end if;

  select p.id,l.id into v_partner,v_lead
  from public.profiles p
  join public.partner_details d on d.profile_id=p.id
  join public.nextway_leads l on l.owner_profile_id=p.id
  where p.role::text='partner'
    and l.status='In valutazione'
    and l.archived_at is null
    and l.workspace_id is null
    and not exists (
      select 1 from public.nextway_lead_conversion_requests r
      where r.lead_id=l.id
        and r.status in ('pending','ready_for_activation','provisioning')
    )
  order by l.created_at
  limit 1;

  if v_partner is null or v_lead is null then
    raise exception 'TEST INTERROTTO: serve un partner con partner_details e un Lead legacy libero in valutazione.';
  end if;

  select id into v_admin
  from public.profiles
  where role::text='platform_admin'
  order by id
  limit 1;

  if v_admin is null then
    raise exception 'TEST INTERROTTO: profilo platform_admin non disponibile.';
  end if;

  perform set_config('nextway.cancel_test.partner',v_partner::text,true);
  perform set_config('nextway.cancel_test.lead',v_lead::text,true);
  perform set_config('nextway.cancel_test.admin',v_admin::text,true);
  perform set_config('nextway.cancel_test.email_pending',
    'nw-cancel-pending-'||gen_random_uuid()::text||'@example.invalid',true);
  perform set_config('nextway.cancel_test.email_ready',
    'nw-cancel-ready-'||gen_random_uuid()::text||'@example.invalid',true);
  perform set_config('nextway.cancel_test.email_provisioning',
    'nw-cancel-provisioning-'||gen_random_uuid()::text||'@example.invalid',true);
end;
$$;

-- 1) Annullamento da pending + retry idempotente.
set local role authenticated;
do $$
declare
  v_partner uuid := current_setting('nextway.cancel_test.partner')::uuid;
  v_admin uuid := current_setting('nextway.cancel_test.admin')::uuid;
  v_request uuid;
  v_first jsonb;
  v_second jsonb;
  v_row public.nextway_lead_conversion_requests%rowtype;
begin
  perform set_config('request.jwt.claim.sub',v_partner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_partner::text,'role','authenticated')::text,true);

  v_request := public.nextway_create_lead_conversion_request(
    current_setting('nextway.cancel_test.lead')::uuid,
    'partner','NEXTWAY Cancellation Pending',
    current_setting('nextway.cancel_test.email_pending'),null
  );

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  v_first := public.nextway_cancel_conversion_activation(v_request,'Test staging: cancel pending');
  v_second := public.nextway_cancel_conversion_activation(v_request,'Motivo retry da ignorare');

  select * into v_row from public.nextway_lead_conversion_requests where id=v_request;
  if v_first->>'status' <> 'cancelled'
     or coalesce((v_second->>'already_cancelled')::boolean,false) is not true
     or v_row.status <> 'cancelled'
     or v_row.cancelled_by <> v_admin
     or v_row.cancellation_reason <> 'Test staging: cancel pending'
     or v_row.cancelled_at is null
     or v_row.activation_claim_token is not null
     or v_row.activation_claimed_at is not null
     or v_row.activation_user_id is not null
     or v_row.activated_at is not null then
    raise exception 'TEST FALLITO: annullamento pending o retry idempotente non coerente.';
  end if;
end;
$$;

-- 2) Annullamento da ready_for_activation: la revisione deve restare intatta.
do $$
declare
  v_partner uuid := current_setting('nextway.cancel_test.partner')::uuid;
  v_admin uuid := current_setting('nextway.cancel_test.admin')::uuid;
  v_request uuid;
  v_row public.nextway_lead_conversion_requests%rowtype;
begin
  perform set_config('request.jwt.claim.sub',v_partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_partner::text,'role','authenticated')::text,true);
  v_request := public.nextway_create_lead_conversion_request(
    current_setting('nextway.cancel_test.lead')::uuid,
    'partner','NEXTWAY Cancellation Ready',
    current_setting('nextway.cancel_test.email_ready'),null
  );

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  update public.nextway_lead_conversion_requests
  set status='ready_for_activation',reviewed_by=v_admin,reviewed_at=now(),
      review_notes='Approvazione temporanea staging'
  where id=v_request and status='pending';

  if not found then raise exception 'TEST FALLITO: impossibile portare la richiesta a ready_for_activation.'; end if;

  perform public.nextway_cancel_conversion_activation(v_request,'Test staging: cancel ready');
  select * into v_row from public.nextway_lead_conversion_requests where id=v_request;
  if v_row.status <> 'cancelled'
     or v_row.reviewed_by <> v_admin
     or v_row.reviewed_at is null
     or v_row.review_notes <> 'Approvazione temporanea staging' then
    raise exception 'TEST FALLITO: annullamento ready ha alterato la revisione.';
  end if;
end;
$$;

-- 3) Annullamento da provisioning: invalidare il claim e bloccare release/finalizer tardivi.
reset role;
set local role authenticated;
do $$
declare
  v_partner uuid := current_setting('nextway.cancel_test.partner')::uuid;
  v_admin uuid := current_setting('nextway.cancel_test.admin')::uuid;
  v_request uuid;
begin
  perform set_config('request.jwt.claim.sub',v_partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_partner::text,'role','authenticated')::text,true);
  v_request := public.nextway_create_lead_conversion_request(
    current_setting('nextway.cancel_test.lead')::uuid,
    'partner','NEXTWAY Cancellation Provisioning',
    current_setting('nextway.cancel_test.email_provisioning'),null
  );
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  update public.nextway_lead_conversion_requests
  set status='ready_for_activation',reviewed_by=v_admin,reviewed_at=now()
  where id=v_request and status='pending';
  if not found then raise exception 'TEST FALLITO: impossibile approvare la richiesta provisioning.'; end if;
  perform set_config('nextway.cancel_test.request',v_request::text,true);
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);

do $$
declare
  v_token uuid := gen_random_uuid();
  v_claim jsonb;
begin
  v_claim := public.nextway_claim_conversion_activation(
    current_setting('nextway.cancel_test.request')::uuid,v_token
  );
  if coalesce((v_claim->>'already_activated')::boolean,true) then
    raise exception 'TEST FALLITO: claim provisioning inatteso.';
  end if;
  perform set_config('nextway.cancel_test.token',v_token::text,true);
end;
$$;

reset role;
set local role authenticated;
do $$
declare
  v_admin uuid := current_setting('nextway.cancel_test.admin')::uuid;
  v_request uuid := current_setting('nextway.cancel_test.request')::uuid;
  v_token uuid := current_setting('nextway.cancel_test.token')::uuid;
  v_row public.nextway_lead_conversion_requests%rowtype;
begin
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform public.nextway_cancel_conversion_activation(v_request,'Test staging: cancel provisioning');

  select * into v_row from public.nextway_lead_conversion_requests where id=v_request;
  if v_row.status <> 'cancelled'
     or v_row.activation_claim_token is not null
     or v_row.activation_claimed_at is not null
     or v_row.activation_user_id is not null
     or v_row.activated_at is not null then
    raise exception 'TEST FALLITO: il claim provisioning non è stato invalidato.';
  end if;

  perform set_config('nextway.cancel_test.old_token',v_token::text,true);
end;
$$;

reset role;
set local role service_role;
do $$
declare
  v_request uuid := current_setting('nextway.cancel_test.request')::uuid;
  v_token uuid := current_setting('nextway.cancel_test.old_token')::uuid;
  v_denied boolean := false;
  v_row public.nextway_lead_conversion_requests%rowtype;
begin
  begin
    perform public.nextway_claim_conversion_activation(v_request,gen_random_uuid());
  exception when others then
    v_denied := true;
  end;
  if not v_denied then raise exception 'TEST FALLITO: una richiesta cancelled è stata reclamata.'; end if;

  perform public.nextway_release_conversion_activation(v_request,v_token);

  v_denied := false;
  begin
    perform public.nextway_finalize_conversion_activation(v_request,v_token,null);
  exception when others then
    v_denied := true;
  end;
  if not v_denied then raise exception 'TEST FALLITO: il finalizer ha accettato il claim annullato.'; end if;

  select * into v_row from public.nextway_lead_conversion_requests where id=v_request;
  if v_row.status <> 'cancelled' then
    raise exception 'TEST FALLITO: release tardivo ha modificato una richiesta annullata.';
  end if;
end;
$$;

reset role;
rollback;

-- Esito atteso: tutte le asserzioni superate e nessun dato persistente.
-- Se un'asserzione fallisce, interrompere, eseguire ROLLBACK e conservare l'errore per l'analisi.
