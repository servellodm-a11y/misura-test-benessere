# NEXTWAY Conversion Provisioning — Edge Function

## Scopo
Attiva una richiesta `ready_for_activation` della coda CRM. L'endpoint è esclusivamente amministrativo.

- `partner`: invia un invito Supabase Auth; il trigger `on_auth_user_created` crea il record base in `profiles`; la RPC completa `profiles` e `partner_details`.
- `customer`: crea il record in `clients` associato al proprietario/sponsor della richiesta. Non crea un account Auth.
- Entrambi i percorsi aggiornano lo stato del Lead e portano la richiesta a `activated`.

## Sicurezza
- Verifica il Bearer token e controlla che `profiles.role = 'platform_admin'`.
- La chiave `NEXTWAY_SERVICE_ROLE_KEY` è usata solo nell'Edge Function.
- Il browser invia esclusivamente `request_id`; email, nome, sponsor e tipo vengono letti dalla richiesta approvata nel database.
- Le RPC di claim/finalizzazione/rilascio sono eseguibili solo da `service_role`.
- Lease di 10 minuti per impedire attivazioni concorrenti; retry dopo scadenza.
- `nextway_conversion_request_id` univoco in `partner_details` e `clients` per prevenire duplicazioni.
- In caso di errore dopo la creazione dell'utente Auth, la funzione verifica prima se la transazione è stata completata; se non lo è, elimina l'utente appena invitato e rilascia il claim.

## Prerequisiti
1. Applicare `supabase/migrations/20261111001500_nextway_conversion_provisioning.sql` nel SQL Editor.
2. Configurare il secret Supabase Edge Functions `NEXTWAY_SERVICE_ROLE_KEY` con la service-role key del progetto. Non inserirla in GitHub, HTML, JavaScript client o documentazione pubblica.
3. Verificare `SUPABASE_URL` e una chiave pubblicabile/anon disponibili nell'ambiente Edge Functions.
4. Pubblicare `nextway-conversion-provisioning`.
5. Il frontend richiama la funzione dalla coda amministrativa delle richieste pronte.

## Endpoint
`POST /functions/v1/nextway-conversion-provisioning`

Header: `Authorization: Bearer <access_token>`, `apikey: <publishable_key>`, `Content-Type: application/json`.

Body:
`{ "request_id": "UUID" }`

Non passare altri dati dal browser. L'operazione invia un invito email a Supabase Auth per i partner. I clienti vengono inseriti direttamente in `public.clients`.

## Limiti
- Il codice nel repository non equivale a una funzione distribuita.
- La migrazione non è applicata su Supabase live finché non viene eseguita dall'amministratore.
- Non è ancora un test runtime end-to-end. Prima del rilascio verificare un invito partner controllato e una conversione cliente con dati di test autorizzati.
- `team_side` resta `NULL` in creazione: l'assegnazione A/B è una scelta organizzativa separata e non viene inventata dal sistema.
