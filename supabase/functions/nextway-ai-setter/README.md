# NEXTWAY AI Setter — Edge Function

## Stato del codice

Questo file è la copia del codice fornito dall'utente il 10 novembre 2026 e destinato alla funzione visualizzata in Supabase come `nextway-ai-setter`.

La presenza del sorgente nel repository **non dimostra** che questa sia la versione attualmente distribuita su Supabase. Prima di un deploy occorre confrontarla con il codice live e confermare l'endpoint effettivo. Non usare automaticamente il nome visualizzato come endpoint.

## Funzionamento previsto

- Accetta richieste `POST` e preflight `OPTIONS`.
- Richiede un Bearer access token Supabase valido.
- Legge conversazione, lead e ultime 20 comunicazioni usando il client autenticato e le policy RLS.
- Genera una risposta strutturata tramite OpenAI Responses API.
- Inserisce il testo in `nextway_setter_messages` come messaggio `outgoing`, `ai_generated=true`, `approved_by=null`, `sent_at=null`.
- Restituisce esplicitamente `sent:false` e `approved:false`.

La funzione non contiene un'azione di invio verso WhatsApp, email o altri canali.

## Variabili d'ambiente

Richieste dal codice:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS` oppure `SUPABASE_PUBLISHABLE_KEY` oppure `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`

Facoltativa:
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

Non inserire valori segreti nel repository, nel frontend o nei log. Il codice usa una chiave Supabase anon/publishable insieme al JWT dell'utente; non usa una service-role key.

## Contratto della richiesta

```json
{
  "conversation_id": "UUID",
  "goal": "first_contact"
}
```

Obiettivi ammessi: `first_contact`, `follow_up`, `reply`, `presentation`, `appointment`.

## Contratto della risposta positiva

```json
{
  "success": true,
  "draft_id": "UUID",
  "message": "Testo della bozza",
  "strategy": "Strategia",
  "objective": "Obiettivo",
  "tone": "Tono",
  "next_step": "Prossimo passo",
  "sent": false,
  "approved": false
}
```

## Controlli ancora necessari prima del deploy

1. Confrontare questo file con il sorgente effettivamente distribuito in Supabase.
2. Verificare l'endpoint reale della funzione.
3. Verificare schema, foreign key e policy RLS di `nextway_setter_conversations` e `nextway_setter_messages`.
4. Verificare che la policy INSERT dei messaggi autorizzi il proprietario della conversazione e l'amministratore secondo le regole volute, senza consentire l'assegnazione arbitraria di `owner_profile_id`.
5. Verificare che la lettura dello storico rispetti l'isolamento per conversazione e proprietario.
6. Verificare che `NEXTWAY_ALLOWED_ORIGINS` contenga tutti e soli gli origin autorizzati. Il codice applica un'allowlist; CORS non sostituisce l'autorizzazione server-side.
7. Applicare la migrazione `20261110000100_nextway_distributed_rate_limit.sql` e testare il rate limit server-side atomico per utente.
8. Testare token valido, token scaduto, conversazione inesistente, conversazione di altro partner, lead non accessibile, errore OpenAI, risposta incompleta e errore di inserimento.
9. Verificare che il record salvato resti una bozza e che nessun processo successivo lo invii senza approvazione esplicita.

## Limiti noti del sorgente acquisito

- CORS usa `NEXTWAY_ALLOWED_ORIGINS` (default: dominio Netlify noto); l'assenza dell'header Origin è ammessa per chiamate non-browser autenticate.
- Il codice chiama `nextway_consume_api_rate_limit('ai_setter')`: massimo 5 richieste per utente in ogni finestra fissa di 60 secondi. Il limite è atomico e condiviso nel database; se il controllo non è disponibile, la funzione fallisce in modo chiuso con HTTP 503; superato il limite restituisce HTTP 429.
- Il body è limitato a 16 KB e la generazione a 1.200 token; i campi del contesto sono troncati nel codice.
- Le conversazioni con stato `closed` o `archived` vengono rifiutate; gli altri stati dipendono dal valore effettivo presente nel database.
- Il comportamento delle policy RLS sulle due tabelle non è deducibile dal solo codice della funzione e non è ancora stato verificato in questo repository.
- Il codice gestisce `status === "incomplete"` e l'assenza di testo; gli altri errori del provider sono ricondotti a un errore generico 500.

## Integrazione frontend (10 novembre 2026)

Il frontend NEXTWAY AI include `nextway-setter.js`, caricato da `nextway-ai.html`. Riutilizza la sessione Supabase esistente esposta da `nextway-cloud.js`, crea prospect e conversazione tramite RPC `nextway_create_lead_with_conversation`, poi invoca il generatore e mostra la bozza. Il percorso configurato nel frontend versionato è `/functions/v1/nextway-ai-setter`; la corrispondenza con la funzione effettivamente distribuita su Supabase resta da verificare. Nessun invio viene eseguito.

## Rate limit server-side

La migrazione `supabase/migrations/20261110000100_nextway_distributed_rate_limit.sql` crea `nextway_api_rate_limits` e la RPC `nextway_consume_api_rate_limit(text)`. Il database impone 5 richieste/minuto per utente su `ai_setter`; la tabella non è direttamente accessibile ai ruoli applicativi. La funzione Edge chiama la RPC con il JWT dell'utente. Il contatore è condiviso tra schede e dispositivi, ma usa finestre fisse da 60 secondi: ai confini della finestra possono verificarsi burst ravvicinati. Non è un budget giornaliero o mensile.

## Deploy

Nessun deploy è stato eseguito da questa attività. Eseguire il deploy solo dopo confronto con la versione live, revisione delle policy e test in ambiente controllato.


### Contratto RPC usato dal frontend

Il frontend chiama `public.nextway_create_lead_with_conversation` con questi parametri: `p_display_name`, `p_category`, `p_source_name`, `p_source_url`, `p_public_evidence`, `p_objective`, `p_channel`. La firma registrata nel contesto operativo è: `(text, text, text, text, text, text DEFAULT, text DEFAULT) RETURNS jsonb`. La funzione crea il lead e la conversazione in modo atomico usando `auth.uid()` e restituisce `success`, `lead_id`, `conversation_id`. Il frontend accetta la risposta solo se contiene `success=true` e un `conversation_id`.

Il frontend carica le conversazioni ordinate per `created_at` decrescente. Questa corrispondenza del contratto è stata ricostruita dalla registrazione del lavoro precedente; la chiamata live resta da testare.


## Idempotenza server-side (10 novembre 2026)

La migrazione `20261110000200_nextway_setter_idempotency.sql` aggiunge una prenotazione transazionale per ogni coppia utente/chiave UUID:

1. La Edge Function richiede `request_id` (UUID) insieme a `conversation_id` e `goal`.
2. `nextway_begin_setter_generation` acquisisce atomicamente la chiave. Una richiesta concorrente con la stessa chiave riceve HTTP 409; una chiave già completata restituisce la risposta salvata senza chiamare OpenAI.
3. La prenotazione pending ha una lease di 2 minuti. Se il processo si interrompe prima del completamento, la stessa chiave può essere riacquisita dopo la scadenza.
4. `nextway_complete_setter_generation` inserisce il messaggio e registra la risposta JSON nella stessa transazione. Una ripetizione successiva restituisce il risultato già registrato.

La chiave è legata all'utente e alla conversazione: riutilizzarla per un'altra conversazione viene rifiutato. La generazione esplicita successiva deve usare una nuova chiave. Il frontend conserva la chiave in `sessionStorage` finché non riceve una risposta positiva, così un ritentativo nella stessa sessione riusa la medesima operazione.

La garanzia vale quando il chiamante riutilizza lo stesso `request_id`. Non deduplica due azioni intenzionali che generano chiavi differenti. Il rate limit viene consumato prima del controllo idempotente: anche un ritentativo con chiave già completata consuma una richiesta del limite AI Setter.

La migrazione non è ancora applicata a Supabase e il comportamento non è stato testato in runtime. La lease di 2 minuti, i permessi delle funzioni SECURITY DEFINER e la corrispondenza effettiva delle colonne devono essere collaudati nell'ambiente Supabase prima del rilascio.
