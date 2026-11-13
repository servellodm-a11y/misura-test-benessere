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
