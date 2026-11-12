# NEXTWAY AI Setter — Edge Function

## Stato del codice

Questo documento descrive il sorgente versionato in GitHub. La presenza del codice nel repository **non dimostra** che sia distribuito su Supabase. Prima del rilascio occorre confrontarlo con la versione live e verificare endpoint e secrets.

## Funzionamento

- Accetta richieste `POST` e preflight `OPTIONS`.
- Richiede un Bearer access token Supabase valido.
- Legge conversazione, lead e ultime 20 comunicazioni con il client autenticato e le policy RLS.
- Applica il rate limit distribuito tramite RPC prima di contattare OpenAI.
- Acquisisce una chiave idempotente server-side per ogni generazione logica.
- Genera una risposta strutturata tramite OpenAI Responses API.
- Salva la bozza e la risposta idempotente nella stessa transazione PostgreSQL.
- Restituisce `sent:false` e `approved:false`.

La funzione non invia messaggi verso WhatsApp, email o altri canali.

## Contratto della richiesta

```json
{
  "conversation_id": "UUID",
  "goal": "first_contact",
  "request_id": "UUID"
}
```

Obiettivi ammessi: `first_contact`, `follow_up`, `reply`, `presentation`, `appointment`.

Il frontend genera un UUID per la singola operazione logica e lo conserva in `sessionStorage` finché non riceve una risposta positiva. In caso di timeout, errore o risposta 409/429, riutilizza la stessa chiave nei tentativi successivi.

## Idempotenza server-side

La migrazione `supabase/migrations/20261110000200_nextway_setter_idempotency.sql` crea:

- tabella `nextway_setter_generation_requests`, con vincolo univoco su `(user_id, idempotency_key)`;
- RPC `nextway_begin_setter_generation(uuid, uuid)`, che acquisisce atomicamente una prenotazione con lease di 2 minuti;
- RPC `nextway_complete_setter_generation(uuid, text, text, text, text, text)`, che inserisce la bozza e memorizza la risposta nella stessa transazione.

Comportamento previsto:
- stessa chiave e stessa conversazione già completata: restituisce la risposta memorizzata e lo stesso `draft_id`, senza creare un altro messaggio;
- stessa chiave mentre la generazione è in corso: restituisce conflitto e un tempo indicativo di attesa;
- anche una chiave diversa sulla stessa conversazione non può avviare una seconda generazione mentre la prima è pending: il vincolo univoco parziale su `conversation_id` blocca schede, dispositivi e account differenti;
- stessa chiave associata a una conversazione diversa: rifiuta la richiesta;
- prenotazione scaduta: consente un nuovo tentativo con la stessa chiave;
- tabella non direttamente accessibile ai ruoli applicativi; le RPC sono eseguibili dagli utenti autenticati e verificano l'identità e l'accesso alla conversazione.

L'idempotenza protegge la creazione delle bozze persistite. Non garantisce che OpenAI venga addebitato una sola volta in ogni possibile interruzione: se OpenAI ha risposto ma la funzione non è riuscita a completare la transazione, un tentativo successivo dopo la scadenza della lease può richiedere una nuova generazione.

## Recupero dell'output AI dopo un errore di salvataggio

La migrazione `20261110000500_nextway_setter_output_recovery.sql` aggiunge la colonna `generated_output` e due RPC riservate all'utente autenticato proprietario della richiesta:

- `nextway_store_setter_generation_output(uuid, jsonb)`: salva l'output strutturato dopo averne verificato i campi e prima di creare il messaggio definitivo.
- `nextway_get_staged_setter_output(uuid)`: recupera l'output della prenotazione pending ancora valida.

Flusso:
1. NEXTWAY acquisisce la prenotazione idempotente.
2. Prima di chiamare OpenAI controlla se esiste già un output temporaneo.
3. Se non esiste, chiama OpenAI e salva subito l'output temporaneo.
4. Solo dopo tenta la transazione che crea la bozza e completa la chiave idempotente.
5. Se il commit finale fallisce dopo lo staging, il retry con la stessa chiave recupera l'output e ritenta il salvataggio senza una seconda chiamata OpenAI.

La protezione riduce il rischio di addebiti duplicati quando lo staging è riuscito ma il commit finale è fallito. Non può garantire il recupero se la risposta OpenAI arriva ma non è possibile salvarla nel database; in quel caso un nuovo tentativo dopo la scadenza della lease può ancora richiedere una nuova generazione.

## Isolamento della persistenza workspace

La migrazione correttiva `20261112020000_nextway_setter_generation_table_isolation.sql` crea la tabella dedicata `nextway_setter_workspace_generation_requests` e reindirizza le quattro RPC correnti a questa tabella.

La precedente `nextway_setter_generation_requests` viene conservata senza modifiche per compatibilità con le RPC legacy e con la relativa manutenzione. Le due strutture non devono essere confuse: la tabella legacy usa `user_id`, stati `pending/completed` e campo `response`; la tabella workspace usa `owner_profile_id`, stati `generating/completed`, `generated_output` e `cached_response`.

La nuova tabella non concede accesso diretto ai ruoli applicativi o a `service_role`: le operazioni passano dalle RPC `SECURITY DEFINER`, che verificano identità, proprietà e membership workspace. La pulizia è manuale e riservata a `platform_admin` tramite `nextway_prune_workspace_setter_generation_requests()`: richieste completate oltre 30 giorni e richieste generating abbandonate da oltre 24 ore.

## Modello autorizzativo

L'Edge Function legge conversazione e lead tramite il JWT dell'utente e quindi rispetta le policy RLS delle tabelle. Le RPC di idempotenza verificano esplicitamente che l'utente sia proprietario della conversazione oppure abbia il ruolo `platform_admin`.

Con il modello attualmente documentato:
- `partner`: può operare sulle proprie conversazioni e sui propri Lead;
- `platform_admin`: può operare anche sulle conversazioni e sui Lead degli altri utenti, secondo le policy admin;
- `sponsor`, `team_leader` e `director`: non ricevono accesso ai dati dei partner della propria linea per il solo fatto di avere quel ruolo. La visibilità gerarchica resta da definire e implementare esplicitamente.

Non ampliare l'accesso gerarchico prima di definire le relazioni organizzative e testare l'isolamento con account distinti.

## Rate limit distribuito

La migrazione `supabase/migrations/20261110000100_nextway_distributed_rate_limit.sql` crea il controllo atomico condiviso; la migrazione successiva `supabase/migrations/20261110000300_nextway_rate_limit_units.sql` aggiorna la RPC per contare unità di consumo.

- AI Setter: massimo 5 generazioni per utente in una finestra fissa di 60 secondi (1 unità per generazione).
- In caso di indisponibilità della RPC, la funzione fallisce in modo chiuso con HTTP 503.
- Al superamento del limite restituisce HTTP 429.

Le finestre fisse possono consentire richieste ravvicinate ai confini di due finestre. Il rate limit non costituisce un budget giornaliero o mensile.

## Conservazione e manutenzione delle chiavi idempotenti

La migrazione `20261110000400_nextway_idempotency_retention.sql` aggiunge una manutenzione manuale, eseguibile solo da `platform_admin` tramite RPC `nextway_prune_setter_generation_requests()`.

- Le richieste completate vengono conservate per 30 giorni dall'ultimo aggiornamento.
- Le prenotazioni `pending` con lease scaduta da oltre 24 ore possono essere eliminate.
- Le prenotazioni appena scadute non vengono cancellate subito: restano disponibili per il normale recupero tramite la logica di lease.
- La funzione restituisce il numero di record eliminati per ciascuna categoria.
- Non viene creato alcun cron o processo automatico: la pulizia deve essere avviata consapevolmente da un amministratore.

Dopo 30 giorni una vecchia chiave completata non è più garantita come replay idempotente: se viene riutilizzata manualmente, potrà essere trattata come una nuova operazione. La retention è quindi una scelta esplicita tra spazio database e finestra temporale di protezione dai replay.

## Variabili d'ambiente

Richieste:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS` oppure `SUPABASE_PUBLISHABLE_KEY` oppure `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`

Facoltativa:
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

Non inserire valori segreti nel repository, nel frontend o nei log. Il codice usa una chiave anon/publishable insieme al JWT dell'utente; non usa una service-role key.

## Limiti e controlli applicativi

- Corpo HTTP massimo 16 KB, verificato durante la lettura in streaming anche senza `Content-Length`.
- JSON malformato, array e valori non-oggetto rifiutati.
- Timeout OpenAI: 60 secondi.
- Output OpenAI massimo: 1.200 token.
- Campi del contesto troncati prima di inviare i dati al modello.
- Conversazioni `closed` o `archived` rifiutate prima della generazione e ricontrollate con lock della riga nella transazione di salvataggio: se vengono chiuse durante la chiamata OpenAI, la bozza non viene salvata e la funzione restituisce HTTP 409.
- CORS limitato da `NEXTWAY_ALLOWED_ORIGINS`; CORS non sostituisce l'autorizzazione.
- Se la generazione fallisce, la bozza non viene salvata. La prenotazione resta pendente fino alla scadenza della lease (2 minuti), poi può essere acquisita nuovamente con la stessa chiave.

## Risposta positiva

La risposta contiene `success`, `draft_id`, `message`, `strategy`, `objective`, `tone`, `next_step`, `sent:false`, `approved:false` e `created_at`.

## Verifiche ancora necessarie

1. Applicare in ambiente di test nell'ordine: `20261110000100_nextway_distributed_rate_limit.sql`, `20261110000200_nextway_setter_idempotency.sql`, `20261110000300_nextway_rate_limit_units.sql`, `20261110000400_nextway_idempotency_retention.sql`, `20261110000500_nextway_setter_output_recovery.sql`.
2. Verificare che le colonne e le foreign key delle tabelle conversazioni e messaggi corrispondano alla migrazione.
3. Testare utente proprietario, utente non proprietario e platform admin.
4. Testare richieste concorrenti con la stessa chiave, replay dopo completamento e riutilizzo della chiave su un'altra conversazione.
5. Testare scadenza della lease dopo errore/timeout e verificare che non si creino messaggi duplicati.
6. Verificare rate limit, timeout OpenAI, output incompleto e indisponibilità delle RPC.
7. Confermare che il record salvato abbia `ai_generated=true`, `approved_by=null` e `sent_at=null`.
8. Verificare la retention: un utente non admin non può eseguire la pulizia; platform_admin può eseguirla e riceve i conteggi; i record completati entro 30 giorni e i pending scaduti da meno di 24 ore restano presenti.
9. Simulare errore del commit finale dopo lo staging: il retry con la stessa chiave deve recuperare l'output e non richiamare OpenAI.
10. Verificare che l'output temporaneo non sia leggibile da un altro partner e non sia disponibile dopo la scadenza della lease.
11. Confrontare il sorgente con la versione distribuita e verificare endpoint e secrets.

## Deploy

Nessun deploy è stato eseguito da questa attività. Le migrazioni e le Edge Functions devono essere applicate/pubblicate e collaudate in ambiente controllato prima del rilascio.


## Istruzioni AI e criteri di qualificazione per workspace

La migrazione \`20261112030000_nextway_setter_governance_read_rpc.sql\` aggiunge la RPC read-only \`nextway_get_active_setter_governance(uuid)\`.

- La Edge Function passa il workspace della conversazione alla RPC.
- La RPC verifica l'identità e la membership attiva tramite \`nextway_has_workspace_access\`.
- Vengono restituiti soltanto prompt e criteri con stato \`active\`; bozze e archiviati non sono visibili.
- La funzione AI incorpora i prompt approvati nelle istruzioni e i criteri attivi nel contesto strutturato.
- Le istruzioni amministrative non possono superare le regole di sicurezza del Setter.
- Se la lettura governance fallisce per una conversazione workspace, la generazione si interrompe con HTTP 503: non procede usando una configurazione incompleta.
- Le conversazioni legacy senza workspace continuano a usare le istruzioni standard.
- La RPC non concede accesso alle tabelle di governance né modifica le autorizzazioni di creazione/attivazione/archiviazione.

La migrazione deve essere applicata a Supabase prima che questa integrazione possa funzionare live. La Edge Function aggiornata deve essere distribuita separatamente. Nessuna delle due operazioni è implicita nel commit GitHub.
