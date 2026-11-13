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

## Audit dipendenze CRM, membership e conversione — 13 novembre 2026

È stata esaminata la catena multi-workspace (foundation, membership, RLS, creazione Lead), l'amministrazione workspace e il provisioning di conversione.

### Parti coerenti staticamente

- La foundation crea workspace, prompt e criteri versionati; l'attivazione richiede workspace attivo e approvazione amministrativa, con RPC riservate a `service_role`.
- Le membership hanno ruoli e stati espliciti, unicità workspace/utente e un solo owner attivo o invitato per workspace.
- `nextway_has_workspace_access` richiede sessione autenticata, membership attiva, workspace attivo e ruolo ammesso; `platform_admin` conserva accesso centrale.
- Le RPC di creazione Lead/Conversazione distinguono il percorso legacy centrale dal percorso workspace-aware e legano la chiave idempotente al workspace. La vecchia idempotenza rifiuta il replay di richieste che appartengono a un workspace.
- Le funzioni admin verificano il ruolo `platform_admin`; la modifica delle membership è centralizzata. I test statici coprono ruoli, stati, unicità owner, grants, CORS e contratti di creazione.
- Il provisioning conversione usa claim token, idempotenza e finalizzazione transazionale; la finalizzazione riblocca e ricontrolla il Lead prima di aggiornare lo stato e creare il record di destinazione.

### GAP P1 — conversione non ancora collegata al workspace

La revisione ha rilevato una lacuna architetturale da risolvere prima di considerare pronto il ciclo multi-workspace partner/cliente:

1. `nextway_lead_conversion_requests` non contiene `workspace_id`.
2. Le RPC claim/finalize e l'Edge Function di provisioning non trasportano il workspace di origine.
3. La finalizzazione crea `profiles` e `partner_details` (partner) oppure `clients` (cliente), ma non crea/assegna una membership al workspace di origine né persiste un riferimento workspace sui record di destinazione.
4. Di conseguenza, dal solo codice esaminato non si può dimostrare che un partner convertito venga associato automaticamente al workspace corretto o che i clienti restino attribuiti in modo non ambiguo quando uno sponsor opera in più workspace.

Questo non dimostra un errore nell'attuale conversione centralizzata, ma impedisce di certificare il flusso di conversione come multi-workspace end-to-end. È necessaria una decisione di modello: il workspace deve essere ereditato dal Lead e persistito nella richiesta; la conversione partner deve creare una membership coerente (ruolo/stato da definire) e la conversione cliente deve conservare l'attribuzione workspace, senza creare accessi Auth per i clienti. La correzione dovrà essere progettata con migrazione additiva, test idempotenza/concorrenza e protezioni per richieste legacy.

**Priorità:** P1 — risolvere prima del primo onboarding/conversione partner in workspace multipli. Non applicare una correzione automatica senza definire la semantica di membership e proprietà cliente.

### Altri gate

- L'API admin può modificare lo stato del workspace; il comportamento di sospensione membership e revoca accessi al cambio stato deve essere verificato con test runtime.
- Nessun test con due utenti reali in workspace distinti è stato eseguito.
- La revisione resta statica: non prova che il database remoto abbia tutte le versioni attese né che le Edge Function distribuite coincidano con Git.

Nessuna migrazione, modifica DB, deploy, merge, seed, creazione membership o conversione è stata eseguita durante questo audit.


## Progettazione correzione conversione multi-workspace — 13 novembre 2026

### Dipendenze verificate nel branch

- La UI CRM in `nextway-cloud.js` crea la richiesta leggendo il Lead, ma seleziona soltanto `id, owner_profile_id, status, archived_at`; non legge né invia `workspace_id`.
- L'INSERT in `nextway_lead_conversion_requests` invia owner/sponsor/creator e dati di conversione, ma nessuna associazione workspace.
- La migration `20261110001400` non definisce `workspace_id`; la policy INSERT controlla proprietario e stato del Lead, ma non conserva un vincolo workspace sulla richiesta.
- Le RPC `nextway_claim_conversion_activation` e `nextway_finalize_conversion_activation` non restituiscono né usano il workspace.
- L'Edge Function `nextway-conversion-provisioning` invia alla finalizzazione soltanto request ID, claim token e Auth user ID.
- La membership ammette gli stati `invited`, `active`, `suspended`; l'accesso effettivo richiede membership `active` e workspace `active`.
- L'admin API può impostare membership e verifica che l'utente Auth esista. Lo stato `invited` non attiva accesso e non invia da solo un invito.
- La migrazione di associazione workspace collega esplicitamente Lead, Knowledge Documents e conversazioni Setter, ma non `clients` o `partner_details`.
- Nel repository esaminato non è stata trovata la definizione originaria completa di `clients`, `partner_details` e delle relative policy RLS. Non è quindi corretto assumere tipi, vincoli o semantica di quelle tabelle oltre alle colonne già usate dal provisioning.

### Disegno raccomandato (da implementare solo dopo verifica schema/RLS)

1. **Richiesta:** aggiungere `workspace_id uuid null` a `nextway_lead_conversion_requests`, con FK RESTRICT. Il valore deve essere copiato dal Lead lato database, non accettato come autorità dal browser. Un trigger/guard deve bloccare richieste con workspace diverso da quello del Lead e rendere immutabile anche il workspace dopo la creazione. `NULL` resta valido esclusivamente per il percorso legacy centrale.
2. **Autorizzazione richiesta:** la policy/RPC di creazione deve verificare insieme proprietario, stato, archiviazione e `nextway_has_workspace_access(lead.workspace_id, ruoli ammessi)`. I Lead legacy senza workspace restano riservati a `platform_admin`.
3. **Claim:** la RPC deve restituire il workspace salvato sulla richiesta, insieme a Lead, owner e sponsor; il claim resta service-role-only e serializzato con `FOR UPDATE`.
4. **Partner:** la finalizzazione deve creare il profilo e `partner_details` come oggi, quindi inserire una membership nel workspace della richiesta con ruolo iniziale `workspace_member` e stato `invited`. Non impostare `active` prima che l'invito sia stato accettato/verificato. Non sovrascrivere una membership esistente e non cambiare ruoli o stati preesistenti con un upsert cieco. L'attivazione resta un passaggio amministrativo esplicito tramite il flusso membership già esistente, finché non sarà progettato e testato un meccanismo sicuro di accettazione automatica.
5. **Cliente:** non aggiungere subito `workspace_id` a `clients` e non modificare una tabella CRM condivisa senza conoscerne schema e RLS. Preferire in prima valutazione una tabella di attribuzione NEXTWAY (ad esempio `nextway_client_workspace_attributions`) con FK a cliente, workspace, richiesta e proprietario; unicità per richiesta e vincoli di coerenza. La scelta finale dipende dalla verifica della tabella `clients`, delle sue policy e delle query di lettura. Il cliente resta senza account Auth.
6. **Finalizzazione:** mantenere una sola transazione SQL che blocca richiesta e Lead, ricontrolla stato/owner/workspace, crea il record cliente o partner, crea la membership/attribuzione, marca richiesta e Lead come convertiti. In caso di errore, rollback completo. Il provisioning Auth esterno continua a usare claim token e recupero idempotente dell'invito.
7. **UI:** mostrare workspace e proprietario nella coda admin; la schermata di richiesta mostra il workspace ereditato dal Lead e non consente di modificarlo. Le query devono includere il workspace nelle letture e non dedurlo dal solo sponsor, che può operare in più workspace.

### Compatibilità e protezioni

- Le richieste storiche con `workspace_id IS NULL` devono continuare a seguire il percorso centralizzato attuale: nessun backfill automatico verso un workspace arbitrario.
- La chiave univoca attiva su Lead e quella su email richiedono una decisione esplicita sul perimetro: oggi l'email è globale. Non restringerla a workspace senza aver definito se la stessa persona possa avere richieste in workspace differenti.
- Il vincolo `sponsor_profile_id = owner_profile_id` resta coerente con l'attuale modello; non sostituire lo sponsor con un amministratore o con il workspace owner.
- La compensazione dell'invito Auth in caso di errore va mantenuta, ma i test devono coprire timeout dopo invito, retry, claim scaduto, finalizzazione già completata e membership già esistente.
- La presenza di una membership `invited` non deve concedere accesso a Lead, Knowledge Base, Setter o CRM.
- Non si deve considerare completata la separazione multi-tenant finché le policy RLS delle tabelle di destinazione e tutte le query UI non sono state verificate con due utenti appartenenti a workspace distinti.

### Test obbligatori prima del rilascio

1. Conversione partner e cliente da Lead in workspace A: destinazione attribuita solo ad A.
2. Conversione da workspace B dello stesso sponsor: nessuna contaminazione A/B.
3. Tentativo di alterare workspace nella richiesta o di collegare un Lead di altro proprietario: rifiuto DB.
4. Utente senza membership, membership `invited` o `suspended`, workspace sospeso/archiviato: nessun accesso.
5. Invito partner accettato, membership attivata e accesso limitato al workspace corretto.
6. Replay, richieste concorrenti, claim scaduto e retry dopo timeout: un solo profilo/partner/cliente/membership/attribuzione.
7. Richieste legacy `NULL`: comportamento centrale invariato.
8. RLS e query UI: utente A non legge né modifica dati attribuiti a B.

**Esito progettuale:** percorso di correzione identificato. Non è ancora una migrazione pronta: mancano la definizione originaria di `clients`/`partner_details`, l'audit delle loro policy RLS e la verifica completa delle query che consumano i record cliente. Nessuna modifica SQL, database, Edge Function, UI o deploy è stata eseguita in questo passaggio.


## Approfondimento dipendenze CRM e preflight schema — 13 novembre 2026

### Risultati dell'ispezione repository

- La migrazione `20261111001500_nextway_conversion_provisioning.sql` aggiunge a `partner_details` e `clients` soltanto `nextway_conversion_request_id` con indice univoco parziale. Non definisce le tabelle originarie né le policy RLS preesistenti.
- La finalizzazione corrente usa `profiles(id,email,full_name,role,sponsor_id)`, `partner_details(profile_id,first_name,last_name,phone,language,sponsor_profile_id,team_side,status,nextway_conversion_request_id)` e `clients(partner_profile_id,first_name,last_name,email,phone,source,status,nextway_conversion_request_id)`. Questi sono i campi effettivamente referenziati dal codice, non una descrizione completa dello schema.
- Le migrazioni multi-workspace associano workspace a Lead, conversazioni Setter, documenti, attività/audit tramite il Lead; non aggiungono workspace a `clients` o `partner_details`.
- La migrazione RLS workspace include `nextway_lead_conversion_requests` e applica lo scope ereditato dal Lead. Questo protegge la richiesta in base al workspace corrente del Lead, ma non conserva uno snapshot immutabile del workspace d'origine nella richiesta.
- La UI crea richieste con INSERT diretto e non legge né trasmette `workspace_id`; la coda amministrativa non mostra il workspace. La correzione dovrà quindi coordinare trigger/RPC, RLS e UI, non soltanto il provisioning.
- La membership consente `invited`, `active`, `suspended`; solo `active` con workspace attivo dà accesso. L'admin workspace esistente può amministrare le membership. Non è stato trovato un handler automatico di accettazione invito che attivi membership: l'attivazione deve restare esplicita e amministrativa finché non sarà implementato un flusso di accettazione verificato.
- Il repository contiene già `supabase/diagnostics/nextway_conversion_schema_readonly.sql`, che restituisce più result set. Per ridurre il lavoro manuale è stato aggiunto `supabase/diagnostics/nextway_conversion_workspace_preflight_readonly.sql`: una sola riga JSON con colonne, vincoli, indici, policy, trigger, owner/RLS e firme delle funzioni rilevanti, senza leggere righe CRM o dati personali.

### Decisione tecnica affinata

1. La richiesta deve memorizzare lo workspace d'origine come snapshot immutabile, derivato dal Lead dal database. La policy RLS deve verificare sia lo snapshot della richiesta sia la coerenza con il Lead; un trasferimento amministrativo successivo del Lead non deve riscrivere retroattivamente la provenienza della conversione.
2. Il percorso INSERT diretto della UI deve essere sostituito o protetto da una RPC/trigger affidabile: non basta inviare `workspace_id` dal browser. Il server deve verificare owner, Lead convertibile, workspace attivo e membership attiva dell'attore; NULL resta ammesso solo per il percorso centrale legacy.
3. Per il partner, creare membership `invited` nel workspace d'origine, senza concedere accesso. Dopo l'accettazione dell'invito Auth, un amministratore autorizzato attiva la membership tramite il pannello già presente. Non fare upsert che sovrascriva membership/ruoli esistenti.
4. Per il cliente, l'attribuzione al workspace deve essere separata dal profilo cliente condiviso finché non sono noti schema, RLS e consumatori di `clients`. La tabella di relazione dedicata resta l'opzione preferita da validare; deve mantenere owner/sponsor e workspace, e impedire che la stessa richiesta generi più attribuzioni.
5. La finalizzazione deve verificare che la riga Lead abbia ancora lo stesso workspace della richiesta, oltre a owner, stato e archiviazione, sotto lock transazionale. Ogni record di destinazione e la membership/attribuzione devono essere creati nella stessa transazione.

### Limite che resta aperto

Le definizioni originarie e le policy live di `clients` e `partner_details` non sono presenti nelle migrazioni del repository; la ricerca statica non può ricostruirle. Non si può quindi produrre in sicurezza una migrazione finale per quelle tabelle senza i metadati read-only del progetto. Il nuovo preflight è stato aggiunto per raccoglierli in un solo risultato, senza esportare dati personali.

**Stato:** dipendenze applicative e disegno precisati; schema effettivo di `clients`/`partner_details` e RLS ancora **DA VERIFICARE**. Nessuna query è stata eseguita sul database remoto; nessuna migrazione, DDL/DML, deploy o modifica UI è stata eseguita.
