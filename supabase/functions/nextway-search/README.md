# NEXTWAY Search Edge Function

## Secrets richiesti
Configurare in Supabase > Edge Functions > Secrets:
- `TAVILY_API_KEY`: chiave privata Tavily.
- `NEXTWAY_ALLOWED_ORIGINS`: `https://misura-test-benessere.netlify.app` (aggiungere altri domini separati da virgola solo se necessari).

La funzione usa le variabili Supabase già fornite dall'ambiente: `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEYS` (con fallback legacy `SUPABASE_ANON_KEY`). Non inserire mai chiavi secret o service-role nel browser o nel repository.

## Endpoint
`POST /functions/v1/nextway-search`

Header:
- `Authorization: Bearer <access_token>`
- `apikey: <publishable_key>`
- `Content-Type: application/json`

Body:
```json
{
  "queries": ["site:linkedin.com/in/ ...", "site:facebook.com ..."],
  "max_results": 5
}
```

Limiti applicati:
- da 1 a 5 query per richiesta;
- massimo 400 caratteri per query;
- da 1 a 10 risultati per query;
- ricerca Tavily basic, senza risposta generativa e senza estrazione raw;
- autenticazione Supabase obbligatoria e controllo dell'origine browser.

La funzione restituisce URL, titolo, snippet, score del provider e data pubblicata, ma NON inserisce automaticamente persone nel database. La selezione e la verifica umana restano obbligatorie.

## Deploy
1. Eseguire prima la migrazione `supabase/nextway_leads.sql`.
2. Impostare i secrets sopra nel progetto Supabase.
3. Pubblicare la funzione `nextway-search` con Supabase CLI o dal flusso di deploy supportato.
4. Testare con un utente autenticato, una query, più query, token scaduto e origine non autorizzata.
5. Solo dopo i test collegare il frontend.

Questa cartella nel repository non equivale a una funzione già distribuita su Supabase.
