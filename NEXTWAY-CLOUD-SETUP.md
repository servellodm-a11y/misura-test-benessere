# NEXTWAY AI — attivazione connessione cloud

## Cosa è stato collegato nel codice
Le pagine `nextway-ai.html`, `nextway-ricerca.html` e `nextway-motore-ricerca.html` caricano il modulo condiviso `nextway-cloud.js`. Il modulo aggiunge:
- configurazione del progetto Supabase con URL e publishable key;
- accesso con account email/password già creati in Supabase Auth;
- chiamata autenticata alla Edge Function `nextway-search`;
- sincronizzazione dei Lead già presenti nel browser verso `public.nextway_leads`;
- lettura dei Lead consentiti dalle policy RLS e unione nell'archivio locale.

La password non viene salvata. URL e publishable key vengono salvati nel localStorage del browser. La publishable key è destinata all'uso client; non inserire mai service-role o secret key nel browser.

## Passaggi da completare nel progetto Supabase
1. Aprire il progetto corretto e verificare che le tabelle `profiles`, `partner_details`, `clients` siano quelle previste.
2. In SQL Editor eseguire `supabase/nextway_leads.sql`.
3. In Authentication > Users creare/invitare gli account dei partner e verificare che ciascuno abbia il proprio record in `public.profiles` con `id = auth.users.id`.
4. Pubblicare la Edge Function `nextway-search` dal percorso `supabase/functions/nextway-search`.
5. In Edge Function Secrets configurare `TAVILY_API_KEY` e `NEXTWAY_ALLOWED_ORIGINS=https://misura-test-benessere.netlify.app`. Il progetto deve rendere disponibili `SUPABASE_URL` e una chiave pubblicabile/anon al runtime della funzione.
6. Attendere che Netlify pubblichi i commit GitHub. Aprire una delle tre pagine e inserire URL progetto e publishable key nel pannello NEXTWAY.
7. Accedere con un account partner. Provare prima la lettura cloud; poi la ricerca web; infine sincronizzare un piccolo gruppo di Lead verificati.

## Comportamento e limiti attuali
- Il modulo di ricerca interroga Tavily solo dopo autenticazione e solo se la Edge Function è stata pubblicata e configurata.
- I risultati Tavily restano risultati web: non vengono trasformati automaticamente in persone/Lead. L'utente deve aprire la fonte, identificare la persona e completare manualmente la scheda.
- La sincronizzazione locale invia i record che hanno i campi obbligatori e non hanno già un `cloud_id`. I duplicati rifiutati dal vincolo univoco non vengono sovrascritti.
- Il pulsante di lettura cloud unisce i record visibili all'utente nell'archivio locale; non cancella i dati esistenti.
- La UI di stato e le modifiche fatte nell'archivio locale non sono ancora sincronizzate automaticamente dopo ogni modifica. Per ora usare il pulsante di sincronizzazione per i nuovi record; gli aggiornamenti di record già sincronizzati e la cancellazione bidirezionale sono una fase successiva.
- I record cloud sono protetti dalle policy RLS. Non considerare conclusa la sicurezza finché non sono stati eseguiti test reali con due partner e un platform_admin.

## Verifica di rilascio
Il codice è stato salvato nel repository GitHub e la sintassi JavaScript delle tre pagine e del modulo condiviso è stata verificata. Questo non dimostra che Netlify abbia già pubblicato i file, né che la migrazione SQL o la Edge Function siano state eseguite su Supabase.
