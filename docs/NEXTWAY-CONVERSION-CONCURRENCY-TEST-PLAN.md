# NEXTWAY — Piano di collaudo concorrenza conversioni

Data preparazione: 12 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Stato: **preparato, non eseguito**.

## Obiettivo

Verificare su un ambiente Supabase di staging isolato che la finalizzazione della conversione Lead -> cliente/partner sia atomica e serializzata rispetto a un aggiornamento concorrente del Lead (cambio stato o archiviazione).

Il collaudo non deve utilizzare il progetto Supabase di produzione, dati reali, email reali o account reali.

## Prerequisiti obbligatori

1. Progetto Supabase di staging distinto dal progetto di produzione, con schema e migrazioni allineati al branch da testare.
2. Backup o reset completo dello staging prima e dopo il test.
3. Due connessioni PostgreSQL indipendenti (Sessione A e Sessione B), con permessi di test controllati.
4. Fixture sintetiche dedicate: profilo proprietario, Lead in stato `In valutazione`, richiesta conversione già revisionata e in stato `provisioning` con claim token noto.
5. Per i test cliente: nessuna chiamata Auth e nessuna email. Per il test partner: soltanto un account Auth sintetico nello staging, con indirizzo email controllato e cancellazione verificata a fine test.
6. Registrare ID fixture e risultati senza esportare token o credenziali.

**Stop immediato** se l'URL/host del database non identifica con certezza lo staging. Non usare il database di produzione.

## Test A — Lead già archiviato

- Preparare una richiesta cliente in stato `provisioning` e un Lead attivo in `In valutazione`.
- Archiviare il Lead con un'operazione autenticata di staging.
- Invocare `nextway_finalize_conversion_activation` con request ID e claim token sintetici.
- Atteso: la RPC fallisce perché non trova un Lead attivo convertibile.
- Verificare che non esista alcun record `clients` collegato alla richiesta; la richiesta non deve risultare `activated`; il Lead deve restare archiviato.
- Verificare il rilascio del claim tramite la Edge Function o, nel test SQL isolato, tramite la RPC di release con lo stesso claim token.

## Test B — Lead con stato cambiato

- Preparare una seconda richiesta cliente in `provisioning`.
- Cambiare il Lead da `In valutazione` a `Non interessato`.
- Invocare la finalizzazione.
- Atteso: errore controllato; nessun record cliente; richiesta non `activated`; stato Lead invariato rispetto alla modifica concorrente.

## Test C — Gara concorrente: aggiornamento Lead vince il lock

Usare due sessioni PostgreSQL indipendenti e due fixture sintetiche nuove.

**Sessione A**
1. Avviare una transazione.
2. Bloccare la riga Lead con `SELECT ... FOR UPDATE`.
3. Cambiare lo stato da `In valutazione` a `Non interessato`.
4. Mantenere la transazione aperta per alcuni secondi, così Sessione B resta in attesa.
5. Eseguire COMMIT.

**Sessione B**
1. Durante l'attesa della Sessione A, invocare la finalizzazione con il claim valido.
2. La chiamata deve attendere il rilascio del lock.
3. Dopo il COMMIT di A, la query `SELECT ... FOR UPDATE` della funzione deve rivalutare il predicato e non trovare più un Lead convertibile.

**Atteso:** la finalizzazione fallisce; nessun cliente/partner viene creato; la richiesta non passa ad `activated`; il Lead resta `Non interessato`.

## Test D — Gara concorrente: finalizzazione vince il lock

- Sessione A invoca la finalizzazione e mantiene la transazione fino al commit.
- Sessione B tenta di cambiare lo stato o archiviare lo stesso Lead mentre A detiene il lock.
- Atteso: B attende il commit di A. La conversione viene completata una sola volta e il Lead assume lo stato `Convertito cliente` o `Convertito partner`.
- Dopo il commit, un eventuale archiviazione successiva è una seconda operazione sequenziale, non una conversione parziale. Verificare che non modifichi il collegamento tra richiesta, Lead e record di destinazione.

## Test E — Rollback per errore a valle

- Preparare una richiesta e un Lead validi.
- Indurre in staging un errore controllato durante la creazione del record di destinazione (ad esempio vincolo univoco già occupato da una fixture isolata).
- Invocare la finalizzazione.
- Atteso: rollback completo; Lead ancora in `In valutazione`; richiesta ancora `provisioning` con claim valido; nessun nuovo record cliente/partner parziale.

## Test F — Idempotenza

- Eseguire una finalizzazione cliente valida.
- Ripetere la chiamata con lo stesso request ID e claim token.
- Atteso: risposta `already_activated`; nessun secondo cliente/partner; nessuna seconda transizione del Lead.

## Evidenze da raccogliere

Per ogni test registrare:
- esito e durata;
- stato iniziale/finale della richiesta;
- stato iniziale/finale del Lead;
- conteggio record cliente/partner collegati al request ID;
- eventuale codice SQLSTATE;
- conferma di rollback o commit.

Non registrare email personali, JWT, claim token, service-role key o contenuti sensibili nei log.

## Criteri di superamento

Tutti i test A–F devono superare. In particolare:
- nessun record di destinazione se il Lead non è convertibile;
- nessuna richiesta `activated` senza transizione coerente del Lead;
- nessun doppio record in caso di retry;
- rollback completo in caso di errore a valle;
- gara concorrente serializzata tramite lock della riga Lead.

## Limiti e stato

- Questo documento è un piano operativo, non una prova eseguita.
- Nessuna connessione a un database di staging è stata effettuata in questa fase.
- Nessuna migrazione è stata applicata e nessun dato, account o invito è stato creato.
- Il test deve essere eseguito soltanto dopo aver predisposto e identificato esplicitamente un progetto di staging separato.
