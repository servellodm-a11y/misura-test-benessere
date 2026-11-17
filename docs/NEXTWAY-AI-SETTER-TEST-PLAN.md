# NEXTWAY AI Setter — piano di collaudo

## Stato e prerequisiti

Questo documento descrive il collaudo da eseguire nell'ambiente Supabase prima dell'attivazione. La presenza delle migrazioni nel repository **non significa che siano state applicate al progetto Supabase**. Non considerare superato alcun test finché non è stato eseguito e registrato nell'ambiente.

Applicare le migrazioni in ordine cronologico, dopo aver verificato lo stato effettivo dello schema:

1. `20261110000100_nextway_distributed_rate_limit.sql`
2. `20261110000200_nextway_setter_idempotency.sql`
3. `20261110000300_nextway_rate_limit_units.sql`
4. `20261110000400_nextway_idempotency_retention.sql`
5. `20261110000500_nextway_setter_output_recovery.sql`
6. `20261110000600_nextway_setter_output_authorization_hardening.sql`
7. `20261110000700_nextway_clear_stale_staged_output.sql`
8. `20261110000800_nextway_leads_soft_archive.sql`
9. `20261110000900_nextway_lead_audit_trail.sql`

La migrazione 007 elimina l'output temporaneo quando una prenotazione pending viene riassegnata a un altro utente, a un'altra chiave o a un'altra conversazione. Evita che il nuovo titolare recuperi una risposta OpenAI generata per la prenotazione precedente.

## Test database e autorizzazioni

- [ ] Utente non autenticato: tutte le RPC protette rifiutano la chiamata.
- [ ] Utente proprietario: può iniziare e completare una generazione sulla propria conversazione.
- [ ] Utente non proprietario e non amministratore: non può iniziare, salvare o recuperare output.
- [ ] `platform_admin`: può operare secondo le autorizzazioni previste; la revoca del ruolo deve essere efficace alle chiamate successive.
- [ ] Conversazione con `owner_profile_id` nullo: salvataggio e recupero output falliscono in modo chiuso (fail-closed).
- [ ] Conversazione `closed` o `archived`: nessun output temporaneo viene salvato o restituito.
- [ ] Chiusura concorrente: se la conversazione viene chiusa durante la chiamata OpenAI, la fase di staging o il completamento finale rifiuta il salvataggio.
- [ ] Prenotazione scaduta riassegnata: il trigger 007 azzera `generated_output` quando cambia `user_id`, `idempotency_key` o `conversation_id`.
- [ ] Stessa chiave e stesso utente dopo errore di commit: l'output temporaneo valido viene recuperato senza una nuova generazione.
- [ ] Stessa chiave già completata: viene restituita la risposta memorizzata senza creare un secondo messaggio.
- [ ] Due chiavi concorrenti sulla stessa conversazione: una sola prenotazione pending viene acquisita.
- [ ] Prenotazione pending scaduta: può essere recuperata; verificare che l'output precedente non sopravviva al trasferimento.
- [ ] RPC di rate limit: limite AI Setter 5 unità/minuto per utente; ricerca pubblica massimo 10 query/minuto per utente.
- [ ] RPC rate limit indisponibile: endpoint fail-closed con HTTP 503; limite superato: HTTP 429.

## Test Edge Function AI Setter

- [ ] Richiesta senza Bearer token: HTTP 401.
- [ ] Origine non autorizzata: HTTP 403.
- [ ] Metodo diverso da POST/OPTIONS: HTTP 405.
- [ ] JSON malformato, body non-oggetto, UUID non valido o goal non ammesso: HTTP 400.
- [ ] Body superiore a 16 KB: HTTP 413.
- [ ] Conversazione non accessibile: HTTP 404 senza divulgare dati.
- [ ] Conversazione chiusa/archiviata prima dell'avvio: HTTP 409.
- [ ] Conversazione chiusa durante staging: HTTP 409 e nessuna bozza salvata.
- [ ] Conversazione chiusa durante completamento: HTTP 409 e nessuna bozza salvata.
- [ ] Risposta OpenAI incompleta, vuota o non conforme allo schema: nessuna bozza salvata.
- [ ] Errore temporaneo di staging: risposta controllata; retry con la stessa chiave non deve generare una seconda bozza duplicata.
- [ ] Output già staged e lease valida: retry recupera il risultato senza chiamare OpenAI.
- [ ] La risposta finale contiene `sent: false` e `approved: false`.
- [ ] Nessuna chiamata o funzione invia messaggi a prospect o clienti.

## Test frontend

- [ ] Sessione assente o scaduta: messaggio chiaro, nessuna generazione.
- [ ] Doppio clic sul pulsante: una sola richiesta per scheda.
- [ ] Timeout o risposta HTTP di errore: la chiave idempotente resta disponibile per il retry.
- [ ] Completamento positivo: la chiave viene rimossa e la bozza viene mostrata.
- [ ] La bozza può essere copiata; non esiste invio automatico.
- [ ] Conversazioni chiuse/archiviate sono chiaramente distinguibili o non selezionabili (miglioria UX da verificare).

## Test ricerca pubblica Tavily

- [ ] Da 1 a 5 query, ciascuna lunga 1–400 caratteri.
- [ ] 6 query o query vuota/troppo lunga: HTTP 400.
- [ ] Risultati parziali: i risultati delle query riuscite vengono conservati e le query fallite sono indicate nei metadati.
- [ ] Tutte le query fallite: errore controllato, senza risultati inventati.
- [ ] URL restituiti: solo HTTP/HTTPS; titolo, snippet, data e score sono normalizzati.
- [ ] Il contatore consuma un'unità per ogni query tentata, anche in caso di errore del provider.

## Criteri di accettazione

Il collaudo è superato solo quando:
1. tutte le migrazioni sono state applicate senza errori nell'ordine previsto;
2. i test di autorizzazione, concorrenza, idempotenza e recupero output sono superati;
3. le Edge Functions sono distribuite su Supabase e testate con sessioni reali;
4. il frontend viene verificato sul sito pubblicato dopo il ripristino dei deploy Netlify;
5. viene confermato che nessun messaggio è inviato automaticamente.

Fino al completamento di questi passaggi, il codice è da considerare preparato nel repository, non validato in produzione.


## Ciclo di vita Lead e sincronizzazione

- [ ] Partner A legge e modifica soltanto i Lead con `owner_profile_id = auth.uid()`.
- [ ] Partner B non può leggere, modificare, archiviare, ripristinare o cancellare i Lead di Partner A.
- [ ] `platform_admin` può leggere e gestire i Lead di tutti i partner.
- [ ] Un partner non può trasferire la proprietà modificando `owner_profile_id`; un eventuale trasferimento è riservato all'amministratore tramite procedura controllata.
- [ ] Creazione: il nuovo Lead viene inserito con `owner_profile_id` dell'utente autenticato; la RPC di creazione Lead/conversazione deve essere verificata separatamente perché la sua definizione non è versionata nelle migrazioni del repository.
- [ ] Modifica: la sincronizzazione aggiorna i record già collegati tramite `cloud_id`; RLS deve rifiutare gli aggiornamenti non autorizzati.
- [ ] Duplicati: URL duplicato per lo stesso proprietario non genera un secondo record; verificare il comportamento quando il duplicato appartiene a un altro partner.
- [ ] Archiviazione: impostare `archived_at`; il trigger valorizza `archived_by` con l'utente autenticato.
- [ ] Ripristino: riportare `archived_at` a NULL; il trigger azzera `archived_by` e `archive_reason`.
- [ ] Un partner non può archiviare o ripristinare Lead altrui; l'amministratore può farlo.
- [ ] Cancellazione definitiva: verificare permessi e conferma esplicita; preferire archiviazione logica per il normale flusso operativo.
- [ ] Sincronizzazione bidirezionale: il pull importa i record visibili via RLS; il push aggiorna record collegati e inserisce i nuovi. Verificare conflitti di modifica tra due dispositivi.
- [ ] La cancellazione di una copia locale non deve essere interpretata come cancellazione del record cloud.
- [ ] La sincronizzazione deve mostrare conteggi separati per nuovi, aggiornati, non modificati e falliti.

### Limiti attuali da non confondere con funzionalità completate

La sincronizzazione locale/cloud ora prova ad aggiornare i record già collegati tramite `cloud_id`, oltre a inserire nuovi record. Il codice non implementa ancora una gestione completa dei conflitti tra dispositivi, una coda di sincronizzazione offline o un comando UI completo per archiviare/ripristinare. L'archiviazione logica è predisposta nello schema tramite la migrazione 008, ma non è considerata attiva finché la migrazione non è applicata e i test RLS non sono superati. La cancellazione locale non elimina il record cloud.


## Test UI archiviazione e ripristino Lead

- [ ] Il filtro predefinito mostra soltanto Lead attivi; il filtro archiviati mostra soltanto Lead con `archived_at` valorizzato.
- [ ] Il comando Archivia è disabilitato/nega l'azione per Lead non ancora sincronizzati (`cloud_id` assente) e indica di sincronizzare prima.
- [ ] Un Lead sincronizzato può essere archiviato con account proprietario; `archived_at` e `archive_reason` vengono salvati e `archived_by` è valorizzato dal trigger.
- [ ] Un Lead archiviato può essere ripristinato; i metadati vengono azzerati dal trigger.
- [ ] Partner diverso non può archiviare o ripristinare il Lead; `platform_admin` può agire secondo policy.
- [ ] Se la migrazione 008 non è applicata, la UI mostra un errore controllato e non dichiara l'operazione completata.
- [ ] L'archiviazione non elimina conversazioni né messaggi associati; verificarne il comportamento e la conservazione.

La UI è preparata nel repository ma resta non verificata live fino ad applicazione migrazione, deploy e test autenticati.


## Test di concorrenza e conflitti di sincronizzazione

- [ ] Un Lead cloud non modificato localmente non viene aggiornato inutilmente dal push.
- [ ] Una modifica locale marcata `local_dirty` viene inviata solo se `updated_at` cloud coincide con `cloud_updated_at` salvato localmente.
- [ ] Se un secondo dispositivo modifica il Lead prima del push, l'UPDATE condizionale non restituisce righe: il record viene segnalato come conflitto e i dati locali restano intatti.
- [ ] Il pull di un record non modificato localmente aggiorna i campi dal cloud e la versione di base.
- [ ] Il pull di un record modificato localmente, ma con versione cloud invariata, conserva la modifica locale senza conflitto.
- [ ] Il pull di un record modificato localmente e anche sul cloud marca il conflitto senza sovrascrivere la copia locale.
- [ ] Un record legacy collegato senza `cloud_updated_at` viene segnalato per revisione e non viene inviato alla cieca.
- [ ] Dopo un push riuscito, `cloud_updated_at` viene aggiornato e `local_dirty` viene azzerato.
- [ ] Dopo archiviazione/ripristino riusciti, la versione cloud locale viene aggiornata per evitare falsi conflitti al push successivo.

### Limite funzionale

Il rilevamento e la prevenzione della sovrascrittura sono predisposti nel codice; la risoluzione interattiva dei conflitti (confronto campo per campo e scelta esplicita locale/cloud) è ancora da implementare. Nessun test multi-dispositivo è stato eseguito in produzione.


## Test UI risoluzione conflitti Lead

- [ ] Un Lead con _sync_conflict mostra il comando “Confronta versioni”.
- [ ] Il confronto recupera la versione cloud corrente autenticata e mostra i campi locali e cloud affiancati.
- [ ] I campi divergenti sono evidenziati; il sistema non sceglie automaticamente una versione.
- [ ] “Conserva versione cloud” sostituisce la copia locale con la versione cloud letta e azzera local_dirty e _sync_conflict.
- [ ] “Conserva versione locale e aggiorna cloud” richiede conferma esplicita.
- [ ] La risoluzione locale esegue UPDATE con filtro sia su id sia su updated_at della versione cloud mostrata.
- [ ] Se il cloud cambia tra confronto e salvataggio, l'UPDATE non modifica righe, la UI mostra un errore controllato e il conflitto resta aperto.
- [ ] Dopo una risoluzione riuscita, cloud_updated_at viene aggiornato e local_dirty / _sync_conflict vengono azzerati.
- [ ] Partner A non può risolvere conflitti di Lead appartenenti a Partner B; platform_admin opera secondo le policy previste.
- [ ] Test concorrente: due dispositivi tentano di risolvere lo stesso conflitto; soltanto la prima scelta basata sulla versione corrente può riuscire.

### Limiti

La schermata e le API sono state aggiunte al repository. I test sopra sono ancora da eseguire; nessun risultato statico o commit dimostra da solo il comportamento live di RLS, trigger o concorrenza su Supabase.

- [ ] Se il cloud cambia mentre il confronto è aperto, la scelta “Conserva versione cloud” rilegge il record al momento della conferma e importa la versione più recente, non lo snapshot precedente.
- [ ] Se il cloud cambia mentre il confronto è aperto e viene scelta la versione locale, l'UPDATE condizionale fallisce e richiede un nuovo confronto.


## Test cronologia e tracciabilità Lead

Prerequisito: applicare `20261110000900_nextway_lead_audit_trail.sql` dopo aver verificato lo schema live e completato le migrazioni precedenti necessarie.

- [ ] INSERT Lead genera un evento INSERT con actor_profile_id, proprietario, timestamp e snapshot after_data.
- [ ] UPDATE di uno o più campi genera un evento UPDATE con changed_fields e snapshot before/after.
- [ ] UPDATE che cambia soltanto updated_at non genera un evento audit.
- [ ] DELETE genera un evento DELETE e la cronologia resta presente anche dopo la cancellazione del Lead.
- [ ] Utente anonimo/non autenticato non può leggere la tabella audit.
- [ ] Partner A può leggere la cronologia dei propri Lead ma non quella di Partner B.
- [ ] Partner B non può leggere né modificare direttamente gli eventi audit.
- [ ] platform_admin può leggere la cronologia di Lead di tutti i partner.
- [ ] authenticated non può inserire, aggiornare o cancellare direttamente righe audit.
- [ ] La funzione trigger non può essere invocata direttamente dal client.
- [ ] Se actor_profile_id viene eliminato, l'evento resta e actor_profile_id diventa NULL.
- [ ] UI mostra data/ora, azione, UUID attore e valori prima/dopo senza interpretare contenuto audit come HTML.
- [ ] La UI gestisce tabella/migrazione non ancora presente con messaggio controllato.
- [ ] Un Lead non sincronizzato non consente la consultazione cloud della cronologia.

### Limiti

La cronologia non è retroattiva: registra solo operazioni eseguite dopo l'applicazione della migrazione. L'interfaccia mostra al momento l'UUID del profilo, non un nome; non inventare un'identità leggibile prima di verificare i campi disponibili nella tabella profiles live. Tutti i test sono da eseguire in Supabase.


## Test registro attività dell’organizzazione

Prerequisito: migrazioni rate limit/idempotenza e ciclo di vita Lead applicate nell’ordine documentato, inclusa `20261110000900_nextway_lead_audit_trail.sql`. Eseguire con almeno due partner e un account `platform_admin`.

- [ ] `platform_admin` autenticato vede il pannello Registro attività organizzazione.
- [ ] Partner autenticato non vede il pannello e una chiamata diretta a `getOrganizationActivity()` viene rifiutata.
- [ ] Utente non autenticato non può leggere gli eventi.
- [ ] L’amministratore vede eventi appartenenti a più proprietari, secondo la policy RLS della tabella audit.
- [ ] Il filtro data iniziale include gli eventi dal principio della giornata locale selezionata.
- [ ] Il filtro data finale include gli eventi fino alla fine della giornata locale selezionata.
- [ ] I filtri INSERT, UPDATE e DELETE restituiscono soltanto l’azione selezionata.
- [ ] Il filtro UUID proprietario limita correttamente gli eventi e rifiuta un UUID malformato.
- [ ] Ordinamento decrescente per timestamp e paginazione: il secondo blocco non duplica il primo.
- [ ] Un evento DELETE mostra il nome del Lead dallo snapshot precedente, quando disponibile.
- [ ] Archiviazione e ripristino, dopo applicazione migrazione 008, appaiono come UPDATE con i campi pertinenti.
- [ ] Un conflitto risolto tramite aggiornamento compare come UPDATE; non viene presentato come evento distinto non registrato.
- [ ] La query non restituisce before_data/after_data completi, note o evidenze pubbliche.
- [ ] Il contenuto di nome Lead e campi modificati è mostrato come testo e non interpretato come HTML.
- [ ] Revocando il ruolo `platform_admin` durante la sessione, una nuova richiesta non deve più restituire il registro.
- [ ] Verificare la gestione UI quando la migrazione audit non è ancora applicata o la tabella non è accessibile.

### Test risoluzione nomi proprietario e operatore

Prerequisito: migrazioni audit applicate su ambiente di test e accesso con account autorizzato.

- [ ] Se un profilo ha `profiles.full_name`, il registro mostra il nome completo.
- [ ] Se `full_name` è vuoto ma esistono `partner_details.first_name/last_name`, il registro mostra nome e cognome.
- [ ] Se sono disponibili entrambi, verificare che `partner_details.first_name/last_name` prevalga su `profiles.full_name`.
- [ ] Se una query anagrafica è negata da RLS o non restituisce un nome, il registro continua a mostrare gli eventi con fallback neutro.
- [ ] Le query anagrafiche sono limitate agli ID presenti negli eventi caricati e non selezionano email o telefono.
- [ ] Verificare la corretta visualizzazione distinta di proprietario e operatore, inclusi actor null dopo eliminazione del profilo.

### Limiti noti

La UI e la query sono predisposte nel repository. La lettura del ruolo richiede che l'utente possa leggere il proprio record in `profiles`. La proiezione JSON PostgREST per `lead_name` deve essere verificata contro la versione live. Nessuno dei test sopra è considerato superato prima del collaudo autenticato su Supabase.


## Test minimizzazione dati audit (migrazione 010)

Prerequisito: applicare prima la migrazione 009 e poi `20261110001000_nextway_audit_data_minimization.sql` su un ambiente di test.

- [ ] INSERT: il nuovo snapshot `after_data` non contiene le chiavi `notes` e `public_evidence`.
- [ ] UPDATE: cambiando soltanto `notes` o `public_evidence`, viene comunque registrato un evento UPDATE e i nomi dei campi compaiono in `changed_fields`.
- [ ] UPDATE: gli snapshot before/after non contengono i valori dei due campi esclusi.
- [ ] DELETE: `before_data` non contiene le due chiavi escluse.
- [ ] Gli altri campi necessari alla cronologia, incluso `display_name`, restano disponibili.
- [ ] La cronologia Lead UI mostra `[valore non registrato per riservatezza]` per i due campi.
- [ ] Verificare che gli eventi precedenti alla migrazione restino invariati: la migrazione 010 non effettua redazione retroattiva.


## Validazione automatica repository

- [ ] Verificare il workflow `NEXTWAY static validation` dopo un push o una pull request che tocchi i file monitorati.
- [ ] Confermare esito verde per parsing di `nextway-cloud.js` e script inline HTML.
- [ ] Confermare i controlli strutturali su migrazione audit, autorizzazione amministratore, filtri/paginazione e snapshot minimizzati.
- [ ] Non interpretare il workflow statico come prova di funzionamento SQL, RLS o Supabase live.


- [x] Validazione statica dei campi profilo/partner, fallback e gate amministrativo nel workflow GitHub Actions (run `42801788640`, SUCCESS).


## Test archiviazione logica Lead

Prerequisito: migrazioni `20261110000800_nextway_leads_soft_archive.sql` e `20261110000900_nextway_lead_audit_trail.sql` applicate in ambiente di test; usare un Lead di prova.

- [ ] Archiviazione: valorizzare `archived_at`, `archived_by` e `archive_reason`; verificare che il record resti nel database.
- [ ] Verificare che il trigger registri un evento UPDATE e i campi di archiviazione modificati.
- [ ] Ripristino: azzerare `archived_at`, `archived_by` e `archive_reason` secondo il trigger; verificare un secondo evento UPDATE.
- [ ] Verificare che un utente non proprietario e non amministratore non possa archiviare o ripristinare il Lead.
- [ ] Verificare che il motivo venga limitato a 500 caratteri dall'API frontend.
- [ ] Verificare che il Lead archiviato non venga confuso con un Lead eliminato e che la cronologia resti consultabile.
- [ ] Confermare che nessuna azione di archiviazione comporti DELETE fisico.
- [x] Controlli statici sull'API archive/restore, sui metadati restituiti e sul limite del motivo aggiunti al validatore GitHub Actions.


## Test amministrazione Lead – identità cronologia e rimozione locale (10 novembre 2026)

- [ ] La cronologia del singolo Lead mostra il nome dell’operatore usando prima `profiles.full_name` e poi `partner_details.first_name/last_name`; se non disponibile usa un fallback neutro.
- [ ] Il mancato accesso alle tabelle anagrafiche non impedisce la lettura degli eventi audit autorizzati.
- [ ] Annullando il prompt del motivo di archiviazione, l’operazione viene annullata e non viene inviata alcuna UPDATE.
- [ ] Il comando di rimozione locale chiarisce che elimina soltanto la copia del browser, non il record cloud né la cronologia.
- [ ] Verificare che una successiva sincronizzazione possa ripristinare localmente un Lead ancora presente nel cloud.
- [x] Controlli statici aggiunti per risoluzione identità attore, annullamento prompt e distinzione tra rimozione locale e cancellazione cloud.

- [ ] Nella scheda di un Lead archiviato sono visibili data/ora e motivo dell’archiviazione, con fallback se il motivo è assente.
- [x] Controllo statico aggiunto per la visualizzazione dei metadati di archiviazione nella scheda Lead.



## 29. Gestione Lead — coerenza UI e protezione della sincronizzazione

Verifiche statiche introdotte:
- la UI mostra data e motivo di archiviazione nei Lead archiviati;
- archiviazione e ripristino sono bloccati se il Lead contiene modifiche locali non sincronizzate;
- archiviazione e ripristino sono bloccati in presenza di conflitto di sincronizzazione;
- il motivo inserito dall'utente è limitato a 500 caratteri anche lato interfaccia;
- il codice non azzera più il flag local_dirty dopo l'archiviazione: l'operazione non deve mascherare modifiche locali non sincronizzate.

La cronologia per Lead già risolve il nome dell'operatore tramite profiles e partner_details; il validatore ora controlla anche questa funzione.

Limiti: codice salvato su GitHub ma non pubblicato su Netlify; migrazioni audit e soft-archive non applicate a Supabase; test runtime Supabase/Postgres e browser live non eseguiti.


## 30. Archiviazione e ripristino — controllo concorrenza ottimistico

- Ogni operazione richiede il timestamp cloud (updated_at) già noto alla scheda Lead.
- L'UPDATE viene eseguito solo se id e updated_at coincidono con la versione letta: un aggiornamento concorrente da un'altra scheda/utente non viene sovrascritto.
- Se il record è cambiato o la versione cloud manca, l'operazione si interrompe e chiede di ricaricare l'archivio.
- Test statici verificano parametro, filtro updated_at, gestione del conflitto e passaggio del timestamp dalla UI.

Validazione statica GitHub Actions: PASS nel run 42803042485 sul commit daae610. Il comportamento va comunque confermato con test runtime Supabase quando le migrazioni saranno applicate; nessuna migrazione o deploy eseguiti in questo passaggio.


## 31. Verifica statica delle autorizzazioni audit e dei trigger di archiviazione

Il validatore controlla ora anche:
- lettura audit limitata al proprietario storico o a platform_admin;
- concessione SELECT a authenticated e assenza di policy di scrittura diretta sull'audit;
- trigger di archiviazione che richiede un utente autenticato e registra auth.uid() in archived_by;
- ripristino che azzera archived_by e archive_reason;
- revoca dell'esecuzione diretta della funzione trigger.

Questi sono controlli testuali/statici sul sorgente SQL, non sostituiscono l'esecuzione delle migrazioni e i test RLS reali su Supabase.

Esito GitHub Actions per la sezione 31: SUCCESS, run 42803134517, commit 4355756. Conferma esclusivamente i controlli statici sopra descritti.


## 32. Matrice autorizzazioni Lead per i cinque ruoli

La matrice seguente è ricavata dalle policy presenti in `supabase/nextway_leads.sql`; non rappresenta un'estensione gerarchica dei permessi.

| Ruolo | SELECT | INSERT | UPDATE (incluso archivio/ripristino) | DELETE | Audit |
|---|---|---|---|---|---|
| platform_admin | Tutti i Lead | Tutti | Tutti | Tutti | Tutti gli eventi |
| director | Solo owner | Solo owner | Solo owner | Solo owner | Solo propri Lead |
| team_leader | Solo owner | Solo owner | Solo owner | Solo owner | Solo propri Lead |
| sponsor | Solo owner | Solo owner | Solo owner | Solo owner | Solo propri Lead |
| partner | Solo owner | Solo owner | Solo owner | Solo owner | Solo propri Lead |

### Controlli statici automatici
- [ ] La policy SELECT limita i ruoli non amministrativi a `owner_profile_id = auth.uid()`.
- [ ] La policy INSERT impedisce di creare Lead assegnandoli a un altro proprietario, salvo platform_admin.
- [ ] Le policy UPDATE USING e WITH CHECK impediscono il trasferimento autonomo della proprietà.
- [ ] La policy DELETE limita la cancellazione fisica al proprietario o a platform_admin.
- [ ] Nessuna policy Lead attribuisce privilegi trasversali a director, team_leader o sponsor.
- [ ] La policy audit consente SELECT al proprietario storico o a platform_admin e non abilita scritture dirette.
- [ ] Test runtime con due partner, un director/team_leader/sponsor e platform_admin: da eseguire su Supabase dopo l'allineamento dello schema live.

### Confini
- La matrice non certifica permessi di conversazioni e messaggi: vanno verificati separatamente.
- I test statici verificano il testo delle policy versionate, non l'effettiva configurazione RLS live.
- L'accesso gerarchico a Lead del proprio ramo è una decisione di prodotto ancora da specificare; non viene attivato implicitamente dal ruolo.


## 33. Diagnostica read-only permessi AI Setter

File: `supabase/diagnostics/nextway_setter_permissions_readonly.sql`.

La query raccoglie soltanto metadati di conversazioni, messaggi e tabelle di servizio: colonne, RLS/FORCE RLS, policy, grants, foreign key, indici e firme/SECURITY DEFINER/privilegi EXECUTE delle RPC usate da AI Setter e dalla creazione Lead. Non legge righe applicative e non modifica il database.

- [ ] Verificare che entrambe le tabelle esistano e che le colonne di ownership siano coerenti.
- [ ] Verificare SELECT/INSERT/UPDATE/DELETE per ciascuna policy e il relativo USING/WITH CHECK.
- [ ] Verificare che i messaggi non possano essere associati a una conversazione appartenente a un altro profilo.
- [ ] Verificare che le autorizzazioni admin siano esplicite e non più ampie del necessario.
- [ ] Solo dopo l'analisi dell'output, definire la matrice definitiva dei permessi AI Setter per i cinque ruoli.

Stato: query preparata su GitHub; non ancora eseguita sul progetto Supabase live.

## 34. Retry frontend dopo creazione Lead/conversazione

- [ ] Creare un prospect e verificare che la RPC restituisca una conversazione.
- [ ] Simulare un errore di caricamento conversazioni dopo la RPC: il retry deve riutilizzare l'ID già ottenuto e non richiamare la RPC di creazione.
- [ ] Simulare un errore/timeout della generazione AI: il pulsante deve proporre il retry sulla conversazione già creata.
- [ ] Verificare che il modulo venga azzerato dopo la creazione confermata e che il retry non produca un secondo Lead.
- [ ] Verificare che il retry riutilizzi la stessa chiave idempotente per la generazione fallita.
- [ ] Verificare che conversazioni `closed` e `archived` non compaiano nel selettore delle conversazioni utilizzabili.
- [ ] Verificare il comportamento quando la conversazione viene chiusa tra caricamento e generazione: il backend deve rifiutare la richiesta senza salvare la bozza.

Controllo statico: GitHub Actions run `42803941984` — SUCCESS. Il controllo include parsing JavaScript di `nextway-setter.js` e verifiche strutturali sul retry. I test browser/RPC/Edge Function restano da eseguire in ambiente live.

## 35. Verifica endpoint effettivo Supabase

- [ ] Aprire Supabase > Edge Functions > funzione AI Setter e copiare l'URL esatto di invocazione mostrato nella dashboard.
- [ ] Confrontare il percorso dell'URL con `ENDPOINT` in `nextway-setter.js`.
- [ ] Verificare una chiamata autenticata POST solo dopo aver confermato endpoint, secrets, migrazioni RPC e policy necessarie.
- [ ] Non usare il solo nome visualizzato della funzione come prova dell'URL invocabile.

Nota: il frontend versionato usa `/functions/v1/nextway-ai-setter`; una precedente schermata Supabase aveva mostrato `/functions/v1/rapid-function`. La discrepanza resta aperta e non va risolta per supposizione.

## 36. Recupero conversazione dopo ricaricamento pagina

- [ ] Creare un prospect e interrompere il flusso dopo la conferma della RPC ma prima del completamento della bozza.
- [ ] Ricaricare la pagina nella stessa scheda: il sistema deve ripristinare ID conversazione e obiettivo da sessionStorage.
- [ ] Verificare che il pulsante mostri l'azione di retry e che il retry richiami la generazione sulla conversazione esistente, senza richiamare la RPC di creazione.
- [ ] Verificare che l'obiettivo selezionato venga ripristinato anche se l'utente lo aveva cambiato prima del reload.
- [ ] Verificare che la chiave sessionStorage venga rimossa dopo il completamento e mantenuta in caso di errore.
- [ ] Verificare che dati sessionStorage non validi o con obiettivi non ammessi vengano ignorati.

Nota: sessionStorage copre reload e ripristino della stessa scheda. Non garantisce recupero dopo chiusura definitiva della scheda o su un altro dispositivo. La RPC di creazione Lead non è ancora idempotente contro un timeout ambiguo prima della risposta al client.

Controllo statico GitHub Actions: run `42804560636` — SUCCESS, commit `1f4a6c79c120cbf8e760d7f53900c3e0c6cc7e80`. I test browser restano da eseguire.

## 37. Minimizzazione dati prima dell'invio al provider AI

- [ ] Verificare che la query Lead usata dalla Edge Function non legga il campo `notes`.
- [ ] Inserire valori di prova in `public_evidence` e nello storico contenenti email, telefono e URL; verificare che il contesto inviato al provider contenga i segnaposto e non i recapiti originali.
- [ ] Verificare che il contesto AI includa soltanto i campi esplicitamente ammessi e che non venga usato uno spread dell'intero record Lead.
- [ ] Verificare i limiti di lunghezza per evidenza pubblica, campi testuali e messaggi storici.
- [ ] Eseguire un test controllato della Edge Function dopo il deploy Supabase autorizzato; verificare il comportamento del prompt e la qualità della bozza dopo la minimizzazione.

Stato codice: commit Edge Function `91f09c0cd8dcb95e5b6964fa7c33442c1cc2409c`; validazione statica GitHub Actions run `42804794248` — SUCCESS. La funzione non è stata distribuita su Supabase e i test runtime/GDPR restano da eseguire.

Verifica CI aggiuntiva: GitHub Actions run `42805023373` — SUCCESS. Il workflow esegue ora anche `deno check supabase/functions/nextway-ai-setter/index.ts` con Deno 2; il controllo statico Node e il type-check Deno sono entrambi superati. Questo non equivale al deploy o al test runtime della funzione.


## 38. Idempotenza della creazione Lead/conversazione

- [ ] Verificare in Supabase che la RPC sottostante `nextway_create_lead_with_conversation` esista con sette argomenti nell'ordine previsto e restituisca `success`, `lead_id`, `conversation_id`.
- [ ] Applicare la migrazione 011 soltanto dopo revisione della firma live e approvazione esplicita.
- [ ] Con un utente autenticato, inviare due volte la stessa coppia `request_id` + SHA-256 e lo stesso payload: la seconda risposta deve restituire gli stessi ID con `idempotent_replay=true`; il database deve contenere un solo Lead e una sola conversazione.
- [ ] Riutilizzare la stessa chiave con hash differente: la RPC deve rifiutare la richiesta senza creare altri record.
- [ ] Simulare due chiamate concorrenti con la stessa chiave: una sola esecuzione deve creare Lead/conversazione; l'altra deve recuperare la risposta originaria.
- [ ] Simulare errore della RPC sottostante: la transazione deve annullare anche la prenotazione idempotente, consentendo un retry corretto.
- [ ] Verificare RLS con due profili partner: ciascuno deve leggere soltanto le proprie chiavi; nessun accesso incrociato.
- [ ] Nel browser, interrompere la connessione dopo l'invio ma prima della risposta; ricaricare la stessa scheda e ripetere la richiesta. Il modulo deve ripristinare il payload e riutilizzare la stessa chiave.
- [ ] Verificare che il payload personale non venga memorizzato nella tabella idempotenza: devono essere presenti soltanto hash, chiave, proprietario, risposta con ID e timestamp.

Stato codice: migrazione `20261110001100_nextway_lead_creation_idempotency.sql`, frontend e validatore salvati su GitHub. GitHub Actions run `42805580487` e run finale `42805604904` — SUCCESS per validazione statica Node e type-check Deno. Run finale: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/42805604904. Migrazione non applicata; test SQL, RLS, concorrenza e browser da eseguire in ambiente autorizzato.


- [ ] Salvare una richiesta sospesa con il profilo A, uscire e autenticarsi con il profilo B nella stessa scheda: il modulo non deve ripristinare i dati di A e il retry deve essere bloccato.
- [ ] Ripetere il controllo con una conversazione già creata e bozza incompleta: il profilo B non deve poter riprendere l'ID della conversazione di A.
- [ ] Verificare che `nextway_prune_lead_creation_requests()` sia eseguibile soltanto da `platform_admin` e rimuova esclusivamente chiavi più vecchie di 30 giorni.


## 40. Test URL esterni e collegamenti

- [ ] Inserimento manuale: verificare che siano accettati URL HTTP/HTTPS assoluti con hostname e rifiutati `javascript:`, `data:`, `file:`, URL relativi e URL con credenziali.
- [ ] Import CSV: verificare gli stessi casi; gli URL non validi devono essere conteggiati come record non validi e non importati.
- [ ] Visualizzazione archivio: record preesistenti con URL non valido non devono produrre collegamenti cliccabili.
- [ ] Ricerca web assistita: risultati con URL non valido devono essere ignorati; URL validi devono aprire solo HTTP/HTTPS e trasferire al modulo lo stesso URL validato.
- [ ] Verificare che nessun dato storico venga riscritto dalla sola visualizzazione o validazione.
- Stato codice: commit UI Lead `5b3212de459718c0fd2e8ed7e6e2aabb2a6e3465`, correzione rendering `47f413fa26aee03f22aceff2b9a2075f3795b27c`, connessione/ricerca `483c908a381ea28453b9799ecbd70c28cbed736f`, validatore `e5901c59cbcb3b3e4ebaf24affd73ce824bc557e`. GitHub Actions run `42806931080` — SUCCESS (validazione statica Node e type-check Deno). Test browser ancora da eseguire.

## 41. Test account isolation dell'archivio locale

- [ ] Senza login, creazione, importazione, ripristino e cancellazione Lead devono essere bloccati.
- [ ] Dopo login con account A, la UI deve leggere/scrivere solo `nextway_ai_records_v1:<A>`.
- [ ] Dopo logout, i dati A devono sparire dalla memoria della pagina e i pannelli con dati account-specifici devono essere svuotati.
- [ ] Dopo login con account B nello stesso browser, nessun Lead locale di A deve apparire; sync/pull devono usare solo la chiave B.
- [ ] Cambio account/sessione in un'altra scheda deve attivare il profilo corretto o svuotare i dati quando la sessione termina.
- [ ] La chiave legacy globale `nextway_ai_records_v1` deve rimanere intatta e non deve essere importata automaticamente in A o B.
- [ ] Testare anche refresh, token scaduto, import CSV, backup JSON e conflitti di sincronizzazione.
- Stato: codice e validatore statico presenti; test browser multi-account ancora da eseguire.

## 42. Verifica privacy-safe logging AI Setter

- [ ] In caso di errore Supabase, verificare nei log runtime che compaiano solo codice e status, senza oggetti errore o contenuti.
- [ ] In caso di errore OpenAI, verificare che venga registrato soltanto lo status HTTP e non il corpo della risposta.
- [ ] In caso di eccezione inattesa, verificare che il catch non registri messaggi, stack o payload.
- [ ] Verificare che il client riceva soltanto il messaggio generico previsto.
- Stato codice: implementato e validato staticamente; type-check Deno superato con GitHub Actions run `42807835076`. Test runtime/log effettivi ancora da eseguire dopo deploy autorizzato.


## 43. Collaudo NEXTWAY CRM – modifica Lead e ordinamento

- [ ] Aprire un Lead locale e verificare che il modulo venga popolato con tutti i campi modificabili.
- [ ] Modificare nome, fonte, URL, evidenza, categoria, qualificazione, punteggi e note; salvare e verificare che il record mantenga lo stesso ID e che non compaia un duplicato.
- [ ] Annullare la modifica e usare il pulsante "Pulisci": il modulo deve tornare allo stato "Nuovo Lead".
- [ ] Tentare di salvare un URL già assegnato a un altro Lead: il salvataggio deve essere bloccato; lo stesso URL del Lead in modifica deve essere consentito.
- [ ] Verificare i vincoli: qualificazione "Qualificato" non consentita senza identità confermata o con punteggio inferiore a 50.
- [ ] Modificare un Lead sincronizzato: deve essere impostato local_dirty=true; dopo sincronizzazione il record cloud deve essere aggiornato mantenendo lo stesso ID.
- [ ] Modificare contemporaneamente il record cloud da un secondo client: la sincronizzazione deve rilevare il conflitto e non sovrascrivere la versione remota.
- [ ] Verificare che Lead archiviati o con conflitto non risolto non possano essere modificati.
- [ ] Verificare i quattro ordinamenti (punteggio, più recenti, meno recenti, nome A-Z) in combinazione con ricerca, categoria, stato e archivio.
- Stato codice: implementato su GitHub nei commit 86d9b06de85d38c94dcd3579061cc012268a6014 e 1d48f8eee4c88ba6a3dc9414ea04bf79fd5d2cb1; controlli statici dedicati aggiunti al validatore nei commit b3e99c286f4bd1a75dc17b7ddaafecd6947b2f9d e 726f2d145ad7c36afff8280f5845debe343d1a19. Test browser/runtime ancora da eseguire.


## 44. Collaudo NEXTWAY CRM – ricerca estesa e filtri

- [ ] Cercare un Lead tramite nome, professione, azienda/brand, località, fonte, URL, evidenza pubblica e note.
- [ ] Combinare ricerca testuale con categoria, stato, archivio, qualificazione e profilo partner.
- [ ] Verificare che l'ordinamento selezionato resti coerente con tutti i filtri.
- [ ] Verificare che i filtri non modifichino i dati e non attivino richieste cloud.
- Stato codice: UI commit a65f24ebc44ee3cfe6891bfda72aa14e7016a34a; validatore commit 3bfa2b371f26bb470696876741e08a4a41f8aad8. CI non ancora confermata; test browser/runtime da eseguire.


## 45. Collaudo NEXTWAY CRM – sincronizzazione oltre 1.000 Lead

- [ ] Con più di 1.000 Lead autorizzati, verificare che il pull recuperi tutte le pagine e non soltanto i primi 1.000.
- [ ] Verificare che i record locali con local_dirty=true restino invariati e che i conflitti vengano segnalati.
- [ ] Verificare il pull con RLS attiva per due account: ogni account deve ricevere esclusivamente i Lead autorizzati dal database.
- Verificare anche che l'ordinamento secondario per ID mantenga pagine deterministiche quando più record condividono created_at.
- Stato codice: commit cloud 5f1b05ddd61105f4992be4743b8b291c1391af62; stabilizzazione ordine deac2d1883db9b2fbcfd6cf7a80523344389e8e3; validatore paginazione c098b17de97d5722dfd26b5d31d1172c96a1e649 e ordine stabile d1f91719811459325be2f46e1a5c72fb031c4b70. Test runtime Supabase ancora da eseguire.


## 46. Collaudo NEXTWAY CRM – registro attività e follow-up

- [ ] Applicare la migrazione 20261110001200 solo dopo aver confermato che il progetto Supabase è quello NEXTWAY corretto.
- [ ] Con account partner A, registrare telefonata, messaggio, email, incontro, nota e attività su un proprio Lead sincronizzato.
- [ ] Verificare che il pannello mostri data, tipo, oggetto e dettagli usando testo non interpretato come HTML.
- [ ] Inserire un follow-up futuro, verificare lo stato aperto e completarlo; ripetere annullandolo.
- [ ] Verificare che non sia possibile aggiungere attività a Lead non sincronizzati o archiviati.
- [ ] Con account partner B, verificare che non possa leggere, inserire o aggiornare le attività del Lead di A.
- [ ] Verificare il comportamento platform_admin sui Lead visibili in base alle policy esistenti.
- [ ] Verificare il limite UI di 100 eventi e l'ordinamento per data decrescente con ID come criterio stabile.
- Stato codice: migrazione 012, API cloud e UI implementate su GitHub; test statico dedicato aggiunto. Migrazione non applicata e test runtime Supabase/browser non eseguiti.

- Verificare anche che le attività già registrate restino consultabili sui Lead archiviati e che la registrazione di nuove attività sia disabilitata.
- Ultimi commit UI/validatore: f14736c1912f68f524e19eee8340d6056236fe72 e a12df0dc2edc5c613500e1bcaea23386a7ec77a2. Il run CI non risulta disponibile nel recupero GitHub effettuato; esito non certificato.


## 47. Collaudo NEXTWAY CRM – coda follow-up

- [ ] Caricare la coda con follow-up aperti e verificare ordinamento dalla scadenza più vicina.
- [ ] Verificare l'evidenza delle attività scadute.
- [ ] Aprire un Lead dalla coda anche quando i filtri correnti lo escludono.
- [ ] Completare un follow-up dalla coda e verificare che scompaia dalla lista aperta.
- [ ] Verificare che il partner veda solo attività collegate ai propri Lead; platform_admin segue le policy globali.
- Stato codice: API e UI implementate su GitHub; migrazione 012 non applicata e test runtime non eseguiti.

- Collaudo navigazione dalla coda: verificare che Apri Lead azzeri solo i filtri incompatibili, visualizzi il Lead corretto e apra il pannello attività; commit UI d52bb4a6be55d29739a7789a224ec191130a411e e 2d621cc496ac25739e1eb966a9ddd8501ea479eb; validatore d0ba03a12984dbd150ade024bed952a47a67ca90.


## 48. Collaudo apertura Lead dalla coda follow-up

- [ ] Creare un follow-up su un Lead sincronizzato.
- [ ] In un browser/profilo con cache locale vuota ma sessione autenticata, caricare la coda follow-up e selezionare "Apri Lead".
- [ ] Verificare che il Lead venga recuperato dal cloud tramite RLS e aggiunto alla cache del solo profilo autenticato.
- [ ] Verificare che il Lead si apra senza sovrascrivere eventuali modifiche locali già presenti.
- [ ] Verificare che un Lead non autorizzato/non visibile tramite RLS non venga recuperato.
- Commit API: 812378019f9d7751c7c2c92385349b988695a5a3; UI: f6c2f8d270aa06c52bc6103c193efa24527c3dcb; validatore: b5771aaf00bed9bc018792583217044e880223d6.
- Stato: codice salvato su GitHub; test runtime non eseguiti.

- Verificare riepilogo dei follow-up scaduti, in scadenza oggi ed entro 7 giorni e le etichette italiane dei tipi di attività. Commit UI: 153bc556e9a681b97a792b44168bf3a540da75da; validatore: 28c0850a4b5b5e0c5092db29b79a20a8fac16eb6.


## 49. Collaudo ciclo di vita commerciale Lead

- [ ] Applicare la migrazione 013 solo dopo verifica esplicita del progetto Supabase corretto.
- [ ] Verificare che Lead esistenti con i quattro stati precedenti continuino a essere letti e sincronizzati.
- [ ] Provare tutte le nove fasi dal selettore Lead e verificare che il filtro per stato restituisca i record corretti.
- [ ] Sincronizzare un Lead in ciascuna nuova fase e verificare che il valore non venga riportato a "Da verificare".
- [ ] Importare CSV con una fase nuova e verificare che sia accettata senza duplicare record.
- [ ] Verificare i conteggi contattati, in follow-up, in valutazione e convertiti.
- [ ] Verificare che "Convertito cliente" e "Convertito partner" siano solo stati CRM e non creino automaticamente record in `clients` o `profiles`.
- Stato: codice e migrazione predisposti su GitHub; migrazione non applicata; test runtime da eseguire.


## Test istruzioni e criteri attivi per workspace

Prerequisiti: applicare in ambiente di test la migrazione 20261112030000_nextway_setter_governance_read_rpc.sql; distribuire la Edge Function aggiornata; predisporre un workspace attivo, due membership di partner, un profilo workspace_viewer, un account platform_admin, prompt/criteri in stato draft e active. Non usare dati personali reali.

- [ ] Un partner con membership attiva workspace_member può generare una bozza e l'AI Setter riceve soltanto prompt/criteri active del workspace associato alla conversazione.
- [ ] Un partner di un altro workspace non può leggere la governance del workspace non associato: RPC rifiutata con 42501.
- [ ] workspace_viewer non può generare una bozza né leggere la governance; il ruolo resta in sola lettura.
- [ ] platform_admin può leggere la governance del workspace secondo il bypass amministrativo già previsto.
- [ ] Prompt/criteri draft o archived non compaiono nel risultato RPC e non vengono passati al modello.
- [ ] Workspace senza prompt/criteri attivi: RPC restituisce array vuoti e l'AI Setter usa le istruzioni standard.
- [ ] Conversazione legacy con workspace_id nullo: nessuna chiamata alla RPC governance e comportamento precedente invariato.
- [ ] RPC governance indisponibile o membership revocata: AI Setter risponde HTTP 503 prima di acquisire la prenotazione idempotente; nessuna chiamata OpenAI e nessuna bozza creata.
- [ ] I criteri attivi aiutano a individuare informazioni mancanti e il prossimo passo; il modello non inventa punteggi, interessi o caratteristiche non supportati.
- [ ] Verificare i limiti di contesto: massimo 5 prompt, 6.000 caratteri per prompt; massimo 5 criteri, configurazione JSON limitata a 5.000 caratteri.
- [ ] Nessun prompt/criterio aggiuntivo può autorizzare pressioni, promesse di guadagno, invio automatico o trattamento non trasparente.
- [ ] La risposta continua a contenere sent:false e approved:false; nessun canale esterno viene contattato.

### Limiti di collaudo

La migrazione e l'integrazione Edge Function sono preparate nel branch, ma non applicate/distribuite. I test sopra sono requisiti di collaudo, non risultati già ottenuti. La verifica statica del repository non dimostra il comportamento runtime di PostgreSQL, membership, RLS o OpenAI.
