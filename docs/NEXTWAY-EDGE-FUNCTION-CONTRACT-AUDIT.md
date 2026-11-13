# NEXTWAY — audit statico contratti Edge Functions

Data: 13 novembre 2026  
Branch analizzato: `fix/nextway-password-recovery`  
HEAD al momento dell'audit: `3cefd52c7c6665d221e4837659f07824e916429b`

## Esito

**Nessuna incompatibilità statica tra le RPC invocate dal codice Edge Function e le firme SQL versionate esaminate.** Questo è un controllo statico del sorgente Git, non una prova che il medesimo codice sia quello attualmente distribuito su Supabase.

### Matrice contratti RPC

| Edge Function | RPC invocate | Contratto SQL individuato | Esito statico |
|---|---|---|---|
| `nextway-ai-setter` | `nextway_consume_api_rate_limit(text, integer)` | migrazione `20261110000300` | COERENTE |
| `nextway-ai-setter` | `nextway_get_active_setter_governance(uuid)` | migrazione `20261112030000` | COERENTE |
| `nextway-ai-setter` | `nextway_begin_setter_generation(uuid, uuid)` | migrazione `20261112020000` | COERENTE |
| `nextway-ai-setter` | `nextway_get_staged_setter_output(uuid)` | migrazione `20261112020000` | COERENTE |
| `nextway-ai-setter` | `nextway_store_setter_generation_output(uuid, jsonb)` | migrazione `20261112020000` | COERENTE |
| `nextway-ai-setter` | `nextway_complete_setter_generation(uuid, text, text, text, text, text)` | migrazione `20261112020000` | COERENTE |
| `nextway-search` | `nextway_consume_api_rate_limit(text, integer)` | migrazione `20261110000300` | COERENTE |
| `nextway-workspace-admin` | `nextway_activate_workspace_prompt(uuid, uuid)`, `nextway_activate_workspace_criteria(uuid, uuid)` | migrazione `20261111200000` | COERENTE |
| `nextway-conversion-provisioning` | `nextway_claim_conversion_activation(uuid, uuid)`, `nextway_finalize_conversion_activation(uuid, uuid, uuid)`, `nextway_release_conversion_activation(uuid, uuid)` | migrazioni `20261111001500`, `20261111150000`, `20261112170000` | COERENTE |

Le quattro RPC Setter di generazione sono ridefinite dalla migrazione di isolamento per operare sullo store workspace `nextway_setter_workspace_generation_requests`; lo store legacy `nextway_setter_generation_requests` è preservato. I nomi dei parametri usati dall'Edge Function corrispondono a quelli SQL esaminati. La RPC rate limit usa la firma finale a due argomenti e l'Edge Function passa `p_units`.

### Dipendenze dati osservate

- AI Setter: `nextway_setter_conversations`, `nextway_leads`, `nextway_setter_messages`; store generazione gestito tramite RPC.
- Ricerca pubblica: autenticazione Supabase e RPC rate limit; provider Tavily tramite secret server-side.
- Workspace admin: `profiles`, `nextway_workspaces`, `nextway_workspace_memberships`, `nextway_knowledge_documents`, `nextway_workspace_prompts`, `nextway_workspace_prospect_criteria`, `partner_details`.
- Knowledge ingest/upload: `profiles`, workspace e tabelle knowledge; accesso privilegiato server-side dopo autenticazione e controllo ruolo.
- Conversion provisioning: `profiles`, `nextway_lead_conversion_requests`; le RPC SQL di claim/finalizzazione/rilascio sono riservate a `service_role`.

### Controlli di sicurezza statici osservati

- AI Setter e ricerca pubblica richiedono Bearer token e validano l'utente con `auth.getUser`.
- Rate limit viene applicato lato server prima della chiamata al provider esterno.
- Workspace admin e conversion provisioning verificano il ruolo `platform_admin` prima delle operazioni privilegiate.
- Conversion provisioning usa claim token, controlli di idempotenza e verifica dello stato prima della finalizzazione.
- Le RPC di attivazione workspace sono invocate dal client service-role dopo il controllo platform_admin e ricevono l'identificativo dell'amministratore; le funzioni SQL verificano nuovamente il ruolo.
- Le RPC Setter sono concesse ad `authenticated`, ma verificano l'attore e l'accesso alla conversazione/workspace all'interno delle funzioni SECURITY DEFINER.
- Le funzioni privilegiate non espongono i valori dei secret nei log o nelle risposte esaminate.

## CI GitHub

Workflow `NEXTWAY static validation`, run **#295**, commit codice `4b9727bbfe8a03a0dbe7cb33a310ababc9cc135e`: **SUCCESS**. Tutti gli step risultano completati con esito positivo, inclusi:
- test statici di sicurezza Edge Functions e provisioning;
- test SQL di rate limit/idempotenza e contratti workspace/Setter/Knowledge;
- test UI e CORS;
- `deno check` per tutte e sei le Edge Functions: AI Setter, Knowledge Ingest, Knowledge Upload, Conversion Provisioning, Workspace Admin e Search.

Il branch HEAD successivo `3cefd52` contiene soltanto il documento di stato della riconciliazione; il diff del commit non modifica codice, SQL o workflow. Il run #295 copre quindi il codice presente al momento dell'audit. Il successo CI certifica i controlli automatizzati del repository, non la distribuzione remota né il comportamento runtime end-to-end.

## Limiti e gate ancora aperti

1. Non è stata interrogata la versione remota effettivamente distribuita delle sei Edge Functions: non dichiarare allineamento GitHub/Supabase.
2. Non sono stati eseguiti test end-to-end con utente, workspace, prompt, lead o conversione reali.
3. Non è certificata l'importabilità del dump schema-only in un PostgreSQL isolato.
4. La riconciliazione completa di ownership, tipi, vincoli, sequenze e ACL live resta aperta, come documentato in `docs/NEXTWAY-STRUCTURAL-RECONCILIATION-STATUS.md`.

## Stato operativo

- **COMPLETATO E VERIFICATO:** compatibilità statica delle RPC invocate con le firme SQL esaminate; CI run #295 verde.
- **ESEGUITO MA NON VERIFICATO:** allineamento tra sorgente GitHub e versione Edge Function remota.
- **DA COMPLETARE:** test runtime isolati e riconciliazione completa dei metadati live.
- **BLOCCATO:** bootstrap Supabase full stack sul Mac Intel 8 GB per limiti di risorse.

Nessuna migrazione, modifica al database, deploy, merge, seed o modifica a `main` eseguita durante questo audit.

## Approfondimento Knowledge Base — 13 novembre 2026

Revisione statica aggiuntiva di:
- `nextway-knowledge-ingest/index.ts`;
- `nextway-knowledge-upload/index.ts`;
- migrazioni `20261111170000` (registro/chunk/ricerca), `20261111180000` (bucket privato), `20261111210000` (associazione workspace) e `20261111230000` (RLS workspace);
- test statici `test-nextway-knowledge-base-sql.mjs`, `test-nextway-knowledge-ingest-security.mjs`, `test-nextway-knowledge-upload-security.mjs` e `test-nextway-workspace-scoped-rls.mjs`.

### Esiti statici

- **Autorizzazione:** entrambe le Edge Function richiedono Bearer token, validano l'utente con `auth.getUser` e verificano `profiles.role = platform_admin` prima delle operazioni privilegiate.
- **Separazione workspace:** ingest richiede un UUID workspace, rifiuta workspace assente/archiviato e applica il filtro `workspace_id` alla deduplicazione. La migrazione scoped sostituisce l'indice hash globale con deduplicazione separata per workspace e limita ricerca e lettura dei documenti/chunk alla membership attiva; le fonti senza workspace restano riservate all'amministratore centrale.
- **Ciclo documento:** i nuovi documenti nascono `pending`; l'Edge Function non li approva automaticamente. I chunk hanno indice univoco per documento e limite SQL di 12.000 caratteri; l'ingest usa chunk da 9.000 caratteri con sovrapposizione di 500.
- **Storage:** bucket `nextway-knowledge` privato, limite 12 MiB, MIME ammessi PDF/DOCX/TXT. Il caricamento usa un percorso che include workspace e modulo. Il file viene rimosso in caso di duplicato o errore di ingest/link; il percorso viene collegato al documento solo dopo l'indicizzazione.
- **Estrazione:** PDF limitati a 250 pagine, DOCX tramite Mammoth, TXT UTF-8 rigoroso; PDF scansiti senza testo vengono rifiutati perché OCR non è implementato.
- **Ricerca:** la funzione SQL finale richiede workspace esplicito e membership; la vecchia firma senza workspace viene revocata. Risultati limitati a documenti approvati e nel periodo di validità.
- **Test presenti:** gli script statici coprono autenticazione, ruolo, limiti, deduplicazione, approvazione, bucket privato, tipi file, estrazione e RLS workspace. La CI verde già registrata include questi controlli.

### Limiti non coperti dalla revisione statica

1. Non è stato eseguito un caricamento PDF/DOCX/TXT reale né un test di rollback su storage.
2. Non sono stati verificati runtime, limiti effettivi della piattaforma Edge, OCR, qualità estrazione o ricerca full-text su contenuti reali.
3. Non è stato verificato che la versione remota di queste due Edge Functions coincida con il branch.
4. Le policy storage proteggono gli accessi autenticati diretti; le Edge Functions operano con service role dopo il controllo applicativo. Il comportamento effettivo va verificato sul progetto remoto senza esporre chiavi.
5. I test sono statici: non provano isolamento effettivo tra due utenti/workspace in una sessione runtime.

**Esito:** nessuna incompatibilità certa rilevata tra codice Edge, schema SQL e modello workspace esaminati. Knowledge Base e caricamento restano **ESEGUITO MA NON VERIFICATO a runtime**; non dichiarare il flusso end-to-end pronto.

Nessuna migrazione, DDL/DML, test con dati reali, deploy, seed o modifica al database è stata eseguita in questo approfondimento.
