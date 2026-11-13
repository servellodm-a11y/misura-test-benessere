-- NEXTWAY: test transazionale end-to-end proposta, revisione, claim e conversione cliente A/B.
-- Eseguire SOLO in ambiente di test dopo aver applicato le migrazioni candidate.
-- Prerequisiti: due profili partner con partner_details, ciascuno con un Lead
-- "In valutazione" non archiviato e senza richiesta attiva; un platform_admin.
-- Tutti i record/aggiornamenti sono temporanei e terminano con ROLLBACK.
-- Nessuna email/invito viene inviato; nessuna Edge Function viene chiamata.
-- Se i prerequisiti mancano, il test si interrompe prima di creare/modificare dati.

begin;

do $$
declare
  v_pair record;
  v_users uuid[] := array[]::uuid[];
  v_leads uuid[] := array[]::uuid[];
  v_admin uuid;
  v_ws_a uuid;
  v_ws_b uuid;
  v_email_a text := 'nw-ws-test-a-' || gen_random_uuid()::text || '@example.invalid';
  v_email_b text := 'nw-ws-test-b-' || gen_random_uuid()::text || '@example.invalid';
begin
  if to_regprocedure('public.nextway_create_lead_conversion_request(uuid,text,text,text,text)') is null
     or to_regprocedure('public.nextway_claim_conversion_activation(uuid,uuid)') is null
     or to_regprocedure('public.nextway_finalize_conversion_activation(uuid,uuid,uuid)') is null
     or to_regprocedure('public.nextway_list_workspace_clients(uuid)') is null
     or to_regclass('public.nextway_client_workspace_attributions') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='nextway_lead_conversion_requests'
         and column_name='workspace_id'
     ) then
    raise exception 'TEST INTERROTTO: le migrazioni candidate non risultano applicate nell''ambiente di test.';
  end if;

  for v_pair in
    select p.id as user_id, l.id as lead_id
    from public.profiles p
    join public.partner_details d on d.profile_id=p.id
    join public.nextway_leads l on l.owner_profile_id=p.id
    where p.role::text='partner'
      and l.status='In valutazione'
      and l.archived_at is null
      and not exists (
        select 1 from public.nextway_lead_conversion_requests q
        where q.lead_id=l.id
          and q.status in ('pending','ready_for_activation','provisioning')
      )
    order by p.id,l.id
  loop
    if not (v_pair.user_id = any(v_users)) then
      v_users := array_append(v_users,v_pair.user_id);
      v_leads := array_append(v_leads,v_pair.lead_id);
    end if;
    exit when cardinality(v_users)=2;
  end loop;

  if cardinality(v_users)<2 then
    raise exception 'TEST INTERROTTO: servono due partner con partner_details e un Lead convertibile libero ciascuno.';
  end if;

  select p.id into v_admin
  from public.profiles p
  where p.role::text='platform_admin'
  order by p.id limit 1;
  if v_admin is null then
    raise exception 'TEST INTERROTTO: profilo platform_admin non disponibile.';
  end if;

  insert into public.nextway_workspaces(workspace_key,name,partner_name,status)
  values ('zztesta_' || replace(gen_random_uuid()::text,'-',''),
          'NEXTWAY TEST Workspace A','Test Partner A','active')
  returning id into v_ws_a;

  insert into public.nextway_workspaces(workspace_key,name,partner_name,status)
  values ('zztestb_' || replace(gen_random_uuid()::text,'-',''),
          'NEXTWAY TEST Workspace B','Test Partner B','active')
  returning id into v_ws_b;

  -- Il partner B propone la conversione del Lead A come membro di A;
  -- il partner A propone la conversione del Lead B come membro di B.
  insert into public.nextway_workspace_memberships
    (workspace_id,user_id,workspace_role,membership_status,activated_at)
  values
    (v_ws_a,v_users[2],'workspace_member','active',now()),
    (v_ws_b,v_users[1],'workspace_member','active',now());

  -- Le modifiche di workspace ai Lead sono eseguite nel contesto admin,
  -- così i trigger di assegnazione applicano la stessa regola dell'applicazione.
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);

  update public.nextway_leads
  set workspace_id=v_ws_a
  where id=v_leads[1] and owner_profile_id=v_users[1]
    and status='In valutazione' and archived_at is null;

  update public.nextway_leads
  set workspace_id=v_ws_b
  where id=v_leads[2] and owner_profile_id=v_users[2]
    and status='In valutazione' and archived_at is null;

  if not exists (select 1 from public.nextway_leads where id=v_leads[1] and workspace_id=v_ws_a)
     or not exists (select 1 from public.nextway_leads where id=v_leads[2] and workspace_id=v_ws_b) then
    raise exception 'TEST INTERROTTO: impossibile associare i Lead ai workspace temporanei.';
  end if;

  perform set_config('nextway.test.user_a',v_users[1]::text,true);
  perform set_config('nextway.test.user_b',v_users[2]::text,true);
  perform set_config('nextway.test.admin',v_admin::text,true);
  perform set_config('nextway.test.workspace_a',v_ws_a::text,true);
  perform set_config('nextway.test.workspace_b',v_ws_b::text,true);
  perform set_config('nextway.test.lead_a',v_leads[1]::text,true);
  perform set_config('nextway.test.lead_b',v_leads[2]::text,true);
  perform set_config('nextway.test.email_a',v_email_a,true);
  perform set_config('nextway.test.email_b',v_email_b,true);
end;
$$;

-- I membri attivi propongono conversioni: il workspace è derivato dal Lead.
set local role authenticated;

do $$
declare
  v_user_a uuid := current_setting('nextway.test.user_a')::uuid;
  v_user_b uuid := current_setting('nextway.test.user_b')::uuid;
  v_req_a uuid;
  v_req_b uuid;
begin
  perform set_config('request.jwt.claim.sub',v_user_b::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_b::text,'role','authenticated')::text,true);
  v_req_a := public.nextway_create_lead_conversion_request(
    current_setting('nextway.test.lead_a')::uuid,'customer',
    'NEXTWAY Test Client A',current_setting('nextway.test.email_a'),null
  );

  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_a::text,'role','authenticated')::text,true);
  v_req_b := public.nextway_create_lead_conversion_request(
    current_setting('nextway.test.lead_b')::uuid,'customer',
    'NEXTWAY Test Client B',current_setting('nextway.test.email_b'),null
  );

  if v_req_a is null or v_req_b is null then
    raise exception 'La RPC di creazione non ha restituito gli ID delle richieste.';
  end if;
  perform set_config('nextway.test.request_a',v_req_a::text,true);
  perform set_config('nextway.test.request_b',v_req_b::text,true);
end;
$$;

-- Revisione amministrativa delle due richieste.
reset role;
set local role authenticated;

do $$
declare
  v_admin uuid := current_setting('nextway.test.admin')::uuid;
  v_rows integer;
begin
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);

  update public.nextway_lead_conversion_requests
  set status='ready_for_activation',reviewed_by=v_admin,reviewed_at=now()
  where id in (
    current_setting('nextway.test.request_a')::uuid,
    current_setting('nextway.test.request_b')::uuid
  ) and status='pending';
  get diagnostics v_rows=row_count;
  if v_rows<>2 then raise exception 'La revisione amministrativa ha aggiornato % richieste invece di 2.',v_rows; end if;
end;
$$;

-- Claim e finalizzazione tramite service_role.
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);

do $$
declare
  v_token_a uuid := gen_random_uuid();
  v_token_b uuid := gen_random_uuid();
  v_claim_a jsonb;
  v_claim_b jsonb;
  v_result_a jsonb;
  v_result_b jsonb;
begin
  perform set_config('nextway.test.token_a',v_token_a::text,true);
  perform set_config('nextway.test.token_b',v_token_b::text,true);

  v_claim_a := public.nextway_claim_conversion_activation(
    current_setting('nextway.test.request_a')::uuid,v_token_a
  );
  v_claim_b := public.nextway_claim_conversion_activation(
    current_setting('nextway.test.request_b')::uuid,v_token_b
  );

  if coalesce((v_claim_a->>'already_activated')::boolean,true)
     or coalesce((v_claim_b->>'already_activated')::boolean,true) then
    raise exception 'Claim inatteso: A %, B %',v_claim_a,v_claim_b;
  end if;

  v_result_a := public.nextway_finalize_conversion_activation(
    current_setting('nextway.test.request_a')::uuid,v_token_a,null
  );
  v_result_b := public.nextway_finalize_conversion_activation(
    current_setting('nextway.test.request_b')::uuid,v_token_b,null
  );

  if coalesce((v_result_a->>'success')::boolean,false) is not true
     or coalesce((v_result_b->>'success')::boolean,false) is not true then
    raise exception 'Finalizzazione customer non riuscita: A %, B %',v_result_a,v_result_b;
  end if;

  if not exists (
    select 1 from public.nextway_lead_conversion_requests
    where id=current_setting('nextway.test.request_a')::uuid and status='activated'
  ) or not exists (
    select 1 from public.nextway_lead_conversion_requests
    where id=current_setting('nextway.test.request_b')::uuid and status='activated'
  ) then
    raise exception 'Le richieste non risultano entrambe attivate.';
  end if;

  if not exists (
    select 1 from public.nextway_client_workspace_attributions
    where conversion_request_id=current_setting('nextway.test.request_a')::uuid
      and workspace_id=current_setting('nextway.test.workspace_a')::uuid
  ) or not exists (
    select 1 from public.nextway_client_workspace_attributions
    where conversion_request_id=current_setting('nextway.test.request_b')::uuid
      and workspace_id=current_setting('nextway.test.workspace_b')::uuid
  ) then
    raise exception 'Attribuzione cliente/workspace non corretta.';
  end if;
end;
$$;

reset role;

-- Trasferimento amministrativo successivo del Lead A: la richiesta resta nello
-- snapshot workspace A e non segue il workspace corrente del Lead.
perform set_config('request.jwt.claim.sub',current_setting('nextway.test.admin'),true);
perform set_config('request.jwt.claim.role','authenticated',true);
perform set_config('request.jwt.claims',jsonb_build_object(
  'sub',current_setting('nextway.test.admin'),'role','authenticated'
)::text,true);
update public.nextway_leads
set workspace_id=current_setting('nextway.test.workspace_b')::uuid
where id=current_setting('nextway.test.lead_a')::uuid;

set local role authenticated;

do $
declare
  v_user_a uuid := current_setting('nextway.test.user_a')::uuid;
  v_user_b uuid := current_setting('nextway.test.user_b')::uuid;
  v_ws_a uuid := current_setting('nextway.test.workspace_a')::uuid;
  v_ws_b uuid := current_setting('nextway.test.workspace_b')::uuid;
  v_req_a uuid := current_setting('nextway.test.request_a')::uuid;
  v_req_b uuid := current_setting('nextway.test.request_b')::uuid;
  v_count integer;
  v_denied boolean;
begin
  -- Partner B è membro A: può leggere il cliente A tramite RPC, non con SELECT diretta.
  perform set_config('request.jwt.claim.sub',v_user_b::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_b::text,'role','authenticated')::text,true);

  select count(*) into v_count from public.nextway_lead_conversion_requests where id=v_req_a;
  if v_count<>1 then raise exception 'La visibilità della richiesta A segue il Lead invece dello snapshot workspace.'; end if;

  select count(*) into v_count from public.nextway_list_workspace_clients(v_ws_a);
  if v_count<>1 then raise exception 'Membro B non legge il cliente condiviso nel workspace A.'; end if;

  select count(*) into v_count from public.clients where nextway_conversion_request_id=v_req_a;
  if v_count<>0 then raise exception 'Membro B legge direttamente il cliente A: RLS clients non isola.'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_b);
  exception when raise_exception then v_denied:=true;
  end;
  if not v_denied then raise exception 'Membro B accede al workspace B senza membership.'; end if;

  -- Partner A è membro B: controllo speculare.
  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_a::text,'role','authenticated')::text,true);
  select count(*) into v_count from public.nextway_list_workspace_clients(v_ws_b);
  if v_count<>1 then raise exception 'Membro A non legge il cliente condiviso nel workspace B.'; end if;

  select count(*) into v_count from public.clients where nextway_conversion_request_id=v_req_b;
  if v_count<>0 then raise exception 'Membro A legge direttamente il cliente B: RLS clients non isola.'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_a);
  exception when raise_exception then v_denied:=true;
  end;
  if not v_denied then raise exception 'Membro A accede al workspace A senza membership.'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.nextway_client_workspace_attributions;
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'La tabella attribuzioni è direttamente leggibile.'; end if;
end;
$$;

reset role;
update public.nextway_workspace_memberships
set workspace_role='workspace_viewer'
where workspace_id=current_setting('nextway.test.workspace_a')::uuid
  and user_id=current_setting('nextway.test.user_b')::uuid;

set local role authenticated;

do $$
declare
  v_user_b uuid := current_setting('nextway.test.user_b')::uuid;
  v_ws_a uuid := current_setting('nextway.test.workspace_a')::uuid;
  v_denied boolean:=false;
begin
  perform set_config('request.jwt.claim.sub',v_user_b::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_b::text,'role','authenticated')::text,true);
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_a);
  exception when raise_exception then v_denied:=true;
  end;
  if not v_denied then raise exception 'Viewer ha letto i clienti del workspace.'; end if;
end;
$$;

reset role;
update public.nextway_workspace_memberships
set workspace_role='workspace_member',membership_status='invited',activated_at=null
where workspace_id=current_setting('nextway.test.workspace_a')::uuid
  and user_id=current_setting('nextway.test.user_b')::uuid;

set local role authenticated;

do $$
declare
  v_user_b uuid := current_setting('nextway.test.user_b')::uuid;
  v_ws_a uuid := current_setting('nextway.test.workspace_a')::uuid;
  v_denied boolean:=false;
begin
  perform set_config('request.jwt.claim.sub',v_user_b::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_b::text,'role','authenticated')::text,true);
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_a);
  exception when raise_exception then v_denied:=true;
  end;
  if not v_denied then raise exception 'Membership invited ha letto i clienti del workspace.'; end if;
end;
$$;

reset role;
rollback;
