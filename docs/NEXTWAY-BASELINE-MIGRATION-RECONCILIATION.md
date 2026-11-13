# NEXTWAY — riconciliazione baseline e migrazioni

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Commit sorgente analizzato: `d11e3e812f11b5949ebd388b976d35cdfd2e83dd`

## 1. Scopo e decisione

Questo documento collega il dump schema-only recuperato dal progetto Supabase di produzione con l'inventario delle migrazioni presenti nel repository. Serve a preparare un ambiente locale riproducibile, non ad autorizzare modifiche al progetto remoto.

**Decisione attuale: baseline recuperata, riconciliazione oggetto-per-oggetto ancora da completare.** Non importare ancora il dump e non applicare in blocco le migrazioni.

## 2. Evidenza del dump schema-only

Il 13 novembre 2026 è stato eseguito, dopo verifica della sintassi con Supabase CLI 3.1.0, il comando:

```bash
supabase db dump --remote=obqwbtlltxjfeirstsya --schema public --file /tmp/nextway-public-schema.sql
```

Risultato documentato nel Terminale:

- destinazione identificata dalla CLI: progetto `nextway-platform`, ref `obqwbtlltxjfeirstsya`, ambiente production;
- file prodotto: `/tmp/nextway-public-schema.sql`;
- dimensione: circa 154 KB, 3.615 righe;
- controllo `COPY` / `INSERT INTO`: zero occorrenze;
- SHA-256: `5622e4e5864c6860241f04ad6ecff6c08a1d7a61c37a062b50772fa704a9f32d`;
- nessuna migrazione o scrittura SQL è stata eseguita sul database remoto.

Inventario strutturale ricavato dai controlli sul dump:

| Oggetto | Conteggio |
|---|---:|
| Tabelle nello schema applicativo | 21 |
| Funzioni `SECURITY DEFINER` | 22 |
| Policy RLS | 53 |
| Trigger | 11 |
| Indici | 48 |

Le definizioni di funzione contengono impostazioni `search_path`; i trigger sono dichiarati con `CREATE OR REPLACE TRIGGER`. I conteggi sono stati corretti dopo aver individuato limiti nelle prime espressioni di ricerca.

**Limite probatorio:** il dump completo è rimasto in `/tmp` sul Mac e non è stato caricato nel repository o reso disponibile come contenuto integrale in questa revisione. I conteggi non dimostrano che ogni oggetto sia corretto, né consentono da soli di associare una tabella o funzione a una specifica migrazione.

## 3. Inventario delle 31 migrazioni

L'elenco seguente è stato letto dal branch indicato e ogni file SQL è stato esaminato staticamente per le dichiarazioni principali. La classificazione non equivale all'esecuzione o alla convalida PostgreSQL.

### Fondazione AI Assistant — da mantenere separata

1. `20261105000100_nextway_ai_assistant_foundation.sql` — crea il modello iniziale AI Assistant e le tabelle `nw_*`; resta **draft separato**, non includerlo automaticamente nella sequenza di staging.

### Rate limit, idempotenza e recupero Setter

2. `20261110000100_nextway_distributed_rate_limit.sql` — tabella rate limit e RPC di consumo.
3. `20261110000200_nextway_setter_idempotency.sql` — prima tabella richieste generazione Setter e funzioni begin/complete.
4. `20261110000300_nextway_rate_limit_units.sql` — aggiornamento unità/semantica rate limit.
5. `20261110000400_nextway_idempotency_retention.sql` — retention richieste idempotenti.
6. `20261110000500_nextway_setter_output_recovery.sql` — memorizzazione e recupero output temporaneo.
7. `20261110000600_nextway_setter_output_authorization_hardening.sql` — rafforzamento autorizzazioni delle funzioni output.
8. `20261110000700_nextway_clear_stale_staged_output.sql` — pulizia output scaduti.

### CRM, audit, Lead e conversioni

9. `20261110000800_nextway_leads_soft_archive.sql` — metadati archiviazione Lead e trigger.
10. `20261110000900_nextway_lead_audit_trail.sql` — tabella audit Lead, policy e trigger.
11. `20261110001000_nextway_audit_data_minimization.sql` — minimizzazione dei dati registrati dall'audit.
12. `20261110001100_nextway_lead_creation_idempotency.sql` — richieste idempotenti creazione Lead, RPC e policy.
13. `20261110001200_nextway_lead_activities.sql` — attività Lead, policy e trigger aggiornamento.
14. `20261110001300_nextway_lead_lifecycle.sql` — aggiornamento stati/ciclo di vita Lead.
15. `20261110001400_nextway_lead_conversion_requests.sql` — richieste conversione, policy, trigger e guard.
16. `20261111001500_nextway_conversion_provisioning.sql` — claim/finalizzazione/rilascio attivazione conversione.
17. `20261111150000_nextway_conversion_claim_cleanup.sql` — pulizia/rafforzamento finalizzazione claim.
18. `20261111160000_nextway_trigger_function_privileges.sql` — privilegi delle funzioni trigger.
19. `20261112170000_nextway_conversion_activation_integrity.sql` — integrità della finalizzazione conversione.

### Knowledge Base e multi-workspace

20. `20261111170000_nextway_knowledge_base.sql` — tabelle documenti/chunk, ricerca e policy.
21. `20261111180000_nextway_knowledge_storage.sql` — policy e integrazione con `storage.buckets` / `storage.objects`.
22. `20261111190000_nextway_multi_workspace_foundation.sql` — workspace, prompt e criteri prospect.
23. `20261111200000_nextway_workspace_activation_rpc.sql` — RPC di attivazione prompt e criteri.
24. `20261111210000_nextway_workspace_data_association.sql` — associazione workspace ai dati esistenti.
25. `20261111220000_nextway_workspace_memberships.sql` — membership, accesso e gestione workspace.
26. `20261111230000_nextway_workspace_scoped_rls.sql` — policy RLS workspace-scoped, audit e ricerca knowledge.
27. `20261111240000_nextway_setter_generation_workspace.sql` — prima versione generazione Setter con ambito workspace.
28. `20261112000000_nextway_lead_creation_workspace.sql` — RPC creazione Lead consapevoli del workspace.
29. `20261112010000_nextway_lead_creation_legacy_idempotency_guard.sql` — protezione compatibilità idempotenza legacy.
30. `20261112020000_nextway_setter_generation_table_isolation.sql` — separazione tabella generazione Setter per workspace.
31. `20261112030000_nextway_setter_governance_read_rpc.sql` — RPC di sola lettura governance Setter.

## 4. Dipendenze esterne da ricostruire

Le migrazioni non costituiscono uno schema autonomo. La baseline locale deve comprendere, nella versione coerente con il dump:

- oggetti preesistenti `public.profiles`, `public.clients`, `public.partner_details`, `public.nextway_leads`, conversazioni e messaggi Setter;
- RPC e trigger preesistenti usati da creazione Lead, qualificazione e flussi Setter;
- schemi e funzioni gestite Supabase, in particolare `auth.users`, `auth.uid()`, `auth.role()`;
- oggetti Storage `storage.buckets` e `storage.objects`, oltre al bucket locale e alle policy necessarie alla Knowledge Base;
- ruoli, grant, tipi, sequenze, vincoli, indici, trigger e policy necessari alle funzioni `SECURITY DEFINER` e a RLS.

Il dump dello schema `public` non include le definizioni degli schemi gestiti `auth` e `storage`, né i ruoli personalizzati. Queste parti devono essere fornite/configurate dallo stack locale, non ricreate alla cieca nel dump applicativo.

## 5. Riconciliazione: cosa è noto e cosa manca

| Verifica | Stato |
|---|---|
| Recupero schema-only remoto | **COMPLETATO** |
| Assenza di righe `INSERT` / `COPY` | **CONTROLLATA** |
| Conteggi principali di tabelle, funzioni, policy, trigger e indici | **RILEVATI** |
| Inventario statico delle 31 migrazioni | **COMPLETATO** |
| Identificazione delle dipendenze Auth e Storage | **COMPLETATA a livello statico** |
| Confronto puntuale di ogni tabella/funzione/trigger/policy del dump con ogni migrazione | **DA COMPLETARE** |
| Verifica di tipi, sequenze, ownership, grant, FK e dipendenze esterne | **DA COMPLETARE** |
| Baseline locale importabile e riproducibile | **NON ANCORA CERTIFICATA** |
| Seed sintetici | **NON CREATI** |
| Test PostgreSQL o test runtime | **NON ESEGUITI** |

Non assumere che una migrazione sia già inclusa nel dump solo perché il suo oggetto compare nel database live: serve verificare definizione e versione. Non riapplicare in produzione `20261112020000_nextway_setter_generation_table_isolation.sql`, che il registro operativo indica come già applicata live.

## 6. Sequenza di costruzione sicura

1. Estrarre dal dump locale, senza esporre corpi funzione o segreti, l'elenco dei nomi di tabelle, viste, tipi, sequenze, funzioni, trigger, policy, vincoli e grant.
2. Confrontare tali elenchi con le 31 migrazioni e con gli oggetti prerequisito legacy.
3. Definire una baseline SQL revisionata; mantenere il dump originale in `/tmp` e fuori dal repository.
4. Preparare `config.toml` e seed esclusivamente sintetici in un percorso isolato, preservando `supabase/.temp/`.
5. Avviare soltanto un profilo locale compatibile con le risorse del Mac, dopo revisione della configurazione.
6. Applicare le migrazioni selezionate esclusivamente al database locale isolato, registrando una per una dipendenze ed esiti.

## 7. Divieti e stato operativo

- Nessun `supabase link`, `db push`, `migration up` remoto o deploy.
- Nessun avvio dello stack locale finché configurazione, baseline e seed non sono revisionati.
- Nessun dato personale, utente, Lead, conversazione o documento di produzione copiato nei test.
- Nessun workspace, membership o record creato in produzione.
- Nessuna modifica a `main`, nessun merge della PR.
- Nessun deploy Netlify produzione prima del 4 dicembre 2026.
- Nessuna spesa o creazione di un nuovo progetto cloud.

**Conclusione:** è stato costruito l'inventario documentato e recuperata una baseline schema-only reale. Il passaggio successivo non è avviare Supabase né applicare migrazioni: è completare la riconciliazione degli oggetti del dump con i prerequisiti delle migrazioni, così da produrre una baseline locale riproducibile senza supposizioni.


## Strumento di confronto locale

Aggiunto `scripts/analyze-nextway-schema-baseline.py`. Lo script legge il dump schema-only e i file SQL del repository, stampa un inventario statico per categoria e segnala quali nomi dichiarati nelle migrazioni risultano già presenti nel dump o non vengono trovati. Mostra hash e nomi degli oggetti, non corpi SQL o valori.

Esecuzione prevista sul Mac, dalla cartella del repository:

```bash
python3 scripts/analyze-nextway-schema-baseline.py
```

Il percorso predefinito del dump è `/tmp/nextway-public-schema.sql`; è possibile specificare un percorso alternativo con `--dump`. Lo script è un aiuto lessicale, non un parser PostgreSQL e non certifica da solo la sicurezza o l'importabilità. Non si connette a Supabase e non esegue SQL. **Non è ancora stato eseguito sul Mac dell'utente.**


## 8. Esito del confronto automatico e correzione mirata — 13 novembre 2026

Eseguito localmente sul branch aggiornato a `ed8187d`:

```bash
python3 scripts/analyze-nextway-schema-baseline.py
```

Lo script ha letto il dump con SHA-256 già registrato e tutte le 31 migrazioni. L'analisi è lessicale e non certifica l'importabilità PostgreSQL.

### Differenze classificate

| Risultato | Interpretazione |
|---|---|
| 12 tabelle `nw_*` non presenti | Attese: appartengono alla migrazione draft `20261105000100_nextway_ai_assistant_foundation.sql`, mantenuta separata dalla baseline corrente |
| 12 tabelle NEXTWAY dichiarate nelle migrazioni risultano nel dump | Evidenza positiva per CRM, Knowledge Base, audit, conversioni e workspace |
| 4 policy Knowledge Storage non presenti nel dump `public` | La migrazione le crea su `storage.objects`, schema managed escluso dal dump `public` |
| Trigger `already` e indice `if` | Falsi positivi dovuti al parsing incompleto di clausole SQL come `IF NOT EXISTS` |
| Differenze nei conteggi delle policy | Conteggi lessicali da normalizzare; non sono una certificazione del numero effettivo di policy |

### Correzione della discrepanza sulla tabella Setter legacy

Il controllo mirato eseguito dall'utente sul dump locale:

```bash
grep -niE 'nextway_setter_generation_requests|nextway_api_rate_limits|nextway_consume_api_rate_limit|nextway_clear_stale_setter_output|nextway_prune_setter_generation_requests|nextway_get_active_setter_governance' /tmp/nextway-public-schema.sql
```

ha trovato `public.nextway_setter_generation_requests` alle righe 2071 e seguenti. Nel dump sono inoltre visibili:

- definizione della tabella e vincolo di stato;
- owner `postgres`;
- commento che la identifica come archivio legacy;
- chiave primaria;
- indice `nextway_setter_generation_conversation_idx`;
- FK verso `nextway_setter_conversations` e `profiles`;
- RLS abilitata;
- concessione `GRANT ALL` a `service_role`.

La tabella `nextway_setter_workspace_generation_requests` è distinta e il relativo commento conferma la separazione. La migrazione `20261112020000_nextway_setter_generation_table_isolation.sql` richiede la tabella legacy e crea lo store workspace separato. **La precedente segnalazione di assenza della tabella legacy era un falso negativo del rilevatore e viene ritirata.** Non è necessario ricreare la tabella.

### Riconciliazione con il codice runtime e priorità

Le assenze confermate nel dump `public` sono:

1. `nextway_api_rate_limits` e `nextway_consume_api_rate_limit(text, integer)`;
2. `nextway_clear_stale_setter_output` e trigger `nextway_clear_stale_setter_output_trg`;
3. `nextway_prune_setter_generation_requests()`;
4. `nextway_get_active_setter_governance(uuid)`.

La lettura delle migrazioni e di `supabase/functions/nextway-ai-setter/index.ts` consente di classificarle:

| Oggetto assente | Dipendenza nel codice | Impatto potenziale |
|---|---|---|
| `nextway_api_rate_limits` + RPC rate limit | L'Edge Function AI Setter chiama `nextway_consume_api_rate_limit` con `p_scope` e `p_units` prima di proseguire | **Bloccante:** se la RPC o la tabella non esistono nel database effettivo, la funzione restituisce HTTP 503 ("Controllo di sicurezza temporaneamente non disponibile") e non genera la bozza |
| `nextway_get_active_setter_governance(uuid)` | L'Edge Function la chiama quando `conversation.workspace_id` è valorizzato | **Bloccante per conversazioni workspace:** se la RPC manca, restituisce HTTP 503 e non procede con istruzioni/criteri workspace |
| `nextway_clear_stale_setter_output()` + trigger | Trigger di sicurezza sulla tabella legacy, definito dalla migrazione 100007 | **Protezione di correttezza:** la sua assenza può lasciare un output staged precedente quando una lease viene riassegnata; non è una dipendenza di chiamata diretta dell'Edge Function |
| `nextway_prune_setter_generation_requests()` | Funzione di manutenzione manuale admin-only, definita dalla migrazione 100004 | **Manutenzione non disponibile:** non è nel percorso ordinario di generazione; la retention legacy non può essere eseguita tramite questa RPC |

La migrazione `20261110000300_nextway_rate_limit_units.sql` elimina la precedente firma `nextway_consume_api_rate_limit(text)` e crea quella a due argomenti con `p_units` predefinito. La tabella `nextway_api_rate_limits` viene creata dalla migrazione `20261110000100_nextway_distributed_rate_limit.sql` e non viene eliminata dalla migrazione successiva: la sua assenza nel dump non è spiegata da quel semplice cambio di firma.

La migrazione `20261112030000_nextway_setter_governance_read_rpc.sql` definisce la RPC governance, ma il nome non compare nel dump. Il codice runtime attuale la usa per conversazioni con workspace valorizzato.

**Limite probatorio:** queste sono conclusioni sul contenuto del dump e sul codice del branch, non una verifica runtime della produzione. Non abbiamo ancora interrogato il registro `supabase_migrations.schema_migrations` né eseguito chiamate RPC remote. Non possiamo quindi stabilire se le migrazioni siano state saltate, se oggetti siano stati rimossi successivamente o se il codice Edge Function distribuito corrisponda esattamente al branch.

### Decisione tecnica aggiornata

- Le 12 tabelle draft `nw_*` restano fuori dalla baseline corrente.
- La tabella Setter legacy è confermata presente e va preservata; lo store workspace è separato.
- **Priorità P0:** chiarire la presenza effettiva della tabella e RPC rate limit, perché il codice AI Setter le richiede.
- **Priorità P0 per workspace:** chiarire la presenza effettiva della RPC governance.
- **Priorità P1:** chiarire trigger/funzione di pulizia output staged, protezione necessaria per la riassegnazione delle lease.
- **Priorità P2:** chiarire la RPC di retention legacy, manutenzione manuale non necessaria per ogni generazione.
- Le policy Storage restano da trattare attraverso lo schema/servizio managed locale.
- La baseline non è ancora certificata come riproducibile: restano da verificare tipi, sequenze, FK, ownership, grant, funzioni, dipendenze e completezza delle strutture managed.
- Non creare oggetti sulla base del solo confronto lessicale e non riapplicare migrazioni in produzione.

### Stato

- **COMPLETATO:** esecuzione dello script; controllo mirato del dump; conferma della tabella Setter legacy, dei suoi vincoli principali e della separazione workspace.
- **DA RISOLVERE:** rate limit, trigger/cleanup legacy, retention legacy e governance RPC; verifica strutturale completa.
- **DA MIGLIORARE:** parser di trigger/indici e conteggi RLS.
- **NON ESEGUITO:** import locale, seed, migrazioni, test runtime, modifiche al database remoto o deploy.


## 9. Verifica SQL read-only degli oggetti e ricerca registri — 13 novembre 2026

L'utente ha eseguito nel SQL Editor una query diagnostica composta da una sola SELECT con CTE, interrogando i cataloghi PostgreSQL e `to_regclass`/`to_regprocedure`. La query è stata eseguita correttamente, senza errori. Non contiene DDL o DML e non ha modificato schema o dati.

### Registri candidati individuati

La ricerca ha restituito tre relazioni candidate:

| Schema | Relazione |
|---|---|
| `auth` | `schema_migrations` |
| `realtime` | `schema_migrations` |
| `storage` | `migrations` |

Questi risultati identificano soltanto relazioni candidate per nome. Non dimostrano che contengano il registro delle migrazioni applicative NEXTWAY. Non è stato letto alcun contenuto delle relazioni e non va presunto che una di esse sostituisca il registro convenzionale Supabase.

### Stato degli oggetti NEXTWAY verificato nel database

| Oggetto | Risultato |
|---|---|
| `public.nextway_setter_generation_requests` | **PRESENTE** |
| `public.nextway_setter_workspace_generation_requests` | **PRESENTE** |
| `public.nextway_api_rate_limits` | **NON TROVATO** |
| `public.nextway_consume_api_rate_limit(text, integer)` | **NON TROVATA** |
| `public.nextway_get_active_setter_governance(uuid)` | **NON TROVATA** |
| `public.nextway_clear_stale_setter_output()` | **NON TROVATA** |
| `public.nextway_clear_stale_setter_output_trg` | **NON TROVATO** |
| `public.nextway_prune_setter_generation_requests()` | **NON TROVATA** |

I risultati confermano la presenza dei due store Setter e confermano nel database interrogato le assenze già rilevate nel dump schema-only per rate limit, governance, cleanup/trigger e retention legacy.

### Interpretazione e prossimi passi

- **P0 — rate limit:** tabella e RPC non risultano presenti. Il codice sorgente del branch usa la RPC prima di proseguire con la generazione AI Setter; il percorso può quindi restituire HTTP 503 se la versione distribuita dipende da questa RPC.
- **P0 — governance workspace:** la RPC non risulta presente. Il percorso Setter per conversazioni con workspace può restituire HTTP 503 se la versione distribuita la invoca.
- **P1 — cleanup staged output:** funzione e trigger non risultano presenti; resta da ripristinare/verificare la protezione contro output staged obsoleti alla riassegnazione della lease.
- **P2 — retention legacy:** la RPC di pulizia non risulta presente; la manutenzione corrispondente non è disponibile tramite questa funzione.
- I due store Setter sono presenti e non devono essere ricreati.
- I tre registri candidati devono essere identificati prima di consultare i loro dati: non eseguire SELECT su tabelle managed senza aver prima stabilito quale sia il registro pertinente e quali colonne contenga.
- Non applicare migrazioni in produzione sulla base di questi risultati. Prima occorre ricostruire la cronologia e verificare il codice Edge Function effettivamente distribuito.

**Limite probatorio:** la query dimostra la presenza/assenza degli oggetti elencati nel database al momento dell'esecuzione. Non dimostra quali migrazioni siano state applicate, né quale versione della Edge Function sia attualmente distribuita.

### Stato aggiornato

- **COMPLETATO:** query read-only eseguita con successo; due tabelle Setter confermate presenti; sei oggetti/funzioni/trigger non trovati; tre relazioni candidate a registro individuate.
- **DA COMPLETARE:** identificazione del registro migrazioni pertinente; confronto della cronologia con le 31 migrazioni; verifica della versione Edge Function distribuita.
- **NON ESEGUITO:** migrazioni, DDL/DML, deploy, import, seed, test runtime o modifiche al database.
