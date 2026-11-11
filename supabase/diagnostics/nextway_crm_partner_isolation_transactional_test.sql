-- NEXTWAY CRM: test transazionale isolamento partner A / partner B / platform_admin.
-- Nessuna tabella temporanea o permanente viene creata.
-- Crea due Lead fittizi e due attività; verifica RLS e annulla tutto con ROLLBACK.
-- Prerequisiti: due profili role='partner' collegati a partner_details e un platform_admin.
-- Eseguire tutto insieme nel SQL Editor del progetto NEXTWAY.

begin;

-- Selezione dei due partner e verifica dell'amministratore, prima del cambio ruolo.
do $$
declare
  v_partners uuid[];
  v_admin uuid := '0c15585e-aa21-4ec3-917d-25f4ac0a5ae6';
begin
  select array_agg(x.id order by x.id) into v_partners
  from (
    select p.id
    from public.profiles p
    join public.partner_details d on d.profile_id = p.id
    where p.role = 'partner'
    order by p.id
    limit 2
  ) x;

  if coalesce(array_length(v_partners, 1), 0) < 2 then
    raise exception 'TEST INTERROTTO: servono almeno due profili partner collegati a partner_details.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'platform_admin'
  ) then
    raise exception 'TEST INTERROTTO: profilo platform_admin atteso non disponibile.';
  end if;

  perform set_config('nextway.iso.owner_a', v_partners[1]::text, true);
  perform set_config('nextway.iso.owner_b', v_partners[2]::text, true);
  perform set_config('nextway.iso.admin', v_admin::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  v_a uuid := current_setting('nextway.iso.owner_a')::uuid;
  v_b uuid := current_setting('nextway.iso.owner_b')::uuid;
  v_admin uuid := current_setting('nextway.iso.admin')::uuid;
  v_lead_a uuid;
  v_lead_b uuid;
  v_activity_a uuid;
  v_activity_b uuid;
  v_response jsonb;
  v_count integer;
  v_rows integer;
  v_total integer := 0;
  v_passed integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_ok boolean;
begin
  -- Partner A crea Lead e attività.
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_a::text,'role','authenticated')::text, true);

  v_response := public.nextway_create_lead_with_conversation_idempotent(
    gen_random_uuid(), repeat('a',64), 'NEXTWAY ISOLATION TEST A',
    'potential_partner', 'NEXTWAY_ISOLATION_TEST',
    'https://example.invalid/nextway-isolation-a',
    'Dato fittizio per test RLS.', 'Test isolamento partner', 'manual'
  );
  if coalesce((v_response->>'success')::boolean,false) is not true
     or nullif(v_response->>'lead_id','') is null then
    raise exception 'Creazione Lead test A fallita: %', v_response;
  end if;
  v_lead_a := (v_response->>'lead_id')::uuid;

  insert into public.nextway_lead_activities
    (lead_id,owner_profile_id,activity_type,subject,details)
  values (v_lead_a,v_a,'note','NEXTWAY ISOLATION TEST A','Attività fittizia rollback')
  returning id into v_activity_a;

  -- Partner B crea Lead e attività.
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_b::text,'role','authenticated')::text, true);

  v_response := public.nextway_create_lead_with_conversation_idempotent(
    gen_random_uuid(), repeat('b',64), 'NEXTWAY ISOLATION TEST B',
    'potential_partner', 'NEXTWAY_ISOLATION_TEST',
    'https://example.invalid/nextway-isolation-b',
    'Dato fittizio per test RLS.', 'Test isolamento partner', 'manual'
  );
  if coalesce((v_response->>'success')::boolean,false) is not true
     or nullif(v_response->>'lead_id','') is null then
    raise exception 'Creazione Lead test B fallita: %', v_response;
  end if;
  v_lead_b := (v_response->>'lead_id')::uuid;

  insert into public.nextway_lead_activities
    (lead_id,owner_profile_id,activity_type,subject,details)
  values (v_lead_b,v_b,'note','NEXTWAY ISOLATION TEST B','Attività fittizia rollback')
  returning id into v_activity_b;

  -- Partner A: proprio Lead, invisibilità e blocco delle operazioni sul Lead B.
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_a::text,'role','authenticated')::text, true);

  select count(*) into v_count from public.nextway_leads where id=v_lead_a;
  v_ok := v_count=1; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner A legge il proprio Lead','atteso',1,'ottenuto',v_count,'superato',v_ok));

  select count(*) into v_count from public.nextway_leads where id=v_lead_b;
  v_ok := v_count=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner A non legge Lead B','atteso',0,'ottenuto',v_count,'superato',v_ok));

  select count(*) into v_count from public.nextway_lead_activities where id=v_activity_b;
  v_ok := v_count=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner A non legge attività B','atteso',0,'ottenuto',v_count,'superato',v_ok));

  update public.nextway_leads set status=status where id=v_lead_b;
  get diagnostics v_rows=row_count;
  v_ok := v_rows=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner A non modifica Lead B','atteso',0,'ottenuto',v_rows,'superato',v_ok));

  delete from public.nextway_leads where id=v_lead_b;
  get diagnostics v_rows=row_count;
  v_ok := v_rows=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner A non cancella Lead B','atteso',0,'ottenuto',v_rows,'superato',v_ok));

  select count(*) into v_count from public.nextway_lead_creation_requests where owner_profile_id=v_b;
  v_ok := v_count=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner A non legge richieste idempotenza B','atteso',0,'ottenuto',v_count,'superato',v_ok));

  -- Partner B: controlli speculari.
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_b::text,'role','authenticated')::text, true);

  select count(*) into v_count from public.nextway_leads where id=v_lead_b;
  v_ok := v_count=1; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner B legge il proprio Lead','atteso',1,'ottenuto',v_count,'superato',v_ok));

  select count(*) into v_count from public.nextway_leads where id=v_lead_a;
  v_ok := v_count=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner B non legge Lead A','atteso',0,'ottenuto',v_count,'superato',v_ok));

  select count(*) into v_count from public.nextway_lead_activities where id=v_activity_a;
  v_ok := v_count=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner B non legge attività A','atteso',0,'ottenuto',v_count,'superato',v_ok));

  update public.nextway_leads set status=status where id=v_lead_a;
  get diagnostics v_rows=row_count;
  v_ok := v_rows=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner B non modifica Lead A','atteso',0,'ottenuto',v_rows,'superato',v_ok));

  delete from public.nextway_leads where id=v_lead_a;
  get diagnostics v_rows=row_count;
  v_ok := v_rows=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner B non cancella Lead A','atteso',0,'ottenuto',v_rows,'superato',v_ok));

  select count(*) into v_count from public.nextway_lead_creation_requests where owner_profile_id=v_a;
  v_ok := v_count=0; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Partner B non legge richieste idempotenza A','atteso',0,'ottenuto',v_count,'superato',v_ok));

  -- Admin: lettura trasversale dei due Lead e delle due attività.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_admin::text,'role','authenticated')::text, true);

  select count(*) into v_count from public.nextway_leads where id in (v_lead_a,v_lead_b);
  v_ok := v_count=2; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Admin legge entrambi i Lead','atteso',2,'ottenuto',v_count,'superato',v_ok));

  select count(*) into v_count from public.nextway_lead_activities where id in (v_activity_a,v_activity_b);
  v_ok := v_count=2; v_total:=v_total+1; if v_ok then v_passed:=v_passed+1; end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('test','Admin legge entrambe le attività','atteso',2,'ottenuto',v_count,'superato',v_ok));

  raise notice 'NEXTWAY_ISOLATION_RESULT=%', jsonb_build_object(
    'test_totali',v_total,'test_superati',v_passed,'test_falliti',v_total-v_passed,
    'esito',case when v_passed=v_total then 'SUPERATO' else 'FALLITO' end,
    'dettaglio',v_results,'nota','Il ROLLBACK finale annulla tutti i record fittizi'
  );

  if v_passed<>v_total then
    raise exception 'TEST ISOLAMENTO FALLITO: % test superati su %.',v_passed,v_total;
  end if;
end;
$$;

-- Operazioni DELETE sopra: tentativi intenzionali cross-owner, attesi a zero righe.
-- Nessuna riga reale può essere interessata: gli ID sono creati in questa transazione.
rollback;
