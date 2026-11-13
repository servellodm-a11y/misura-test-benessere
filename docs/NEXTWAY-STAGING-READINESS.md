# NEXTWAY — Readiness dell'ambiente staging

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Esito: **PREPARAZIONE AVANZATA; NON ANCORA PRONTO PER CREARE/APPLICARE LE MIGRAZIONI**.

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

### B2 — baseline core: manifest preparato, schema completo ancora necessario

Le migrazioni versionate non costituiscono, da sole, una ricostruzione completa e autonoma del database applicativo già esistente. Diverse migrazioni presuppongono tabelle preesistenti come:
- `public.profiles`;
- `public.nextway_leads`;
- `public.nextway_setter_conversations`;
- `public.nextway_setter_messages`;
- `public.partner_details`;
- `public.clients`.

La migrazione iniziale `20261105000100_nextway_ai_assistant_foundation.sql` crea le tabelle del modulo AI Assistant (`nw_*`), non una baseline completa di queste tabelle core.

**Preparazione completata:** creato `docs/NEXTWAY-STAGING-BASELINE-MANIFEST.md` con gli oggetti core preesistenti, le colonne minime note, le strutture create dalle migrazioni e le esclusioni sui dati.

**Conseguenza:** non si deve creare uno staging vuoto e lanciare tutte le migrazioni alla cieca. Serve ancora la baseline SQL schema-only, sanitizzata e revisionata, oppure un processo documentato che ricostruisca in modo ripetibile lo schema core senza importare dati personali o dati di produzione.

### B3 — trigger Setter: riallineamento dopo la separazione delle tabelle

La migrazione `20261110000700_nextway_clear_stale_staged_output.sql` installa un trigger su `public.nextway_setter_generation_requests` e assegna `NEW.generated_output := null`.

La tabella creata dalla migrazione `20261110000200_nextway_setter_idempotency.sql` non dichiara la colonna `generated_output`; dichiara invece `response`. La successiva migrazione `20261112020000_nextway_setter_generation_table_isolation.sql` crea una tabella distinta, `nextway_setter_workspace_generation_requests`, che contiene `generated_output`, e dichiara esplicitamente di preservare la tabella legacy.

**Riallineamento preparato sul branch:** `20261113150000_nextway_setter_stale_output_trigger_workspace_fix.sql` rimuove il trigger non più necessario dalla tabella legacy e installa la protezione sulla tabella workspace, usando `owner_profile_id`, `idempotency_key` e `conversation_id`. La migrazione è forward-only e verifica preventivamente la presenza della tabella/colonne richieste. Il test statico dedicato è `scripts/test-nextway-setter-stale-output-trigger.mjs`.

**Stato:** preparata; CI superata (run `43412386590`). Il contratto statico è stato corretto per riflettere la cronologia reale delle colonne legacy; la migrazione non è stata eseguita su PostgreSQL e resta da sottoporre a test runtime in staging.

### B4 — migrazioni Setter: transizione da eseguire senza traffico intermedio

La sequenza effettiva è:

1. `20261110000200`: crea la tabella legacy `nextway_setter_generation_requests` con `user_id`, `response` e chiave idempotenza.
2. `20261110000500`: aggiunge `generated_output` alla tabella legacy.
3. `20261110000700`: installa il trigger coerente con quello schema legacy.
4. `20261111240000`: introduce una definizione workspace-aware usando `CREATE TABLE IF NOT EXISTS` sullo stesso nome legacy e ridefinisce le RPC correnti per il nuovo modello. Su una catena pulita, la tabella esiste già con la forma legacy; la migrazione è quindi uno stato intermedio e non deve ricevere traffico applicativo.
5. `20261112020000`: crea `nextway_setter_workspace_generation_requests`, sposta le RPC correnti sulla tabella dedicata e preserva la tabella legacy per la retention storica.
6. `20261113150000`: disattiva il trigger legacy non più necessario al percorso RPC corrente e installa la protezione sulla tabella workspace.

**Conseguenza operativa:** in staging, completare l'intera sequenza di migrazioni prima di avviare l'applicazione o eseguire test AI Setter. Non eseguire prove intermedie tra `20261111240000` e `20261112020000`. Il test statico di isolamento controlla che le quattro RPC correnti usino esclusivamente la tabella workspace.

**Precisazione:** il commento storico in testa alla migrazione 120200 parla di tabella legacy conservata per le RPC originali; in realtà le RPC con le stesse firme vengono sostituite e reindirizzate alla tabella workspace. La tabella legacy resta per compatibilità strutturale e retention, non per il percorso RPC corrente.

## 3. Ordine di preparazione richiesto

1. Ottenere una baseline schema-only completa e sanitizzata del database core, senza righe applicative, utenti Auth, storage objects, segreti o dati personali.
2. Confrontare la baseline con le migrazioni versionate e definire quali oggetti sono baseline preesistenti e quali sono creati dalle migrazioni.
3. Verificare CI e sottoporre a revisione SQL il riallineamento forward-only del trigger Setter; preservare la compatibilità senza riscrivere migrazioni storiche già applicate.
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
| Riallineamento trigger Setter dopo isolamento | PREPARATO, CI SUPERATA (run 43412838823); runtime DA ESEGUIRE |
| Progetto Supabase staging | NON CREATO |
| Test PostgreSQL/Auth/concorrenza | NON ESEGUITI |
| Progetto reale | NON MODIFICATO |

## 6. Criterio per dichiarare lo staging pronto

Lo staging sarà pronto solo quando B1–B4 saranno risolti, la catena migrazioni sarà riproducibile su uno schema pulito, i controlli di sicurezza saranno superati e il progetto separato sarà stato creato con autorizzazione esplicita.

Fino a quel momento, la scelta corretta è non avviare un collaudo runtime che potrebbe fallire per difetti strutturali già individuabili staticamente.
