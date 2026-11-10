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

Il modello attualmente documentato garantisce al proprietario e a `platform_admin` l'accesso ai Lead. L'AI Setter legge conversazione e Lead tramite il JWT e le policy RLS; le RPC idempotenti consentono la generazione solo al proprietario della conversazione o a `platform_admin`. La visibilità gerarchica per sponsor, team leader e director non deve essere aggiunta finché non sono definite regole precise basate sulla relazione organizzativa. Il solo ruolo non deve mai concedere accesso ai dati di altri partner.

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
- [ ] Partner B non può leggere lo storico né generare bozze sulla conversazione di Partner A.
- [ ] Sponsor, team leader e director non ottengono accesso a Lead/conversazioni altrui per il solo ruolo.
- [ ] Platform admin può leggere lo storico e generare bozze su conversazioni altrui secondo la policy admin.
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
- [ ] Una conversazione già chiusa o archiviata restituisce HTTP 409 prima della generazione.
- [ ] Se una conversazione viene chiusa durante la chiamata OpenAI, la RPC di completamento la ricontrolla sotto lock, non salva la bozza e l'Edge Function restituisce HTTP 409.
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
- [ ] Simulare errore del commit finale dopo lo staging dell'output OpenAI: il retry con la stessa chiave recupera l'output e non richiama OpenAI.
- [ ] Simulare output temporaneo assente: il retry può generare nuovamente solo dopo aver riacquisito una prenotazione valida.
- [ ] Verificare che un altro partner non possa leggere o sovrascrivere l'output temporaneo.
- [ ] Verificare che inserimento messaggio e memorizzazione della risposta siano atomici: nessun messaggio duplicato in caso di ripetizione.
- [ ] Verificare isolamento: chiave di Partner A non leggibile né riutilizzabile da Partner B.
- [ ] La tabella ha vincolo univoco su `(user_id, idempotency_key)` e indice univoco parziale su `conversation_id` per le richieste pending; non è direttamente accessibile ai ruoli applicativi.
- [ ] Le RPC sono eseguibili da authenticated ma non da anon; le funzioni SECURITY DEFINER verificano proprietario conversazione o platform_admin e non espongono la tabella direttamente ai ruoli applicativi.
- [ ] Verificare che il frontend riutilizzi la stessa chiave in caso di ritentativo nella stessa sessione e la cancelli solo dopo una risposta positiva.

### 6. Retention e manutenzione idempotenza
- [ ] Applicare `20261110000400_nextway_idempotency_retention.sql` solo dopo le migrazioni precedenti.
- [ ] Utente partner autenticato: esecuzione di `nextway_prune_setter_generation_requests()` negata.
- [ ] Platform admin: esecuzione consentita e restituisce conteggi separati.
- [ ] Record completati aggiornati negli ultimi 30 giorni: conservati.
- [ ] Record completati più vecchi di 30 giorni: eliminati.
- [ ] Prenotazioni pending con lease scaduta da meno di 24 ore: conservate.
- [ ] Prenotazioni pending con lease scaduta da oltre 24 ore: eliminate.
- [ ] La pulizia retention elimina anche il campo output temporaneo solo insieme al record idempotente scaduto.
- [ ] Verificare che nessun cron o job automatico sia stato creato: la pulizia è manuale.
- [ ] Documentare che una chiave completata oltre la retention non garantisce più il replay idempotente.

### 7. Ricerca web
- [ ] Corpo richiesta oltre 16 KB restituisce HTTP 413 prima di contattare Tavily.
- [ ] JSON malformato, array o valori non-oggetto restituiscono HTTP 400.
- [ ] Da 1 a 5 query, ciascuna entro 400 caratteri.
- [ ] Massimo 10 risultati per query.
- [ ] Timeout Tavily restituisce errore controllato.
- [ ] HTTP 429 del provider viene gestito senza esporre credenziali.
- [ ] URL risultato limitati a HTTP/HTTPS.
- [ ] Risposte upstream malformate non interrompono la funzione con errore non gestito.
- [ ] I risultati restano candidati da verificare: non diventano Lead automaticamente.

### 7. Ricerca Tavily parziale e resilienza provider
- [ ] Inviare 6 query: richiesta rifiutata HTTP 400, nessun troncamento silenzioso.
- [ ] Inviare una query vuota o oltre 400 caratteri: richiesta rifiutata HTTP 400.
- [ ] Con 3 query, simulare successo della prima, timeout della seconda e successo della terza: la risposta contiene i risultati 1 e 3 e segnala una query fallita.
- [ ] Verificare `queries_requested`, `queries_completed`, `queries_failed` e `partial`.
- [ ] Se tutte le query falliscono, la funzione restituisce un errore HTTP controllato e non una risposta di successo vuota.
- [ ] Verificare che i dettagli di errore non espongano API key, header Authorization o contenuti interni del provider.
- [ ] Verificare che il consumo rate limit conteggi tutte le query tentate anche quando una o più chiamate Tavily falliscono.

### 8. Costi e abuso
- [ ] Applicare in ambiente di test nell'ordine `20261110000100_nextway_distributed_rate_limit.sql`, `20261110000200_nextway_setter_idempotency.sql`, `20261110000300_nextway_rate_limit_units.sql`, `20261110000400_nextway_idempotency_retention.sql`, `20261110000500_nextway_setter_output_recovery.sql`.
- [ ] AI Setter: 5 generazioni nella stessa finestra per utente ammesse; la sesta restituisce HTTP 429.
- [ ] Ricerca Tavily: 10 query complessive nella stessa finestra per utente ammesse; l'unità che supera 10 restituisce HTTP 429.
- [ ] Una richiesta di ricerca con 5 query consuma 5 unità, non una sola; due richieste da 5 query consumano il limite completo.
- [ ] Il contatore è condiviso tra due schede/dispositivi dello stesso utente.
- [ ] Due utenti distinti hanno contatori separati.
- [ ] A nuova finestra di 60 secondi il contatore riparte da 1.
- [ ] Se la RPC rate limit fallisce, nessuna chiamata OpenAI/Tavily parte e la funzione restituisce HTTP 503.
- [ ] Utenti anonimi non possono eseguire la RPC o leggere/modificare direttamente la tabella.
- [ ] Verificare doppio clic/ritentativo secondo la sezione Idempotenza AI Setter: stessa chiave = stessa operazione; nuova chiave = nuova generazione esplicita.
- [ ] Verificare soglie distinte: 5 generazioni AI Setter/minuto e 10 query Tavily/minuto per utente.
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
