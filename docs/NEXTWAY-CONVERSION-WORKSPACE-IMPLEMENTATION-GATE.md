# NEXTWAY — Gate di implementazione conversione multi-workspace

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Stato: progettazione e verifiche statiche; nessuna modifica al database remoto.

## Decisione

La conversione deve conservare in modo immutabile il workspace del Lead al momento della richiesta. Il browser non è fonte attendibile per `workspace_id`: il valore va derivato dal Lead lato database e salvato nella richiesta. Le richieste storiche con workspace nullo restano nel percorso centrale legacy; nessun backfill automatico.

## Regole di autorizzazione

- Lead in workspace: può proporre la conversione un membro autenticato con membership `active`, workspace `active` e ruolo `workspace_owner`, `workspace_admin`, `workspace_manager` o `workspace_member`.
- `workspace_viewer`, membership `invited`/`suspended` e workspace non attivo non possono proporre conversioni.
- Lead legacy senza workspace: resta valida la regola centrale esistente (proprietario o `platform_admin`).
- Owner e sponsor continuano a rappresentare il proprietario effettivo del Lead; `created_by` identifica chi ha proposto la conversione.
- Revisione, approvazione e provisioning restano riservati a `platform_admin` finché non esiste una delega esplicita e auditata.

## Modello dati da implementare dopo il preflight

1. Aggiungere `workspace_id uuid null` alla richiesta, FK con comportamento RESTRICT. Derivazione atomica dal Lead e immutabilità dopo l'inserimento.
2. Proteggere creazione con RPC/trigger e policy coerenti: proprietario, stato, archiviazione, workspace attivo e membership attiva dell'attore. Non fidarsi del workspace inviato dal client.
3. Il claim restituisce lo snapshot workspace e resta serializzato e limitato al service role.
4. La finalizzazione blocca richiesta e Lead, ricontrolla owner, stato e workspace invariato; in caso di spostamento del Lead dopo la richiesta si ferma per revisione, senza riassegnazione silenziosa.
5. Partner: creare membership nel workspace della richiesta con ruolo iniziale `workspace_member` e stato `invited`. Non concedere accesso prima dell'accettazione e dell'attivazione amministrativa. Non sovrascrivere membership/ruoli già presenti.
6. Cliente: mantenere il profilo cliente condiviso senza account Auth. Valutare una relazione dedicata di attribuzione workspace; non alterare `clients` finché schema, RLS e consumatori non sono stati verificati.
7. UI: mostrare workspace e proprietario in coda e dettaglio; workspace ereditato, non modificabile. Conservare il flusso centrale legacy.

## Gate bloccanti prima di scrivere DDL

- Ottenere il risultato della diagnostica read-only `supabase/diagnostics/nextway_conversion_workspace_preflight_readonly.sql`: una sola riga JSON, metadati soltanto, nessuna riga cliente/partner.
- Riconciliare colonne, tipi, default, PK/FK/unique/check, indici, owner, RLS/force RLS, policy, trigger e funzioni effettive di `clients`, `partner_details`, `profiles`, Lead, richieste e membership.
- Confermare la compatibilità con le policy e con tutte le query UI che leggono/scrivono clienti e partner.
- Solo dopo, preparare una migrazione additiva, reversibile ove possibile, e test SQL transazionali. Nessuna applicazione live è autorizzata da questo documento.

## Collaudo obbligatorio

- Partner e cliente convertiti da workspace A e B restano attribuiti al rispettivo workspace.
- Membro attivo autorizzato può proporre; viewer, non membro, invitato, sospeso e workspace sospeso sono respinti.
- Tentativo di falsificare workspace o collegare Lead di altro proprietario è respinto dal database.
- Spostamento del Lead dopo la richiesta blocca la finalizzazione.
- Membership invitata non dà accesso; attivazione concede accesso solo al workspace corretto.
- Replay, retry dopo timeout, claim scaduto, concorrenza e finalizzazione ripetuta producono una sola conversione.
- Richieste legacy con workspace nullo conservano il comportamento centrale.
- RLS: utente A non legge né modifica dati attribuiti a B.
- Nessuna sovrascrittura di membership preesistenti o di ruoli assegnati.

## Stato e perimetro

- Diagnostica read-only: preparata, non ancora eseguita.
- Test statico della diagnostica: aggiunto e integrato nel workflow.
- Copertura pull request della diagnostica: aggiunta al workflow e protetta da asserzioni nel test statico.
- Schema completo/RLS di `clients` e `partner_details`: da verificare.
- Test runtime multi-utente: non eseguiti.
- Database remoto, migrazioni, Edge Functions remote, Netlify e PR merge: non toccati.
