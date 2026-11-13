-- NEXTWAY: test transazionale end-to-end conversione cliente e isolamento workspace A/B.
-- Eseguire SOLO in ambiente di test dopo aver applicato le migrazioni candidate.
-- Prerequisiti: due profili partner con partner_details, ciascuno con un Lead
-- "In valutazione" non archiviato e senza richiesta attiva; un platform_admin.
-- Sposta temporaneamente i due Lead nei workspace di test, finalizza due conversioni
-- customer con service_role e verifica RPC/RLS. Tutto termina con ROLLBACK.
-- Nessuna email/invito viene inviato; nessuna Edge Function viene chiamata.
-- Se i prerequisiti mancano, il test si interrompe PRIMA di creare o modificare dati.

begin;

do $$
declare
  v_pair record;
  v_users uuid[] := array[]::uuid[];
  v_leads uuid[] := array[]::uuid[];
  v_admin uuid;
  v_ws_a uuid;
  v_ws_b uuid;
  v_req_a uuid;
  v_req_b uuid;
  v_token_a uuid := gen_random_uuid();
  v_token_b uuid := gen_random_uuid();
  v_email_a text := 'nw-ws-test-a-' || gen_random_uuid()::text || '@example.invalid';
  v_email_b text := 'nw-ws-test-b-' || gen_random_uuid()::text || '@example.invalid';
begin
  if to_regprocedure('public.nextway_finalize_conversion_activation(uuid,uuid,uuid)') is null
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

  -- A è membro del workspace A ma non proprietario del cliente A;
  -- B è membro del workspace B ma non proprietario del cliente B.
  insert into public.nextway_workspace_memberships
    (workspace_id,user_id,workspace_role,membership_status,activated_at)
  values
    (v_ws_a,v_users[2],'workspace_member','active',now()),
    (v_ws_b,v_users[1],'workspace_member','active',now());

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

  insert into public.nextway_lead_conversion_requests
    (lead_id,owner_profile_id,sponsor_profile_id,created_by,conversion_type,
     full_name,email,status,reviewed_by,reviewed_at,workspace_id,
     activation_claim_token,activation_claimed_at)
  values
    (v_leads[1],v_users[1],v_users[1],v_users[1],'customer',
     'NEXTWAY Test Client A',v_email_a,'provisioning',v_admin,now(),v_ws_a,v_token_a,now())
  returning id into v_req_a;

  insert into public.nextway_lead_conversion_requests
    (lead_id,owner_profile_id,sponsor_profile_id,created_by,conversion_type,
     full_name,email,status,reviewed_by,reviewed_at,workspace_id,
     activation_claim_token,activation_claimed_at)
  values
    (v_leads[2],v_users[2],v_users[2],v_users[2],'customer',
     'NEXTWAY Test Client B',v_email_b,'provisioning',v_admin,now(),v_ws_b,v_token_b,now())
  returning id into v_req_b;

  perform set_config('nextway.test.user_a',v_users[1]::text,true);
  perform set_config('nextway.test.user_b',v_users[2]::text,true);
  perform set_config('nextway.test.admin',v_admin::text,true);
  perform set_config('nextway.test.workspace_a',v_ws_a::text,true);
  perform set_config('nextway.test.workspace_b',v_ws_b::text,true);
  perform set_config('nextway.test.request_a',v_req_a::text,true);
  perform set_config('nextway.test.request_b',v_req_b::text,true);
  perform set_config('nextway.test.token_a',v_token_a::text,true);
  perform set_config('nextway.test.token_b',v_token_b::text,true);
end;
$$;

-- Simula il chiamante interno: finalizzazione server-side, nessuna chiave segreta.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);

do $$
declare
  v_result_a jsonb;
  v_result_b jsonb;
begin
  v_result_a := public.nextway_finalize_conversion_activation(
    current_setting('nextway.test.request_a')::uuid,
    current_setting('nextway.test.token_a')::uuid,
    null
  );
  v_result_b := public.nextway_finalize_conversion_activation(
    current_setting('nextway.test.request_b')::uuid,
    current_setting('nextway.test.token_b')::uuid,
    null
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
set local role authenticated;

do $$
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
  -- Partner B è membro A: può leggere il cliente A tramite RPC, ma non con SELECT diretta.
  perform set_config('request.jwt.claim.sub',v_user_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_b::text,'role','authenticated')::text,true);
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

  -- La tabella di attribuzione non è direttamente leggibile da authenticated.
  v_denied:=false;
  begin
    perform count(*) from public.nextway_client_workspace_attributions;
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'La tabella attribuzioni è direttamente leggibile.'; end if;
end;
$$;

reset role;

-- Viewer e membership invited non devono accedere alla proiezione clienti.
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
