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
