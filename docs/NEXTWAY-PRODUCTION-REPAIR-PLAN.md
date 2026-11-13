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
