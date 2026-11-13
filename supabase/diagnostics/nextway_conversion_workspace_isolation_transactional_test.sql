-- NEXTWAY: test transazionale isolamento conversioni workspace A / B.
-- Eseguire SOLO dopo aver applicato le migrazioni candidate in un ambiente di test.
-- Richiede due profili partner reali con partner_details, due Lead e un platform_admin.
-- Crea dati fittizi esclusivamente nella transazione e termina con ROLLBACK.
-- Nessuna email/invito viene inviato; nessuna Edge Function viene chiamata.
-- Se i prerequisiti mancano, il test si interrompe PRIMA di creare dati.

begin;

do $$
declare
  v_users uuid[];
  v_leads uuid[];
  v_admin uuid;
  v_ws_a uuid;
  v_ws_b uuid;
  v_req_a uuid;
  v_req_b uuid;
  v_client_a uuid;
  v_client_b uuid;
  v_email_a text := 'nw-ws-test-a-' || gen_random_uuid()::text || '@example.invalid';
  v_email_b text := 'nw-ws-test-b-' || gen_random_uuid()::text || '@example.invalid';
begin
  if to_regprocedure('public.nextway_list_workspace_clients(uuid)') is null
     or to_regprocedure('public.nextway_create_lead_conversion_request(uuid,text,text,text,text)') is null
     or to_regclass('public.nextway_client_workspace_attributions') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='nextway_lead_conversion_requests'
         and column_name='workspace_id'
     ) then
    raise exception 'TEST INTERROTTO: applicazione controllata delle nuove migrazioni non rilevata.';
  end if;

  select array_agg(x.id order by x.id) into v_users
  from (
    select p.id
    from public.profiles p
    join public.partner_details d on d.profile_id=p.id
    where p.role::text='partner'
    order by p.id
    limit 2
  ) x;

  if coalesce(array_length(v_users,1),0) < 2 then
    raise exception 'TEST INTERROTTO: servono almeno due profili partner con partner_details.';
  end if;

  select array_agg(x.id order by x.id) into v_leads
  from (
    select l.id from public.nextway_leads l order by l.id limit 2
  ) x;

  if coalesce(array_length(v_leads,1),0) < 2 then
    raise exception 'TEST INTERROTTO: servono almeno due Lead per rispettare l''unicità delle richieste.';
  end if;

  select p.id into v_admin
  from public.profiles p
  where p.role::text='platform_admin'
  order by p.id
  limit 1;

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

  insert into public.nextway_workspace_memberships
    (workspace_id,user_id,workspace_role,membership_status,activated_at)
  values
    (v_ws_a,v_users[1],'workspace_member','active',now()),
    (v_ws_b,v_users[2],'workspace_member','active',now());

  -- I clienti sono intenzionalmente intestati all'altro partner:
  -- il membro del workspace deve vederli SOLO tramite la RPC di proiezione.
  insert into public.nextway_lead_conversion_requests
    (lead_id,owner_profile_id,sponsor_profile_id,created_by,conversion_type,
     full_name,email,status,workspace_id)
  values
    (v_leads[1],v_users[2],v_users[2],v_users[2],'customer',
     'NEXTWAY Test Client A',v_email_a,'pending',v_ws_a)
  returning id into v_req_a;

  insert into public.nextway_lead_conversion_requests
    (lead_id,owner_profile_id,sponsor_profile_id,created_by,conversion_type,
     full_name,email,status,workspace_id)
  values
    (v_leads[2],v_users[1],v_users[1],v_users[1],'customer',
     'NEXTWAY Test Client B',v_email_b,'pending',v_ws_b)
  returning id into v_req_b;

  insert into public.clients
    (partner_profile_id,first_name,last_name,email,source,status,nextway_conversion_request_id)
  values
    (v_users[2],'Test Client','A',v_email_a,'NEXTWAY_TEST','potential',v_req_a)
  returning id into v_client_a;

  insert into public.clients
    (partner_profile_id,first_name,last_name,email,source,status,nextway_conversion_request_id)
  values
    (v_users[1],'Test Client','B',v_email_b,'NEXTWAY_TEST','potential',v_req_b)
  returning id into v_client_b;

  insert into public.nextway_client_workspace_attributions
    (client_id,workspace_id,conversion_request_id,owner_profile_id)
  values
    (v_client_a,v_ws_a,v_req_a,v_users[2]),
    (v_client_b,v_ws_b,v_req_b,v_users[1]);

  perform set_config('nextway.test.user_a',v_users[1]::text,true);
  perform set_config('nextway.test.user_b',v_users[2]::text,true);
  perform set_config('nextway.test.admin',v_admin::text,true);
  perform set_config('nextway.test.workspace_a',v_ws_a::text,true);
  perform set_config('nextway.test.workspace_b',v_ws_b::text,true);
  perform set_config('nextway.test.request_a',v_req_a::text,true);
  perform set_config('nextway.test.request_b',v_req_b::text,true);
end;
$$;

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
  v_total integer := 0;
  v_passed integer := 0;
begin
  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_a::text,'role','authenticated')::text,true);

  select count(*) into v_count from public.nextway_list_workspace_clients(v_ws_a);
  v_total:=v_total+1; if v_count=1 then v_passed:=v_passed+1; end if;
  if v_count<>1 then raise exception 'A non vede esattamente il cliente attribuito al workspace A.'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_b);
  exception when raise_exception then v_denied:=true;
  end;
  v_total:=v_total+1; if v_denied then v_passed:=v_passed+1; end if;
  if not v_denied then raise exception 'A ha ottenuto accesso al workspace B.'; end if;

  select count(*) into v_count from public.clients
  where nextway_conversion_request_id=v_req_a;
  v_total:=v_total+1; if v_count=0 then v_passed:=v_passed+1; end if;
  if v_count<>0 then raise exception 'A legge direttamente un cliente intestato a B: RLS clients non isola.'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.nextway_client_workspace_attributions;
  exception when insufficient_privilege then v_denied:=true;
  end;
  v_total:=v_total+1; if v_denied then v_passed:=v_passed+1; end if;
  if not v_denied then raise exception 'A può leggere direttamente la tabella delle attribuzioni.'; end if;

  perform set_config('request.jwt.claim.sub',v_user_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_b::text,'role','authenticated')::text,true);

  select count(*) into v_count from public.nextway_list_workspace_clients(v_ws_b);
  v_total:=v_total+1; if v_count=1 then v_passed:=v_passed+1; end if;
  if v_count<>1 then raise exception 'B non vede esattamente il cliente attribuito al workspace B.'; end if;

  v_denied:=false;
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_a);
  exception when raise_exception then v_denied:=true;
  end;
  v_total:=v_total+1; if v_denied then v_passed:=v_passed+1; end if;
  if not v_denied then raise exception 'B ha ottenuto accesso al workspace A.'; end if;

  select count(*) into v_count from public.clients
  where nextway_conversion_request_id=v_req_b;
  v_total:=v_total+1; if v_count=0 then v_passed:=v_passed+1; end if;
  if v_count<>0 then raise exception 'B legge direttamente un cliente intestato ad A: RLS clients non isola.'; end if;

  raise notice 'NEXTWAY_WORKSPACE_CLIENT_ISOLATION_RESULT=%',
    jsonb_build_object('test_totali',v_total,'test_superati',v_passed,
      'test_falliti',v_total-v_passed,'esito','SUPERATO');
end;
$$;

reset role;

-- Viewer e membership invited/suspended non devono accedere alla proiezione.
update public.nextway_workspace_memberships
set workspace_role='workspace_viewer'
where workspace_id=current_setting('nextway.test.workspace_a')::uuid
  and user_id=current_setting('nextway.test.user_a')::uuid;

set local role authenticated;

do $$
declare
  v_user_a uuid := current_setting('nextway.test.user_a')::uuid;
  v_ws_a uuid := current_setting('nextway.test.workspace_a')::uuid;
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_a::text,'role','authenticated')::text,true);
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
  and user_id=current_setting('nextway.test.user_a')::uuid;

set local role authenticated;

do $$
declare
  v_user_a uuid := current_setting('nextway.test.user_a')::uuid;
  v_ws_a uuid := current_setting('nextway.test.workspace_a')::uuid;
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_a::text,'role','authenticated')::text,true);
  begin
    perform count(*) from public.nextway_list_workspace_clients(v_ws_a);
  exception when raise_exception then v_denied:=true;
  end;
  if not v_denied then raise exception 'Membership invited ha letto i clienti del workspace.'; end if;
end;
$$;

reset role;
rollback;
