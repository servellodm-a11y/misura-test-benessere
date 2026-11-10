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
