# NEXTWAY — profilo PostgreSQL locale a risorse ridotte

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Stato: **progettazione statica; nessun container avviato, nessun dump importato**.

## 1. Decisione

Il primo ambiente di collaudo sarà un PostgreSQL isolato, avviato come singolo servizio Docker e non tramite lo stack completo `supabase start`.

Questa scelta è subordinata a tre gate:
1. identificare la versione PostgreSQL della sorgente e scegliere un'immagine compatibile;
2. completare la revisione strutturale del dump e delle dipendenze;
3. misurare il consumo reale del singolo container prima di eseguire test.

Non aumentare la memoria Docker e non avviare lo stack Supabase completo sul Mac Intel con 8 GiB RAM e VM Docker da 3,82 GiB.

## 2. Evidenza e limite del dump disponibile

Il file locale `/tmp/nextway-public-schema.sql` è un dump schema-only dello schema `public`, SHA-256:

`5622e4e5864c6860241f04ad6ecff6c08a1d7a61c37a062b50772fa704a9f32d`

Il dump è stato raccolto prima del ripristino P0 Rate Limit + Governance del 13 novembre 2026. Pertanto è una fotografia storica e **non rappresenta da solo lo schema live successivo al ripristino P0**.

Il dump contiene lo schema `public`, ma non ricostruisce automaticamente gli schemi e i servizi gestiti Supabase, in particolare `auth` e `storage`. Il controllo `DATA_STATEMENTS=0` prova soltanto che lo scanner non ha rilevato statement di primo livello `COPY` o `INSERT`: non certifica importabilità, completezza, assenza di segreti hard-coded o equivalenza con Supabase.

Il dump originale resta in `/tmp`, fuori dal repository, e non deve essere modificato o committato.

## 3. Perimetro del profilo SQL

### Incluso, quando la baseline sarà pronta
- PostgreSQL con versione compatibile con quella della sorgente;
- schema applicativo `public` revisionato;
- ruoli PostgreSQL minimi necessari ai grant e ai test;
- sessioni SQL indipendenti per test transazionali e concorrenza;
- fixture sintetiche create esclusivamente nel database locale.

### Escluso
- Supabase Auth / GoTrue e verifica reale dei JWT;
- PostgREST e gateway HTTP;
- Storage API e comportamento effettivo delle policy su file;
- Edge Runtime e chiamate alle Edge Functions;
- Realtime, Studio, image proxy, telemetria e pooler;
- qualsiasi collegamento al progetto Supabase di produzione.

Un esito positivo del profilo SQL non sarà presentato come test end-to-end o come prova del funzionamento di Auth, API, Storage o Edge Functions.

## 4. Dipendenze Supabase da trattare esplicitamente

Le migrazioni NEXTWAY e gli oggetti applicativi fanno riferimento a:
- `auth.users`, `auth.uid()`, `auth.role()` e ruoli `anon`, `authenticated`, `service_role`;
- `storage.buckets` e `storage.objects`;
- helper, funzioni, trigger e tabelle legacy già presenti nello schema `public`.

Nel profilo PostgreSQL puro, eventuali schemi/ruoli di compatibilità possono essere creati soltanto come **fixture tecniche locali**, con implementazione minima e documentata. Non sono Supabase Auth o Storage e non possono validare il comportamento dei relativi servizi.

Regole:
1. Non creare placeholder alla cieca: prima estrarre dai file SQL tutte le colonne e le funzioni effettivamente referenziate.
2. Per i test che dipendono da `auth.uid()`, simulare l'identità soltanto tramite impostazioni di sessione esplicite e utenti sintetici; documentare che si tratta di simulazione.
3. Non dichiarare superate policy Storage con un semplice schema `storage` fittizio.
4. Se una funzione o policy richiede semantiche non riproducibili in PostgreSQL puro, classificare il test come **NON ESEGUIBILE NEL PROFILO SQL** e rimandarlo al profilo d'integrazione.
5. La migrazione `20261111180000_nextway_knowledge_storage.sql` resta fuori dal primo profilo SQL: scrive su `storage.buckets` e crea policy su `storage.objects`.

## 5. Baseline: ordine di costruzione

La baseline non sarà ottenuta applicando in blocco tutte le migrazioni.

1. Inventariare il dump: tabelle, colonne, tipi, domini, sequenze, viste, indici, vincoli, FK, funzioni, trigger, policy, owner e grant.
2. Inventariare i prerequisiti delle migrazioni selezionate e collegare ogni oggetto al relativo prerequisito.
3. Separare gli oggetti già presenti nel dump dagli oggetti introdotti dopo il dump.
4. Integrare la differenza P0 post-dump usando le definizioni canoniche delle migrazioni/draft già revisionate; non duplicare oggetti né riapplicare migrazioni già rappresentate.
5. Tenere fuori la migrazione draft `20261105000100_nextway_ai_assistant_foundation.sql`.
6. Tenere fuori le vecchie migrazioni Setter `20261110000400` e `20261110000700`: sono incompatibili con il modello legacy corrente basato su `owner_profile_id` e `claimed_at`. Non aggiungere colonne obsolete `user_id` o `lease_expires_at`.
7. Non riapplicare `20261112020000_nextway_setter_generation_table_isolation.sql` come modifica live: risulta già applicata. La sua rappresentazione nella baseline locale va riconciliata con lo stato effettivo, senza duplicare la tabella workspace.
8. Solo dopo la riconciliazione produrre un bootstrap SQL locale revisionato e fixture sintetiche separate.

La fotografia pre-P0 non va trattata come baseline finale: la differenza P0 deve essere ricostruita e verificata prima di qualsiasi import locale.

## 6. Requisiti prima di scegliere l'immagine PostgreSQL

Non fissare ancora un tag `postgres` arbitrario. Prima occorre ricavare la versione della sorgente dall'intestazione del dump o da evidenza attendibile del progetto e verificare la compatibilità di:
- versione server e versione del formato dump;
- estensioni effettivamente richieste;
- configurazioni di ricerca full-text, incluso il dizionario italiano;
- funzioni PostgreSQL usate da default, indici, trigger e corpi SQL;
- proprietari, ruoli e privilegi citati nel dump.

Se una dipendenza non è disponibile nell'immagine scelta, non sostituirla silenziosamente: fermarsi e documentare la differenza.

## 7. Configurazione e protezione del repository

- Non eseguire `supabase init`: la directory `supabase/` contiene già codice, migrazioni, funzioni e `.temp/`.
- Non sovrascrivere, cancellare o rigenerare `supabase/.temp/`.
- Non aggiungere ancora `supabase/config.toml`: il profilo PostgreSQL singolo non ne ha bisogno.
- Conservare il bootstrap SQL e le fixture in una directory dedicata e versionabile solo dopo revisione, senza dump grezzi, dati personali o segreti.
- Non introdurre automaticamente script di import o comandi che possano puntare a un database remoto.
- Il container futuro dovrà usare un nome dedicato, una porta locale non in conflitto, volume locale dedicato e rete isolata; nessuna porta pubblica o credenziale reale.

## 8. Gate di esecuzione

| Gate | Condizione per superarlo | Stato |
|---|---|---|
| G1 — sorgente | Versione PostgreSQL ed estensioni identificate | DA COMPLETARE |
| G2 — schema | Inventario strutturale e dipendenze managed riconciliati | DA COMPLETARE |
| G3 — delta P0 | Differenza tra dump pre-P0 e stato post-P0 ricostruita | DA COMPLETARE |
| G4 — bootstrap | SQL locale revisionato, senza dati reali o segreti | DA COMPLETARE |
| G5 — risorse | Profilo singolo PostgreSQL valutato entro 3,82 GiB Docker | DA COMPLETARE |
| G6 — runtime SQL | Import locale e test isolati superati | NON ESEGUITO |

Nessun gate è superato per il solo fatto che il pre-flight locale sia passato.

## 9. Test ammessi dopo i gate

Quando l'ambiente sarà stato autorizzato e avviato:
- applicazione/ricostruzione della baseline esclusivamente nel database locale;
- test di vincoli, FK, indici e trigger;
- test di funzioni SQL e transazioni;
- test di concorrenza con due sessioni PostgreSQL;
- test RLS soltanto se ruoli, claim simulati e funzioni di compatibilità sono esplicitamente predisposti, con risultato etichettato come simulazione.

Ogni test dovrà indicare: database target locale, fixture sintetiche, comando eseguito, esito e limiti. Nessun dato o account di produzione.

## 10. Stato e prossime attività

**COMPLETATO E VERIFICATO**
- pre-flight locale in sola lettura superato;
- dump schema-only identificato e hash verificato;
- scanner lessicale SQL e self-test superati;
- inventario iniziale delle migrazioni e matrice servizi disponibili.

**DA COMPLETARE**
- inventario strutturale completo di colonne, tipi, sequenze, FK, owner e grant;
- identificazione versione PostgreSQL ed estensioni;
- ricostruzione del delta P0 successivo al dump;
- bootstrap SQL locale minimo e revisionato;
- valutazione finale del singolo container.

**NON ESEGUITO**
- import del dump;
- avvio container PostgreSQL o stack Supabase;
- migrazioni locali o remote;
- seed, test runtime, deploy, merge o modifiche a `main`.

**Vincoli:** nessun deploy Netlify in produzione prima del 4 dicembre 2026; nessuna modifica al database remoto, deploy Supabase, merge PR o spesa senza autorizzazione specifica.
