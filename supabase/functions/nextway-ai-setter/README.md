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

1. Applicare in ambiente di test nell'ordine: `20261110000100_nextway_distributed_rate_limit.sql`, `20261110000200_nextway_setter_idempotency.sql`, `20261110000300_nextway_rate_limit_units.sql`.
2. Verificare che le colonne e le foreign key delle tabelle conversazioni e messaggi corrispondano alla migrazione.
3. Testare utente proprietario, utente non proprietario e platform admin.
4. Testare richieste concorrenti con la stessa chiave, replay dopo completamento e riutilizzo della chiave su un'altra conversazione.
5. Testare scadenza della lease dopo errore/timeout e verificare che non si creino messaggi duplicati.
6. Verificare rate limit, timeout OpenAI, output incompleto e indisponibilità delle RPC.
7. Confermare che il record salvato abbia `ai_generated=true`, `approved_by=null` e `sent_at=null`.
8. Confrontare il sorgente con la versione distribuita e verificare endpoint e secrets.

## Deploy

Nessun deploy è stato eseguito da questa attività. Le migrazioni e le Edge Functions devono essere applicate/pubblicate e collaudate in ambiente controllato prima del rilascio.
