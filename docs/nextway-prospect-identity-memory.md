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
- Lettura per membri attivi del workspace, scrittura per membri non viewer.
- Nessuna policy DELETE per gli utenti autenticati: la pulizia delle righe scadute sarà un'attività server-side controllata.

## Sicurezza

- RLS abilitata su entrambe le tabelle.
- Nessun accesso anonimo o pubblico.
- Gli utenti senza workspace non possono leggere o scrivere archivi personali globali; il percorso senza workspace è riservato a `platform_admin`.
- I membri possono creare record propri nel workspace attivo.
- Proprietario e workspace non sono modificabili dai membri dopo la creazione; solo `platform_admin` può trasferire dati tra workspace.
- I viewer possono leggere ma non scrivere.
- Il ruolo `service_role` è previsto per future operazioni server-side e bypassa RLS: deve restare esclusivamente nei segreti server, mai nel browser.

## Dipendenze prima dell'applicazione

1. La catena di migrazioni multi-workspace e membership deve essere approvata e applicata nell'ordine previsto.
2. Il client deve calcolare SHA-256 delle chiavi d'identità normalizzate prima di inviarle; non deve inviare email/telefono come impronte in chiaro.
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

La Edge Function `nextway-search` ora è predisposta per due operazioni autenticate:

1. **Ricerca:** richiede un workspace attivo, un segmento e un mercato. Cerca prima la query nella tabella `nextway_search_query_cache`; soltanto le query mancanti vengono inviate a Tavily e conteggiate dalla RPC di rate limit.
2. **Memoria identità:** dopo l'analisi locale, il browser invia fino a 25 prospect alla stessa Edge Function con l'azione `archive_prospects`. La funzione normalizza gli URL, calcola sul server gli SHA-256 delle chiavi identità e invoca `nextway_merge_prospect_identity`.

La RPC di merge serializza gli aggiornamenti per workspace, URL e impronte identità, consolida fonti e recapiti professionali pubblici e mantiene lo stato `acquired` se già presente. Non crea Lead e non assegna automaticamente lo stato Qualified.

La UI carica i workspace accessibili tramite `nextway_list_accessible_workspaces`. Se non esiste un workspace attivo o l'utente non ne ha accesso, la ricerca esterna viene bloccata: non deve essere possibile spendere unità Tavily senza poter controllare la cache condivisa.

La cache è separata per workspace, segmento, mercato, azienda e numero massimo di risultati; i record hanno TTL massimo di sette giorni. Le query già in cache non consumano unità di ricerca. Se la lettura della cache centrale fallisce, la funzione si arresta senza chiamare Tavily.

**Stato:** codice e migrazione candidati in PR, non applicati. Prima di abilitare l'uso reale occorrono CI verde, revisione della migrazione e applicazione esplicitamente autorizzata. Nessuna ricerca Tavily è stata eseguita durante la preparazione.
