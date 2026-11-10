# NEXTWAY AI — Piano di collaudo pre-rilascio

Documento operativo per il collaudo dopo la riattivazione dei deploy. Non eseguire questi test in produzione finché le Edge Functions aggiornate non sono state pubblicate.

## Stato e vincoli

- Il codice viene preparato su GitHub.
- Il deploy Netlify è sospeso per esaurimento dei crediti fino al 4 dicembre 2026.
- La pubblicazione delle Edge Functions Supabase non è ancora verificata.
- Non eseguire la migrazione `20261105000100_nextway_ai_assistant_foundation.sql`.
- Non usare mai la service-role key nel browser.
- L'AI Setter deve soltanto generare e salvare bozze: nessun invio automatico.

## Matrice di autorizzazione da verificare

| Identità | Lead propri | Lead altrui | Storico conversazioni |
|---|---|---|---|
| Partner | Consentito | Negato | Solo conversazioni accessibili tramite RLS |
| Sponsor | Da definire e verificare | Non concedere per supposizione | Da definire |
| Team leader | Da definire e verificare | Non concedere per supposizione | Da definire |
| Director | Da definire e verificare | Non concedere per supposizione | Da definire |
| Platform admin | Consentito su tutti | Consentito | Consentito secondo policy admin |

Il modello attualmente documentato garantisce al proprietario e a `platform_admin` l'accesso ai Lead. La visibilità gerarchica per sponsor, team leader e director non deve essere aggiunta finché non sono definite regole precise basate sulla relazione organizzativa.

## Test funzionali

### 1. Autenticazione e sessione
- [ ] Utente non autenticato: lettura e scrittura rifiutate.
- [ ] Token scaduto o non valido: risposta 401.
- [ ] Utente autenticato: può operare secondo le policy del proprio account.
- [ ] Chiave publishable presente nel client; service-role key assente.

### 2. Lead e isolamento
- [ ] Partner A crea un Lead: owner_profile_id coincide con l'utente autenticato.
- [ ] Partner A legge e modifica il proprio Lead.
- [ ] Partner B non legge, modifica o elimina il Lead di A.
- [ ] Platform admin può consultare i Lead di entrambi.
- [ ] URL duplicato per lo stesso proprietario viene rifiutato.
- [ ] Punteggi fuori scala e qualifica non supportata dai requisiti vengono rifiutati.

### 3. Creazione conversazione
- [ ] RPC crea Lead e conversazione in un'unica operazione.
- [ ] Parametri mancanti o categoria/canale non ammessi vengono rifiutati.
- [ ] Errore nella creazione non lascia record parziali.
- [ ] La conversazione appartiene al proprietario corretto.

### 4. AI Setter
- [ ] Primo contatto produce una bozza coerente con i dati disponibili.
- [ ] Follow-up considera lo storico e non ripete il testo precedente.
- [ ] Una conversazione chiusa o archiviata restituisce HTTP 409.
- [ ] Corpo richiesta oltre 16 KB restituisce HTTP 413, anche senza header Content-Length.
- [ ] JSON malformato, array o valori non-oggetto restituiscono HTTP 400.
- [ ] La generazione OpenAI termina entro il timeout di 60 secondi.
- [ ] L'output OpenAI è limitato a 1.200 token e la bozza resta entro il limite applicativo.
- [ ] ID conversazione e obiettivo non validi vengono rifiutati.
- [ ] Prospect non accessibile tramite RLS non genera bozze.
- [ ] Timeout o errore OpenAI non crea un messaggio fittizio.
- [ ] Bozza salvata con ai_generated=true, approved_by=null e sent_at=null.
- [ ] Nessuna chiamata o integrazione invia messaggi all'esterno.

### 5. Idempotenza AI Setter
- [ ] Applicare la migrazione `20261110000200_nextway_setter_idempotency.sql` in ambiente di test dopo aver verificato schema e permessi.
- [ ] Una richiesta valida con `request_id` UUID acquisisce la chiave e genera una sola bozza.
- [ ] Due richieste concorrenti dello stesso utente con stessa chiave e conversazione: una sola acquisisce la prenotazione; l'altra riceve HTTP 409.
- [ ] Due schede/dispositivi dello stesso utente con chiavi diverse sulla stessa conversazione: una sola generazione pending; l'altra riceve HTTP 409.
- [ ] Proprietario e platform_admin che tentano simultaneamente la generazione sulla stessa conversazione: una sola prenotazione pending globale; la seconda richiesta riceve HTTP 409.
- [ ] Ripetere una richiesta completata con la stessa chiave: viene restituita la stessa bozza e non viene chiamato OpenAI una seconda volta.
- [ ] Riutilizzare la stessa chiave per una conversazione diversa: richiesta rifiutata.
- [ ] Usare una nuova chiave per una rigenerazione intenzionale: viene creata una nuova bozza.
- [ ] Simulare interruzione dopo la prenotazione: la stessa chiave resta occupata per la lease e può essere riacquisita dopo 2 minuti.
- [ ] Verificare che inserimento messaggio e memorizzazione della risposta siano atomici: nessun messaggio duplicato in caso di ripetizione.
- [ ] Verificare isolamento: chiave di Partner A non leggibile né riutilizzabile da Partner B.
- [ ] La tabella ha vincolo univoco su `(user_id, idempotency_key)` e indice univoco parziale su `conversation_id` per le richieste pending; non è direttamente accessibile ai ruoli applicativi.
- [ ] Le RPC sono eseguibili da authenticated ma non da anon; le funzioni SECURITY DEFINER verificano proprietario conversazione o platform_admin e non espongono la tabella direttamente ai ruoli applicativi.
- [ ] Verificare che il frontend riutilizzi la stessa chiave in caso di ritentativo nella stessa sessione e la cancelli solo dopo una risposta positiva.

### 6. Ricerca web
- [ ] Corpo richiesta oltre 16 KB restituisce HTTP 413 prima di contattare Tavily.
- [ ] JSON malformato, array o valori non-oggetto restituiscono HTTP 400.
- [ ] Da 1 a 5 query, ciascuna entro 400 caratteri.
- [ ] Massimo 10 risultati per query.
- [ ] Timeout Tavily restituisce errore controllato.
- [ ] HTTP 429 del provider viene gestito senza esporre credenziali.
- [ ] URL risultato limitati a HTTP/HTTPS.
- [ ] Risposte upstream malformate non interrompono la funzione con errore non gestito.
- [ ] I risultati restano candidati da verificare: non diventano Lead automaticamente.

### 7. Costi e abuso
- [ ] Applicare in ambiente di test prima `20261110000100_nextway_distributed_rate_limit.sql` e poi `20261110000200_nextway_setter_idempotency.sql`.
- [ ] AI Setter: 5 richieste nella stessa finestra per utente ammesse; la sesta restituisce HTTP 429.
- [ ] Ricerca: 3 richieste nella stessa finestra per utente ammesse; la quarta restituisce HTTP 429.
- [ ] Il contatore è condiviso tra due schede/dispositivi dello stesso utente.
- [ ] Due utenti distinti hanno contatori separati.
- [ ] A nuova finestra di 60 secondi il contatore riparte da 1.
- [ ] Se la RPC rate limit fallisce, nessuna chiamata OpenAI/Tavily parte e la funzione restituisce HTTP 503.
- [ ] Utenti anonimi non possono eseguire la RPC o leggere/modificare direttamente la tabella.
- [ ] Verificare doppio clic/ritentativo secondo la sezione Idempotenza AI Setter: stessa chiave = stessa operazione; nuova chiave = nuova generazione esplicita.
- [ ] Definire soglie distinte per AI Setter e ricerca, con risposta controllata quando il limite viene raggiunto.
- [ ] Definire budget e alert per OpenAI e Tavily.
- [ ] Verificare log: nessun token, chiave o dato personale non necessario.
- [ ] Verificare comportamento in caso di provider indisponibile.

## Criteri di rilascio

Il rilascio è autorizzabile solo dopo:
1. test con due account partner distinti e un platform admin;
2. conferma delle policy RLS e dei permessi delle Edge Functions;
3. test positivo e negativo di tutte le funzioni;
4. verifica dei secrets e dei limiti di spesa;
5. conferma che nessuna funzione invii messaggi automaticamente.

Registrare per ogni test data, account/ruolo, risultato atteso, risultato ottenuto e riferimento al commit pubblicato.
