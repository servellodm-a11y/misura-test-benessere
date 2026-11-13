# NEXTWAY — Protocollo di collaudo staging del ciclo Partner

Data: 13 novembre 2026  
Branch di riferimento: `fix/nextway-password-recovery`  
Stato: protocollo preparato; nessun test runtime eseguito.

## 1. Regola di isolamento

Il collaudo deve avvenire in un progetto Supabase staging distinto da `nextway-platform`.

Non usare il progetto reale per:
- applicare le migrazioni candidate;
- creare utenti Auth, inviti, membership, profili, Lead o richieste di prova;
- inviare email;
- simulare concorrenza o cleanup;
- provare la cancellazione di account.

Lo staging deve avere:
- progetto e URL separati, chiaramente etichettati STAGING;
- schema e migrazioni candidate revisionati e applicati solo allo staging;
- credenziali e secret distinti, senza riutilizzare service-role key o secret di produzione;
- redirect URL che puntano esclusivamente al dominio staging;
- SMTP sandbox / Mailpit / inbox di test controllata, senza destinatari reali;
- dati sintetici e nessun dato personale reale;
- log accessibili per Auth, Edge Functions e database.

Non creare il progetto staging o sostenere costi senza una decisione esplicita. Questo documento non autorizza operazioni remote.

## 2. Prerequisiti di fixture

Preparare esclusivamente nello staging:
- un utente Auth platform_admin;
- due utenti Auth partner di test, con email di test controllate;
- profili `profiles` e righe `partner_details` coerenti;
- un Lead convertibile per ciascun partner;
- almeno un Lead legacy con `workspace_id IS NULL`;
- due workspace attivi e membership attive per le prove di isolamento;
- nessuna richiesta attiva preesistente sui Lead usati.

Le email devono essere indirizzi sintetici appartenenti all'inbox sandbox. Non usare `example.invalid` per i test di consegna email: quel dominio serve solo alle fixture SQL che non inviano messaggi.

## 3. Sequenza di collaudo

### Fase A — installazione controllata

1. Creare il progetto staging separato.
2. Applicare allo staging lo schema base e le migrazioni candidate nell'ordine previsto, dopo revisione del diff.
3. Verificare che tutte le RPC richieste esistano, con firma, owner, SECURITY DEFINER, search_path e grants attesi.
4. Verificare RLS, policy, trigger, indici e vincoli.
5. Verificare che il progetto reale `nextway-platform` non sia stato selezionato per errore.

### Fase B — PostgreSQL transazionale senza Auth

Eseguire in staging il file:

`supabase/diagnostics/nextway_partner_cancellation_transactional_test.sql`

Il test:
- interrompe l'esecuzione se mancano migrazioni o fixture;
- richiede un partner, un Lead legacy libero e un platform_admin;
- crea tre richieste tramite la RPC applicativa;
- prova annullamento da `pending`, da `ready_for_activation` e da `provisioning`;
- verifica retry idempotente, conservazione dei dati di revisione e invalidazione del claim;
- prova che claim, release tardivo e finalizer non possano riattivare la richiesta annullata;
- non crea utenti Auth, non invia email e termina con `ROLLBACK`.

Esito richiesto: tutte le asserzioni passano; nessun record di test resta persistente.

Eseguire inoltre `nextway_conversion_workspace_isolation_transactional_test.sql` solo quando sono disponibili due partner e i relativi Lead. Anche questo test è rollback-only.

### Fase C — concorrenza PostgreSQL a due sessioni

Queste prove non possono essere sostituite da test statici o da una singola transazione.

Usare due sessioni SQL indipendenti nello staging, con una richiesta di test già portata allo stato indicato. Conservare ID richiesta e claim token solo nell'ambiente staging.

**C1 — finalizzazione vince**
1. Sessione A apre una transazione e acquisisce il lock della richiesta con lo stesso ordine di lock usato dal finalizer.
2. Sessione A completa la finalizzazione e fa COMMIT.
3. Sessione B invoca l'annullamento mentre A detiene il lock.
4. Dopo il commit di A, B deve ricevere il rifiuto previsto per una richiesta `activated`.
5. Verificare che esista una sola conversione e una sola membership; nessun metadato di annullamento.

**C2 — annullamento vince**
1. Sessione A invoca l'RPC di annullamento e mantiene aperta la transazione.
2. Sessione B tenta la finalizzazione con il claim token precedente.
3. B deve attendere il lock.
4. A esegue COMMIT.
5. B deve essere respinta perché la richiesta è `cancelled`; nessun profilo, partner_details o membership deve essere creato dal finalizer tardivo.

**C3 — claim contro annullamento**
- Avviare claim e annullamento quasi simultaneamente su due sessioni.
- Deve riuscire una sola transizione coerente.
- Se vince l'annullamento, il claim non deve restare valido.
- Se vince il claim, l'annullamento può successivamente vincere sullo stato `provisioning`, invalidando il token.

**C4 — retry e doppia chiamata**
- Due invocazioni di annullamento: una sola scrittura; la seconda deve restituire `already_cancelled` senza cambiare motivo, attore o timestamp.
- Due claim concorrenti: un solo claim valido.
- Due finalizzazioni concorrenti: una sola conversione.

Registrare tempi di attesa, esito SQLSTATE e stato finale. Non interpretare un timeout del client come prova che la transazione sia fallita: leggere lo stato dal database prima di qualsiasi retry.

### Fase D — Supabase Auth ed Edge Function

Usare esclusivamente account e inbox sandbox.

| Caso | Risultato richiesto |
|---|---|
| Nuova richiesta Partner | Un solo invito Auth con metadata della richiesta corretta |
| Invito reinviato a utente non confermato | Stesso Auth user ID, stessa email e metadata request ID |
| Invito già accettato | Riutilizzo dello stesso utente; nessun reinvio e nessuna cancellazione |
| Email già usata da account non collegato | Fail closed; nessuna associazione automatica |
| Metadata request ID non corrispondente | Fail closed |
| Retry dopo timeout | Nessun duplicato; stato letto prima del retry |
| Finalizzazione completata | Profilo Partner e partner_details coerenti; membership `invited` |
| Accettazione invito | Email confermata; nessuna attivazione workspace automatica |
| Attivazione admin | Solo membership invited, workspace attivo, email confermata e conversione/utente/workspace corrispondenti |
| Annullamento prima della finalizzazione | Finalizer respinto; claim non più valido |
| Errore dopo invito creato nel tentativo corrente | Cleanup solo se Auth conferma che l'email non è stata confermata |
| Errore dopo recupero invito precedente | L'account recuperato non viene eliminato |
| Account confermato durante la gara con annullamento | Mai cancellare l'account Auth; registrare per riconciliazione manuale |

**Attenzione al caso di gara Auth:** se l'invito viene accettato mentre l'annullamento prevale sulla finalizzazione, l'account Auth confermato non viene cancellato (protezione intenzionale). Potrebbe quindi rimanere un account Auth senza profilo NEXTWAY, associato nei metadata a una richiesta `cancelled`. Il test deve rilevarlo e documentare una procedura amministrativa di riconciliazione; non deve tentare una cancellazione automatica.

### Fase E — autorizzazioni e isolamento

Verificare almeno:
- anon e utente autenticato non admin non possono annullare;
- platform_admin può annullare solo tramite RPC autorizzata;
- authenticated non può aggiornare direttamente i metadati di annullamento;
- service_role non ha EXECUTE sulla RPC di annullamento;
- un utente non può leggere o convertire dati di un workspace senza membership attiva;
- `invited`, `suspended` e `workspace_viewer` non ottengono accesso alla proiezione clienti;
- accesso diretto alla tabella attribuzioni resta negato;
- le richieste legacy con workspace NULL conservano il comportamento previsto;
- i log non espongono claim token, service-role key o dati Auth sensibili.

## 4. Criteri di accettazione

Il ciclo Partner può essere considerato collaudato solo quando:
1. test SQL rollback-only superato;
2. gare concorrenti C1–C4 superate su PostgreSQL;
3. invito, reinvio, accettazione e riuso account testati con Auth reale di staging;
4. membership invited → active testata con autorizzazioni corrette;
5. cleanup e account confermati orfani verificati;
6. RLS, audit e grants verificati;
7. evidenze e versioni testate registrate nel MASTER.

Un workflow GitHub verde o un test statico non sostituisce nessuno di questi risultati runtime.

## 5. Stato

- Protocollo: preparato sul branch.
- Test transazionale Partner: preparato, non eseguito.
- Test workspace A/B: preparato, non eseguito.
- PostgreSQL concorrente: da eseguire in staging.
- Supabase Auth: da eseguire in staging.
- Progetto staging: non creato.
- Progetto reale `nextway-platform`: non modificato.
- Nessuna migrazione applicata, nessun deploy, nessuna email o account di test creati.
- `main` invariato; PR #1 resta draft e non mergeata.
