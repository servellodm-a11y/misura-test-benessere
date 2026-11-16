# NEXTWAY — Memoria centrale delle identità prospect

## Scopo

Questa proposta introduce una memoria centrale, separata dai Lead CRM, per ricordare le identità pubbliche/professionali già individuate anche quando non sono state acquisite come Lead.

La migrazione è **solo candidata**: non è stata applicata a Supabase e non contiene seed, backfill o modifiche a righe operative.

## Tabelle proposte

### `nextway_prospect_identity_archive`

Un record per identità riconosciuta nel workspace.

- `workspace_id`: separazione dei dati tra aziende/team.
- `owner_user_id`: utente che ha creato il record.
- `identity_fingerprints`: fino a 20 impronte SHA-256 esadecimali; non contiene email o telefoni in chiaro.
- `canonical_url`, `display_name`, `company_name`, `profile_data`.
- `public_contacts`: solo recapiti professionali pubblicamente dichiarati.
- `source_evidence`: fonti, URL, estratti e data di raccolta, con limiti di dimensione.
- `target_type`: potenziale cliente, potenziale partner o da classificare.
- `partner_segment`: professionista wellness, networker wellness, networker altro settore, imprenditore, reddito extra.
- `archive_status`: individuato, revisionato, acquisito, ignorato.
- date prima/ultima rilevazione e contatore.

L'archivio non promuove automaticamente nessuno a Lead e non sostituisce l'approvazione manuale del CRM.

### `nextway_search_query_cache`

Cache delle ricerche riuscite, separata per workspace, impronta della query, segmento, mercato e provider.

- Massimo 10 risultati per query.
- Scadenza non oltre 7 giorni.
- Lettura per membri attivi del workspace; scrittura esclusivamente tramite RPC server-side protetta.
- Nessuna policy DELETE per gli utenti autenticati: la pulizia delle righe scadute sarà un'attività server-side controllata.

## Sicurezza

- RLS abilitata su entrambe le tabelle.
- Nessun accesso anonimo o pubblico.
- Gli utenti senza workspace non possono leggere o scrivere archivi personali globali; il percorso senza workspace è riservato a `platform_admin`.
- Gli utenti autenticati hanno accesso diretto in sola lettura: inserimento, aggiornamento e merge sono riservati alle RPC server-side.
- Le RPC verificano l'identità dell'attore e la membership; i client non possono cambiare direttamente proprietario, workspace o stato di acquisizione.
- I viewer possono leggere ma non scrivere.
- Il ruolo `service_role` è previsto per future operazioni server-side e bypassa RLS: deve restare esclusivamente nei segreti server, mai nel browser.

## Dipendenze prima dell'applicazione

1. La catena di migrazioni multi-workspace e membership deve essere approvata e applicata nell'ordine previsto.
2. La Edge Function deve normalizzare le chiavi d'identità e calcolare SHA-256 sul server; nel database si conservano solo le impronte, mentre gli eventuali recapiti professionali pubblici sono campi distinti e soggetti a limiti.
3. L'Edge Function di ricerca deve ricevere un workspace verificato e consultare la cache prima di consumare unità Tavily.
4. Il salvataggio/merge dell'identità deve essere atomico per workspace e fingerprint, per evitare duplicati in richieste concorrenti.
5. La pulizia della cache scaduta deve essere server-side e limitata al workspace.
6. Vanno completati test RLS con utenti appartenenti a due workspace diversi, viewer, member, manager e platform_admin.

## Risparmio crediti: distinzione importante

La tabella cache evita nuove chiamate solo quando la query e il relativo contesto corrispondono a una cache ancora valida. La memoria delle identità evita di ripresentare prospect già conosciuti dopo una nuova ricerca, ma non può recuperare il credito già consumato da una query nuova. La deduplicazione pre-provider deve quindi interrogare prima la cache delle query; la memoria identità opera sul risultato per consolidare persone e fonti.

## Stato

- SQL candidato creato.
- Policy RLS e guard di immutabilità inclusi.
- Test statico CI incluso.
- Nessuna migrazione applicata.
- Nessun dato importato o modificato.
- Nessun deploy o chiamata Tavily eseguita.


## Integrazione centrale proposta (PR di integrazione)

La Edge Function `nextway-search` ora è predisposta per tre operazioni autenticate:

1. **Ricerca:** richiede un workspace attivo, un segmento e un mercato. Cerca prima la query nella tabella `nextway_search_query_cache`; soltanto le query mancanti vengono inviate a Tavily e conteggiate dalla RPC di rate limit.
2. **Confronto identità e CRM:** prima di consentire l'acquisizione, il browser invia fino a 25 prospect con l'azione `lookup_prospects`; la funzione confronta URL e impronte SHA-256 nell'archivio centrale e verifica i Lead CRM tramite RPC.
3. **Memoria identità:** dopo l'analisi locale, il browser invia fino a 25 prospect con l'azione `archive_prospects`. La funzione normalizza gli URL, calcola sul server gli SHA-256 delle chiavi identità e invoca `nextway_merge_prospect_identity`.

La RPC di merge serializza gli aggiornamenti per workspace, URL e impronte identità, consolida fonti e recapiti professionali pubblici e mantiene lo stato `acquired` se già presente. Non crea Lead e non assegna automaticamente lo stato Qualified.

La UI carica i workspace accessibili tramite `nextway_list_accessible_workspaces`. Se non esiste un workspace attivo o l'utente non ne ha accesso, la ricerca esterna viene bloccata: non deve essere possibile spendere unità Tavily senza poter controllare la cache condivisa. Il `platform_admin` vede tutti i workspace attivi e può operare senza una membership dedicata; gli altri utenti richiedono una membership attiva con ruolo di ricerca. L'area amministrativa crea un workspace inizialmente in stato `draft`; un amministratore lo attiva esplicitamente. Le migrazioni non creano workspace, membership o dati iniziali.

La cache è separata per workspace, segmento, mercato, azienda e numero massimo di risultati; i record hanno TTL massimo di sette giorni. Le query già in cache non consumano unità di ricerca. Se la lettura della cache centrale fallisce, la funzione si arresta senza chiamare Tavily.

**Stato:** codice e migrazione candidati in PR, non applicati. Prima di abilitare l'uso reale occorrono CI verde, revisione della migrazione e applicazione esplicitamente autorizzata. Nessuna ricerca Tavily è stata eseguita durante la preparazione.


## Lettura della memoria condivisa prima dell'acquisizione

Prima di consolidare i nuovi risultati, la UI invia alla Edge Function fino a 25 identità candidate. La funzione verifica URL canonici e impronte SHA-256 nello stesso workspace, applicando RLS e membership attiva.

La UI segnala:
- identità già presenti nella memoria condivisa;
- data della prima e dell'ultima rilevazione;
- numero di rilevazioni;
- identità già acquisite nel CRM del workspace, per impedire una seconda acquisizione.

Il confronto avviene prima della scrittura/merge dei risultati appena trovati, così il primo inserimento non viene confuso con un nominativo già noto. L'archivio non modifica né crea Lead durante la sola lettura.


### Scritture protette dell'archivio identità

I client autenticati hanno accesso diretto in sola lettura alla tabella centrale. Inserimenti e aggiornamenti passano esclusivamente dalla RPC `nextway_merge_prospect_identity`, che verifica la membership attiva, convalida impronte e payload e serializza i merge. In questo modo un client non può modificare direttamente lo stato `acquired` o alterare le identità condivise fuori dal percorso controllato.


## Verifica autorevole dei Lead CRM

Il confronto non si limita all'archivio identità: la Edge Function invoca `nextway_lookup_prospect_crm_matches` prima di abilitare l'acquisizione. La RPC cerca i source URL nel workspace selezionato e nei Lead legacy non ancora associati a un workspace ma appartenenti all'utente autenticato. Se trova un Lead, la UI riceve lo stato acquisito; se trova più record, il risultato viene trattato come ambiguo e l'acquisizione resta bloccata.

La RPC di merge accetta dai client soltanto nuove osservazioni `seen`. Lo stato `acquired` viene derivato nel database esclusivamente dalla presenza effettiva di un Lead corrispondente. Il client non può attribuirsi da solo l'acquisizione o la revisione umana.

La cache e i payload di identità sono convalidati prima del salvataggio: array di contatti, oggetti fonte, impronte, URL, risultati e score. Se il confronto CRM non è disponibile, la ricerca si arresta prima dell'acquisizione.


## Migrazioni separate e ordine di applicazione

Per mantenere immutabili le migrazioni già applicate, lo schema e le RPC sono distribuiti in due file distinti:

1. `20261116100000_nextway_prospect_identity_memory.sql`: tabelle, indici, RLS, guard di immutabilità e RPC di persistenza della cache e merge identità.
2. `20261116120000_nextway_prospect_identity_memory_rpcs.sql`: verifica Lead CRM e preflight server-only dei prerequisiti e dei privilegi.
3. `20261116130000_nextway_list_accessible_workspaces.sql`: RPC read-only che alimenta il selettore dei workspace attivi autorizzati.

La seconda migrazione verifica preventivamente la presenza delle tabelle e delle colonne `nextway_leads.workspace_id` e `source_url`. La terza richiede le tabelle multi-workspace/membership e il helper `nextway_is_platform_admin()`. Tutte e tre sono candidate, transazionali e senza seed o modifiche ai dati esistenti; devono essere applicate nell'ordine indicato solo dopo l'approvazione della catena precedente.


## Scritture centrali: confine server-only

Le RPC `nextway_store_search_query_cache` e `nextway_merge_prospect_identity` sono eseguibili soltanto dal ruolo server `service_role`; i ruoli `public`, `anon` e `authenticated` non possono invocarle direttamente. La Edge Function autentica prima il chiamante con il suo JWT, verifica la membership attiva usando il client con permessi dell'utente e usa il client server esclusivamente per queste due RPC. Le RPC ricevono l'ID dell'attore verificato e ripetono il controllo della membership nel database. Le letture di workspace, cache e archivio restano sul client JWT dell'utente: la chiave server non viene usata per letture generiche.

Se la credenziale server non è disponibile, la ricerca esterna viene bloccata prima del rate limit e di qualsiasi chiamata Tavily; non vengono avviate nuove ricerche a pagamento. Prima di consumare unità Tavily, la Edge Function esegue un preflight server-only che verifica l'identità dell'attore, la membership, la presenza delle tabelle e delle RPC necessarie e i relativi permessi. Esegue anche una verifica CRM a URL vuoto e una lettura dell'archivio con il JWT dell'utente. Se uno di questi controlli fallisce, la ricerca esterna non parte.

## Elenco dei workspace accessibili

`20261116130000_nextway_list_accessible_workspaces.sql` aggiunge una RPC read-only per elencare i workspace attivi visibili al motore di ricerca. I platform_admin vedono tutti i workspace attivi; gli altri utenti vedono solo quelli con membership attiva e ruolo abilitato alla ricerca.
