# NEXTWAY — Implementazione conversione multi-workspace

Data: 13 novembre 2026  
Stato: piano tecnico derivato dal preflight read-only del database remoto.  
Ambito: branch `fix/nextway-password-recovery` soltanto.

## Vincoli di rilascio

- Nessuna modifica al branch `main`, nessun merge della PR #1.
- Nessuna migrazione applicata, nessuna query DDL/DML, nessun deploy Supabase/Netlify.
- Le modifiche al repository sono preparatorie e non autorizzano l'esecuzione remota.
- Il percorso legacy con `workspace_id IS NULL` deve restare compatibile.

## Evidenze dal preflight live

Il preflight `NEXTWAY_CONVERSION_WORKSPACE_PREFLIGHT_READ_ONLY` ha confermato:

- `nextway_lead_conversion_requests` non ha `workspace_id`; ha claim token, stato, owner, sponsor e creator.
- `nextway_leads.workspace_id` è nullable, FK verso `nextway_workspaces(id)` con ON DELETE RESTRICT.
- La policy INSERT della richiesta consente creator autenticato, sponsor=owner e Lead non archiviato in stato `In valutazione`, ma l'attore deve essere owner oppure platform_admin.
- Le policy workspace della richiesta ereditano lo scope dal workspace corrente del Lead; non conservano uno snapshot immutabile.
- `nextway_workspace_memberships` ha UNIQUE(workspace_id,user_id), ruoli owner/admin/manager/member/viewer e stati invited/active/suspended. Una membership active richiede activated_at.
- `clients` ha owner `partner_profile_id`, RLS owner/admin e nessuna colonna workspace; FK verso profiles e conversion request.
- `partner_details` ha PK `profile_id`, RLS self/admin e nessuna colonna workspace; FK verso profiles e conversion request.
- `clients` e `partner_details` non hanno FORCE RLS; non sono presenti trigger su queste due tabelle nel preflight.
- `profiles` ha RLS self-read e ruolo platform_admin/partner/etc.
- Le RPC claim/finalize/release sono SECURITY DEFINER. Il preflight non ha restituito il corpo delle funzioni: prima di scrivere una sostituzione occorre acquisire il DDL completo delle tre RPC e delle policy/funzioni chiamate.

## Decisioni di modello

### Richiesta e snapshot workspace

Aggiungere `workspace_id uuid NULL` a `nextway_lead_conversion_requests`, FK a `nextway_workspaces(id) ON DELETE RESTRICT`, indice non univoco.

Il valore è derivato dal Lead lato database in una funzione di creazione atomica; il client non è fonte autorevole. La richiesta conserva lo snapshot originale. Una modifica successiva del workspace del Lead non riscrive la richiesta; la finalizzazione confronta snapshot e Lead corrente e, se divergono, blocca la conversione per revisione.

Per i Lead legacy con workspace NULL, la richiesta resta NULL e continua il percorso centrale owner/platform_admin.

### Autorizzazione alla proposta

- Lead in workspace: attore con membership active, workspace active e ruolo workspace_owner, workspace_admin, workspace_manager o workspace_member.
- workspace_viewer escluso.
- Lead legacy NULL: regola corrente owner o platform_admin.
- owner_profile_id e sponsor_profile_id restano uguali al proprietario effettivo del Lead.
- created_by identifica l'attore che propone la conversione.
- Revisione e provisioning restano riservati a platform_admin.

La policy INSERT esistente deve essere sostituita o resa coerente con una RPC di creazione atomica. Non è sufficiente aggiungere una policy permissiva senza coordinare la policy di scope già presente.

### Partner

La finalizzazione crea profilo e partner_details come oggi e, nella stessa transazione, crea membership nel workspace snapshot con ruolo workspace_member e stato invited. Non concede accesso prima dell'attivazione. Se esiste già una membership per la stessa coppia workspace/utente, non fare upsert cieco: verificare ruolo/stato e applicare una regola esplicita senza sovrascrivere membership sospese o ruoli preesistenti.

Il flusso attuale di invito Auth e la compensazione in caso di errore vanno preservati. L'attivazione della membership resta amministrativa: l'accettazione dell'invito Auth non equivale automaticamente all'attivazione membership.

### Cliente

Non aggiungere workspace_id direttamente a clients senza una migrazione RLS coordinata. Introdurre una tabella di attribuzione dedicata, ad esempio `nextway_client_workspace_attributions`, con:
- id UUID PK;
- client_id FK clients(id) ON DELETE RESTRICT;
- workspace_id FK nextway_workspaces(id) ON DELETE RESTRICT;
- conversion_request_id FK nextway_lead_conversion_requests(id) ON DELETE RESTRICT e UNIQUE;
- owner_profile_id FK profiles(id) ON DELETE RESTRICT;
- created_at timestamptz.

La tabella di attribuzione non conferisce da sola accesso alla riga clients. Occorre una policy di lettura controllata che verifichi membership attiva e workspace attivo, insieme all'owner centrale. Occorre inoltre esaminare tutte le query UI che leggono clients e verificare che l'accesso sia mediato da RLS; non usare service role nel browser.

La relazione deve consentire più attribuzioni solo se il modello di business lo richiede esplicitamente. Per la prima versione, una richiesta genera una sola attribuzione; la stessa riga cliente può eventualmente essere attribuita a più workspace soltanto dopo una decisione esplicita su email globale e identità cliente.

## Sequenza di implementazione richiesta

1. Acquisire DDL completo di claim/finalize/release e policy/funzioni conversione; il preflight ha raccolto firme e metadati, non i corpi.
2. Mappare tutte le query UI e le policy di lettura/scrittura di clients e partner_details.
3. Preparare una migrazione additiva con snapshot, funzione atomica di creazione, guard immutabilità, attribuzione cliente e RPC aggiornate.
4. Aggiornare Edge Function affinché trasporti solo request_id/claim token/Auth user ID; il workspace è letto e validato dal database, mai fidato dal payload.
5. Aggiornare UI: mostra workspace nella richiesta e nella coda admin; non permettere di sceglierlo; conservare owner/sponsor e created_by.
6. Aggiungere test statici per migrazione, RPC, RLS, Edge Function e UI.
7. Aggiungere test transazionali/runtime per workspace A/B, viewer, membership invited/suspended, workspace archiviato, legacy NULL, replay, concorrenza, claim scaduto, membership già esistente, errore/rollback.
8. Solo dopo review esplicita: eventuale test remoto controllato, migrazione e deploy separati.

## Criteri di accettazione

- Un membro active ammesso può proporre conversione per Lead condiviso nel proprio workspace.
- Un viewer, un utente senza membership o una membership invited/suspended non possono proporla.
- Nessun utente può impostare o alterare workspace_id nel browser.
- Lo snapshot resta invariato e una divergenza Lead/richiesta blocca la finalizzazione.
- Partner creato con membership invited nel workspace corretto; accesso negato finché non attivata.
- Cliente attribuito al workspace corretto, ma leggibile solo tramite policy RLS esplicita.
- Nessuna fuga di dati tra workspace A e B.
- Il percorso legacy NULL continua a funzionare senza backfill.
- Retry e concorrenza non producono duplicati.
- Il rollback SQL comprende profilo/destinazione, membership/attribuzione, stato richiesta e Lead.

## Stato

- Diagnostica strutturale live: COMPLETATA E VERIFICATA (metadati soltanto).
- Disegno architetturale: DEFINITO.
- Migrazione e modifiche runtime: NON ANCORA IMPLEMENTATE.
- Motivo del gate: mancano i corpi live delle RPC e l'inventario delle query/permessi effettivi dei consumatori di clients. Scrivere sostituzioni senza questi elementi rischia di rompere il percorso legacy o introdurre bypass RLS.

## Verifica aggiuntiva UI — codice branch

La lettura diretta di `nextway-cloud.js` sul branch ha confermato:

- `createLeadConversionRequest()` legge il Lead con `id, owner_profile_id, status, archived_at`, quindi non legge `workspace_id`.
- L'INSERT è diretto su `nextway_lead_conversion_requests` e invia `lead_id`, `owner_profile_id`, `sponsor_profile_id`, `created_by`, tipo e dati contatto; non invia workspace.
- `getLeadConversionRequest()` non include workspace nella SELECT.
- `getLeadConversionQueue()` non include workspace nella SELECT; la relazione Lead seleziona solo `display_name`.
- La UI della coda mostra Lead, email, telefono, owner/sponsor e data; non mostra workspace.
- La coda e le azioni di revisione restano correttamente protette lato UI da `isPlatformAdmin()`; la Edge Function di provisioning ripete il controllo server-side.
- In `nextway-cloud.js` non è presente una lettura diretta da `clients`; il pannello CRM corrente non espone ancora una vista clienti workspace-scoped in questo file. Le letture di `partner_details` individuate servono alla risoluzione dei nomi nell'audit attività, non alla gestione membership.

Conseguenza: l'aggiornamento UI dovrà essere atomico con la migrazione che introduce il campo e/o la RPC. Non pubblicare una UI che selezioni `workspace_id` prima che la migrazione sia stata approvata e applicata in un rilascio coordinato.


## Lettura del codice SQL e della Edge Function sul branch

Sono stati letti integralmente:
- `20261110001400_nextway_lead_conversion_requests.sql`;
- `20261111001500_nextway_conversion_provisioning.sql`;
- `20261112170000_nextway_conversion_activation_integrity.sql`;
- `supabase/functions/nextway-conversion-provisioning/index.ts`.

### Comportamento RPC attuale ricostruito dalle migrazioni

**Claim**
- Richiede `auth.role() = service_role`.
- Blocca la richiesta con `FOR UPDATE`.
- Accetta `ready_for_activation` o un claim scaduto dopo 10 minuti.
- Restituisce dati richiesta, owner, sponsor e claim token.
- Non restituisce workspace perché la richiesta non ne conserva uno.

**Finalizzazione**
- Richiede service_role, blocca la richiesta e controlla il claim token.
- L'ultima migrazione di integrità blocca il Lead e ricontrolla owner, stato e archiviazione.
- Aggiorna lo stato Lead e crea il record partner/cliente nella stessa transazione SQL: un errore successivo annulla anche l'aggiornamento Lead.
- Non confronta workspace della richiesta e workspace corrente del Lead.
- Per il partner, usa UPSERT su `profiles(id)` aggiornando email, nome, ruolo e sponsor; usa UPSERT su `partner_details(profile_id)` aggiornando nome, telefono, sponsor, stato e riferimento richiesta.
- Per il cliente, usa UPSERT idempotente su `clients(nextway_conversion_request_id)`.
- Non crea membership workspace per il partner e non crea attribuzione workspace per il cliente.

**Release**
- Richiede service_role.
- Riporta la richiesta a `ready_for_activation` solo se request ID, stato provisioning e claim token corrispondono.
- Non modifica dati Lead o destinazione.

### Rischi concreti da correggere

1. **Workspace non vincolato:** claim, finalize e provisioning non trasportano né validano lo snapshot workspace.
2. **Sovrascrittura profilo:** il ramo `ON CONFLICT (id) DO UPDATE` può modificare ruolo e sponsor di un profilo Auth già presente. La nuova logica deve distinguere un profilo già associato alla stessa richiesta (retry legittimo) da un profilo preesistente o associato ad altra richiesta (conflitto da bloccare).
3. **Sovrascrittura partner_details:** l'UPSERT può riattivare un record sospeso o cambiare sponsor e dati personali. Il retry deve essere no-op soltanto se il record è già legato alla stessa richiesta e i riferimenti essenziali coincidono; altrimenti rollback e revisione.
4. **Cliente senza accesso workspace:** creare una tabella di attribuzione non basta; l'accesso alla riga `clients` resta filtrato dalla sua RLS attuale. Serve una policy esplicita e testata.
5. **Compensazione Auth:** la Edge Function invita l'utente prima della finalizzazione e cancella l'utente invitato se la finalizzazione fallisce. La nuova membership invited e le nuove attribuzioni dovranno essere create nella transazione SQL, mantenendo la logica di compensazione solo quando si è certi che la finalizzazione non sia stata committata.
6. **Stato Lead:** la migrazione di integrità più recente corregge un difetto della versione precedente: ora il Lead è bloccato e aggiornato nella transazione di finalizzazione. Questo comportamento va preservato.

### Contratto Edge Function da preservare

- La Edge Function autentica il chiamante e richiede ruolo `platform_admin`.
- Il browser invia soltanto `request_id`; claim token viene generato lato server.
- La Edge Function usa service_role esclusivamente server-side.
- La nuova versione non deve accettare `workspace_id` dal browser né dal payload di provisioning: il workspace deve provenire dalla richiesta persistita e verificata in SQL.
- Mantenere origin allowlist, validazione UUID, limiti dimensione body, recupero idempotente dell'invito e log senza dati sensibili.

## Gate prima della migrazione

Le migrazioni nel repository descrivono il corpo atteso delle RPC, ma non dimostrano da sole che il database live abbia esattamente quelle definizioni, grants e dipendenze. Il file `supabase/diagnostics/nextway_conversion_function_definitions_readonly.sql` è stato preparato per acquisire il DDL effettivo e le policy live.

Non preparare una sostituzione SQL definitiva finché il DDL live non è stato confrontato con le migrazioni e non sono state verificate le dipendenze RLS. Questo gate evita di rimpiazzare accidentalmente modifiche live non presenti nel branch.


## Confronto con il database live — diagnostica ricevuta

Il 13 novembre 2026 è stato ricevuto l'output completo della diagnostica read-only. Le definizioni live sono state confrontate con le migrazioni nel branch.

### Divergenza critica: finalizzazione live non atomica rispetto al Lead

La funzione live `nextway_finalize_conversion_activation` (OID 18341) **non coincide** con la versione di `20261112170000_nextway_conversion_activation_integrity.sql`.

La funzione live:
- non acquisisce un lock `FOR UPDATE` sulla riga Lead;
- crea/aggiorna prima `profiles`, `partner_details` o `clients`;
- aggiorna il Lead soltanto dopo la creazione del record destinazione;
- non usa `RETURNING` né controlla `FOUND` sull'UPDATE del Lead;
- può quindi restituire `success=true` e attivare la richiesta anche se l'UPDATE Lead non ha trovato una riga ancora convertibile.

La versione di repository del 12 novembre corregge precisamente questi punti con lock pessimista, verifica preventiva e UPDATE ... RETURNING; va considerata la baseline da preservare, non la prova che il database live sia già corretto.

### Altre differenze e fatti live

- La funzione live claim corrisponde sostanzialmente alla migrazione di provisioning.
- La funzione live release corrisponde sostanzialmente alla migrazione di provisioning.
- La funzione live review guard è SECURITY DEFINER con `search_path=pg_catalog`; gestisce transizioni review/claim/release/finalize.
- La funzione live finalize ha `search_path=pg_catalog, public, auth` e SECURITY DEFINER.
- Il trigger updated_at è non SECURITY DEFINER con `search_path=pg_catalog`.
- Le policy conversion request comprendono una policy RESTRICTIVE di workspace scope derivata dal Lead, più una policy permissive workspace SELECT. La policy INSERT resta owner/admin e non abilita un membro attivo a proporre conversioni per un Lead condiviso.
- La policy di SELECT Lead combina owner/admin e workspace access; una policy RESTRICTIVE limita comunque l'accesso al workspace.
- La policy di SELECT conversion requests owner/admin e quella workspace SELECT sono permissive; l'accesso workspace è comunque limitato dalla policy RESTRICTIVE.
- `clients` continua ad avere policy CRUD owner partner_profile_id/admin: non concede accesso ai membri del workspace.
- `partner_details` resta leggibile dal soggetto e dall'admin; la policy admin_all consente scrittura solo all'admin.
- La policy membership admin_all e self_read non concede automaticamente accesso a dati CRM.
- La policy workspace member read include owner/admin/manager/member/viewer tramite `nextway_has_workspace_access`; la proposta di conversione può comunque escludere viewer senza alterare la lettura workspace.

### Limiti dell'evidenza

La diagnostica restituita contiene definizioni RPC e policy, ma non l'elenco dei GRANT effettivi alle funzioni. Non certifica quindi i privilegi EXECUTE live. Non legge dati CRM e non prova il comportamento runtime, concorrenza o rollback.

### Conseguenze per la correzione

1. La futura migrazione deve sostituire la funzione live finalize con una versione atomica che acquisisca lock su richiesta e Lead, verifichi lo snapshot workspace, controlli il numero di righe aggiornate e crei record di destinazione, membership/attribuzione e stati finali nella stessa transazione.
2. Il ramo partner deve rifiutare profili o partner_details già esistenti e incompatibili; retry della stessa richiesta può essere idempotente solo se i legami alla richiesta coincidono.
3. La richiesta deve acquisire `workspace_id` dal Lead lato database al momento della creazione, con NULL riservato al percorso legacy centrale; il client non deve poter scegliere o alterare tale valore.
4. La policy INSERT va riprogettata per consentire a ruoli workspace autorizzati di proporre conversioni di Lead condivisi, verificando membership attiva e ruolo, mantenendo owner/sponsor come proprietario effettivo del Lead.
5. L'accesso clienti dei collaboratori deve essere progettato e testato separatamente; la membership non deve diventare un bypass generalizzato di RLS.
6. Prima di finalizzare la migrazione, acquisire i GRANT EXECUTE live e confermare le firme/grants di `nextway_has_workspace_access` e `nextway_is_platform_admin`, oltre a eseguire test statici e transazionali su fixture controllate.


## Verifica GRANT EXECUTE live — 13 novembre 2026

È stato ricevuto il report unificato della diagnostica read-only dei privilegi. Le sette funzioni risultano:

| Funzione | EXECUTE live |
|---|---|
| nextway_claim_conversion_activation(uuid, uuid) | postgres, service_role |
| nextway_finalize_conversion_activation(uuid, uuid, uuid) | postgres, service_role |
| nextway_release_conversion_activation(uuid, uuid) | postgres, service_role |
| nextway_guard_conversion_request_review() | postgres, service_role |
| nextway_set_conversion_request_updated_at() | postgres, service_role |
| nextway_has_workspace_access(uuid, text[]) | postgres, authenticated, service_role |
| nextway_is_platform_admin() | postgres, authenticated, service_role |

Non risultano grant EXECUTE a PUBLIC o anon nel report. I grant delle tre RPC di provisioning sono coerenti con il contratto Edge Function: il browser non invoca direttamente claim/finalize/release. Le due helper workspace/governance sono invocabili da authenticated, coerentemente con l'uso nelle policy RLS.

Le due funzioni senza argomenti sono trigger function: l'assenza di argomenti è attesa. I privilegi diretti non vanno interpretati come un requisito di invocazione dal browser; l'esecuzione avviene tramite i trigger installati.

### Hardening da verificare prima di proporre una modifica

- `nextway_has_workspace_access(uuid, text[])`: SECURITY DEFINER, search_path `pg_catalog, public`; impostazione coerente con le altre funzioni protette.
- `nextway_is_platform_admin()`: SECURITY DEFINER, search_path `public`; non è ancora possibile classificare questa impostazione come vulnerabilità senza leggere il corpo e controllare i riferimenti non qualificati. Non modificarla alla cieca.
- Le funzioni trigger `nextway_guard_conversion_request_review()` e `nextway_set_conversion_request_updated_at()` hanno search_path `pg_catalog`, come atteso per funzioni che non devono dipendere da risoluzione implicita in schemi applicativi.

È stato aggiunto il file read-only `supabase/diagnostics/nextway_workspace_helper_definitions_readonly.sql`, che restituisce in un'unica cella il corpo, le impostazioni e i privilegi delle due helper. Il suo scopo è chiudere il controllo di sicurezza di `nextway_is_platform_admin` prima di qualsiasi proposta di hardening.

### Stato aggiornato

- GRANT EXECUTE live delle sette funzioni: **COMPLETATO E VERIFICATO** sulla base dell'output fornito.
- Assenza di EXECUTE a PUBLIC/anon: **COMPLETATO E VERIFICATO** sulla base dell'output fornito.
- Corpo e dipendenze di `nextway_is_platform_admin()`: **DA COMPLETARE**.
- Correzione multi-workspace della conversione: **DA IMPLEMENTARE** dopo chiusura del controllo helper e delle dipendenze.
- Nessuna modifica al database remoto, nessun deploy e nessun merge effettuati.


## Verifica corpi funzioni workspace — 13 novembre 2026

Sono stati acquisiti i corpi live di `nextway_has_workspace_access` e `nextway_is_platform_admin`.

### `nextway_has_workspace_access`

- `STABLE SECURITY DEFINER`, `search_path=pg_catalog, public`.
- Richiede `auth.uid()` non nullo.
- Consente l'accesso immediato al platform admin.
- Per gli altri utenti richiede membership `active`, workspace `active` e ruolo incluso in `p_allowed_roles`.
- Il default include owner/admin/manager/member/viewer; le operazioni che richiedono privilegi di modifica devono passare una lista di ruoli più restrittiva, escludendo viewer.
- Il corpo usa nomi qualificati per tabelle e funzione amministrativa; non emerge una correzione logica necessaria da questa definizione.

### `nextway_is_platform_admin`

- `STABLE SECURITY DEFINER`, proprietario postgres.
- Privilegi live: postgres, authenticated, service_role; nessun EXECUTE a PUBLIC/anon rilevato.
- Il corpo verifica `profiles.id=auth.uid()` e `role='platform_admin'`.
- Anomalia: `search_path=public`, non coerente con le altre funzioni privilegiate.
- Preparata sul branch la migrazione additiva `20261113110000_nextway_platform_admin_search_path_hardening.sql`, che mantiene invariati corpo, firma e logica e imposta `search_path=pg_catalog, public`. La migrazione non è stata applicata.

### Stato aggiornato

- Privilegi EXECUTE delle sette funzioni: COMPLETATO E VERIFICATO sulla diagnostica live.
- Corpo e logica di `nextway_has_workspace_access`: COMPLETATO E VERIFICATO sulla definizione live ricevuta.
- Corpo e logica di `nextway_is_platform_admin`: COMPLETATO E VERIFICATO; hardening search_path PREPARATO MA NON APPLICATO.
- Conversione multi-workspace: ancora DA IMPLEMENTARE; resta prioritario correggere la finalizzazione live non atomica e coordinare snapshot workspace, membership partner e attribuzione cliente.


## Implementazione preparatoria — snapshot workspace richiesta (13 novembre 2026)

È stata aggiunta sul branch la migrazione `20261113120000_nextway_conversion_request_workspace_snapshot.sql`.

Contenuto:
- Aggiunge `workspace_id` nullable alla richiesta, FK RESTRICT e indice.
- Introduce `nextway_create_lead_conversion_request` SECURITY DEFINER: blocca il Lead, deriva owner e workspace dal record DB, verifica stato/archiviazione e autorizzazione; per workspace richiede membership active con ruolo owner/admin/manager/member (viewer escluso). Per Lead legacy NULL mantiene owner/platform_admin.
- Revoca INSERT diretto ad authenticated: il client deve passare dalla RPC e non può scegliere lo snapshot.
- Estende il guard per rendere immutabile `workspace_id`.
- Il percorso legacy NULL non viene backfillato.

Aggiornato `nextway-cloud.js`: la creazione usa la nuova RPC e le letture di dettaglio/coda includono `workspace_id`; nessun valore workspace viene inviato dal browser.

Aggiunto `scripts/test-nextway-conversion-workspace-snapshot.mjs` per controlli statici. Revisione statica dei file sul branch: 8/9 controlli superati.

**Limite attuale:** questa tranche non implementa ancora la membership invited del partner, l'attribuzione cliente, la nuova finalizzazione atomica e le policy RLS di lettura clienti. La migrazione è preparatoria e NON applicata; il database remoto non è stato modificato. Prima di proseguire con la finalizzazione va completato il disegno RLS/attribuzione clienti e verificata la compatibilità della policy restrictive live.


## Implementazione preparatoria — conversione multi-workspace (13 novembre 2026)

Sono state aggiunte sul branch due migrazioni ulteriori:

### Snapshot e proposta conversione
`20261113120000_nextway_conversion_request_workspace_snapshot.sql`
- Aggiunge `workspace_id` nullable alla richiesta, FK RESTRICT e indice.
- La RPC `nextway_create_lead_conversion_request` blocca il Lead e deriva dal database owner, sponsor e workspace; il client non invia né decide lo snapshot.
- Per Lead workspace richiede membership active e ruolo owner/admin/manager/member; viewer escluso.
- Per Lead legacy NULL mantiene il percorso owner/platform_admin.
- Revoca INSERT diretto ad authenticated, rende immutabile lo snapshot nel trigger guard e serializza le richieste concorrenti con la stessa email, includendo lo stato provisioning nei controlli anti-duplicato.

### Finalizzazione e accesso clienti
`20261113130000_nextway_conversion_workspace_finalization.sql`
- Sostituisce la finalizzazione live con una transazione che blocca richiesta e Lead, verifica owner/stato/archiviazione, confronta workspace snapshot e Lead corrente e richiede workspace attivo.
- Per partner verifica anche che l'utente Auth sia associato alla stessa richiesta tramite `raw_user_meta_data.nextway_conversion_request_id`.
- Non esegue UPSERT distruttivi su `profiles` o `partner_details`: completa solo i campi null di un profilo già partner e compatibile; conflitti di ruolo, email, sponsor o dettagli bloccano l'intera transazione.
- Crea membership `workspace_member / invited`; se esiste già una membership per la coppia workspace/utente, blocca invece di sovrascriverla.
- Per cliente crea la riga `clients` e, se workspace-scoped, una riga in `nextway_client_workspace_attributions` nella stessa transazione.
- La tabella attribuzioni non concede accesso diretto. RLS è attiva e i privilegi diretti sono revocati.
- La lettura dei clienti workspace avviene tramite `nextway_list_workspace_clients(uuid)`, che restituisce una proiezione limitata e richiede membership active con ruolo owner/admin/manager/member. Viewer escluso. Non è stata aggiunta una policy SELECT generalizzata a `clients`.
- L'Edge Function continua a inviare solo request ID, claim token e Auth user ID; workspace non è accettato dal payload.

### UI e test statici
- `nextway-cloud.js` crea le richieste tramite RPC e include lo snapshot nelle letture.
- La coda amministrativa include nome e partner del workspace; per richieste legacy mostra il percorso centrale.
- `scripts/test-nextway-conversion-workspace-snapshot.mjs` contiene 24 asserzioni statiche su migrazioni, RPC, RLS, UI ed Edge Function.

### Limiti e gate residui
- La revisione statica manuale dei contenuti recuperati ha superato 24/24 controlli logici. Lo script contiene 24 asserzioni; la sintassi JavaScript dello script è stata controllata con Node 22. L'esecuzione delle asserzioni sul checkout completo e i test PostgreSQL/runtime restano da effettuare.
- Non è stato eseguito un parser PostgreSQL, un test transazionale, un test RLS runtime o un test Edge Function.
- Il profilo Auth creato da eventuali trigger deve avere ruolo partner e dati compatibili; la finalizzazione rifiuta profili non compatibili senza sovrascriverli.
- La RPC clienti è predisposta, ma non è stata aggiunta una schermata CRM clienti workspace: l'interfaccia va costruita separatamente usando la sola RPC e non una SELECT diretta.
- Prima di qualsiasi applicazione remota occorre confrontare i nomi/tipi delle colonne e i trigger effettivi live, applicare in ambiente controllato e testare i casi A/B, legacy NULL, viewer, membership invited/suspended/esistente, workspace archiviato, retry e rollback.

**Stato:** implementazione preparatoria sul branch completata per snapshot, finalizzazione, membership invited, attribuzione cliente, RPC di lettura limitata e contesto workspace in coda. Non certificata runtime e NON applicata al database remoto. Nessun deploy.
