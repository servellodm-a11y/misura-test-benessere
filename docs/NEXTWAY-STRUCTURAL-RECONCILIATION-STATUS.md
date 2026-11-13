# NEXTWAY — stato operativo della riconciliazione strutturale

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`

## Decisione sintetica

La riconciliazione è **parzialmente completata con evidenze documentate**. Non è necessario che l'utente copi o invii il report da 76 righe. Il report strutturale completo non verrà usato come prerequisito per ripetere verifiche già concluse.

La baseline schema-only remota è stata recuperata in sola lettura:
- progetto `nextway-platform`, ref `obqwbtlltxjfeirstsya`;
- file locale `/tmp/nextway-public-schema.sql`, 154 KB / 3.615 righe;
- SHA-256 `5622e4e5864c6860241f04ad6ecff6c08a1d7a61c37a062b50772fa704a9f32d`;
- inventario riportato: 21 tabelle, 22 funzioni SECURITY DEFINER, 53 policy, 11 trigger, 48 indici;
- dump del solo schema `public`, senza righe applicative; non comprende gli schemi gestiti `auth` e `storage`, né ruoli personalizzati.

## Evidenze live già acquisite

| Area | Evidenza | Stato |
|---|---|---|
| Tabelle base | `profiles`, `nextway_leads`, conversazioni Setter e store legacy presenti | COMPLETATO E VERIFICATO nei preflight precedenti |
| Workspace | workspace, prompt, criteri, membership presenti; RLS attiva | COMPLETATO E VERIFICATO nei controlli precedenti |
| Associazione workspace | colonne `workspace_id` e FK RESTRICT su Lead, knowledge documents e conversazioni Setter | COMPLETATO E VERIFICATO nei controlli precedenti |
| Store Setter | `nextway_setter_generation_requests` legacy e `nextway_setter_workspace_generation_requests` separato | COMPLETATO E VERIFICATO |
| Rate limit P0 | tabella, RPC finale `nextway_consume_api_rate_limit(text, integer)`, RLS e grant RPC | COMPLETATO E VERIFICATO dal report SQL utente del 13-11-2026 |
| Governance P0 | RPC `nextway_get_active_setter_governance(uuid)` e accesso | COMPLETATO E VERIFICATO dal report SQL utente del 13-11-2026 |

Non ripetere questi controlli senza una nuova evidenza concreta.

## Riconciliazione statica delle migrazioni

1. Le migrazioni rate-limit `20261110000100` e `20261110000300` definiscono la tabella e poi aggiornano la RPC dalla firma a un argomento alla firma finale a due argomenti. Lo stato P0 live è stato ripristinato con il draft controllato ed è verificato; non riapplicare le migrazioni per tentare di ricostruire la cronologia.
2. Le migrazioni workspace sono dipendenti in sequenza: fondazione workspace → associazione dati → membership/helper → RLS workspace-scoped → Setter workspace-aware → isolamento dello store Setter. I preflight precedenti confermano la presenza delle strutture principali e delle associazioni.
3. La migrazione `20261112020000_nextway_setter_generation_table_isolation.sql` risulta già applicata live secondo lo storico operativo. Preserva lo store legacy e crea lo store workspace separato. Non riapplicare.
4. Le migrazioni legacy `20261110000400_nextway_idempotency_retention.sql` e `20261110000700_nextway_clear_stale_staged_output.sql` dipendono dal vecchio modello `user_id / lease_expires_at / pending`. La tabella legacy effettiva usa `owner_profile_id / claimed_at`; tali migrazioni sono incompatibili e vanno escluse, senza aggiungere colonne obsolete.
5. La migrazione governance `20261112030000_nextway_setter_governance_read_rpc.sql` è la sorgente versionata della RPC ora verificata live. La cronologia di esecuzione non è ricostruibile da un registro applicativo Supabase identificato.

## Limiti probatori residui

Non è corretto dichiarare completata la riconciliazione esatta di:
- tutti i tipi e default di colonna;
- ogni PK, UNIQUE, CHECK e FK con definizione completa;
- parametri completi, proprietari e ACL di tutte le funzioni;
- proprietari e privilegi di ogni relazione e sequenza;
- corrispondenza uno-a-uno tra ogni oggetto live e ogni migrazione.

Il dump integrale è presente soltanto sul Mac dell'utente e il report dettagliato dei cataloghi non è stato trasferito in questa conversazione. Questi dettagli non possono essere ricostruiti con certezza dai soli conteggi o da estratti del MASTER.

## Decisione sul bootstrap locale

**NON AVVIARE ancora il bootstrap/import locale.** Il Mac Intel con 8 GB RAM non è adatto allo stack Supabase completo; Docker VM disponeva di circa 3,82 GiB. Nessun aumento memoria e nessun full stack.

Il prossimo lavoro consentito e utile è una revisione statica mirata dei prerequisiti delle migrazioni e dei contratti Edge Function sul branch. La baseline può essere preparata come documentazione, ma non certificata importabile senza confronto integrale di definizioni e senza un runtime PostgreSQL isolato.

## Vincoli invariati

- Nessuna migrazione, DDL/DML, deploy, merge, seed o modifica DB live.
- Non toccare `main`; PR #1 resta draft.
- Nessun deploy Netlify produzione prima del 4 dicembre 2026.
- Preservare `supabase/.temp/`.
- Nessun dato reale nei test; eventuali seed solo sintetici e in ambiente isolato.
- Distinguere sempre controlli statici, report SQL live e test runtime.

## Stato

- **COMPLETATO E VERIFICATO:** baseline schema-only acquisita; principali oggetti workspace/Setter; Rate Limit e Governance P0 secondo i report SQL.
- **ESEGUITO MA NON VERIFICATO:** riconciliazione lessicale complessiva come certificazione di importabilità.
- **DA COMPLETARE:** dettagli completi di colonne/tipi, vincoli, sequenze, ownership e ACL; test PostgreSQL isolato.
- **BLOCCATO:** bootstrap Supabase completo sul Mac attuale per limiti di risorse; cronologia delle migrazioni applicative non identificata.
