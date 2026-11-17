# NEXTWAY — chiusura collegamento CRM → memoria centrale

## Implementazione preparata

Il flusso di sincronizzazione CRM ora prevede una conferma esplicita server-side dopo il salvataggio del Lead e dopo l'eventuale revisione manuale.

1. Il client completa l'insert/update su `nextway_leads`.
2. Se è richiesta la revisione manuale, chiama e attende `nextway_confirm_lead_manual_review`.
3. Solo dopo il successo chiama l'Edge Function `nextway-search` con `action=confirm_crm_acquisition`.
4. L'Edge Function autentica l'utente, verifica la membership del workspace e invoca la RPC protetta `nextway_mark_prospect_identity_acquired`.
5. La RPC verifica ID Lead, proprietario, workspace e URL sorgente. Solo allora imposta `archive_status='acquired'` e valorizza `last_acquired_at`.
6. La RPC è idempotente: conserva il primo timestamp di acquisizione.
7. Se la conferma centrale fallisce dopo il commit CRM, il Lead resta salvato, `_central_acquisition_pending` resta true e la sincronizzazione successiva riprova la conferma senza creare un altro Lead.
8. Lo storico e l'indice identità locali sono aggiornati solo dopo la conferma server-side.

I Lead personali legacy senza `workspace_id` non vengono inviati alla memoria centrale workspace.

## File modificati/aggiunti

- `nextway-cloud.js`
- `supabase/functions/nextway-search/index.ts`
- `supabase/migrations/20261116150000_nextway_confirm_prospect_crm_acquisition.sql`
- `scripts/test-nextway-central-crm-acquisition-confirmation.mjs`
- `NEXTWAY-PR14-CHANGELOG-16NOV.md`

## Validazione locale

- 44 script Node.js `scripts/test-nextway-*.mjs`: superati.
- 2 script Python `scripts/test-nextway-*.py`: superati.
- 3 controlli sintattici JavaScript: superati.
- TypeScript della Edge Function `nextway-search`: controllo `tsc --noEmit` superato con dichiarazioni locali per l'ambiente Deno e il modulo Supabase remoto.

Non è stato possibile eseguire un test SQL runtime perché non è disponibile un client PostgreSQL/Deno collegato a un ambiente di test. Il controllo TypeScript non sostituisce il deploy/test runtime Deno.

## Attivazione ancora necessaria

Questa è una preparazione locale. Non sono state applicate migrazioni, deployate Edge Functions, eseguite scritture Supabase, pushate modifiche, aggiornate PR o pubblicate pagine Netlify.

Prima di usare il flusso in un ambiente reale occorre applicare la migrazione indicata, distribuire la Edge Function aggiornata e fare un test controllato in workspace di prova. La funzione di readiness blocca la ricerca finché la nuova RPC e i relativi permessi non risultano installati.