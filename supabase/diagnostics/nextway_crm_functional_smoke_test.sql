-- NEXTWAY CRM: smoke test funzionale transazionale.
-- Eseguire nel SQL Editor del progetto NEXTWAY corretto.
-- Simula l'utente platform_admin tramite JWT claims e SET LOCAL ROLE authenticated.
-- Tutti i record (Lead, conversazione, chiave idempotenza, attività, richiesta conversione e audit)
-- vengono creati nella transazione e annullati con ROLLBACK. Nessun dato resta persistente.
-- Non eseguire in produzione se la sessione SQL non consente SET LOCAL ROLE authenticated.

begin;

-- Profilo platform_admin già verificato nel progetto NEXTWAY.
select set_config('request.jwt.claim.sub', '0c15585e-aa21-4ec3-917d-25f4ac0a5ae6', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"0c15585e-aa21-4ec3-917d-25f4ac0a5ae6","role":"authenticated"}',
  true
);

set local role authenticated;

do $$
declare
  v_owner uuid := '0c15585e-aa21-4ec3-917d-25f4ac0a5ae6';
  v_request_id uuid := gen_random_uuid();
  v_hash text := repeat('a', 64);
  v_first jsonb;
  v_replay jsonb;
  v_lead_id uuid;
  v_conversation_id uuid;
  v_activity_id uuid;
  v_activity_status text;
  v_archived_at timestamptz;
  v_archived_by uuid;
  v_restored_at timestamptz;
  v_restored_by uuid;
  v_conversion_id uuid;
  v_audit_after jsonb;
  v_email text;
begin
  if auth.uid() is distinct from v_owner then
    raise exception 'TEST INTERROTTO: auth.uid() non corrisponde al profilo amministratore atteso';
  end if;

  v_first := public.nextway_create_lead_with_conversation_idempotent(
    v_request_id,
    v_hash,
    'NEXTWAY TEST TEMPORANEO',
    'test',
    'NEXTWAY_SMOKE_TEST',
    'https://example.invalid/nextway-smoke-test',
    'Dato fittizio: test tecnico transazionale, nessun prospect reale.',
    'Verificare il funzionamento del CRM',
    'manual'
  );

  if coalesce((v_first->>'success')::boolean, false) is not true
     or coalesce((v_first->>'idempotent_replay')::boolean, true) is not false then
    raise exception 'TEST FALLITO: prima creazione idempotente non valida: %', v_first;
  end if;

  v_lead_id := (v_first->>'lead_id')::uuid;
  v_conversation_id := (v_first->>'conversation_id')::uuid;

  v_replay := public.nextway_create_lead_with_conversation_idempotent(
    v_request_id,
    v_hash,
    'NEXTWAY TEST TEMPORANEO',
    'test',
    'NEXTWAY_SMOKE_TEST',
    'https://example.invalid/nextway-smoke-test',
    'Dato fittizio: test tecnico transazionale, nessun prospect reale.',
    'Verificare il funzionamento del CRM',
    'manual'
  );

  if coalesce((v_replay->>'success')::boolean, false) is not true
     or coalesce((v_replay->>'idempotent_replay')::boolean, false) is not true
     or (v_replay->>'lead_id')::uuid is distinct from v_lead_id
     or (v_replay->>'conversation_id')::uuid is distinct from v_conversation_id then
    raise exception 'TEST FALLITO: replay idempotente non coerente: %', v_replay;
  end if;

  raise notice 'PASS 1/6 — Creazione Lead/conversazione e replay idempotente. Lead ID temporaneo: %', v_lead_id;

  insert into public.nextway_lead_activities (
    lead_id, owner_profile_id, activity_type, subject, details, next_action_at
  ) values (
    v_lead_id, v_owner, 'task', 'NEXTWAY TEST - follow-up', 'Attività fittizia di verifica.',
    now() + interval '1 day'
  )
  returning id into v_activity_id;

  update public.nextway_lead_activities
     set next_action_status = 'done'
   where id = v_activity_id
  returning next_action_status into v_activity_status;

  if v_activity_status is distinct from 'done' then
    raise exception 'TEST FALLITO: aggiornamento stato attività/follow-up non riuscito';
  end if;

  raise notice 'PASS 2/6 — Creazione attività e completamento follow-up.';

  update public.nextway_leads
     set archived_at = clock_timestamp(),
         archive_reason = 'Test tecnico transazionale'
   where id = v_lead_id
  returning archived_at, archived_by into v_archived_at, v_archived_by;

  if v_archived_at is null or v_archived_by is distinct from v_owner then
    raise exception 'TEST FALLITO: archiviazione logica o metadata non corretti';
  end if;

  update public.nextway_leads
     set archived_at = null
   where id = v_lead_id
  returning archived_at, archived_by into v_restored_at, v_restored_by;

  if v_restored_at is not null or v_restored_by is not null then
    raise exception 'TEST FALLITO: ripristino Lead non riuscito o metadata non azzerati';
  end if;

  raise notice 'PASS 3/6 — Archiviazione logica e ripristino del Lead.';

  update public.nextway_leads
     set status = 'In valutazione'
   where id = v_lead_id;

  v_email := 'nextway-smoke-' || replace(v_request_id::text, '-', '') || '@example.invalid';

  insert into public.nextway_lead_conversion_requests (
    lead_id, owner_profile_id, sponsor_profile_id, created_by,
    conversion_type, full_name, email, phone
  ) values (
    v_lead_id, v_owner, v_owner, v_owner,
    'customer', 'NEXTWAY TEST TEMPORANEO', v_email, null
  )
  returning id into v_conversion_id;

  raise notice 'PASS 4/6 — Creazione richiesta conversione in stato pending.';

  update public.nextway_lead_conversion_requests
     set status = 'ready_for_activation',
         review_notes = 'Test tecnico: richiesta pronta, nessuna attivazione eseguita.',
         reviewed_by = v_owner,
         reviewed_at = clock_timestamp()
   where id = v_conversion_id;

  if not exists (
    select 1 from public.nextway_lead_conversion_requests
    where id = v_conversion_id
      and status = 'ready_for_activation'
      and reviewed_by = v_owner
      and reviewed_at is not null
  ) then
    raise exception 'TEST FALLITO: revisione amministrativa non salvata';
  end if;

  raise notice 'PASS 5/6 — Revisione amministrativa; nessun account o cliente viene creato.';

  select after_data into v_audit_after
    from public.nextway_lead_audit_logs
   where lead_id = v_lead_id
     and action = 'INSERT'
   order by created_at desc
   limit 1;

  if v_audit_after is null
     or v_audit_after ? 'notes'
     or v_audit_after ? 'public_evidence' then
    raise exception 'TEST FALLITO: snapshot audit mancante o non minimizzato: %', v_audit_after;
  end if;

  raise notice 'PASS 6/6 — Audit trail presente e snapshot privo di notes/public_evidence.';
  raise notice 'ESITO: TUTTI I TEST SUPERATI. Lead ID temporaneo: %, conversation ID: %', v_lead_id, v_conversation_id;
end;
$$;

-- Annulla ogni record e ogni evento audit generato dal test.
rollback;
