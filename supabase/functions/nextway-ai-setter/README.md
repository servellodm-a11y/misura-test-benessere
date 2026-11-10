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
7. Implementare e testare un rate limit server-side distribuito per utente; il codice attuale limita il body e i token di output, ma non il numero di richieste.
8. Testare token valido, token scaduto, conversazione inesistente, conversazione di altro partner, lead non accessibile, errore OpenAI, risposta incompleta e errore di inserimento.
9. Verificare che il record salvato resti una bozza e che nessun processo successivo lo invii senza approvazione esplicita.

## Limiti noti del sorgente acquisito

- CORS usa `NEXTWAY_ALLOWED_ORIGINS` (default: dominio Netlify noto); l'assenza dell'header Origin è ammessa per chiamate non-browser autenticate.
- Non è ancora presente un rate limit server-side distribuito; i blocchi frontend non proteggono da richieste dirette o multi-dispositivo.
- Il body è limitato a 16 KB e la generazione a 1.200 token; i campi del contesto sono troncati nel codice.
- Non viene controllato lo stato della conversazione prima di generare una bozza.
- Il comportamento delle policy RLS sulle due tabelle non è deducibile dal solo codice della funzione e non è ancora stato verificato in questo repository.
- Il codice gestisce `status === "incomplete"` e l'assenza di testo; gli altri errori del provider sono ricondotti a un errore generico 500.

## Integrazione frontend (10 novembre 2026)

Il frontend NEXTWAY AI include ora `nextway-setter.js`, caricato da `nextway-ai.html`. Riutilizza la sessione Supabase esistente esposta da `nextway-cloud.js`, crea prospect e conversazione tramite RPC `nextway_create_lead_with_conversation`, poi invoca il generatore e mostra la bozza. Il frontend usa il percorso `/functions/v1/rapid-function`, indicato in precedenza come endpoint effettivo; la corrispondenza con la funzione live resta da testare. Nessun invio viene eseguito.

## Deploy

Nessun deploy è stato eseguito da questa attività. Eseguire il deploy solo dopo confronto con la versione live, revisione delle policy e test in ambiente controllato.


### Contratto RPC usato dal frontend

Il frontend chiama `public.nextway_create_lead_with_conversation` con questi parametri: `p_display_name`, `p_category`, `p_source_name`, `p_source_url`, `p_public_evidence`, `p_objective`, `p_channel`. La firma registrata nel contesto operativo è: `(text, text, text, text, text, text DEFAULT, text DEFAULT) RETURNS jsonb`. La funzione crea il lead e la conversazione in modo atomico usando `auth.uid()` e restituisce `success`, `lead_id`, `conversation_id`. Il frontend accetta la risposta solo se contiene `success=true` e un `conversation_id`.

Il frontend carica le conversazioni ordinate per `created_at` decrescente. Questa corrispondenza del contratto è stata ricostruita dalla registrazione del lavoro precedente; la chiamata live resta da testare.
