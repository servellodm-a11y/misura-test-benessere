# NEXTWAY — Readiness dell'ambiente staging

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Esito: **NON PRONTO PER LA CREAZIONE/APPLICAZIONE DELLE MIGRAZIONI**.

Questo documento registra la preparazione tecnica necessaria prima di creare un progetto Supabase staging. Non autorizza la creazione del progetto, l'applicazione di migrazioni, l'uso di credenziali remote o l'invio di email.

## 1. Ambiente separato richiesto

Lo staging dovrà essere un progetto Supabase distinto da `nextway-platform`, con:
- URL e project ref chiaramente identificati come staging;
- chiavi API e secret autonomi, mai copiati dal progetto reale;
- SMTP sandbox / Mailpit o inbox di test controllata;
- redirect URL esclusivamente staging;
- dati sintetici;
- nessun collegamento Netlify produzione;
- nessun deploy o modifica al progetto reale.

Il progetto reale resta fuori dal perimetro di tutte le prove.

## 2. Blocchi individuati nel repository

### B1 — manca la configurazione Supabase CLI versionata

Nel branch non risulta presente `supabase/config.toml`. Non è quindi disponibile una configurazione locale dichiarativa da usare per un progetto staging. Non eseguire `supabase init` automaticamente: prima occorre definire e revisionare la configurazione desiderata, inclusi Auth, Edge Functions e porte locali.

### B2 — manca una baseline completa dello schema applicativo

Le migrazioni versionate non costituiscono, da sole, una ricostruzione completa e autonoma del database applicativo già esistente. Diverse migrazioni presuppongono tabelle preesistenti come:
- `public.profiles`;
- `public.nextway_leads`;
- `public.nextway_setter_conversations`;
- `public.nextway_setter_messages`;
- `public.partner_details`;
- `public.clients`.

La migrazione iniziale `20261105000100_nextway_ai_assistant_foundation.sql` crea le tabelle del modulo AI Assistant (`nw_*`), non una baseline completa di queste tabelle core.

**Conseguenza:** non si deve creare uno staging vuoto e lanciare tutte le migrazioni alla cieca. Serve una baseline schema-only, sanitizzata e revisionata, oppure un processo documentato che ricostruisca in modo ripetibile lo schema core senza importare dati personali o dati di produzione.

### B3 — trigger legacy Setter da correggere prima del collaudo da zero

La migrazione `20261110000700_nextway_clear_stale_staged_output.sql` installa un trigger su `public.nextway_setter_generation_requests` e assegna `NEW.generated_output := null`.

La tabella creata dalla migrazione `20261110000200_nextway_setter_idempotency.sql` non dichiara la colonna `generated_output`; dichiara invece `response`. La successiva migrazione `20261112020000_nextway_setter_generation_table_isolation.sql` crea una tabella distinta, `nextway_setter_workspace_generation_requests`, che contiene `generated_output`, e dichiara esplicitamente di preservare la tabella legacy.

**Conseguenza:** la migrazione 007 non è coerente con la tabella legacy su cui installa il trigger. Va corretta o sostituita con una migrazione forward-only che rimuova il trigger legacy errato e, se ancora necessario, installi il comportamento sulla tabella workspace corretta. Non modificare retroattivamente una migrazione già potenzialmente applicata; la soluzione deve essere additiva e compatibile con entrambi gli stati già esistenti.

### B4 — migrazioni Setter legacy non certificate per una nuova installazione

Le migrazioni `20261110000400_nextway_idempotency_retention.sql` e `20261110000700_nextway_clear_stale_staged_output.sql` devono essere riconciliate con il modello legacy e con la successiva separazione della tabella workspace. La 004 opera sulla tabella legacy e va verificata rispetto alla baseline effettiva; la 007 presenta il mismatch di colonna descritto sopra.

Non classificare l'intera catena come applicabile finché la revisione non è completata.

## 3. Ordine di preparazione richiesto

1. Ottenere una baseline schema-only completa e sanitizzata del database core, senza righe applicative, utenti Auth, storage objects, segreti o dati personali.
2. Confrontare la baseline con le migrazioni versionate e definire quali oggetti sono baseline preesistenti e quali sono creati dalle migrazioni.
3. Correggere il difetto legacy 007 con migrazione forward-only, preservando la compatibilità e senza riscrivere migrazioni storiche già applicate.
4. Definire e revisionare `supabase/config.toml` per staging, senza collegare il progetto reale.
5. Preparare secret manifest con soli nomi e descrizioni, mai valori; distinguere chiavi pubbliche, service role e secret Edge Function.
6. Creare il progetto Supabase staging solo dopo autorizzazione esplicita e controllo di eventuali costi/limiti del piano.
7. Applicare schema e migrazioni soltanto allo staging, in ambiente controllato.
8. Eseguire i test SQL rollback-only, quindi i test Auth e concorrenza del protocollo `NEXTWAY-PARTNER-STAGING-TEST-PROTOCOL.md`.

## 4. Cosa non fare

- Non usare `nextway-platform` come staging.
- Non eseguire `supabase link`, `db push`, `migration up` o deploy per “vedere se funziona”.
- Non usare un dump contenente dati per creare fixture.
- Non copiare chiavi o secret tra progetti.
- Non avviare Supabase full stack sul Mac Intel da 8 GB: il limite di memoria già rilevato rende questa strada inadatta.
- Non modificare `main`, non fare merge della PR draft e non effettuare deploy Netlify prima del 4 dicembre 2026.

## 5. Stato

| Elemento | Stato |
|---|---|
| Protocollo di collaudo Partner | COMPLETATO |
| Test SQL rollback-only Partner | PREPARATO, NON ESEGUITO |
| Configurazione CLI staging | DA PREPARARE |
| Baseline schema-only core | DA PREPARARE/REVISIONARE |
| Correzione forward-only trigger Setter 007 | DA COMPLETARE |
| Progetto Supabase staging | NON CREATO |
| Test PostgreSQL/Auth/concorrenza | NON ESEGUITI |
| Progetto reale | NON MODIFICATO |

## 6. Criterio per dichiarare lo staging pronto

Lo staging sarà pronto solo quando B1–B4 saranno risolti, la catena migrazioni sarà riproducibile su uno schema pulito, i controlli di sicurezza saranno superati e il progetto separato sarà stato creato con autorizzazione esplicita.

Fino a quel momento, la scelta corretta è non avviare un collaudo runtime che potrebbe fallire per difetti strutturali già individuabili staticamente.
