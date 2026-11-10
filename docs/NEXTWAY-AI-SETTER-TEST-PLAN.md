# NEXTWAY AI Setter — piano di collaudo

## Stato e prerequisiti

Questo documento descrive il collaudo da eseguire nell'ambiente Supabase prima dell'attivazione. La presenza delle migrazioni nel repository **non significa che siano state applicate al progetto Supabase**. Non considerare superato alcun test finché non è stato eseguito e registrato nell'ambiente.

Applicare le migrazioni in ordine cronologico, dopo aver verificato lo stato effettivo dello schema:

1. `20261110000100_nextway_distributed_rate_limit.sql`
2. `20261110000200_nextway_setter_idempotency.sql`
3. `20261110000300_nextway_rate_limit_units.sql`
4. `20261110000400_nextway_idempotency_retention.sql`
5. `20261110000500_nextway_setter_output_recovery.sql`
6. `20261110000600_nextway_setter_output_authorization_hardening.sql`
7. `20261110000700_nextway_clear_stale_staged_output.sql`

La migrazione 007 elimina l'output temporaneo quando una prenotazione pending viene riassegnata a un altro utente, a un'altra chiave o a un'altra conversazione. Evita che il nuovo titolare recuperi una risposta OpenAI generata per la prenotazione precedente.

## Test database e autorizzazioni

- [ ] Utente non autenticato: tutte le RPC protette rifiutano la chiamata.
- [ ] Utente proprietario: può iniziare e completare una generazione sulla propria conversazione.
- [ ] Utente non proprietario e non amministratore: non può iniziare, salvare o recuperare output.
- [ ] `platform_admin`: può operare secondo le autorizzazioni previste; la revoca del ruolo deve essere efficace alle chiamate successive.
- [ ] Conversazione con `owner_profile_id` nullo: salvataggio e recupero output falliscono in modo chiuso (fail-closed).
- [ ] Conversazione `closed` o `archived`: nessun output temporaneo viene salvato o restituito.
- [ ] Chiusura concorrente: se la conversazione viene chiusa durante la chiamata OpenAI, la fase di staging o il completamento finale rifiuta il salvataggio.
- [ ] Prenotazione scaduta riassegnata: il trigger 007 azzera `generated_output` quando cambia `user_id`, `idempotency_key` o `conversation_id`.
- [ ] Stessa chiave e stesso utente dopo errore di commit: l'output temporaneo valido viene recuperato senza una nuova generazione.
- [ ] Stessa chiave già completata: viene restituita la risposta memorizzata senza creare un secondo messaggio.
- [ ] Due chiavi concorrenti sulla stessa conversazione: una sola prenotazione pending viene acquisita.
- [ ] Prenotazione pending scaduta: può essere recuperata; verificare che l'output precedente non sopravviva al trasferimento.
- [ ] RPC di rate limit: limite AI Setter 5 unità/minuto per utente; ricerca pubblica massimo 10 query/minuto per utente.
- [ ] RPC rate limit indisponibile: endpoint fail-closed con HTTP 503; limite superato: HTTP 429.

## Test Edge Function AI Setter

- [ ] Richiesta senza Bearer token: HTTP 401.
- [ ] Origine non autorizzata: HTTP 403.
- [ ] Metodo diverso da POST/OPTIONS: HTTP 405.
- [ ] JSON malformato, body non-oggetto, UUID non valido o goal non ammesso: HTTP 400.
- [ ] Body superiore a 16 KB: HTTP 413.
- [ ] Conversazione non accessibile: HTTP 404 senza divulgare dati.
- [ ] Conversazione chiusa/archiviata prima dell'avvio: HTTP 409.
- [ ] Conversazione chiusa durante staging: HTTP 409 e nessuna bozza salvata.
- [ ] Conversazione chiusa durante completamento: HTTP 409 e nessuna bozza salvata.
- [ ] Risposta OpenAI incompleta, vuota o non conforme allo schema: nessuna bozza salvata.
- [ ] Errore temporaneo di staging: risposta controllata; retry con la stessa chiave non deve generare una seconda bozza duplicata.
- [ ] Output già staged e lease valida: retry recupera il risultato senza chiamare OpenAI.
- [ ] La risposta finale contiene `sent: false` e `approved: false`.
- [ ] Nessuna chiamata o funzione invia messaggi a prospect o clienti.

## Test frontend

- [ ] Sessione assente o scaduta: messaggio chiaro, nessuna generazione.
- [ ] Doppio clic sul pulsante: una sola richiesta per scheda.
- [ ] Timeout o risposta HTTP di errore: la chiave idempotente resta disponibile per il retry.
- [ ] Completamento positivo: la chiave viene rimossa e la bozza viene mostrata.
- [ ] La bozza può essere copiata; non esiste invio automatico.
- [ ] Conversazioni chiuse/archiviate sono chiaramente distinguibili o non selezionabili (miglioria UX da verificare).

## Test ricerca pubblica Tavily

- [ ] Da 1 a 5 query, ciascuna lunga 1–400 caratteri.
- [ ] 6 query o query vuota/troppo lunga: HTTP 400.
- [ ] Risultati parziali: i risultati delle query riuscite vengono conservati e le query fallite sono indicate nei metadati.
- [ ] Tutte le query fallite: errore controllato, senza risultati inventati.
- [ ] URL restituiti: solo HTTP/HTTPS; titolo, snippet, data e score sono normalizzati.
- [ ] Il contatore consuma un'unità per ogni query tentata, anche in caso di errore del provider.

## Criteri di accettazione

Il collaudo è superato solo quando:
1. tutte le migrazioni sono state applicate senza errori nell'ordine previsto;
2. i test di autorizzazione, concorrenza, idempotenza e recupero output sono superati;
3. le Edge Functions sono distribuite su Supabase e testate con sessioni reali;
4. il frontend viene verificato sul sito pubblicato dopo il ripristino dei deploy Netlify;
5. viene confermato che nessun messaggio è inviato automaticamente.

Fino al completamento di questi passaggi, il codice è da considerare preparato nel repository, non validato in produzione.
