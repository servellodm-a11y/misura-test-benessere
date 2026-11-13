# NEXTWAY — recupero controllato della baseline schema-only

Data: 13 novembre 2026  
Branch di riferimento: `fix/nextway-password-recovery`

## Scopo e blocco attuale

Il repository contiene le migrazioni NEXTWAY e alcuni script diagnostici, ma non contiene una baseline completa e versionata dello schema applicativo preesistente. Le migrazioni richiedono oggetti preesistenti quali `public.profiles`, `public.clients`, `public.partner_details`, `public.nextway_leads`, conversazioni/messaggi Setter e RPC di creazione Lead.

Non ricostruire tali oggetti per supposizione. Prima del collaudo locale serve una copia **schema-only** del solo schema applicativo `public`, senza righe di tabelle.

## Procedura proposta

La Supabase CLI documenta `supabase db dump` come esportazione PostgreSQL. Il dump predefinito non include dati né ruoli personalizzati; gli schemi gestiti Supabase (`auth`, `storage` e schemi extension) sono esclusi dal dump. Lo stack locale fornisce i propri schemi e servizi gestiti. Per la baseline applicativa si richiede quindi il solo schema `public`.

Comando previsto con CLI v3:

```bash
supabase db dump --remote=obqwbtlltxjfeirstsya --schema public --file /tmp/nextway-public-schema.sql
```

- È una lettura/esportazione dello schema dal database remoto; non applica SQL e non modifica il database remoto.
- Non aggiungere `--data-only`, `--role-only`, `db push`, `migration up`, `link` o comandi di deploy.
- Se la CLI chiede la password del database, inserirla soltanto nel prompt locale del Terminale. Non incollarla in chat, non inserirla nella riga di comando e non salvarla in un file versionato.
- Se il comando segnala che il target non è quello atteso, interrompere e non confermare.
- L'output va salvato in `/tmp`, non direttamente nel repository.

La sintassi effettiva va prima confrontata con `supabase db dump --help` della versione installata (3.1.0). Se l'opzione `--remote` o `--schema` non risulta disponibile, fermarsi e non sostituire automaticamente con `--linked`.

## Revisione obbligatoria prima di usare o versionare il dump

Il dump può contenere definizioni SQL e corpi delle funzioni, ma non deve contenere righe applicative. Prima di importarlo localmente:

1. controllare intestazione e target indicato dalla CLI;
2. verificare che non compaiano `COPY`, `INSERT INTO` o blocchi di dati;
3. controllare le definizioni di funzioni per eventuali valori hard-coded, URL privati o segreti;
4. verificare che siano presenti le tabelle e le RPC prerequisito richieste dalle migrazioni;
5. rimuovere eventuali oggetti specifici di produzione che non devono essere ricreati in locale, documentando ogni esclusione;
6. non committare il dump finché non è stato revisionato e depurato. In caso di dubbio tenerlo fuori dal repository.

## Limiti e completezza

- Il dump `public` non esporta le strutture gestite `auth` e `storage`; queste devono essere fornite dalla versione locale dello stack Supabase.
- Il dump predefinito non esporta ruoli personalizzati. Ruoli e grant vanno confrontati con i ruoli standard del runtime locale; non aggiungere un dump ruoli senza revisione separata.
- Un dump dello schema attuale non sostituisce la cronologia delle migrazioni. Occorre riconciliare la baseline con le 31 migrazioni presenti nel branch, distinguendo gli oggetti già inclusi nella baseline da quelli creati dalle migrazioni.
- Non esportare dati da `auth.users`, `profiles`, `clients`, `partner_details`, Lead, conversazioni o documenti.
- I seed locali saranno creati separatamente e con valori sintetici, solo dopo aver validato schema e vincoli.

## Protezioni operative

- Nessun collegamento persistente della directory locale al progetto remoto.
- Nessuna migrazione, scrittura SQL, creazione di utenti, invito o invio email.
- Nessun deploy, merge, modifica a `main` o a Netlify produzione.
- Nessuna creazione di progetto cloud o spesa.
- Non eseguire `supabase init` nella directory di lavoro esistente finché non è stata definita una procedura che preservi integralmente `supabase/` e `supabase/.temp/`.

## Stato

- Inventario dipendenze: completato staticamente.
- Baseline schema-only completa: non disponibile nel repository.
- Esportazione schema-only remota: da eseguire solo dopo verifica della sintassi CLI 3.1.0 e conferma del target.
- Import locale: non eseguito.
- Migrazioni/test runtime: non eseguiti.


## Esito effettivo del recupero — 13 novembre 2026

La procedura descritta sopra è stata eseguita con Supabase CLI 3.1.0, dopo aver controllato `supabase db dump --help`. Il dump è stato prodotto in `/tmp/nextway-public-schema.sql` dal progetto identificato dalla CLI come `nextway-platform` (ref `obqwbtlltxjfeirstsya`).

- File: circa 154 KB / 3.615 righe.
- SHA-256: `5622e4e5864c6860241f04ad6ecff6c08a1d7a61c37a062b50772fa704a9f32d`.
- Nessuna occorrenza di istruzioni `COPY` o `INSERT INTO` nei controlli eseguiti.
- Inventario strutturale rilevato: 21 tabelle, 22 funzioni `SECURITY DEFINER`, 53 policy RLS, 11 trigger e 48 indici.
- Le definizioni esaminate includono impostazioni `search_path`; il dump usa `CREATE OR REPLACE TRIGGER`.
- Nessuna migrazione o scrittura SQL è stata eseguita sul database remoto.

Il dump resta in `/tmp` e non è stato committato. La sua revisione è **strutturalmente promettente ma non conclusiva**: occorre ancora confrontare i nomi e le definizioni degli oggetti uno per uno con le 31 migrazioni, controllare tipi, sequenze, ownership, grant, FK e dipendenze. I conteggi non sono una certificazione di importabilità.

È stato creato `docs/NEXTWAY-BASELINE-MIGRATION-RECONCILIATION.md` con l'inventario statico delle 31 migrazioni, le dipendenze managed Auth/Storage, i limiti probatori e la sequenza di costruzione sicura.

### Stato aggiornato

- Esportazione schema-only: **COMPLETATA**.
- Controllo assenza di righe dati: **COMPLETATO nei controlli effettuati**.
- Riconciliazione puntuale dump/migrazioni: **DA COMPLETARE**.
- Import locale, configurazione CLI, seed e test runtime: **NON ESEGUITI**.
- Nessuna modifica al database remoto, deploy, merge o intervento su `main`.
