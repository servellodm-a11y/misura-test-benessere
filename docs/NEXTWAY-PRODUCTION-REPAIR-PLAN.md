# NEXTWAY — Piano di preparazione ripristino oggetti mancanti

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`

## Scopo

Preparare il ripristino controllato degli oggetti NEXTWAY che il report read-only ha trovato assenti. Questo documento non autorizza e non esegue modifiche in produzione.

## Evidenze attuali

Confermati nel database:
- `public.nextway_setter_generation_requests` — presente; preservare.
- `public.nextway_setter_workspace_generation_requests` — presente; preservare.

Non trovati:
- `public.nextway_api_rate_limits`
- `public.nextway_consume_api_rate_limit(text, integer)`
- `public.nextway_get_active_setter_governance(uuid)`
- `public.nextway_clear_stale_setter_output()`
- trigger `nextway_clear_stale_setter_output_trg`
- `public.nextway_prune_setter_generation_requests()`

## Sorgenti canoniche già presenti nel branch

| Priorità | Migrazione sorgente | Oggetti |
|---|---|---|
| P0 | `20261110000100_nextway_distributed_rate_limit.sql` + `20261110000300_nextway_rate_limit_units.sql` | Tabella rate limit e RPC finale con firma `(text, integer)` |
| P0 workspace | `20261112030000_nextway_setter_governance_read_rpc.sql` | RPC governance read-only |
| P1 | `20261110000700_nextway_clear_stale_staged_output.sql` | Funzione trigger e trigger di pulizia output staged |
| P2 | `20261110000400_nextway_idempotency_retention.sql` | Indici retention e funzione admin-only di manutenzione |

Non inventare SQL sostitutivo: usare le migrazioni esistenti come sorgente canonica dopo aver verificato dipendenze e definizioni live.

## Dipendenze da pre-verificare

- Rate limit: `auth.users`, `auth.uid()`, tabella legacy rate-limit assente, ruolo `authenticated`; verificare che non esistano oggetti omonimi con firma differente e che la tabella non sia già stata creata con nome diverso.
- Governance: tabelle workspace, helper `nextway_has_workspace_access(uuid,text[])`, stato e colonne usate dalla funzione; la migrazione richiede workspace attivo e membership attiva.
- Cleanup staged: tabella legacy presente e colonne `user_id`, `idempotency_key`, `conversation_id`, `generated_output`; trigger deve restare limitato agli aggiornamenti delle tre colonne di lease/identità.
- Retention: tabella legacy e colonne `status`, `updated_at`, `lease_expires_at`; verifica che i vincoli e la semantica della tabella legacy corrispondano alla migrazione di origine.

## Sequenza proposta

1. Eseguire una sola query pre-flight read-only (`NEXTWAY-REPAIR-PREFLIGHT-REPORT.sql`). Produce una sola cella testuale.
2. Confrontare ogni dipendenza con lo schema live. Se un prerequisito è mancante o una funzione target è già presente, fermarsi e riconciliare.
3. Preparare quattro pacchetti separati, mantenendo l'ordine delle migrazioni sorgente. Per rate limit, applicare concettualmente la migrazione base e poi quella che aggiorna la firma; non eseguire la vecchia firma come stato finale.
4. Riesaminare sicurezza: `SECURITY DEFINER`, `search_path` fisso, privilegi revocati da `public/anon`, grant solo al ruolo previsto, RLS e accesso alla tabella privata.
5. Prima di qualsiasi applicazione: backup/export adeguato, piano di rollback e autorizzazione esplicita dell'utente. Nessun test con dati reali.
6. Dopo un'eventuale applicazione autorizzata, eseguire una query read-only di verifica oggetti e privilegi; test runtime soltanto su staging isolato.

## Rischi e cautele

- La query pre-flight è diagnostica, non prova l'assenza di dipendenze semantiche.
- La migrazione governance contiene una transazione esplicita e dipende dalle tabelle workspace già popolate strutturalmente, ma non richiede di creare record workspace.
- La migrazione rate limit crea una tabella referenziando `auth.users`; non eseguire se lo schema non è quello atteso.
- La funzione retention elimina righe quando invocata: la sua creazione non elimina dati, ma non chiamarla in produzione senza una specifica autorizzazione e una revisione della retention.
- Non riapplicare `20261112020000_nextway_setter_generation_table_isolation.sql`: è già dichiarata applicata e lo store workspace è presente.
- Non applicare in blocco tutte le migrazioni del repository: alcune sono draft, altre già applicate o dipendenti da prerequisiti.

## Divieti invariati

Nessuna migrazione, DDL/DML, deploy, merge, seed, creazione di workspace/membership/Lead/documenti, test runtime o modifica a `main` in questa fase. Nessun deploy Netlify in produzione prima del 4 dicembre 2026.

## Stato

- **COMPLETATO:** piano di ripristino e query pre-flight preparati sul branch.
- **DA COMPLETARE:** esecuzione del pre-flight e revisione delle dipendenze/privilegi live.
- **NON ESEGUITO:** qualsiasi modifica al database o deploy.

## Aggiornamento dopo pre-flight — 13 novembre 2026

Il pre-flight restituisce:
- Dipendenze base Auth/profiles/Lead/conversazioni e helper workspace: presenti.
- Tabelle workspace e RLS: presenti.
- Rate limit table/RPC e governance RPC: assenti.
- La tabella legacy `nextway_setter_generation_requests` NON ha `user_id` e `lease_expires_at`.

### Interpretazione corretta della tabella legacy

L'assenza di `user_id` e `lease_expires_at` non è una lacuna da correggere aggiungendo colonne. La migrazione workspace-aware `20261111240000_nextway_setter_generation_workspace.sql` definisce lo store legacy con `owner_profile_id`, `claimed_at`, `generated_output`, `cached_response` e stati `generating/completed`. La successiva migrazione `20261112020000_nextway_setter_generation_table_isolation.sql` crea uno store workspace separato e mantiene la tabella legacy.

Le migrazioni `20261110000700_nextway_clear_stale_staged_output.sql` e `20261110000400_nextway_idempotency_retention.sql` appartengono al vecchio schema `user_id/lease_expires_at/pending`. Sono incompatibili con la struttura attuale: NON applicarle, NON aggiungere colonne per farle passare e NON ricreare il vecchio modello. La protezione e il flusso attuale vanno valutati sulle funzioni workspace-aware già presenti.

### Draft P0

Creato `docs/NEXTWAY-P0-REPAIR-DRAFT.sql`, non applicato. Contiene:
- guardie preliminari su prerequisiti e oggetti target;
- creazione tabella rate limit e RPC con firma finale `(text, integer)`;
- creazione RPC governance workspace;
- grant/revoke e search_path fisso, in linea con le migrazioni sorgenti.

Il draft è una proposta tecnica da revisionare, non un'autorizzazione all'esecuzione. Prima dell'applicazione servono controllo finale delle colonne workspace, privilegi effettivi, backup e autorizzazione esplicita.


## Autorizzazione ricevuta e limite operativo — 13 novembre 2026
L'utente ha autorizzato il ripristino P0. Il draft è stato confrontato con le migrazioni sorgenti e il codice Edge Function: la firma RPC richiesta dal Setter è `(p_scope text, p_units integer)`; la governance viene chiamata quando la conversazione ha `workspace_id`. Aggiunta al draft una guardia che interrompe la transazione se la RPC governance esiste già, evitando una sostituzione accidentale.

L'ambiente di questa conversazione non dispone di un connettore Supabase/SQL Editor né di una sessione database autenticata: non è possibile eseguire direttamente il DDL sul progetto. Il consenso è registrato, ma non va dichiarata l'applicazione completata. Per eseguire il ripristino, il draft aggiornato deve essere lanciato dall'utente nel SQL Editor autenticato del progetto corretto; dopo il risultato si potrà verificare lo stato con una query read-only. Nessun DDL è stato eseguito.

## Aggiornamento stato reale — 13 novembre 2026, dopo verifica P0

L'utente ha eseguito il draft P0 nel SQL Editor del progetto `nextway-platform` e ha riportato `Success. No rows returned`. La query read-only successiva ha confermato tutti i seguenti esiti:

- Tabella `public.nextway_api_rate_limits`: OK.
- RPC `nextway_consume_api_rate_limit(text, integer)`: OK.
- RPC `nextway_get_active_setter_governance(uuid)`: OK.
- RLS sulla tabella Rate Limit: ATTIVA.
- Accesso RPC Rate Limit: OK.
- Accesso RPC Governance: OK.

**P0 RATE LIMIT E GOVERNANCE: COMPLETATO E VERIFICATO secondo il report SQL dell'utente.** Non ripetere il pre-flight o la verifica di questi oggetti senza una nuova evidenza concreta.

### Chiusura delle vecchie attività P1/P2

Le migrazioni `20261110000700_nextway_clear_stale_staged_output.sql` e `20261110000400_nextway_idempotency_retention.sql` appartengono al precedente modello legacy (`user_id`, `lease_expires_at`, stati `pending`). La tabella legacy corrente usa invece `owner_profile_id` e `claimed_at`, e lo store workspace è separato. Queste migrazioni non sono compatibili e NON devono essere applicate né adattate aggiungendo colonne obsolete.

Non esiste quindi un'attività P1/P2 pronta da eseguire usando quelle migrazioni. Qualsiasi futura manutenzione degli output dovrà essere progettata per il modello workspace-aware effettivo e solo dopo aver dimostrato un difetto runtime o un requisito operativo mancante. Non invocare funzioni di retention o cancellazione su dati reali.

### Prossimo lavoro utile per la piattaforma

1. Completare la riconciliazione della baseline schema-only e delle dipendenze, senza ripetere controlli SQL già conclusi.
2. Preparare una baseline locale riproducibile e un seed esclusivamente sintetico, preservando `supabase/.temp/`.
3. Eseguire prima test PostgreSQL isolati; solo se le risorse lo consentono, valutare i test d'integrazione Auth/API/Storage/Edge Runtime.
4. Tenere separati i test CI/statici dai test runtime e dalle verifiche delle funzioni effettivamente distribuite.

Vincoli invariati: nessuna migrazione ulteriore, deploy Supabase o Netlify, merge PR o modifica a `main` senza autorizzazione specifica; Netlify produzione resta bloccato fino al 4 dicembre 2026.
