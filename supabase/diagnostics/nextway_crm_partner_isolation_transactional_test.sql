-- NEXTWAY CRM: test isolamento multiutente partner A / partner B / platform_admin.
-- Sola prova transazionale: crea due Lead fittizi e due attività tramite RPC/INSERT autenticati.
-- Tutto viene annullato da ROLLBACK. Non modifica Lead reali né profili/partner.
-- Prerequisiti: almeno due profili role='partner' collegati a partner_details e un platform_admin.
-- Eseguire nel SQL Editor Supabase del progetto NEXTWAY corretto, in un'unica esecuzione.

begin;

-- Selezione automatica di due partner reali (solo ID) e dell'admin già verificato.
create temporary table nextway_iso_fixture (
  singleton boolean primary key default true check (singleton),
  owner_a uuid not null,
  owner_b uuid not null,
  admin_id uuid not null,
  lead_a uuid,
  lead_b uuid,
  activity_a uuid,
  activity_b uuid
) on commit drop;

create temporary table nextway_iso_results (
  test_name text primary key,
  expected text not null,
  actual text not null,
  passed boolean not null
) on commit drop;

-- Anche le tabelle temporanee del test applicano RLS.
alter table nextway_iso_fixture enable row level security;
alter table nextway_iso_results enable row level security;

create policy nextway_iso_fixture_authenticated_test
  on nextway_iso_fixture for all to authenticated
  using (true) with check (true);
create policy nextway_iso_results_authenticated_test
  on nextway_iso_results for all to authenticated
  using (true) with check (true);

grant select, insert, update on nextway_iso_fixture to authenticated;
grant select, insert on nextway_iso_results to authenticated;

do $$
declare
  v_partners uuid[];
  v_admin uuid := '0c15585e-aa21-4ec3-917d-25f4ac0a5ae6';
begin
  select array_agg(x.id order by x.id)
    into v_partners
  from (
    select p.id
    from public.profiles p
    join public.partner_details d on d.profile_id = p.id
    where p.role = 'partner'
    order by p.id
    limit 2
  ) x;

  if coalesce(array_length(v_partners, 1), 0) < 2 then
    raise exception 'TEST INTERROTTO: servono almeno due profili role=partner collegati a partner_details.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'platform_admin'
  ) then
    raise exception 'TEST INTERROTTO: il profilo platform_admin atteso non è disponibile.';
  end if;

  insert into nextway_iso_fixture(singleton, owner_a, owner_b, admin_id)
  values (true, v_partners[1], v_partners[2], v_admin);
end;
$$;

-- Da qui le operazioni applicative vengono eseguite come authenticated.
set local role authenticated;

do $$
declare
  f record;
  r jsonb;
  v_rows integer;
  v_count integer;
begin
  select * into f from nextway_iso_fixture;

  -- Partner A crea il proprio Lead temporaneo tramite la stessa RPC usata dal CRM.
  perform set_config('request.jwt.claim.sub', f.owner_a::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.owner_a::text, 'role', 'authenticated')::text, true);

  r := public.nextway_create_lead_with_conversation_idempotent(
    gen_random_uuid(), repeat('a', 64),
    'NEXTWAY ISOLATION TEST A', 'potential_partner',
    'NEXTWAY_ISOLATION_TEST', 'https://example.invalid/nextway-isolation-a',
    'Dato fittizio generato esclusivamente per test RLS.',
    'Test isolamento partner', 'manual'
  );

  if coalesce((r->>'success')::boolean, false) is not true
     or nullif(r->>'lead_id','') is null then
    raise exception 'Creazione Lead test A fallita: %', r;
  end if;

  update nextway_iso_fixture
     set lead_a = (r->>'lead_id')::uuid
   where singleton = true;

  insert into public.nextway_lead_activities
    (lead_id, owner_profile_id, activity_type, subject, details)
  values
    ((r->>'lead_id')::uuid, f.owner_a, 'note',
     'NEXTWAY ISOLATION TEST A', 'Attività fittizia rollback')
  returning id into f.activity_a;

  update nextway_iso_fixture set activity_a = f.activity_a where singleton = true;

  -- Partner B crea il proprio Lead temporaneo.
  perform set_config('request.jwt.claim.sub', f.owner_b::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.owner_b::text, 'role', 'authenticated')::text, true);

  r := public.nextway_create_lead_with_conversation_idempotent(
    gen_random_uuid(), repeat('b', 64),
    'NEXTWAY ISOLATION TEST B', 'potential_partner',
    'NEXTWAY_ISOLATION_TEST', 'https://example.invalid/nextway-isolation-b',
    'Dato fittizio generato esclusivamente per test RLS.',
    'Test isolamento partner', 'manual'
  );

  if coalesce((r->>'success')::boolean, false) is not true
     or nullif(r->>'lead_id','') is null then
    raise exception 'Creazione Lead test B fallita: %', r;
  end if;

  update nextway_iso_fixture set lead_b = (r->>'lead_id')::uuid where singleton = true;

  insert into public.nextway_lead_activities
    (lead_id, owner_profile_id, activity_type, subject, details)
  values
    ((r->>'lead_id')::uuid, f.owner_b, 'note',
     'NEXTWAY ISOLATION TEST B', 'Attività fittizia rollback')
  returning id into f.activity_b;

  update nextway_iso_fixture set activity_b = f.activity_b where singleton = true;

  select * into f from nextway_iso_fixture;

  -- PARTNER A: vede il proprio Lead/attività e non vede quelli di B.
  perform set_config('request.jwt.claim.sub', f.owner_a::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.owner_a::text, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.nextway_leads where id = f.lead_a;
  insert into nextway_iso_results values
    ('Partner A legge il proprio Lead', '1', v_count::text, v_count = 1);

  select count(*) into v_count from public.nextway_leads where id = f.lead_b;
  insert into nextway_iso_results values
    ('Partner A non legge il Lead di B', '0', v_count::text, v_count = 0);

  select count(*) into v_count from public.nextway_lead_activities where id = f.activity_b;
  insert into nextway_iso_results values
    ('Partner A non legge attività di B', '0', v_count::text, v_count = 0);

  update public.nextway_leads set status = status where id = f.lead_b;
  get diagnostics v_rows = row_count;
  insert into nextway_iso_results values
    ('Partner A non modifica Lead di B', '0 righe', v_rows::text || ' righe', v_rows = 0);

  delete from public.nextway_leads where id = f.lead_b;
  get diagnostics v_rows = row_count;
  insert into nextway_iso_results values
    ('Partner A non cancella Lead di B', '0 righe', v_rows::text || ' righe', v_rows = 0);

  select count(*) into v_count
    from public.nextway_lead_creation_requests
   where owner_profile_id = f.owner_b;
  insert into nextway_iso_results values
    ('Partner A non legge richieste idempotenza di B', '0', v_count::text, v_count = 0);

  -- PARTNER B: test speculare.
  perform set_config('request.jwt.claim.sub', f.owner_b::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.owner_b::text, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.nextway_leads where id = f.lead_b;
  insert into nextway_iso_results values
    ('Partner B legge il proprio Lead', '1', v_count::text, v_count = 1);

  select count(*) into v_count from public.nextway_leads where id = f.lead_a;
  insert into nextway_iso_results values
    ('Partner B non legge il Lead di A', '0', v_count::text, v_count = 0);

  select count(*) into v_count from public.nextway_lead_activities where id = f.activity_a;
  insert into nextway_iso_results values
    ('Partner B non legge attività di A', '0', v_count::text, v_count = 0);

  update public.nextway_leads set status = status where id = f.lead_a;
  get diagnostics v_rows = row_count;
  insert into nextway_iso_results values
    ('Partner B non modifica Lead di A', '0 righe', v_rows::text || ' righe', v_rows = 0);

  delete from public.nextway_leads where id = f.lead_a;
  get diagnostics v_rows = row_count;
  insert into nextway_iso_results values
    ('Partner B non cancella Lead di A', '0 righe', v_rows::text || ' righe', v_rows = 0);

  select count(*) into v_count
    from public.nextway_lead_creation_requests
   where owner_profile_id = f.owner_a;
  insert into nextway_iso_results values
    ('Partner B non legge richieste idempotenza di A', '0', v_count::text, v_count = 0);

  -- PLATFORM ADMIN: accesso trasversale previsto dalle policy.
  perform set_config('request.jwt.claim.sub', f.admin_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.admin_id::text, 'role', 'authenticated')::text, true);

  select count(*) into v_count
    from public.nextway_leads
   where id in (f.lead_a, f.lead_b);
  insert into nextway_iso_results values
    ('Admin legge entrambi i Lead', '2', v_count::text, v_count = 2);

  select count(*) into v_count
    from public.nextway_lead_activities
   where id in (f.activity_a, f.activity_b);
  insert into nextway_iso_results values
    ('Admin legge entrambe le attività', '2', v_count::text, v_count = 2);

  if exists (select 1 from nextway_iso_results where not passed) then
    raise exception 'TEST ISOLAMENTO FALLITO: una o più asserzioni non sono rispettate.';
  end if;
end;
$$;

-- Risultato leggibile prima dell'annullamento della transazione.
select
  test_name,
  expected,
  actual,
  case when passed then 'SUPERATO' else 'FALLITO' end as esito
from nextway_iso_results
order by test_name;

select
  count(*) as test_totali,
  count(*) filter (where passed) as test_superati,
  count(*) filter (where not passed) as test_falliti,
  case when bool_and(passed) then 'SUPERATO' else 'FALLITO' end as esito_generale,
  'I record temporanei saranno annullati dal ROLLBACK' as nota
from nextway_iso_results;

-- Obbligatorio: annulla Lead, conversazioni, attività, richieste e audit creati dal test.
rollback;
