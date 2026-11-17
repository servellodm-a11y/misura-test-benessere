# NEXTWAY PR14 — integrazione locale aggiuntiva (16 novembre 2026)

## Correzione: distinzione tra salvataggio locale e acquisizione CRM

Il pulsante del motore di ricerca salva il prospect nell'archivio locale del collaboratore. La sincronizzazione verso `nextway_leads` è un'operazione successiva e separata, avviata dall'utente.

Prima della correzione, il click di acquisizione locale impostava `archive_status='acquired'`, aggiornava lo storico e la memoria identità locali e mostrava quindi il prospect come già acquisito nel CRM, anche se il Lead non era ancora stato sincronizzato.

La correzione:
- introduce lo stato UI `captured` per il record salvato nell'archivio locale;
- riserva `acquired` ai prospect riconosciuti nel CRM;
- aggiorna conferma, agenda e navigazione per non mostrare un Lead CRM prima della sincronizzazione;
- conserva l'helper `markSearchHistoryAcquired` per un eventuale uso esclusivamente dopo conferma server-side, ma non lo richiama più al salvataggio locale;
- non modifica le RPC centrali, le migrazioni, le policy RLS o i dati.

## Test

- 43 script Node.js `scripts/test-nextway-*.mjs`: superati.
- 2 script Python `scripts/test-nextway-*.py`: superati.
- 3 controlli sintattici JavaScript (`nextway-cloud.js`, `nextway-admin.js`, `nextway-setter.js`): superati.
- Nuovo test `test-nextway-capture-state-semantics.mjs`: 9 asserzioni sul significato degli stati e sulla separazione archivio locale/CRM.

## Limiti

Validazione locale statica/contrattuale. Nessun test runtime Supabase/Tavily, nessuna migrazione applicata, nessun push/merge/deploy e nessuna modifica a servizi remoti.


## Chiusura collegamento CRM → memoria centrale

Aggiunto il flusso server-side `confirm_crm_acquisition`: dopo il commit del Lead CRM e dopo l'eventuale revisione manuale, il client invoca l'Edge Function autenticata; questa verifica membership e delega a una RPC `service_role` che verifica ID Lead, proprietario, workspace e URL fonte prima di impostare `archive_status='acquired'` e `last_acquired_at`. La RPC è idempotente e conserva il primo timestamp di acquisizione.

Se il CRM è stato aggiornato ma la conferma centrale fallisce, il Lead resta salvato, viene marcato `_central_acquisition_pending` e la sincronizzazione successiva riprova. Lo stato locale dello storico viene aggiornato solo dopo conferma server-side.

Nuova migrazione candidata: `20261116150000_nextway_confirm_prospect_crm_acquisition.sql`. Da applicare solo dopo i normali preflight e autorizzazione. Nessun deploy o modifica remota eseguiti.