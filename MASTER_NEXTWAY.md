# MASTER NEXTWAY

## AGGIORNAMENTO OPERATIVO — 10 NOVEMBRE 2026 (CRM conversioni assistite e stato validazione)

- Aggiunto nel CRM un flusso di conversione assistita Lead → cliente/partner: richiesta collegata al proprietario del Lead, sponsor proposto uguale al proprietario, invio alla coda di revisione `platform_admin` e nessuna creazione automatica di account o profili.
- Versionati la migrazione `20261110001400_nextway_lead_conversion_requests.sql`, l'API cloud, la UI del Lead, la coda amministrativa e la diagnostica read-only `nextway_conversion_schema_readonly.sql`. La migrazione non risulta applicata a Supabase.
- La revisione è progettata come decisione amministrativa singola e immutabile; la UI richiede un motivo per il rifiuto. La migrazione deve ancora essere corretta: il body della funzione trigger usa il delimitatore `as $ ... $;` invece di `as $ ... $;`; non applicare la migrazione in questo stato. Inoltre il vincolo del motivo di rifiuto è verificato nel client, ma non è imposto dal database.
- GitHub Actions run #100 (`42811158172`) è **FAILURE**: il validatore statico cerca una vecchia espressione `if(!safeHttpUrl(x.url))` che non corrisponde più alla UI corrente, che usa `sourceUrl=safeHttpUrl(x.url)`. Il job si interrompe prima del type-check Deno, che risulta skipped. Il codice applicativo non è stato modificato in questa attività documentale.
- In questa sessione non è disponibile un connettore Supabase: schema live, policy effettive, applicazione della migrazione, deploy e secrets non sono stati interrogati. Nessun deploy o cambiamento database è stato eseguito.

## AGGIORNAMENTO OPERATIVO PRECEDENTE — 10 NOVEMBRE 2026 (integrazione frontend AI Setter)

- Aggiunto `nextway-setter.js`: interfaccia AI Setter con creazione prospect/conversazione tramite RPC `nextway_create_lead_with_conversation`, selezione conversazioni esistenti e generazione di bozze.
- Aggiornato `nextway-cloud.js`: espone al modulo Setter il client Supabase autenticato e la configurazione già esistente, senza duplicare login o memorizzare password.
- Aggiornato `nextway-ai.html`: carica il nuovo modulo e aggiunge il collegamento alla sezione AI Setter.
- La UI chiama l'endpoint precedentemente indicato dall'utente: `/functions/v1/rapid-function`. L'endpoint effettivo deve ancora essere confermato con un test live; non è stato effettuato alcun deploy manuale della Edge Function.
- La bozza viene mostrata e copiata; non esiste invio automatico né pulsante di invio.
- Modifiche salvate su GitHub `main`. Deploy Netlify e test end-to-end non ancora verificati.
- Prossimo passo: verificare deploy Netlify, login, RPC, endpoint AI Setter e salvataggio della bozza con una conversazione di test controllata. Non ripetere verifiche generiche di RLS già effettuate.


Ultimo aggiornamento: 10 novembre 2026
Repository: https://github.com/servellodm-a11y/misura-test-benessere
Branch di riferimento: main
Scopo: punto unico di continuità del progetto. Questo documento distingue sempre ciò che è stato letto nel repository, ciò che è stato riferito nelle conversazioni e ciò che resta da verificare nell'ambiente operativo.

## 1. Regole di lavoro

- Procedere in sequenza: concluso un compito, avviare il successivo senza chiedere un'autorizzazione per ogni passaggio ordinario.
- Non ripetere verifiche già svolte se non sono necessarie per una decisione o per un rischio concreto.
- Non chiedere all'utente dati già presenti nel contesto.
- Non dichiarare completati deploy, test, configurazioni o modifiche senza riscontro.
- Distinguere: **COMPLETATO E VERIFICATO**, **ESEGUITO MA NON VERIFICATO**, **DA COMPLETARE**, **BLOCCATO**.
- Nessuna modifica distruttiva a database, account, configurazioni o dati senza una verifica preventiva e, se irreversibile o con impatto esterno, conferma esplicita.
- Mai inserire nel repository credenziali, token, chiavi segrete o service-role key.

## 2. Obiettivo e principi architetturali

NEXTWAY è una piattaforma modulare, multiutente e multi-settore. La prima applicazione operativa supporta l'attività Zinzino; il nucleo deve restare indipendente dal marchio e consentire futuri moduli aziendali.

L'assistente si chiama **NEXTWAY AI Assistant**. L'AI Setter lavora in modalità assistita: prepara ricerche, analisi e bozze; approvazione e invio restano sotto controllo umano. Non deve inviare messaggi autonomamente.

Principi:
- un profilo unico per persona, con interessi e opportunità separati per settore;
- separazione dei dati per proprietario/partner;
- controllo centrale del ruolo `platform_admin`;
- fonti approvate e tracciabili per le risposte AI;
- protezione dei dati personali, minimizzazione e gestione di finalità/consensi;
- nessuna diagnosi, prescrizione o promessa di risultato sanitario/economico;
- nessuna service-role key nel browser.

## 3. Repository e pubblicazione

- Repository: `servellodm-a11y/misura-test-benessere`
- Branch predefinito verificato: `main`
- Repository pubblico; permessi GitHub disponibili alla connessione corrente: admin/maintain/push.
- Frontend Netlify noto: `https://misura-test-benessere.netlify.app` (deploy da GitHub, riferimento conversazionale; lo stato del deploy live non è stato verificato in questo aggiornamento).
- File principali presenti nel repository:
  - `index.html`
  - `nextway-ai.html`
  - `nextway-cloud.js`
  - `nextway-dashboard.html`
  - `nextway-ricerca.html`
  - `nextway-motore-ricerca.html`
  - `nextway-analisi.html`
  - `NEXTWAY-CLOUD-SETUP.md`
  - `docs/NEXTWAY-AI-ASSISTANT-ARCHITETTURA.md`
  - `supabase/nextway_leads.sql`
  - `supabase/migrations/20261105000100_nextway_ai_assistant_foundation.sql`
  - `supabase/diagnostics/nextway_schema_audit.sql`
  - `supabase/functions/nextway-search/index.ts`

## 4. Stack e ambiente

- Frontend: HTML/CSS/JavaScript statico.
- Hosting: Netlify.
- Backend/database/auth: Supabase.
- Supabase project ref riferito nel lavoro: `obqwbtlltxjfeirstsya`; progetto indicato come `nextway-platform`.
- Supabase piano Free (riferito dall'utente; stato piano non ricontrollato in questo aggiornamento).
- Ricerca web prevista: Tavily tramite Edge Function `nextway-search`.
- Integrazione AI: OpenAI prevista per AI Setter; disponibilità/configurazione effettiva delle chiavi e del modello non verificata.
- WhatsApp Business Platform: architettura prevista, non risulta ancora attivata secondo la specifica architetturale del 5 novembre 2026.

## 5. Modello utenti e autorizzazioni

Ruoli previsti/ricordati:
- `platform_admin`
- `director`
- `team_leader`
- `sponsor`
- `partner`

Requisito funzionale: ogni partner deve vedere e gestire solo i propri lead/clienti, secondo le policy; l'amministratore di piattaforma deve poter gestire l'intera organizzazione. Non presumere che director/team_leader/sponsor abbiano accesso trasversale: deve essere definito e verificato esplicitamente.

Profilo amministratore riportato nel lavoro:
- UUID: `0c15585e-aa21-4ec3-917d-25f4ac0a5ae6`
- ruolo: `platform_admin`
Questo identificativo è un dato tecnico interno, non una credenziale.

## 6. Database Supabase: stato noto

### Tabelle iniziali (contesto conversazionale)
- `profiles`
- `partner_details`
- `clients`

La tabella `clients` è stata descritta con 11 colonne, incluse identità, `partner_profile_id`, fonte, stato e timestamp. `partner_details` include sponsor, lato team e lingua. `profiles` contiene i profili/ruoli. RLS risultava attiva sulle tre tabelle iniziali secondo verifiche precedenti riferite nelle conversazioni; lo stato live non è stato interrogato in questo aggiornamento.

### Lead
- `public.nextway_leads`: SQL di migrazione presente in `supabase/nextway_leads.sql`.
- Il README descrive RLS e isolamento per `owner_profile_id = auth.uid()`, con accesso completo `platform_admin`.
- Il README segnala che la migrazione prepara la tabella e che i test con due partner e un admin sono necessari.
- Nella conversazione del 10 novembre l'utente ha confermato che non ci sono lead né conversazioni per il profilo admin. Le query eseguite avevano restituito zero righe su `nextway_leads` e `nextway_setter_conversations`. Non ripetere queste query senza una ragione tecnica concreta.

### AI Setter: conversazioni e messaggi
- `nextway_setter_messages`: campi verificati in conversazione: `conversation_id`, `owner_profile_id`, `direction`, `content`, `message_type`, `ai_generated`, `approved_by`, `sent_at`, `created_at`.
- `nextway_setter_conversations`: tabella interrogata nella sessione del 10 novembre; nessuna conversazione presente per il profilo admin.
- RPC `public.nextway_create_lead_with_conversation(...)`: creazione SQL riferita il 9 novembre con esito editor SQL “Success. No rows returned”; definizione e funzionamento live non recuperati in questo aggiornamento. Stato: **ESEGUITO MA NON VERIFICATO**.

### Migrazione fondazione AI
Nel repository esiste `supabase/migrations/20261105000100_nextway_ai_assistant_foundation.sql`, che propone tabelle `nw_contacts`, `nw_contact_channels`, `nw_opportunity_modules`, `nw_contact_interests`, `nw_contact_skills`, `nw_contact_opportunities`, `nw_consent_records`, `nw_conversations`, `nw_messages`, `nw_knowledge_sources`, `nw_handoffs`.
La migrazione si definisce draft/additiva e abilita RLS senza concedere accesso ai client browser. Il documento architetturale dice di verificare schema e RLS prima di eseguirla. **Non risulta provato che questa migrazione sia stata eseguita sul progetto Supabase live. Non eseguirla automaticamente.**

## 7. Edge Functions e servizi

### `nextway-search`
- Codice presente nel repository: `supabase/functions/nextway-search/index.ts`.
- Il documento `NEXTWAY-CLOUD-SETUP.md` descrive chiamata autenticata, ricerca Tavily, sincronizzazione e lettura dei lead.
- Setup documentato: secret `TAVILY_API_KEY`, `NEXTWAY_ALLOWED_ORIGINS=https://misura-test-benessere.netlify.app`, runtime `SUPABASE_URL` e chiave pubblicabile/anon.
- Il documento segnala che sincronizzazione automatica degli aggiornamenti e cancellazione bidirezionale non sono implementate.
- Deploy/configurazione live e test reale non verificati in questo aggiornamento.

### `nextway-ai-setter` e `hyper-api`
- Pubblicazione di queste funzioni è stata riferita nelle conversazioni.
- Il codice della funzione `nextway-ai-setter` è stato condiviso in chat e usa `@supabase/supabase-js@2`; obiettivi: `first_contact`, `follow_up`, `reply`, `presentation`, `appointment`.
- Flusso progettato: autenticazione JWT, validazione, lettura lead e ultime 20 righe, generazione AI, salvataggio bozza.
- Nessun invio autonomo.
- Il codice completo non è stato verificato nel repository in questo aggiornamento. Endpoint effettivi citati in precedenza (`rapid-function`, `rapid-function2`) non devono essere confusi con il nome visualizzato: recuperare l'URL effettivo dal deploy/configurazione prima di usarlo.
- Dashboard con invocazioni zero era stata riportata: significa che non risultavano chiamate, non che la funzione sia stata testata con successo.
- API key e modello OpenAI configurati non verificati.

## 8. Frontend e sincronizzazione cloud

Il documento `NEXTWAY-CLOUD-SETUP.md` afferma che:
- `nextway-ai.html`, `nextway-ricerca.html` e `nextway-motore-ricerca.html` caricano `nextway-cloud.js`;
- il modulo prevede URL Supabase e publishable key, login email/password, chiamata autenticata a `nextway-search`, sincronizzazione dei lead locali e lettura dei lead consentiti da RLS;
- URL e publishable key sono salvati in localStorage; la password non viene salvata;
- gli aggiornamenti dei record già sincronizzati e la cancellazione bidirezionale non sono ancora sincronizzati automaticamente.
Il documento riferisce una verifica sintattica JavaScript delle tre pagine e del modulo; non prova il deploy Netlify o il funzionamento end-to-end.

## 9. Diagnostica e sicurezza

- È presente `supabase/diagnostics/nextway_schema_audit.sql`: query dichiarata read-only che restituisce colonne, RLS, policy e foreign key dello schema public.
- Ultimo commit GitHub visibile al 10 novembre: `f30f1f03933a3cf8b73e49aa3dd4dcc6df60d250`, messaggio “Add read-only Supabase schema audit query”, datato 5 novembre 2026.
- Commit precedenti visibili includono schema iniziale AI Assistant, architettura iniziale, hardening parsing secret e documentazione cloud.
- Verifiche conversazionali del 9 novembre hanno riguardato policy RLS di `nextway_leads`; l'utente ha confermato esito positivo dei controlli mostrati. Non estendere tale esito ad altre tabelle o a test multiutente non effettuati.
- Il test di isolamento effettivo richiede account distinti (almeno due partner e un platform_admin); non è ancora documentato come completato.

## 10. Registro operativo sintetico

| Data | Operazione | Esito / stato |
|---|---|---|
| 05-11-2026 | Commit architettura e schema iniziale NEXTWAY AI Assistant | Presente nel repository |
| 05-11-2026 | Modulo frontend cloud e documentazione setup | Presenti nel repository; end-to-end non dimostrato |
| 05-11-2026 | Migrazione fondazione AI Assistant | File presente; esecuzione live non verificata |
| 05-11-2026 | Query diagnostica read-only schema | File presente nel repository |
| 09-11-2026 | Policy RLS lead e RPC creazione lead/conversazione | Verifiche e creazione riferite in chat; RPC da verificare |
| 10-11-2026 | Query lead e conversazioni per profilo admin | Zero righe; assenza record confermata dall'utente |
| 10-11-2026 | Creazione del presente MASTER | Da confermare dopo il commit e la rilettura GitHub |

## 11. Stato per componente

| Componente | Stato |
|---|---|
| Repository GitHub e branch main | **COMPLETATO E VERIFICATO** |
| Documentazione architettura iniziale | **COMPLETATO E VERIFICATO** (file nel repository) |
| Frontend NEXTWAY | **ESEGUITO MA NON VERIFICATO** end-to-end |
| Modulo `nextway-cloud.js` | **ESEGUITO MA NON VERIFICATO** end-to-end |
| SQL `nextway_leads.sql` | **PRESENTE NEL REPOSITORY**; applicazione live da verificare se necessaria |
| Migrazione `nw_*` | **DA COMPLETARE** solo dopo audit e decisione |
| Edge Function `nextway-search` | **PRESENTE NEL REPOSITORY**; deploy/configurazione/test live da verificare |
| Edge Function `nextway-ai-setter` | **SORGENTE VERSIONATO** nel repository; deploy e configurazione live non verificati |
| Tabelle lead/conversazioni | **NESSUN RECORD** per il profilo admin nelle query del 10 novembre |
| RPC creazione lead/conversazione | **ESEGUITO MA NON VERIFICATO** |
| Test RLS con due partner e admin | **DA COMPLETARE** |
| WhatsApp Business Platform | **DA COMPLETARE**; non risulta attivata |
| Flusso conversione assistita Lead → cliente/partner | **ESEGUITO MA NON VERIFICATO** nel runtime; sorgenti presenti, migrazione non applicata e CI fallita |
| Diagnostica read-only conversione | **COMPLETATO E VERIFICATO** come file nel repository; esecuzione su Supabase non verificata |
| Validazione GitHub Actions | **BLOCCATO** da asserzione statica non allineata alla UI; type-check Deno saltato nel run più recente |
| MASTER NEXTWAY | **COMPLETATO E VERIFICATO** dopo aggiornamento e rilettura GitHub |

## 12. Prossimo percorso operativo

1. Correggere il validatore statico: sostituire l'asserzione obsoleta sull'URL con un controllo coerente con `sourceUrl=safeHttpUrl(x.url)` e con il rendering sicuro attuale.
2. Correggere la migrazione `20261110001400_nextway_lead_conversion_requests.sql`: usare un delimitatore PostgreSQL valido `$ ... $` per la funzione trigger e imporre anche lato database il motivo obbligatorio quando `status='rejected'`.
3. Rilanciare GitHub Actions e verificare che passino sia `Validate NEXTWAY audit` sia `Type-check AI Setter Edge Function`; non considerare superato il controllo finché il run non è `success`.
4. Eseguire in Supabase la diagnostica read-only `supabase/diagnostics/nextway_conversion_schema_readonly.sql` e verificare schema, foreign key, indici, RLS, policy e grants effettivi.
5. Confrontare la migrazione corretta con lo schema live e applicarla solo in un intervento separato, controllato e autorizzato; questa attività documentale non modifica il database.
6. Testare il flusso con partner proprietario e `platform_admin`: richiesta valida, duplicato Lead/email, Lead archiviato o fuori fase, rifiuto con motivo, rifiuto senza motivo via API, revisione ripetuta e nuova richiesta dopo rifiuto.
7. Verificare che la revisione `ready_for_activation` non crei ancora account Auth, `profiles`, `partner_details` o `clients`; progettare l'attivazione come processo separato con controlli idempotenti.
8. Riprendere i test AI Setter: confronto sorgente live/endpoint, schema e RLS conversazioni/messaggi, generazione e salvataggio bozza; poi collegamento frontend. Nessun invio automatico.

## 13. Limiti di questa fotografia

Questa versione è stata compilata confrontando i file accessibili nel repository GitHub e il contesto conversazionale disponibile al 10 novembre 2026. Non è una scansione live completa di Supabase, Netlify, OpenAI, Tavily o Meta. Le informazioni conversazionali sono esplicitamente indicate come tali. Aggiornare lo stato solo dopo nuove evidenze.


## 14. Integrazione AI Setter — confronto repository/conversazioni (10 novembre 2026)

Recupero dalla conversazione del 9 novembre:
- La funzione è elencata in Supabase con nome `nextway-ai-setter`, ma l'endpoint effettivo mostrato all'utente era `/functions/v1/rapid-function`. Non chiamarla usando il nome visualizzato finché l'URL reale non è verificato.
- Metodo previsto: POST/OPTIONS; autenticazione Bearer JWT tramite `supabase.auth.getUser`.
- Variabili riportate come presenti dall'utente: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. `OPENAI_MODEL` risultava assente e il codice ricordato usava default `gpt-4o-mini`. Stato attuale dei secrets non interrogato.
- Il codice ricordato usa OpenAI Responses API e le tabelle `nextway_setter_conversations`, `nextway_leads`, `nextway_setter_messages`; recupera le ultime 20 comunicazioni.
- Output JSON previsto: `message`, `strategy`, `objective`, `tone`, `next_step`; obiettivi ammessi `first_contact`, `follow_up`, `reply`, `presentation`, `appointment`.
- Output finale include `sent:false` e `approved:false`; salva esclusivamente una bozza. Nessun invio automatico.

Confronto con il repository:
- La directory `supabase/functions` contiene solo `nextway-search`; non contiene `nextway-ai-setter`.
- La ricerca dei riferimenti `nextway-ai-setter`, `nextway_setter_conversations` e `nextway_create_lead_with_conversation` nel codice indicizzato del repository non ha restituito risultati.
- `nextway-cloud.js` chiama `/functions/v1/nextway-search`; non contiene un collegamento alla funzione AI Setter.
- Quindi la funzione AI Setter è stata riferita come pubblicata in Supabase, ma il suo codice non è versionato nel repository consultato e l'integrazione dal frontend non risulta implementata in questo file.

Stato aggiornato:
- Funzione AI Setter in Supabase: **ESEGUITO MA NON VERIFICATO** (esistenza riferita, codice/endpoint live non interrogati).
- Codice versionato AI Setter: **COMPLETATO E VERIFICATO** come copia del sorgente fornito dall'utente il 10 novembre; non equivale a verifica della versione live.
- Collegamento frontend al generatore di bozze: **DA COMPLETARE**.
- Secrets: **RIFERITI DALL'UTENTE, NON VERIFICATI LIVE**.
- Il 10 novembre l'utente ha fornito il codice completo. È stato salvato in `supabase/functions/nextway-ai-setter/index.ts` e documentato in `supabase/functions/nextway-ai-setter/README.md`. Il codice archiviato è quello ricevuto, non è stato dichiarato identico al deploy live.
- Prossimo intervento: verificare il sorgente live, l'endpoint effettivo, lo schema e le policy delle tabelle conversazioni/messaggi. Non cambiare endpoint e non effettuare deploy senza verifica.


## 15. Audit codice frontend/cloud e Edge Function ricerca (10 novembre 2026)

### `nextway-search` nel repository
- File `supabase/functions/nextway-search/index.ts` presente e letto integralmente.
- Endpoint documentato: `POST /functions/v1/nextway-search`.
- Verifica origine tramite `NEXTWAY_ALLOWED_ORIGINS`; gestione preflight OPTIONS; accetta solo POST.
- Richiede Bearer token, valida l'utente con `supabase.auth.getUser(token)).
- Richiede `SUPABASE_URL`, una publishable/anon key e `TAVILY_API_KEY`; supporta anche `SUPABASE_PUBLISHABLE_KEYS`.
- Limita a 1–5 query, 400 caratteri per query e 1–10 risultati; chiama Tavily basic e restituisce risultati senza inserire lead.
- Nessuna service-role key usata nel codice letto.
- README funzione specifica test obbligatori: utente autenticato, query singola/multipla, token scaduto e origine non autorizzata.
- La presenza del codice nel repository non dimostra che la funzione sia distribuita o configurata live.

### Coerenza sincronizzazione Lead
- Confrontati i campi del payload di `nextway-cloud.js` con la definizione in `supabase/nextway_leads.sql`.
- Tutti i campi del payload esaminati risultano dichiarati nello schema SQL: `owner_profile_id`, `display_name`, `profession`, `company_brand`, `location`, `category`, `partner_type`, `discovery_mode`, `public_signal`, `source_name`, `source_url`, `public_evidence`, `verified_at`, `identity_check`, `qualification`, i cinque punteggi, `status`, `notes`.
- Questo è un controllo statico repository-to-repository, non un test di inserimento sul database live.
- Le pagine `nextway-ai.html`, `nextway-ricerca.html` e `nextway-motore-ricerca.html` includono lo script Supabase JS e `/nextway-cloud.js`.- Nota UI da rivedere: `nextway-ai.html` contiene ancora un avviso che descrive l'archivio come solo locale e non sincronizzato tra dispositivi, mentre il modulo cloud offre configurazione, login, sincronizzazione e lettura cloud. La sincronizzazione resta manuale e non completa per aggiornamenti/cancellazioni. Non modificato in questo passaggio.

### Blocco recupero codice AI Setter
- Gli strumenti collegati disponibili in questa sessione consentono lettura/scrittura GitHub, ma non espongono un connettore Supabase per leggere il codice pubblicato, i secrets o l'URL reale della Edge Function.
- Il repository non contiene `supabase/functions/nextway-ai-setter/index.ts`; non è stato possibile recuperare il codice live da Supabase attraverso le connessioni disponibili.
- Non creare un duplicato o una versione ricostruita da ricordi: potrebbe divergere dalla funzione attualmente pubblicata.
- Azione minima richiesta all'utente per sbloccare il passo: in Supabase aprire Edge Functions, selezionare `nextway-ai-setter` e copiare qui il contenuto completo di `index.ts` (non copiare né condividere secrets o valori delle chiavi). Se il pannello mostra solo l'endpoint, riportare anche il nome/URL visualizzato, oscurando eventuali token.
- Una volta ricevuto il codice, confrontarlo con la logica attesa, versionarlo nel repository e aggiornare la documentazione. Nessuna modifica alla funzione live prima della revisione.

Stato di questo audit:
- Lettura statica del codice `nextway-search`: **COMPLETATO E VERIFICATO**.
- Coerenza dei campi sync con SQL nel repository: **COMPLETATO E VERIFICATO** (solo statica).
- Test end-to-end Supabase/Netlify: **DA COMPLETARE**.
- Recupero sorgente live `nextway-ai-setter`: **BLOCCATO** dall'assenza di accesso Supabase nella sessione.


## 16. Sorgente AI Setter ricevuto e versionato (10 novembre 2026)

### File aggiunti al repository
- `supabase/functions/nextway-ai-setter/index.ts`: copia integrale del codice incollato dall'utente in chat.
- `supabase/functions/nextway-ai-setter/README.md`: contratto richiesta/risposta, variabili d'ambiente, flusso previsto, controlli pre-deploy e limiti noti.
- Commit di aggiunta sorgente: `849f52eb089026909071b23c660b97f675ef90be`.
- Commit di documentazione: `c972006ecad48456b3c13ff8d834d08ddbe092f5`.

### Revisione statica iniziale del codice ricevuto
Aspetti positivi:
- Autenticazione Supabase tramite Bearer JWT e `auth.getUser(token)`.
- Uso del client Supabase con il JWT dell'utente; non è presente una service-role key.
- Lettura di conversazione, prospect e storico tramite RLS.
- Recupero massimo delle ultime 20 comunicazioni.
- Generazione strutturata tramite OpenAI Responses API e schema JSON.
- Inserimento come bozza con `direction: "outgoing"`, `ai_generated: true`, `approved_by: null`, `sent_at: null`.
- Risposta esplicita `sent: false` e `approved: false`; nessuna chiamata di invio esterno nel codice.

Rilievi da risolvere/verificare:
1. CORS attualmente consente `Access-Control-Allow-Origin: *`; restringere agli origin NEXTWAY previsti, coerentemente con la funzione `nextway-search`.
2. Non è presente rate limiting applicativo; valutare limiti per utente e per finestra temporale per contenere abuso e costi OpenAI.
3. Non sono imposti limiti espliciti alla dimensione del body e ai campi testuali di lead/storico inseriti nel contesto.
4. Non viene controllato lo stato della conversazione prima della generazione; definire il comportamento per conversazioni chiuse/archiviate.
5. Le policy RLS e lo schema effettivo di `nextway_setter_conversations` e `nextway_setter_messages` non sono presenti nei file SQL recuperati in questo audit: non si può certificare che SELECT/INSERT funzionino né che l'ownership sia coerente.
6. Non è stato verificato che la policy INSERT impedisca di associare un messaggio a un proprietario non autorizzato, mantenendo l'eccezione amministratore solo dove voluta.
7. Il codice intercetta lo stato OpenAI `incomplete` e l'assenza di output; gli errori del provider vengono ricondotti a 500 generico. Da testare anche refusal, timeout e risposte non conformi.

### Stato e limiti
- Sorgente ricevuto e salvato nel repository: **COMPLETATO E VERIFICATO** (copia del testo ricevuto).
- README e istruzioni operative: **COMPLETATO E VERIFICATO** (file aggiunto).
- Identità tra sorgente archiviato e versione distribuita su Supabase: **DA VERIFICARE**.
- Endpoint effettivo: **DA VERIFICARE**; non usare un URL dedotto dal nome funzione.
- Schema e policy RLS conversazioni/messaggi: **DA VERIFICARE**.
- Deploy, secrets e test live: **NON ESEGUITI**.
- Integrazione dal frontend NEXTWAY: **DA COMPLETARE** solo dopo verifica del backend e dell'endpoint.

### Prossimo percorso
1. Recuperare dal pannello Supabase il sorgente live e confrontarlo con il file archiviato.
2. Recuperare/verificare schema, foreign key e policy RLS delle due tabelle conversazioni e messaggi.
3. Correggere il codice in un'unica revisione controllata dopo aver chiarito i rilievi; non fare patch ripetitive non testate.
4. Testare generazione e salvataggio bozza con account autorizzato, account partner diverso, token scaduto e conversazione non accessibile.
5. Solo dopo, collegare il frontend e testare approvazione manuale; mantenere disabilitato qualsiasi invio automatico.


## 17. Controllo ciclo di vita Lead e sincronizzazione (10 novembre 2026)

### Esiti dell'audit statico
- Il file `supabase/nextway_leads.sql` definisce RLS per SELECT/INSERT/UPDATE/DELETE: il proprietario gestisce i propri Lead; `platform_admin` può gestire tutti i Lead.
- La policy UPDATE usa sia `USING` sia `WITH CHECK`: un partner non può trasferire il Lead cambiando `owner_profile_id`, perché il nuovo proprietario deve restare l'utente autenticato. L'amministratore può effettuare un trasferimento.
- L'indice univoco impedisce URL duplicati per lo stesso proprietario, normalizzati con `lower(btrim(source_url))`.
- Il frontend sincronizzava solo nuovi record e saltava quelli già dotati di `cloud_id`: le modifiche successive restavano locali.
- La cancellazione dal browser rimuove soltanto la copia locale; non cancella il record Supabase.
- La lettura cloud rispetta RLS, ma il merge locale non è ancora una sincronizzazione conflitti-aware tra dispositivi.
- La RPC `nextway_create_lead_with_conversation` non risulta presente nelle migrazioni versionate: la sua definizione effettiva e le policy delle tabelle conversazioni devono essere verificate nel progetto Supabase prima di certificare il flusso completo Lead+conversazione.

### Modifiche apportate al repository
- Migrazione `supabase/migrations/20261110000800_nextway_leads_soft_archive.sql`: aggiunge `archived_at`, `archived_by`, `archive_reason`, indici per Lead attivi/archiviati e trigger per valorizzare/azzerare i metadati di archiviazione. Non cancella fisicamente i record.
- `nextway-cloud.js`: la sincronizzazione aggiorna i record già collegati tramite `cloud_id` e inserisce quelli nuovi. Gli aggiornamenti non cambiano `owner_profile_id`; RLS resta il controllo effettivo sull'autorizzazione.
- Piano di collaudo aggiornato con test per Partner A, Partner B, platform_admin, archiviazione, ripristino, duplicati, conflitti e cancellazione locale/cloud.

### Limiti e stato
- Audit statico schema RLS Lead: **COMPLETATO**; le policy nel file SQL sono coerenti con proprietà individuale e amministratore.
- Sincronizzazione push di nuovi Lead e aggiornamento record collegati: **CODICE AGGIORNATO**, non testato contro Supabase live.
- Archiviazione logica: **MIGRAZIONE PREPARATA**, non applicata a Supabase e non ancora esposta da un comando UI dedicato.
- Ripristino, conflitti multi-dispositivo e sincronizzazione offline: **DA IMPLEMENTARE/TESTARE**.
- Cancellazione cloud: non eseguita dal pulsante locale; resta distinta dalla cancellazione fisica amministrativa.
- RPC Lead/conversazione e isolamento RLS conversazioni: **DA VERIFICARE LIVE**.
- Nessun deploy Netlify o Supabase effettuato in questo controllo.

### Prossimi controlli
1. Verificare la definizione live della RPC `nextway_create_lead_with_conversation` e la coerenza dei campi/foreign key.
2. Preparare UI esplicita per archiviazione/ripristino e indicatore di sincronizzazione, senza confondere cancellazione locale e cloud.
3. Definire risoluzione conflitti tra modifiche provenienti da dispositivi diversi.
4. Eseguire i test RLS con account distinti Partner A, Partner B e platform_admin dopo applicazione controllata delle migrazioni.


## 18. Gestione UI archiviazione e ripristino Lead (10 novembre 2026)

- `nextway-cloud.js` espone ora `archiveLead(cloudId, reason)` e `restoreLead(cloudId)` tramite sessione Supabase autenticata. Le operazioni aggiornano `archived_at` e `archive_reason`; `archived_by` resta gestito dal trigger database della migrazione 008.
- `nextway-ai.html` aggiunge filtro Lead attivi/archiviati/tutti e comando Archivia/Ripristina. Il comando è disponibile solo per record con `cloud_id`: un Lead solo locale deve essere sincronizzato prima. La UI non esegue cancellazioni fisiche cloud.
- Il pull aggiorna lo stato di archiviazione dei record locali già collegati, senza sovrascrivere gli altri campi modificati localmente. Non è ancora una risoluzione generale dei conflitti multi-dispositivo.
- I conteggi principali escludono gli archiviati e il filtro predefinito mostra i Lead attivi.
- Stato: **CODICE COMMITTATO NEL REPOSITORY**; **NON PUBBLICATO SU NETLIFY**; dipende dalla migrazione 008 non ancora applicata e da test Supabase live non eseguiti. Non considerare archiviazione/ripristino operativi in produzione finché prerequisiti e test non sono completati.


## 19. Sincronizzazione con rilevamento conflitti (10 novembre 2026)

- `nextway-cloud.js` conserva per ogni Lead collegato la versione cloud `cloud_updated_at` e lo stato locale `local_dirty`.
- Il push aggiorna un record esistente solo se il record è marcato come modificato localmente e la versione `updated_at` coincide con quella letta in precedenza. L'UPDATE usa quindi un controllo ottimistico atomico (`WHERE id = ... AND updated_at = ...`). Se nessuna riga viene restituita, il record viene segnalato come conflitto e non viene sovrascritto.
- Il pull aggiorna i campi cloud dei record locali solo quando non risultano modifiche locali pendenti e la versione di base è disponibile. Se il cloud è cambiato mentre esistono modifiche locali, il record viene marcato con `_sync_conflict` e i dati locali restano intatti.
- I Lead creati o modificati tramite il modulo principale e i cambi di stato vengono marcati `local_dirty`. Le operazioni di archiviazione/ripristino registrano la nuova versione `updated_at` restituita da Supabase.
- I record legacy collegati ma privi di versione cloud di base non vengono aggiornati alla cieca: richiedono revisione, perché non è possibile stabilire se la copia locale sia più recente.
- Limite deliberato: non è ancora presente una schermata di risoluzione guidata per scegliere tra versione locale e cloud; il sistema rileva e conserva il conflitto, ma non applica una scelta automatica.
- Stato: **CODICE COMMITTATO NEL REPOSITORY**; nessun deploy o test runtime effettuato. I test richiedono migrazioni e ambiente Supabase attivo.


## 20. Risoluzione guidata conflitti Lead (10 novembre 2026)

- nextway-cloud.js espone getLeadForConflict(cloudId) per leggere la versione cloud corrente e resolveLeadConflict(cloudId, expectedRemoteUpdatedAt, localRecord) per applicare la scelta locale con UPDATE condizionale su id e updated_at.
- La risoluzione locale è compare-and-swap: se il timestamp cloud è cambiato dopo il confronto, l'UPDATE non restituisce righe e la scelta viene rifiutata senza sovrascrivere il nuovo dato.
- nextway-ai.html aggiunge il confronto affiancato dei campi locali e cloud e due azioni esplicite: conservare la versione cloud oppure conservare quella locale e aggiornarla sul cloud.
- La scelta cloud sostituisce la copia locale con la versione appena letta e azzera local_dirty e _sync_conflict. La scelta locale aggiorna il cloud solo dopo conferma e verifica atomica della versione.
- Se il cloud cambia nuovamente durante la risoluzione, il sistema mostra l'errore e mantiene aperto il conflitto; l'utente può aggiornare il confronto e decidere di nuovo.
- Il confronto mostra valori dei campi principali, evidenziando in grassetto i valori divergenti. La decisione resta manuale; nessuna strategia last-write-wins.

### Stato e limiti
- UI e API di risoluzione: CODICE COMMITTATO NEL REPOSITORY.
- Controllo ottimistico finale sull'UPDATE: IMPLEMENTATO NEL CODICE, non ancora verificato su Supabase live.
- Test runtime con due dispositivi, race condition e ruoli distinti: DA ESEGUIRE.
- Deploy Netlify e Supabase: NON ESEGUITI. Netlify resta in attesa del ripristino crediti del 4 dicembre 2026.
- La funzione locale/cloud non deve essere considerata operativa in produzione fino ad applicazione delle migrazioni richieste, deploy e collaudo autenticato.


## 21. Cronologia e tracciabilità modifiche Lead (10 novembre 2026)

- Aggiunta la migrazione `20261110000900_nextway_lead_audit_trail.sql` che crea `nextway_lead_audit_logs`.
- Un trigger AFTER INSERT/UPDATE/DELETE su `nextway_leads` registra azione, timestamp, actor_profile_id, proprietario del Lead al momento dell'evento, campi modificati e snapshot precedente/successivo.
- Gli eventi UPDATE vengono registrati solo se cambia almeno un campo diverso da `updated_at`; le modifiche automatiche del solo timestamp non generano rumore.
- La tabella audit non ha FK verso il Lead: una cancellazione fisica del Lead non cancella la cronologia. actor_profile_id usa ON DELETE SET NULL per conservare l'evento anche se un profilo viene eliminato.
- RLS è abilitata. La lettura è consentita al proprietario storico del Lead o a platform_admin; agli utenti authenticated viene concesso SELECT, nessuna policy di scrittura è prevista. Scrittura esclusiva tramite trigger SECURITY DEFINER con search_path fisso; EXECUTE della funzione trigger è revocato.
- `nextway-cloud.js` espone getLeadHistory(cloudId), con query autenticata e limite massimo 50 eventi per Lead.
- `nextway-ai.html` mostra il pannello Cronologia modifiche nelle schede Lead sincronizzate: data/ora, attore (UUID profilo), azione e valori precedenti/successivi dei campi modificati. I dati audit sono inseriti nel DOM con textContent, non con HTML interpretato.

### Stato e limiti
- Migrazione, API e UI: COMMITTATE NEL REPOSITORY.
- Cronologia retroattiva: NON DISPONIBILE. Gli eventi iniziano solo dopo l'applicazione della migrazione e l'attivazione del trigger.
- Identità dell'attore: per ora viene mostrato l'UUID del profilo. Nome leggibile da profili da aggiungere solo dopo verifica certa dello schema profiles live.
- Consultazione: massimo 50 eventi per Lead; paginazione/filtri avanzati non implementati.
- Test runtime RLS, trigger, insert/update/delete e conservazione dopo cancellazione: DA ESEGUIRE su Supabase.
- Migrazione NON applicata; nessun deploy Supabase o Netlify eseguito. Netlify resta in attesa del 4 dicembre 2026.


## 22. Registro attività dell’organizzazione (10 novembre 2026)

- `nextway-cloud.js` aggiunge la vista **Registro attività organizzazione** alla Connessione centrale.
- Il pannello è visibile solo dopo autenticazione e verifica del ruolo `platform_admin` leggendo il profilo corrente. La funzione `getOrganizationActivity()` ripete il controllo del ruolo prima di ogni lettura: la sola visibilità UI non è considerata un controllo di sicurezza.
- La query legge `nextway_lead_audit_logs` e seleziona esclusivamente ID Lead, proprietario, attore, azione, campi modificati, timestamp e nome pubblico del Lead estratto dagli snapshot. Non scarica gli snapshot completi, le note o le evidenze.
- Filtri disponibili: data iniziale, data finale, tipo operazione (INSERT/UPDATE/DELETE) e UUID del profilo proprietario. Ordinamento cronologico decrescente e paginazione a blocchi di 100 eventi.
- Le operazioni di archiviazione/ripristino, quando la migrazione 008 sarà applicata, risultano nel registro come UPDATE con i campi di archiviazione modificati. La risoluzione di un conflitto compare come UPDATE del Lead: non viene inventato un evento separato di conflitto risolto.
- Per i Lead eliminati il nome viene recuperato dallo snapshot precedente; se non disponibile, viene mostrato un identificativo descrittivo neutro.
- I nomi leggibili di partner e operatori sono stati aggiunti successivamente: la risoluzione usa `profiles.full_name` e `partner_details.first_name/last_name`; i dettagli sono documentati nella sezione 25.
- Tutti i contenuti dinamici vengono inseriti con `textContent`; nessuno snapshot o contenuto audit viene interpretato come HTML.

### Stato e limiti

- API, pannello amministrativo e filtri: **COMMITTATI NEL REPOSITORY**.
- Verifica sintattica JavaScript del file `nextway-cloud.js`: SUPERATA dopo l’ultima correzione.
- Query PostgREST, autorizzazioni RLS, visibilità del ruolo, paginazione e resa UI: **DA TESTARE SU SUPABASE**.
- La vista dipende dalla migrazione `20261110000900_nextway_lead_audit_trail.sql`, che non risulta applicata al database live.
- Nessun deploy Netlify o Supabase eseguito. Netlify resta in attesa del ripristino dei crediti il 4 dicembre 2026.


## 23. Minimizzazione degli snapshot audit (10 novembre 2026)

- Nuova migrazione `20261110001000_nextway_audit_data_minimization.sql` sostituisce la funzione trigger `nextway_capture_lead_audit()` mantenendo il trigger esistente.
- I nuovi snapshot INSERT/UPDATE/DELETE escludono i valori di `notes` e `public_evidence`. I nomi dei campi restano in `changed_fields`, così si continua a sapere che un campo è stato modificato senza conservare il suo contenuto nel registro.
- Per rilevare le modifiche UPDATE, il confronto avviene sui record completi in memoria della funzione trigger; vengono persistiti soltanto gli snapshot minimizzati.
- La UI Cronologia Lead mostra un messaggio di valore omesso per questi due campi.
- **Importante:** la migrazione non modifica gli eventi storici già registrati. Gli snapshot precedenti alla migrazione 010 possono ancora contenere quei valori. La loro eventuale redazione richiede una decisione separata e una migrazione esplicitamente approvata.
- Ordine migrazioni: prima `20261110000900_nextway_lead_audit_trail.sql`, poi `20261110001000_nextway_audit_data_minimization.sql`.
- Stato: codice e documentazione nel repository; migrazione non applicata su Supabase; test SQL non eseguiti.


## 24. Controlli statici automatici (10 novembre 2026)

- Aggiunto `scripts/validate-nextway-audit.mjs`, senza dipendenze esterne: controlla parsing JavaScript di `nextway-cloud.js` e degli script inline di `nextway-ai.html`, struttura essenziale della migrazione audit, accesso amministrativo, paginazione e minimizzazione dei nuovi snapshot.
- Aggiunto workflow `.github/workflows/nextway-static-validation.yml`, attivato da modifiche rilevanti su `main` e pull request.
- Il workflow usa Node.js 22 e permessi GitHub in sola lettura (`contents: read`).
- Stato: script e workflow committati; esecuzione GitHub Actions non ancora osservata. I controlli statici eseguiti in questa sessione sono separati dall'esito futuro del workflow.
- Questi controlli non sostituiscono test SQL/Postgres, RLS, Supabase Auth, PostgREST o test browser.

- Prima esecuzione GitHub Actions sul commit `b512b7450da927e04cad12c64d572d0d9ad2711b`: **SUCCESS**; job `validate` e step `Validate NEXTWAY audit` completati senza errori. Questo conferma i soli controlli statici definiti nello script.

- Dopo l'ultima revisione della migrazione 010, GitHub Actions ha eseguito nuovamente il workflow sul commit `d96906a5ba07312e5af1ad9ee97bc27d23e2e14a`: **SUCCESS** (job `validate`).

## 25. Diagnostica schema identità profili (10 novembre 2026)

- Eseguita dall'utente nel SQL Editor Supabase la diagnostica read-only su `information_schema.columns` e sui vincoli FK di `profiles` e `partner_details`.
- Schema verificato: `profiles` contiene `id`, `full_name`, `email`, `role`, `sponsor_id`, `team_leg`, `active`, `created_at`, `updated_at`. `partner_details` contiene `profile_id`, `first_name`, `last_name`, `phone`, `language`, `sponsor_profile_id`, `team_side`, `status`, `created_at`, `updated_at`.
- Relazioni FK verificate: `partner_details.profile_id -> profiles.id`; `partner_details.sponsor_profile_id -> profiles.id`; `profiles.sponsor_id -> profiles.id`.
- Aggiornato `nextway-cloud.js`: il Registro attività organizzazione raccoglie gli ID proprietario e operatore presenti nella pagina di eventi, prova a risolvere i nomi tramite `profiles.full_name` e poi tramite `partner_details.first_name/last_name`, e mostra i nomi al posto degli UUID. Se una lettura dei profili non è autorizzata o un nome non è disponibile, il registro usa un fallback neutro e continua a visualizzare gli eventi. L'ID proprietario resta disponibile come filtro facoltativo.
- La risoluzione dei nomi usa query separate e limitate agli ID effettivamente presenti negli eventi caricati; non recupera email né numeri telefonici.
- Commit codice: `0fd2e88bd95bff97a0640e30d9d830d9af851942`.
- Stato: schema verificato dall'output SQL condiviso dall'utente; codice committato nel repository. Test PostgREST/RLS e browser live ancora da eseguire. Nessun deploy Netlify o Supabase eseguito. Netlify resta in attesa del ripristino dei crediti il 4 dicembre 2026.


## 26. Validazione della risoluzione identità nel registro (10 novembre 2026)

- Esteso `scripts/validate-nextway-audit.mjs` per controllare che la UI usi esclusivamente i campi anagrafici verificati: `profiles.id/full_name` e `partner_details.profile_id/first_name/last_name`.
- I controlli verificano anche l'associazione dei nomi a proprietario e operatore, i fallback quando il nome non è disponibile, il controllo `platform_admin` e l'assenza di selezione di email e telefono nelle query anagrafiche.
- Commit del validatore: `a60517b1d2186e35bbce323c8b73793833dd8b50`.
- GitHub Actions run `42801788640`: **SUCCESS**, job `validate` completato.
- Questo esito conferma parsing e controlli statici; non prova che le query PostgREST siano autorizzate dalle policy RLS live o che la UI funzioni in browser.
- Nessuna migrazione applicata e nessun deploy eseguito.


## 27. Normalizzazione dei nomi nel registro (10 novembre 2026)

- Normalizzato `profiles.full_name` con `trim()` prima di inserirlo nella mappa dei nomi: stringhe vuote o composte da spazi non vengono visualizzate come nomi validi.
- La risoluzione da `partner_details.first_name/last_name` resta prioritaria quando entrambi i campi producono un nome, perché viene applicata dopo il fallback `profiles.full_name`.
- Le query anagrafiche continuano a essere non bloccanti: eventuali errori di lettura non interrompono il registro e producono il fallback neutro.
- Validatore aggiornato per controllare normalizzazione, comportamento non bloccante e fallback.
- Commit codice: `ef431cfdcf10a6c8498b66fe15296ae4db2ee8f1`.
- Commit validatore: `3c7f9027bcb6c17d5a2a5bb177eb68fe71a67c4d`.
- GitHub Actions run `42801908730`: **SUCCESS**, job `validate` e step `Validate NEXTWAY audit` superati.
- Test live PostgREST/RLS e browser ancora da eseguire dopo disponibilità del deploy; nessuna migrazione o pubblicazione eseguita.


## 28. Controlli automatici API archiviazione logica Lead (10 novembre 2026)

- Esteso `scripts/validate-nextway-audit.mjs` per verificare l'API frontend `archiveLead`/`restoreLead`, il timestamp di archiviazione, la cancellazione dei metadati al ripristino, il limite di 500 caratteri per il motivo e i campi restituiti.
- Aggiunti al piano di collaudo i test live per archiviazione, ripristino, audit UPDATE, autorizzazioni owner/admin e assenza di DELETE fisico.
- Commit validatore: `f5a93644d5ac97e5e14787fe3414fd2a7c41f737`.
- Commit piano di test: `886cff668f51f136a8149a1d22b38b51822b27ab`.
- Workflow GitHub Actions run `42802356565`: avviato; esito da verificare.
- Nessuna migrazione applicata e nessun deploy eseguito. I test live restano subordinati a un ambiente Supabase di test e all'applicazione autorizzata delle migrazioni.


## 29. Rifinitura del flusso amministrativo Lead (10 novembre 2026)

- La cronologia del singolo Lead risolve ora il nome dell’operatore tramite i campi verificati di `profiles` e `partner_details`, con fallback neutro e query limitate agli ID presenti negli eventi.
- L’annullamento del prompt del motivo interrompe l’archiviazione: non viene più interpretato come conferma con motivo vuoto.
- Il comando di rimozione dall’archivio locale è stato rinominato **Rimuovi copia locale** e chiarisce che non elimina il record cloud né la cronologia; una sincronizzazione successiva può reimportare il record cloud.
- Il validatore statico controlla questi comportamenti insieme ai controlli esistenti su audit, identità e archiviazione.
- Stato: modifiche committate su GitHub; test statici automatici da verificare dopo il push. Nessuna migrazione Supabase, nessun deploy e nessun test runtime eseguiti.

- Rifinita la scheda Lead: quando il record è archiviato, mostra chiaramente data/ora e motivo dell’archiviazione; se il motivo è assente usa un fallback neutro. Il controllo è incluso nel validatore statico.


## 29. Gestione Lead — protezione sincronizzazione e archivio leggibile (10 novembre 2026)

- La scheda Lead archiviata mostra data e motivo dell'archiviazione.
- Archiviazione/ripristino impediti quando esistono modifiche locali non sincronizzate o un conflitto aperto; evita di marcare come sincronizzati dati non salvati sul cloud.
- Il motivo è limitato a 500 caratteri anche nell'interfaccia; l'utente può annullare la richiesta senza eseguire l'archiviazione.- Rimossa l'assegnazione impropria local_dirty=false dopo la modifica di archiviazione: la funzione non deve nascondere modifiche locali pendenti.
- La cronologia per Lead mostra già il nome dell'operatore dai campi profiles e partner_details; aggiunto controllo statico per questa risoluzione.
- Stato: codice e documentazione salvati su GitHub; validazione GitHub Actions da eseguire. Nessun deploy Netlify e nessuna migrazione Supabase.


## 30. Concorrenza sicura su archiviazione e ripristino (10 novembre 2026)

- Le operazioni di archiviazione/ripristino richiedono la versione cloud aggiornata del Lead.
- UPDATE condizionato su id + updated_at: se il record è stato modificato nel frattempo da un'altra sessione, nessuna modifica viene applicata e la UI chiede di ricaricare.
- Il timestamp viene passato dalla scheda Lead a entrambe le operazioni; il validatore statico controlla l'intero percorso.
- Stato: sorgenti e documentazione salvati su GitHub; GitHub Actions run 42803042485 = SUCCESS sul commit daae610. Validazione solo statica; nessun deploy Netlify e nessuna migrazione Supabase.


## 31. Controllo statico delle autorizzazioni audit e trigger soft-archive (10 novembre 2026)

- Validatore esteso alla policy SELECT dell'audit: proprietario storico o platform_admin.
- Verificata staticamente l'assenza di policy dirette INSERT/UPDATE/DELETE sull'audit e la concessione SELECT ai soli utenti autenticati.
- Verificati staticamente i trigger soft-archive: autenticazione obbligatoria, archived_by = auth.uid(), pulizia dei metadati al ripristino e revoca EXECUTE della funzione trigger.
- Questi controlli non sono test runtime: le migrazioni 008-010 restano da applicare e collaudare su Supabase con profili distinti.

- Validazione statica sezione 31: GitHub Actions run 42803134517 = SUCCESS (commit 4355756). Non equivale a test RLS o SQL runtime.


## 32. Matrice autorizzazioni Lead per ruolo (10 novembre 2026)

### Regole effettivamente presenti nel sorgente SQL

| Ruolo | Visualizza Lead | Crea Lead | Modifica Lead | Archivia / ripristina | Eliminazione fisica | Cronologia audit |
|---|---|---|---|---|---|---|
| platform_admin | Tutti | Tutti | Tutti | Tutti | Tutti | Tutta l'organizzazione |
| director | Solo propri | Solo propri | Solo propri | Solo propri | Solo propri | Solo eventi dei propri Lead |
| team_leader | Solo propri | Solo propri | Solo propri | Solo propri | Solo propri | Solo eventi dei propri Lead |
| sponsor | Solo propri | Solo propri | Solo propri | Solo propri | Solo propri | Solo eventi dei propri Lead |
| partner | Solo propri | Solo propri | Solo propri | Solo propri | Solo propri | Solo eventi dei propri Lead |

### Interpretazione e limiti

- Le policy RLS presenti in `supabase/nextway_leads.sql` autorizzano SELECT, INSERT, UPDATE e DELETE se `owner_profile_id = auth.uid()`, oppure se il profilo autenticato ha ruolo `platform_admin`.
- Nelle policy Lead non esistono eccezioni per `director`, `team_leader` o `sponsor`: il loro ruolo organizzativo non amplia la visibilità sui Lead di altri profili.
- Archiviazione e ripristino sono UPDATE del record e quindi seguono la stessa regola di proprietà, oltre al controllo di concorrenza `updated_at`.
- L'audit è leggibile dal proprietario storico del Lead o da `platform_admin`; non sono previste scritture dirette da parte del client.
- La cancellazione fisica è consentita dalla policy al proprietario e all'amministratore, ma il flusso ordinario deve preferire l'archiviazione logica.
- Questa matrice descrive le policy nel repository. Non certifica che ogni migrazione sia applicata sul progetto Supabase live né che i test multiutente siano stati eseguiti.
- I permessi delle tabelle conversazioni e messaggi non vengono dedotti da questa matrice: il loro schema/policy effettivo richiede un audit separato.
- Nessun accesso gerarchico di director/team_leader/sponsor va aggiunto prima di una decisione funzionale esplicita e di policy RLS dedicate.

Il validatore statico controlla ora la presenza dei quattro ambiti RLS e l'assenza di privilegi speciali impliciti per i ruoli organizzativi non amministrativi.


## 33. Diagnostica permessi AI Setter (10 novembre 2026)

- Preparata `supabase/diagnostics/nextway_setter_permissions_readonly.sql`, query read-only che rileva colonne, stato RLS/FORCE RLS, policy USING/WITH CHECK, grants, foreign key, firme/SECURITY DEFINER/privilegi EXECUTE delle RPC AI Setter e indici delle tabelle conversazioni, messaggi e tabelle di servizio `nextway_setter_generation_requests` / `nextway_api_rate_limits`.
- La diagnostica non legge record applicativi e non modifica schema, dati o permessi.
- I permessi delle conversazioni e dei messaggi restano non certificati finché non viene esaminato l'output del progetto Supabase live. Non dedurre i permessi dalla matrice Lead.

## 34. AI Setter — retry sicuro dopo creazione prospect (10 novembre 2026)

- Corretto `nextway-setter.js`: dopo che la RPC ha creato il Lead e la conversazione, l'ID conversazione viene conservato prima di avviare il caricamento e la generazione AI.
- Se caricamento o generazione falliscono, il pulsante passa a un'azione di retry che riutilizza la conversazione già creata; non richiama la RPC di creazione e quindi evita duplicati causati da un nuovo invio del modulo.
- Il modulo viene azzerato subito dopo la creazione confermata, non dopo la generazione AI: in caso di errore l'utente non rischia di reinviare gli stessi dati come nuovo prospect.
- Il selettore delle conversazioni esclude quelle con stato `closed` o `archived`, che l'Edge Function rifiuta comunque per nuove generazioni.
- Esteso `scripts/validate-nextway-audit.mjs` per includere il parsing JavaScript di `nextway-setter.js` e controlli statici sui percorsi di retry e sull'esclusione delle conversazioni chiuse.
- Commit frontend: `bbc582a7ff350fffd5c3c908513a698b89cff7e0`.
- Commit validatore: `3182aeaa0b574d7ba06a36106cbf3c76359278ed`.
- GitHub Actions run `42803941984`: **SUCCESS**, job `validate`, step `Validate NEXTWAY audit`.
- Questo esito certifica parsing e controlli statici, non il comportamento runtime del browser, RPC o Supabase live.
- Nessuna migrazione applicata; nessun deploy Netlify o Supabase eseguito.

## 35. Verifica endpoint Edge Function AI Setter — discrepanza da risolvere

- Il frontend versionato in `nextway-setter.js` usa attualmente `ENDPOINT = '/functions/v1/nextway-ai-setter'`.
- Nelle precedenti verifiche della dashboard Supabase era stato riferito l'endpoint effettivo `/functions/v1/rapid-function`, mentre `nextway-ai-setter` era il nome mostrato della funzione. Non è disponibile una verifica live aggiornata che dimostri che l'URL sia stato rinominato o che esista un alias.
- Non modificare automaticamente il frontend verso `rapid-function` e non dichiarare funzionante l'integrazione: il nome visualizzato e l'URL invocabile devono essere confrontati con il valore esatto mostrato da Supabase nella scheda della funzione.
- Stato: **BLOCCATO DA CONFERMA ENDPOINT LIVE**. Il test GitHub statico non verifica la raggiungibilità dell'Edge Function.
- Nessun deploy Supabase eseguito.

## 36. AI Setter — recupero della conversazione dopo reload (10 novembre 2026)

- Il contesto del prospect appena creato non resta più soltanto in una variabile JavaScript: `nextway-setter.js` salva in `sessionStorage` l'ID della conversazione e l'obiettivo della bozza.
- Al ricaricamento della pagina il sistema ripristina ID e obiettivo, preseleziona la conversazione e propone il retry senza richiamare la RPC di creazione.
- La chiave di sessione viene rimossa soltanto dopo la generazione completata; se il tentativo fallisce, il contesto resta disponibile per riprovare.
- Il valore recuperato viene validato come UUID e l'obiettivo viene accettato solo se appartiene alla lista prevista.
- Commit frontend: `6cc702d6078eed6ba198b75c28f463023607eeee`.
- Commit validatore: `a4b0ba4ec6c41709a325023890f6d07e09bbf232`.
- GitHub Actions run `42804560636`, commit `1f4a6c79c120cbf8e760d7f53900c3e0c6cc7e80`: **SUCCESS**; job `validate` e step `Validate NEXTWAY audit` superati. Il controllo statico non sostituisce il test runtime di refresh/sessionStorage e la verifica Supabase live.
- Limite residuo: la protezione copre il caso in cui il browser abbia ricevuto l'ID dalla RPC; non rende idempotente la RPC di creazione in caso di timeout ambiguo prima che il client riceva la risposta. Non aggiungere idempotenza DB senza migrazione approvata.

## 37. AI Setter — minimizzazione dei dati inviati al provider AI (10 novembre 2026)

- La Edge Function `supabase/functions/nextway-ai-setter/index.ts` ora costruisce il contesto AI tramite allowlist esplicita, senza fare spread dell'intero record Lead.
- Le note libere (`nextway_leads.notes`) non vengono più lette dalla query usata per la generazione e non vengono inviate al provider.
- Email, URL e sequenze numeriche compatibili con recapiti telefonici vengono sostituite prima dell'invio al provider; la sanitizzazione è applicata a evidenza pubblica, campi testuali del prospect, obiettivo e storico messaggi.
- I limiti di lunghezza sono espliciti per campo; il testo dello storico viene limitato a 1.500 caratteri per messaggio e l'evidenza pubblica a 2.000.
- Il workflow GitHub ora si attiva anche sulle modifiche a `supabase/functions/nextway-ai-setter/**`.
- Commit Edge Function: `91f09c0cd8dcb95e5b6964fa7c33442c1cc2409c`.
- Commit validatore: `2bc2f15890d81f3fb2ccdb29ac0b566dc73fe4cf`.
- Commit workflow: `9b94928aa2e306b928d356e9dd648bf3bf95b6ef`.
- GitHub Actions run `42805023373`, commit `e87081095b48939099abcb43d681c3eaa8c1a4f1`: **SUCCESS**; job `validate`, step `Validate NEXTWAY audit` e nuovo step `Type-check AI Setter Edge Function` superati con Deno 2.
- La validazione è statica: non è un test Deno runtime né una verifica della chiamata effettiva a OpenAI. La modifica Edge Function è salvata su GitHub ma non è stata distribuita su Supabase.
- Nota di conformità: la sanitizzazione riduce l'invio accidentale di recapiti evidenti, ma non garantisce anonimizzazione completa né sostituisce informativa, base giuridica e valutazione GDPR del trattamento.


## 38. Idempotenza transazionale creazione Lead/conversazione (10 novembre 2026)

- Preparata la migrazione `supabase/migrations/20261110001100_nextway_lead_creation_idempotency.sql`.
- La nuova RPC `nextway_create_lead_with_conversation_idempotent` riceve `request_id` UUID e fingerprint SHA-256 del payload; la chiave è univoca per `owner_profile_id`.
- La tabella `nextway_lead_creation_requests` conserva soltanto proprietario, chiave, hash, risposta con ID Lead/conversazione e timestamp: non conserva il payload personale.
- La tabella usa RLS owner-scoped. La RPC è `SECURITY INVOKER`, con `search_path` fissato e privilegi EXECUTE revocati a `public`/ `anon`, concessi ad `authenticated`.
- La funzione registra la chiave, richiama la RPC esistente `nextway_create_lead_with_conversation` nella stessa transazione e salva la risposta. Richieste ripetute con la stessa chiave e lo stesso hash ricevono la risposta originaria; una chiave riutilizzata con hash diverso viene rifiutata. Errori o risposte incomplete provocano rollback, inclusa la prenotazione della chiave.
- `nextway-setter.js` conserva prima della chiamata di rete la chiave, il fingerprint e il payload nella sessione della scheda. Se non riceve risposta, ripete esattamente la richiesta originale; il modulo viene ripristinato al reload. La memoria viene rimossa soltanto dopo una risposta di creazione confermata.
- Il payload viene serializzato nel browser e il suo SHA-256 è calcolato con Web Crypto. Se sessionStorage o Web Crypto non sono disponibili, la chiamata non viene inviata senza protezione idempotente.
- Commit migrazione: `df95e3e53ffa96e50bc8a745a9359f0b67fa6bf4` (successiva correzione rollback `c4e13e8a95ae9c847d7b466165006911454d9f6c`).
- Commit frontend: `7eaf8cd2d20aff0c2e1cdead2a6f1f5065ebcd73`.
- Commit validatore: `5adf96007802fe1337647e9ff0bde707eef276af`.
- Commit workflow: `4ebc44be7f16014895904a7f8e0ecf7f7db296e5`.
- GitHub Actions run `42805580487` e run finale `42805604904`: **SUCCESS**; job `validate`, validazione statica Node e type-check Deno superati. Run finale: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/42805604904.
- La migrazione è solo preparata nel repository: non applicata su Supabase. Il wrapper presuppone che la RPC live a 7 parametri `nextway_create_lead_with_conversation` esista con la firma e il comportamento già verificati; la diagnostica read-only è stata estesa per controllare la nuova RPC e la nuova tabella dopo l'eventuale applicazione.
- Prima dell'applicazione live restano necessari: verifica della firma RPC sottostante, revisione SQL sul progetto, test con due chiamate concorrenti e stesso/differente payload, test RLS con due utenti e test di errore/rollback.
- Nessun deploy Supabase o Netlify eseguito; nessuna migrazione applicata.


## 39. Hardening finale idempotenza e isolamento sessione (10 novembre 2026)

- La richiesta Lead sospesa in `sessionStorage` è associata al profilo autenticato che l'ha avviata. Dopo un cambio account, NEXTWAY non ripristina il payload personale nel modulo e impedisce il retry dal profilo diverso.
- Anche l'ID della conversazione sospesa dopo una creazione confermata è associato al profilo proprietario; il retry viene bloccato se l'utente autenticato non coincide.
- Corretto il recupero in cui, dopo una risposta RPC ricevuta, restassero temporaneamente sia l'ID conversazione sia la chiave della richiesta: il completamento del retry cancella entrambi gli stati locali.
- Aggiunta alla migrazione 011 la funzione manuale admin-only `nextway_prune_lead_creation_requests()`, che elimina le chiavi più vecchie di 30 giorni. Non è stato creato alcun job automatico.
- La diagnostica read-only include anche la nuova RPC di pulizia e la tabella `nextway_lead_creation_requests` in tutte le sezioni: colonne, RLS, policy, grants e indici. Ultimi commit diagnostica: `01e823d5680e7469333db7a13aaec4c46c752be2` (tabelle di servizio in tutte le sezioni) e `7823f47f9847c5c9fda944a4ab5f6bf24aa3a9b9` (numero argomenti, default e tipo restituito delle RPC).
- Commit cleanup SQL: `69a0ef1ff1a3cee6cdc7eff956ca542a5862c6c0`; diagnostica: `d77acb2dee269bee3c20a6b01f434667040099e9`.
- Commit frontend profilo conversazione: `d717f99c98a285c9b7923eb49f1469827cd1f5b7`; validatore finale: `1e39155596a89093a07a153f74ff227546bcb3c7`.
- GitHub Actions run `42806035763`: **SUCCESS**; validazione statica Node e type-check Deno superati.
- Nessuna migrazione applicata e nessun deploy Supabase/Netlify eseguito. I test runtime, SQL, RLS multiutente e concorrenza restano da svolgere dopo autorizzazione e verifica della RPC sottostante.


## 40. Validazione rigorosa URL esterni (10 novembre 2026)

- Aggiunto `safeHttpUrl` nella UI Lead e nella connessione centrale: accetta soltanto URL assoluti HTTP/HTTPS con hostname e senza credenziali incorporate.
- La UI Lead applica la validazione in inserimento manuale e import CSV; i record storici non validi non ricevono un collegamento attivo nella visualizzazione.
- La ricerca web assistita scarta i risultati privi di URL valido prima di renderizzare il collegamento o trasferire la fonte nel modulo Lead.
- Il validatore statico verifica la presenza e l'uso della validazione nei due frontend.
- Commit UI Lead: `5b3212de459718c0fd2e8ed7e6e2aabb2a6e3465` e correzione rendering `47f413fa26aee03f22aceff2b9a2075f3795b27c`; connessione/ricerca: `483c908a381ea28453b9799ecbd70c28cbed736f`; validatore: `e5901c59cbcb3b3e4ebaf24affd73ce824bc557e`.
- GitHub Actions run `42806931080`: **SUCCESS**, validazione statica Node e type-check Deno superati anche dopo la correzione finale che rimuove completamente il collegamento per gli URL storici non validi. Run: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/42806931080.
- Nessun dato preesistente modificato; nessuna migrazione applicata; nessun deploy Supabase o Netlify eseguito.

## 41. Isolamento dell'archivio Lead locale per account (10 novembre 2026)

- L'archivio locale non viene più letto/scritto con una chiave browser globale condivisa: la chiave è `nextway_ai_records_v1:<profile UUID>`.
- L'area Lead parte vuota fino all'autenticazione. Creazione, importazione, ripristino e cancellazione richiedono un profilo autenticato.
- Login, ripristino sessione e cambi di stato Supabase attivano l'archivio del profilo corrente. Logout o sessione assente svuotano i dati dalla memoria della pagina e ripuliscono i risultati/registro visibili.
- Sincronizzazione e caricamento cloud usano esclusivamente la chiave locale derivata dall'ID del profilo autenticato; i Lead nuovi ricevono comunque `owner_profile_id = auth.uid()`. RLS resta il controllo server-side.
- Il vecchio archivio globale `nextway_ai_records_v1` non viene letto, sovrascritto o cancellato. Rimane conservato ma isolato: non viene assegnato automaticamente al primo utente che effettua login, perché il browser non può dimostrarne il proprietario.
- Commit: UI `4d65326eb3df2777f9eedb5b9dc782a2dd4948f9`; cloud/sync `33615b41f9d10f554069cf05d2a2eac3afcd83a6`; listener auth `65f219f8e15247f69f55d49d099c0453eb484e8f`; pulizia pannelli su cambio account `aff12877e82ffddfd27f84a29df6d7f76f1b477b`; reset sessione al cambio configurazione Supabase `74931324e1dff829cf3210f3a88207687a00ab26`; validatore `8688654a3ccc3d7f40ab3c6f219b398f1ab4b83e` e controllo cambio account `d051575d840f790cf2c777240ff6047348d2116b`.
- GitHub Actions run `42807466889`: **SUCCESS**, validazione statica Node e type-check Deno superati. Run successiva `42807634403`: **SUCCESS**, include anche i controlli statici sullo svuotamento della UI al cambio account. Ultimo controllo dopo reset configurazione Supabase: run `42807685905`: **SUCCESS**, validazione statica Node e type-check Deno superati. Link: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/42807685905.
- Test browser ancora necessari: due account sullo stesso browser, logout/login, cambio account senza refresh, sessione scaduta, import/backup, sync/pull, e conservazione dell'archivio legacy.
- Nessuna migrazione Supabase, nessun deploy Supabase o Netlify.

## 42. Minimizzazione dei log AI Setter (10 novembre 2026)

- I log della Edge Function non stampano più oggetti di errore Supabase completi, corpi di errore OpenAI o eccezioni complete, che potrebbero contenere dettagli della richiesta o dati contestuali.
- Aggiunta `logSafeFailure`: registra soltanto codice errore e status numerico, quando presenti.
- Gli errori OpenAI registrano soltanto lo status HTTP; il catch generale registra un messaggio fisso senza contenuto dell'eccezione.
- Le risposte HTTP al client restano generiche e non espongono dettagli interni.
- Commit Edge Function `67cc1253f5fab12af16e7917560269d0ca19651f`; validatore `482781a8dc2d0377d51d371875c4a5a223c22ad1`.
- GitHub Actions run `42807835076`: **SUCCESS**, validazione statica Node e type-check Deno superati. https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/42807835076.
- La verifica è statica/type-check; nessuna chiamata runtime a OpenAI o Supabase eseguita. Nessun deploy Supabase/Netlify.


## 43. NEXTWAY CRM – modifica Lead e ordinamento operativo (10 novembre 2026)

- Aggiunto il flusso di modifica dei Lead esistenti nel modulo nextway-ai.html: il pulsante apre il modulo con i dati correnti; il salvataggio aggiorna il record locale esistente senza generare un nuovo ID o duplicare il Lead.
- La modifica conserva i metadati di sincronizzazione (cloud_id, cloud_updated_at e proprietario implicito nella sessione) e imposta local_dirty=true, così il normale comando di sincronizzazione applica l'UPDATE condizionato dalla versione cloud. Se il record remoto è cambiato, la logica esistente rileva il conflitto e non sovrascrive silenziosamente.
- Il flusso impedisce la modifica di Lead archiviati o in conflitto; il pulsante resta disabilitato in questi casi. Sono presenti annullamento modifica e controllo duplicati URL che esclude il record in corso di modifica.
- Le regole di qualificazione restano applicate anche durante la modifica: identità confermata e punteggio minimo 50 per lo stato "Qualificato".
- Aggiunto ordinamento archivio per punteggio, data più recente, data meno recente e nome A-Z, mantenendo attivi i filtri già presenti.
- Commit UI modifica Lead: 86d9b06de85d38c94dcd3579061cc012268a6014; ordinamento: 1d48f8eee4c88ba6a3dc9414ea04bf79fd5d2cb1.
- Commit validatore modifica: b3e99c286f4bd1a75dc17b7ddaafecd6947b2f9d; ordinamento: 726f2d145ad7c36afff8280f5845debe343d1a19.
- Il workflow statico è configurato per avviarsi sui cambiamenti di nextway-ai.html e del validatore. Non dichiaro ancora superato il run generato da questi ultimi commit: lo stato del run non è stato recuperato in questa sessione.
- Test browser/runtime e verifica effettiva della sincronizzazione restano da completare. Nessuna migrazione Supabase e nessun deploy Netlify eseguiti.


## 44. NEXTWAY CRM – ricerca estesa e filtri di qualificazione (10 novembre 2026)

- Estesa la ricerca testuale ai campi nome, professione, azienda/brand, località, fonte, URL, evidenza pubblica e note.
- Aggiunti filtri indipendenti per esito di prequalificazione e profilo partner, combinabili con categoria, stato, archivio e ordinamento.
- La ricerca usa normalizzazione locale della stringa in italiano; i filtri operano sui valori strutturati già presenti nel Lead, senza richiedere nuove colonne Supabase.
- Commit UI: a65f24ebc44ee3cfe6891bfda72aa14e7016a34a.
- Commit validatore: 3bfa2b371f26bb470696876741e08a4a41f8aad8.
- Controlli statici dedicati aggiunti; lo stato CI del nuovo commit non è stato ancora confermato in questa sessione. Nessun deploy o migrazione.


## 45. NEXTWAY CRM – sincronizzazione cloud con paginazione completa (10 novembre 2026)

- La funzione pullCloud non si ferma più ai primi 1.000 Lead: recupera i record autorizzati in pagine da 1.000 con range Supabase, fino all'ultima pagina.
- Mantiene invariati i controlli per proprietario tramite RLS, gestione dei record locali dirty, rilevamento conflitti e merge senza sovrascrivere modifiche locali.
- La paginazione usa ordinamento stabile secondario per ID, così record con lo stesso timestamp non dipendono da un ordinamento ambiguo tra pagine.
- Commit cloud iniziale: 5f1b05ddd61105f4992be4743b8b291c1391af62; stabilizzazione ordinamento: deac2d1883db9b2fbcfd6cf7a80523344389e8e3.
- Commit validatore: c098b17de97d5722dfd26b5d31d1172c96a1e649; controllo ordinamento stabile: d1f91719811459325be2f46e1a5c72fb031c4b70.
- Controllo statico dedicato aggiunto; il run CI non è ancora stato confermato in questa sessione. Nessun deploy o migrazione.


## 46. NEXTWAY CRM – registro interazioni e follow-up (10 novembre 2026)

- Aggiunta la migrazione additiva `20261110001200_nextway_lead_activities.sql` per il registro delle attività collegate ai Lead: telefonata, messaggio, email, incontro, nota e attività.
- Ogni evento conserva oggetto, dettagli, data/ora, autore e prossima azione facoltativa. Le prossime azioni hanno stato aperto/completato/annullato.
- RLS verifica il proprietario effettivo del Lead collegato oppure il ruolo platform_admin; l'autore è sempre l'utente autenticato. I client possono leggere/inserire e aggiornare esclusivamente lo stato del follow-up; nessun grant DELETE. La tabella non espone i dati agli account anonimi.
- `nextway-cloud.js` espone API per leggere, inserire e completare/annullare follow-up; recupera il proprietario dal record Lead lato server prima dell'inserimento.
- `nextway-ai.html` aggiunge il pannello Attività e follow-up in ogni scheda Lead sincronizzata: registra contatti e note, mostra gli ultimi 100 eventi e permette di completare/annullare promemoria aperti. I Lead locali non sincronizzati e quelli archiviati non possono ricevere attività.
- La UI usa textContent per i contenuti inseriti dagli utenti; i dettagli non vengono inseriti come HTML.
- Commit migrazione iniziale: 56c63be3fbecc039f51ced195ff0c6d255048e7d; correzione ambito RLS: 0cdb56387da92c30b78c09b7af5ab23b7ddb065a.
- Commit API cloud: 20f906e17114f4450cfea0aa8d21a130ae0b9b28; UI attività: b2c313acb5dcfd87680e77650da9d6065d185153; validatore: 760fa1ed8ad9d67cdd7e7956e81ac3735baceed1.
- Migrazione non applicata su Supabase. Il modulo attività richiede l'applicazione della migrazione prima dell'uso cloud. Test runtime e run CI ancora da confermare; nessun deploy Netlify.

- Correzione UI successiva: i Lead archiviati mantengono consultabile il registro attività, mentre il pulsante di registrazione resta disabilitato. Commit UI: f14736c1912f68f524e19eee8340d6056236fe72; controllo statico aggiuntivo: a12df0dc2edc5c613500e1bcaea23386a7ec77a2.
- Il repository non ha restituito workflow run né commit status per l'ultimo commit del validatore: CI non confermata. Non dichiarare superati i test statici fino a un esito effettivo.


## 47. NEXTWAY CRM – coda centralizzata dei follow-up (10 novembre 2026)

- Aggiunta API cloud `getOpenLeadActivities(limit=100)`: legge le prossime azioni aperte, con data scadenza crescente, limite massimo 100 e join sul nome del Lead. RLS protegge i dati e non viene introdotto accesso trasversale ai partner.
- Aggiunto in Gestione Lead il comando "Carica prossimi follow-up": mostra le azioni aperte, evidenzia quelle scadute, consente di aprire la scheda del Lead e completare il follow-up.
- La navigazione verso il Lead rimuove filtri incompatibili solo quando il Lead non è già visibile; non modifica i dati del record.
- Commit API: f7a47b3cd537c1e583e13d0ed28b19821071ceb1; UI iniziale: d52bb4a6be55d29739a7789a224ec191130a411e; correzione navigazione: 2d621cc496ac25739e1eb966a9ddd8501ea479eb; validatore: d0ba03a12984dbd150ade024bed952a47a67ca90.
- Dipendenza: migrazione 20261110001200 non applicata; coda e registro attività cloud diventano disponibili dopo l'applicazione della migrazione. CI e test runtime non confermati.

- Ultima rifinitura coda: il comando Apri Lead rimuove i filtri che impedivano la visualizzazione e apre il pannello attività; commit UI d52bb4a6be55d29739a7789a224ec191130a411e e 2d621cc496ac25739e1eb966a9ddd8501ea479eb. Ultimo validatore coda: d0ba03a12984dbd150ade024bed952a47a67ca90.


## 48. Robustezza apertura Lead dalla coda follow-up (10 novembre 2026)

- Risolto il caso in cui un follow-up è presente nel cloud ma il Lead collegato non è ancora nella cache locale del browser.
- `nextway-cloud.js` espone `getLeadById(cloudId)`, che recupera un singolo Lead tramite sessione autenticata e RLS Supabase, restituendo il record normalizzato e la versione cloud.
- Il pulsante "Apri Lead" recupera il Lead solo se manca dalla cache, lo inserisce nell'archivio locale associato al profilo e lo mostra rimuovendo i filtri UI incompatibili. Non sovrascrive record locali già presenti o modifiche locali non sincronizzate.
- Commit API: 812378019f9d7751c7c2c92385349b988695a5a3; UI: f6c2f8d270aa06c52bc6103c193efa24527c3dcb; validatore: b5771aaf00bed9bc018792583217044e880223d6.
- Test runtime non eseguiti; migrazione 012 non applicata e deploy Netlify non effettuato.

- Rifinitura coda follow-up: riepilogo conteggi per attività scadute, in scadenza oggi ed entro 7 giorni; tipi di contatto tradotti in italiano. Commit UI: 153bc556e9a681b97a792b44168bf3a540da75da; validatore: 28c0850a4b5b5e0c5092db29b79a20a8fac16eb6.


## 49. Ciclo di vita commerciale dei Lead (10 novembre 2026)

- Esteso lo stato CRM da quattro a nove fasi: Da verificare, Verificato, Contattato, In follow-up, In valutazione, Convertito cliente, Convertito partner, Non interessato, Escluso.
- Nuova migrazione `20261110001300_nextway_lead_lifecycle.sql`: aggiorna il vincolo CHECK sul campo `status`, mantenendo validi tutti i valori precedenti. Non cambia i record esistenti e non crea automaticamente righe in `clients` o `profiles`.
- UI: filtro per tutte le fasi; selettore stato per ogni Lead; riepilogo dei Lead contattati, in follow-up, in valutazione e convertiti.
- Sync e import: whitelist estesa alle nove fasi, così gli stati non vengono degradati a "Da verificare" durante sincronizzazione/importazione.
- Commit migrazione: d38d7ce53fd7259b331ec057b5de60dfc1eb958d; UI: 89c2e9dc338b3b8f6a42a1e73a7eb7bf8b91cbaa; sync: edded501faf1e852b8992232c4d336b1b409154e; validatore: a09a1f9a3f722fcca126f54f5730788dc5a4bf56.
- Migrazione non applicata live; test runtime non eseguiti; deploy Netlify non effettuato.


## 50. NEXTWAY CRM — conversione assistita Lead → cliente/partner e stato CI (10 novembre 2026)
### Modifiche effettivamente presenti nel repository

- Migrazione: `supabase/migrations/20261110001400_nextway_lead_conversion_requests.sql`.
- Diagnostica read-only: `supabase/diagnostics/nextway_conversion_schema_readonly.sql`.
- API cloud: `nextway-cloud.js`.
- UI Lead e coda amministrativa: `nextway-ai.html`.
- Validatore: `scripts/validate-nextway-audit.mjs`.
- Workflow: `.github/workflows/nextway-static-validation.yml`.

### Funzionamento implementato nel codice

- Un Lead può avviare una richiesta solo se è sincronizzato nel cloud, non è archiviato, non è in conflitto e si trova nello stato `In valutazione`.
- La richiesta distingue `customer` e `partner`; richiede nome ed email e accetta un telefono facoltativo.
- L'API recupera il Lead autenticato tramite Supabase, imposta `owner_profile_id` dal record cloud, imposta `sponsor_profile_id` uguale al proprietario e registra `created_by` come utente autenticato.
- La tabella `nextway_lead_conversion_requests` prevede: `id`, `lead_id`, `owner_profile_id`, `sponsor_profile_id`, `created_by`, `conversion_type`, `full_name`, `email`, `phone`, `status`, `review_notes`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.
- Gli stati previsti sono `pending`, `ready_for_activation`, `rejected`. Indici parziali univoci impediscono richieste attive duplicate per lo stesso Lead o per la stessa email normalizzata.
- RLS nel file SQL: SELECT per proprietario o `platform_admin`; INSERT per il proprietario autenticato del Lead o `platform_admin`, con controllo su proprietà, sponsor, Lead non archiviato e stato `In valutazione`; UPDATE riservato a `platform_admin`. Non è concesso DELETE.
- La coda amministrativa carica fino a 100 richieste pendenti. La revisione può impostare `ready_for_activation` o `rejected`; il codice client richiede una motivazione per il rifiuto.
- Le richieste respinte possono essere ripresentate; una richiesta pendente o pronta blocca un'altra richiesta attiva sullo stesso Lead/email.
- Il trigger di revisione intende rendere la decisione singola e i dati originari immutabili.
- Il flusso **non** crea account Auth, `profiles`, `partner_details` o `clients`: `ready_for_activation` significa soltanto “pronta per un processo separato”, non attivazione completata.

### Commit rilevanti esaminati

- Migrazione iniziale: `d7767d65b7ff96f7fb040631e263d03d180463bd`.
- API cloud: `0bf4aa44082dad3bd42c1776bcdef7722937366b`.
- UI richiesta: `9a083d64c6405f79259f2f0ee2307bf2bca24e4b`.
- Coda amministrativa: `71852ab13904fd53be08cf73650a49d08c6dcde1`.
- Vincolo fase `In valutazione`: `4df52ba3cfdb63aeb42ae1856bc10c55cd2057be`.
- Ripresentazione dopo rifiuto: `168956b7224c95817025f2531b3731ea40f996b5`.
- Validatore del flusso: `51c23531a2fdd072fd42b813998053d54bfbd087`.
- Motivo obbligatorio nel client: `033347fa452efd32d1f583df08ce8843cbde2898`.
- Revisione amministrativa singola/immutabile: `85eb4cb7487a403ad794467f42176644880e2cdb`.
- Controlli statici aggiuntivi: `7c80651f1b2ab906848f1e69084456dab5ab2d9d` e `7e1b5d4a3c0cd9c17036d3c0117b77b8ee0e12d9`.
- Diagnostica read-only: `1e6bedae92927a8bcf8935bf04ce55ec12667766`.

### Rilievi tecnici emersi dalla lettura statica

1. **Blocco sintattico potenziale nella migrazione:** in `nextway_guard_conversion_request_review()` il file contiene `as $` e chiude con `$;`. Il delimitatore dollar-quoted PostgreSQL deve essere valido (per esempio `$$ ... $$;`). La migrazione non deve essere applicata prima della correzione.
2. **Motivo del rifiuto non imposto dal database:** il frontend rifiuta una motivazione vuota, ma il trigger SQL non verifica che `review_notes` sia valorizzato quando lo stato diventa `rejected`. Un aggiornamento diretto autenticato potrebbe aggirare il controllo client. Aggiungere il controllo nel trigger o in un vincolo SQL.
3. **Validatore statico non allineato alla UI:** `scripts/validate-nextway-audit.mjs` richiede ancora la stringa `if(!safeHttpUrl(x.url))`; la UI corrente calcola `sourceUrl=safeHttpUrl(x.url)` e usa il risultato per mostrare un link sicuro oppure il testo “Fonte non valida”. L'asserzione fallisce anche se la logica UI attuale usa la funzione di validazione.
4. Nel run #100 il job si è fermato allo step `Validate NEXTWAY audit`; gli step `Setup Deno` e `Type-check AI Setter Edge Function` sono stati saltati. Non è quindi disponibile un esito positivo del type-check in quel run.

### Evidenze CI e stato live

- Ultimo run osservato: GitHub Actions run `42811158172`, run #100, commit `7e1b5d4a3c0cd9c17036d3c0117b77b8ee0e12d9`, conclusione **failure**.
- Errore esatto: asserzione del validatore non soddisfatta su `/if\(!safeHttpUrl\(x\.url\)\)/`; Node 22 ha terminato `Validate NEXTWAY audit` con exit code 1.
- Anche il run #99 (`42811145876`) risulta failure nello stesso step. La lista dei 12 run più recenti mostrava i run #92–#100 tutti con conclusione failure; il log dettagliato è stato letto per il run #100.
- La presenza dei file e dei commit su GitHub è verificata. La migrazione non risulta applicata da alcuna evidenza disponibile; non sono stati eseguiti test runtime di inserimento/revisione.
- La sessione non espone un connettore Supabase: non sono stati interrogati schema, policy, grants o stato effettivo della migrazione sul progetto live. Nessun deploy Supabase/Netlify è stato eseguito da questa attività.

### Stato per componente

| Componente | Stato |
|---|---|
| Codice UI/API conversione assistita nel repository | **COMPLETATO E VERIFICATO** come presenza dei file e lettura statica; runtime non testato |
| Migrazione SQL 014 | **BLOCCATO**: delimitatore della funzione da correggere; non applicata |
| RLS/policy conversion requests | **ESEGUITO MA NON VERIFICATO**: definite nel file SQL, non confrontate con Supabase live |
| Diagnostica conversione read-only | **COMPLETATO E VERIFICATO** come file presente; non eseguita su Supabase |
| Motivo obbligatorio di rifiuto | **DA COMPLETARE** lato database; attualmente verificato solo dal client |
| Validazione GitHub Actions | **BLOCCATO** da asserzione statica obsoleta; type-check Deno saltato nel run #100 |
| Attivazione effettiva cliente/partner | **DA COMPLETARE**; deliberatamente non implementata dal flusso di richiesta |
| Deploy Supabase e Netlify | **NON VERIFICATI**; nessun deploy eseguito in questa attività |

### Registro del MASTER

- 10-11-2026: recuperata la versione corrente di `MASTER_NEXTWAY.md` dal branch `main` prima dell'aggiornamento.
- 10-11-2026: esaminati gli ultimi commit GitHub, i file di migrazione/API/UI/diagnostica/validatore/workflow e il run Actions #100.
- 10-11-2026: aggiunta questa sezione; nessun codice applicativo, database o configurazione modificati.
- 10-11-2026: dopo il commit `0ef734b4c55c8699449c11dfeaff4069e4c8f5a4`, il MASTER è stato recuperato nuovamente da GitHub; sezione 50, sezione 12 aggiornata, tabella stati e sezioni storiche 48–49 risultano presenti. Blob SHA verificato: `64150e29368f4397fb62147082b0f43a916a4cc1`.

## 51. Ripristino validazione CI e correzione guardia conversione (11 novembre 2026)

### Modifiche effettivamente eseguite nel repository

- Corretta la funzione trigger public.nextway_guard_conversion_request_review() nella migrazione supabase/migrations/20261110001400_nextway_lead_conversion_requests.sql: il corpo PL/pgSQL ora usa il delimitatore dollar-quoted valido $$ ... $$.
- Aggiunto un controllo lato database: una richiesta portata allo stato rejected deve avere review_notes non nullo e non vuoto dopo btrim. Il controllo non dipende più soltanto dalla UI/client.
- Aggiornato scripts/validate-nextway-audit.mjs affinché verifichi il codice effettivo attuale, senza aspettarsi vecchie espressioni o controlli spostati nel markup HTML.
- Riallineati i controlli relativi a URL sorgente validati, ordinamento alfabetico, filtri qualificazione/profilo, API attività e follow-up, query dei follow-up aperti, markup dei pulsanti e contatori del funnel.
- Nessuna modifica a nextway-ai.html, nextway-cloud.js, nextway-setter.js o alla Edge Function in questa sessione; sono stati aggiornati soltanto la migrazione 014 e il validatore.

### Commit rilevanti dell'11 novembre

- Migrazione SQL e guardia rifiuto: f498edecbab69359864b893f4f958c974e5f7d1d.
- Riallineamento iniziale validatore: 7d0e2a90b73cc4856ae6f7b5445e79b251f34279.
- Correzioni successive delle asserzioni obsolete del validatore: 2ad46d9c08111a4b82ef074431bf919d63df4424, a89e8886e14d96e0a200dd6f1749bf78e64413d8, 816f04092df8ac8e81be33200abba90839620395, 1ccd4d1eed3b84df3b3095e1a81d9d6b707fe3b2, 5b939730c84bbd5e727ad3410a6940784f67ff5d, 9813de3581ca4ebd760254350ffe98f5340c71b7, 38119691227cf411b424a108863faae7d1c17a85.
- Ultimo commit verificato: 38119691227cf411b424a108863faae7d1c17a85.

### Evidenze di validazione

- GitHub Actions run #109: SUCCESS — https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/42970531105.
- Step Validate NEXTWAY audit: success.
- Step Type-check AI Setter Edge Function con Deno: success.
- I run #101–#108 sono falliti durante il riallineamento, facendo emergere ulteriori asserzioni obsolete nel validatore. Il run #109, sul commit finale indicato sopra, ha superato entrambi gli step.
- Questo risultato certifica i controlli statici Node e il type-check Deno; non equivale a test runtime del flusso conversione né a verifica della migrazione su Supabase live.

### Stato aggiornato per componente

| Componente | Stato aggiornato |
|---|---|
| Migrazione SQL 014: sintassi trigger e motivo obbligatorio del rifiuto | COMPLETATO E VERIFICATO mediante lettura del file aggiornato e validazione statica CI; non applicata su Supabase |
| Validatore statico NEXTWAY | COMPLETATO E VERIFICATO dal run #109 |
| Edge Function AI Setter: type-check Deno | COMPLETATO E VERIFICATO dal run #109; nessun test runtime |
| RLS/policy conversion requests | ESEGUITO MA NON VERIFICATO su Supabase live |
| UI/API conversione assistita | COMPLETATO E VERIFICATO come presenza e controlli statici nel repository; runtime non testato |
| Migrazione 014 su progetto Supabase | DA COMPLETARE dopo revisione/applicazione controllata |
| Test runtime di richiesta, revisione e rifiuto | DA COMPLETARE |
| Attivazione effettiva cliente/partner | DA COMPLETARE; resta un processo separato e non viene creato automaticamente |
| Deploy Supabase e Netlify | DA COMPLETARE; nessun deploy eseguito in questa sessione |

### Fonti e limiti

- Fonte primaria esaminata: branch main del repository servellodm-a11y/misura-test-benessere.
- Esaminati la migrazione 014, il validatore, il workflow e i log del run #109.
- La sessione non espone un connettore Supabase operativo: non sono stati letti schema, policy, grants, migrazioni applicate o record del progetto live.
- Non sono stati eseguiti test browser/runtime, migrazioni, deploy o modifiche alle impostazioni.
- Nessuna credenziale, chiave o token è stato inserito nel MASTER.

### Prossimo passo operativo preciso

Prima di applicare la migrazione 014, verificare con accesso read-only su Supabase lo stato reale delle migrazioni 008–014 e le policy/grants della tabella conversion requests; quindi pianificare l'applicazione controllata e i test con un account proprietario e un account platform_admin. Non procedere con attivazioni cliente/partner finché questa fase non è verificata.

### Registro del MASTER

- 11-11-2026: recuperata la versione corrente del MASTER dal branch main prima della modifica.
- 11-11-2026: aggiunta la sezione 51 per registrare le correzioni effettive a migrazione/validatore e l'esito positivo del run #109.
- 11-11-2026: nessun codice applicativo ulteriore, database live, impostazione o configurazione modificati durante l'aggiornamento documentale.
- 11-11-2026: verifica post-salvataggio da eseguire recuperando nuovamente il file da GitHub.


## 52. Preparazione operatività NEXTWAY CRM e correzioni sincronizzazione (11 novembre 2026)

### Correzioni effettivamente salvate e verificate su GitHub

- Migrazione `supabase/migrations/20261110001100_nextway_lead_creation_idempotency.sql`: corretti entrambi i delimitatori della funzione `nextway_prune_lead_creation_requests()`, che prima presentavano `as $` e `$;`. Il file è stato recuperato nuovamente dal branch `main`; controllo testuale: zero aperture `as $\ndeclare` incomplete, due aperture `as $$\ndeclare` valide e chiusura `$$;` presente.
- `nextway-cloud.js`: corretta la whitelist di `syncLocal()`. Prima accettava soltanto quattro stati storici e poteva riportare a `Da verificare` un Lead che avesse uno stato del ciclo commerciale avanzato. Ora conserva tutti e nove gli stati: Da verificare, Verificato, Contattato, In follow-up, In valutazione, Convertito cliente, Convertito partner, Non interessato, Escluso.
- `scripts/validate-nextway-audit.mjs`: aggiunta un'asserzione specifica sulla whitelist di sincronizzazione, per intercettare una regressione anche se gli stati sono presenti altrove nel file cloud.
- File di distribuzione `supabase/deploy/nextway_crm_apply.sql`: creato bundle transazionale che include le migrazioni 008, 009, 010, 011, 012, 013 e 014 nell'ordine corretto. Include precondizioni sulla tabella Lead, profili e firma della RPC esistente, oltre a controlli strutturali prima del commit. Include la migrazione 009 audit e la 010 minimizzazione dati, non soltanto le tre tabelle CRM mancanti.
- Il bundle è stato recuperato nuovamente da GitHub e verificato: contiene tutte e sette le migrazioni, `begin;` e `commit;`.

### Commit

- Correzione delimitatori SQL migrazione 011: `7fd8c0243d7815403810b2f909fe9a550737b98c`.
- Correzione stati nella sincronizzazione cloud: `f7a43daf1c0c3df037e75dad3ef263d4316ded8f`.
- Guardia di regressione nel validatore: `c4d0923c7bcab9c7cdeb06fc141de5ec03a54fc0`.
- Bundle SQL transazionale CRM: `7d2f7cfa963e81fc6585c91cf2efe2daf907248e`.

### Stato operativo

| Componente | Stato |
|---|---|
| Correzione sintassi migrazione 011 | COMPLETATO E VERIFICATO nel file GitHub |
| Conservazione dei nove stati durante sync | COMPLETATO E VERIFICATO nel file GitHub |
| Asserzione anti-regressione | COMPLETATO E VERIFICATO nel file GitHub |
| Bundle SQL 008–014 | COMPLETATO E VERIFICATO nel repository; non ancora eseguito |
| Migrazioni 008–014 su Supabase live | DA COMPLETARE: nessuna esecuzione DB effettuata |
| Test runtime con account partner e platform_admin | DA COMPLETARE |
| Deploy Netlify | DA COMPLETARE; nessun deploy eseguito |
| CI per i nuovi commit | NON VERIFICATA: il connettore GitHub non ha restituito status associati ai nuovi commit; non dichiarare successo CI |

### Azione necessaria per rendere operativo il CRM

- Aprire il file `supabase/deploy/nextway_crm_apply.sql` nel repository.
- Copiare tutto il contenuto nel SQL Editor del progetto Supabase NEXTWAY corretto ed eseguire una sola volta.
- Il blocco è transazionale: se una precondizione o una migrazione fallisce, la transazione deve essere annullata; non proseguire con deploy frontend finché non è stato verificato il risultato.
- Dopo l'esecuzione, ripetere la diagnostica read-only `supabase/diagnostics/nextway_crm_prerequisites_readonly.sql` e `supabase/diagnostics/nextway_crm_live_status_readonly.sql`. Le tabelle attività, creazione idempotente e conversione devono risultare presenti; devono essere presenti le colonne archive e il vincolo dei nove stati; RLS e policy devono essere ricontrollati.
- Solo dopo la conferma live, passare ai test funzionali: creazione Lead, sincronizzazione, modifica concorrente/conflitto, archiviazione/ripristino, attività e follow-up, richiesta conversione, revisione admin e rifiuto con motivazione.
- Il flusso di conversione continua a non creare automaticamente utenti Auth, profili, clienti o partner: l'attivazione effettiva resta una fase distinta.

### Registro

- 11-11-2026: recuperati i file correnti e i rispettivi SHA prima delle modifiche.
- 11-11-2026: correzioni e bundle salvati su GitHub e verificati con nuovo recupero dei file.
- 11-11-2026: nessuna modifica eseguita su Supabase live e nessun deploy Netlify.


## 53. Applicazione migrazioni CRM live e verifica grants (11 novembre 2026)

### Backup pre-migrazione
- Creato sul Mac dell'utente il dump PostgreSQL custom `NEXTWAY_PRE_MIGRAZIONI_20261111.dump` nella cartella privata `~/Desktop/NEXTWAY_BACKUP`.
- `pg_dump` terminato con codice 0; `pg_restore --list` ha letto correttamente l'archivio e l'utente ha confermato `VERIFICA BACKUP: SUPERATA`.
- Il dump include dati e schemi PostgreSQL, compresi auth, storage e vault accessibili al ruolo usato. È sensibile e va conservato privatamente. Non è stato eseguito un restore di prova e il dump non sostituisce il backup delle configurazioni/secrets esterni al database.

### Applicazione Supabase
- L'utente ha eseguito nel SQL Editor il bundle `supabase/deploy/nextway_crm_apply.sql`, contenente le migrazioni 008–014 in una transazione.
- Risposta Supabase: `Success. No rows returned`; nessun errore riportato.
- Diagnostica read-only `nextway_crm_live_status_readonly.sql`: `nextway_leads` presente, RLS attivo, quattro policy owner/admin presenti; tabelle `nextway_lead_activities` e `nextway_lead_conversion_requests` presenti.
- Diagnostica read-only `nextway_crm_prerequisites_readonly.sql`: presenti le tre tabelle correlate (attività, richieste creazione idempotente, richieste conversione); vincolo CHECK con tutti i nove stati Lead; colonne `archived_at`, `archived_by`, `archive_reason` e `owner_profile_id` presenti; RPC ordinaria e wrapper idempotente presenti.
- La tabella di tracking migrazioni non è disponibile nel progetto/ruolo interrogato; la verifica è stata condotta sullo stato effettivo di tabelle, colonne, vincoli, policy e funzioni.

### Verifica e correzione grants
- Diagnostica sicurezza: RLS attivo sulle tre tabelle correlate. I permessi UPDATE a livello colonna per attività e conversioni risultano presenti; i controlli table-level UPDATE false sono coerenti con i grants limitati alle sole colonne autorizzate.
- Individuati due grants eccessivi: DELETE su `nextway_lead_creation_requests` per `authenticated` e EXECUTE anonimo sulla vecchia RPC `nextway_create_lead_with_conversation`. La RPC vecchia richiede comunque `auth.uid()`, ma il grant anonimo era superfluo.
- L'utente ha eseguito i REVOKE e il GRANT mirati nel SQL Editor; risposta: `Success. No rows returned`.
- Verifica read-only successiva: `creation_requests_authenticated_delete=false`, `creation_requests_anon_delete=false`, `old_function_anon_execute=false`, `old_function_authenticated_execute=true`, `idempotent_function_anon_execute=false`, `idempotent_function_authenticated_execute=true`. Tutti i valori coincidono con quelli attesi.
- Non sono stati cancellati Lead o dati applicativi durante queste verifiche.

### Stato aggiornato
| Componente | Stato |
|---|---|
| Backup pre-migrazione | COMPLETATO E VERIFICATO come archivio leggibile; restore non provato |
| Migrazioni CRM 008–014 su Supabase live | ESEGUITE con esito SQL positivo e strutture verificate |
| Tabelle, colonne archivio, nove stati e RPC | COMPLETATO E VERIFICATO tramite diagnostiche read-only |
| RLS e policy owner/admin su Lead | COMPLETATO E VERIFICATO tramite diagnostica read-only |
| Grants DELETE/EXECUTE anonimi corretti | COMPLETATO E VERIFICATO tramite query read-only |
| Test funzionali end-to-end CRM | DA COMPLETARE |
| Isolamento multiutente partner/admin | DA COMPLETARE |
| Deploy Netlify e verifica UI live | DA COMPLETARE; nessun deploy dichiarato |
| Operatività CRM in produzione | NON ANCORA CERTIFICATA: mancano test funzionali e verifica UI |

### Prossimo passo
- Passare ai test funzionali controllati con un utente autenticato e record di test esplicitamente identificabili: creazione Lead e conversazione, sincronizzazione, attività/follow-up, archiviazione e ripristino, richiesta di conversione e revisione amministrativa. Evitare cancellazioni fisiche e non usare Lead reali.
- Prima di creare record di test nel progetto live, ottenere conferma esplicita dell'utente sul fatto che possiamo creare record temporanei di test. Dopo i test, valutare deploy Netlify e prova UI; non dichiarare il CRM operativo prima di questi riscontri.

### Registro
- 11-11-2026: bundle CRM 008–014 eseguito dall'utente su Supabase; esito positivo.
- 11-11-2026: diagnostiche strutturali e sicurezza eseguite e risultati ricevuti.
- 11-11-2026: grants eccessivi revocati; verifica successiva superata.
- 11-11-2026: aggiornamento documentale; nessun deploy Netlify e nessun test funzionale eseguiti.


### Appendice operativa — test funzionale transazionale predisposto (11 novembre 2026)

- Creato `supabase/diagnostics/nextway_crm_functional_smoke_test.sql` per eseguire un test controllato con il ruolo `authenticated` e il profilo `platform_admin` già verificato.
- Il test copre: creazione Lead e conversazione tramite RPC idempotente; replay della stessa richiesta senza duplicazione; creazione attività e completamento follow-up; archiviazione e ripristino; creazione e revisione amministrativa della richiesta conversione; presenza dell'audit con esclusione di `notes` e `public_evidence` dagli snapshot.
- La procedura è racchiusa in `BEGIN ... ROLLBACK`: i record temporanei e gli eventi audit generati vengono annullati al termine. Usa soltanto dati fittizi e un indirizzo `example.invalid`; non attiva account o clienti.
- File salvato e recuperato nuovamente da GitHub. Commit: `008c7424fae3a0993e8e5c30953705e360db0b5d`.
- Nota storica: al momento della predisposizione dell'appendice il test non era ancora stato eseguito. L'esito effettivo, ricevuto successivamente dall'utente (6/6 superati con rollback OK), è registrato nella sezione “Esito test funzionale CRM — 11 novembre 2026” qui sotto.


### Esito test funzionale CRM — 11 novembre 2026
- L'utente ha eseguito lo smoke test transazionale aggiornato su Supabase SQL Editor.
- Risultato restituito: `ESITO=SUPERATO`, `TEST_TOTALI=6`, `TEST_SUPERATI=6`, `ROLLBACK=OK - DATI DI TEST ANNULLATI`.
- Verifiche superate: idempotenza; attività e follow-up; richiesta di conversione; audit e minimizzazione; revisione amministrativa; archiviazione e ripristino.
- Il risultato conferma il superamento dei sei test funzionali inclusi nello smoke test. Non certifica ancora isolamento multiutente, interfaccia web, deploy Netlify o operatività complessiva in produzione.
- La precedente indicazione “test funzionali end-to-end da completare” è superata limitatamente ai sei casi sopra elencati. Restano da verificare isolamento multiutente partner/admin e flusso UI live.
- Nessun dato di test è rimasto nel database: il rollback è stato confermato dall'output.


### Preparazione isolamento partner / amministratore — 11 novembre 2026
- Esaminato il piano pre-rilascio e le policy CRM documentate: il modello atteso è accesso del partner ai soli record con owner_profile_id = auth.uid(); accesso trasversale riservato a platform_admin solo dove esplicitamente previsto dalle policy RLS.
- Non viene attribuita visibilità automatica a sponsor, team leader o director. Le relative regole gerarchiche restano da definire e verificare separatamente.
- Creato supabase/diagnostics/nextway_crm_isolation_audit_readonly.sql: audit in sola lettura di RLS, policy e privilegi sulle tabelle Lead, attività, richieste, audit, profili e dettagli partner.
- Lo script legge esclusivamente metadati PostgreSQL: non legge record CRM e non modifica dati, schema, policy, ruoli o grants.
- File recuperato nuovamente da GitHub e contenuto verificato. Blob SHA: ab3b832ab4ca990fa58ec1fb027acac737d390f7.
- Commit di creazione file: e01f97db09a761486710e28f2fa64572b0095474.
- Stato: script preparato, NON ancora eseguito su Supabase. Nessun test di isolamento multiutente è dichiarato superato.
- Per il test funzionale effettivo serviranno due identità partner distinte e l'identità platform_admin, con verifica di lettura, modifica e accesso ai dati correlati sotto sessioni separate. Nessun record reale sarà modificato.

## Test isolamento multiutente partner / amministratore predisposto — 11 novembre 2026

- Analizzato il risultato live dell'audit RLS read-only eseguito dall'utente. Le sette tabelle esaminate hanno RLS attiva; i privilegi SELECT anonimi risultano assenti. Le policy Lead consentono l'accesso al proprietario e a platform_admin; le policy attività applicano lo stesso vincolo tramite il Lead collegato.
- Il controllo live conferma inoltre che le richieste idempotenti di creazione hanno policy SELECT owner-only: non viene quindi presunta una visibilità amministrativa su questa tabella.
- Preparato `supabase/diagnostics/nextway_crm_partner_isolation_transactional_test.sql`, test transazionale con due profili `role='partner'` collegati a `partner_details` e il profilo `platform_admin` già verificato.
- Il test crea due Lead fittizi tramite la RPC idempotente e due attività fittizie sotto identità partner distinte; verifica lettura del proprio Lead, invisibilità del Lead e delle attività dell'altro partner, blocco di UPDATE e DELETE cross-owner, isolamento delle richieste idempotenti e lettura trasversale admin di Lead e attività.
- Tutte le creazioni e le operazioni avvengono nella stessa transazione, terminata da `ROLLBACK`. Non vengono modificati profili, partner o Lead preesistenti. I valori di test usano il dominio riservato `example.invalid`.
- Il test è stato salvato su GitHub e recuperato nuovamente per verifica. Commit di creazione: `9745ceea5b83b40d316b485b9e26b2189aa40345`; commit di allineamento alla policy owner-only delle richieste idempotenti: `0af4b73d74238cf524f189bcb2af50c6ca36cabc`.
- Stato: **PREPARATO, NON ANCORA ESEGUITO** su Supabase. Non dichiarare superato l'isolamento multiutente finché l'utente non restituisce il risultato della query.
- Il test si interrompe senza scrivere dati se non trova due profili partner collegati a `partner_details` o se il profilo amministratore atteso non è presente.
- Limite: il test copre le policy RLS del CRM su Lead, attività e richieste idempotenti; non certifica accesso gerarchico sponsor/team leader/director, UI, API browser o deploy Netlify. La tabella richieste idempotenti resta intenzionalmente owner-only secondo la policy live rilevata.


### Revisione preventiva avvisi SQL Editor — test isolamento — 11 novembre 2026

- Dopo l'avviso del SQL Editor, la prima versione del test è stata sospesa prima dell'esecuzione.
- Revisione effettuata: rimosse tutte le tabelle temporanee del test; rimossi gli UPDATE senza filtro selettivo. Il test aggiornato non crea tabelle né modifica schema, policy, grants o profili.
- Il test usa variabili locali PL/pgSQL e restituisce il riepilogo tramite NOTICE. Crea esclusivamente due Lead e due attività fittizie con ID generati nella transazione corrente.
- Restano due istruzioni DELETE intenzionali, una per ciascun tentativo cross-owner. Sono limitate agli ID dei Lead appena creati nella stessa transazione; il risultato atteso è zero righe modificate per effetto della RLS. Il test termina con ROLLBACK.
- File aggiornato e recuperato da GitHub: `supabase/diagnostics/nextway_crm_partner_isolation_transactional_test.sql`; commit revisione: `aa415e2f43636ac6941fcef89584e65f7930b1c9`; blob SHA verificato: `c0fba4e755b8803d03d5af7ef3bc21e2e183fe47`.
- Stato: **NON ESEGUIRE la versione precedente**. Usare esclusivamente la versione aggiornata. L'avviso generico di operazioni distruttive può restare perché il test contiene i due DELETE intenzionali; il loro bersaglio sono soltanto i record fittizi appena creati e il rollback annulla l'intera transazione.

## AGGIORNAMENTO OPERATIVO — 11 NOVEMBRE 2026 (coda conversioni approvate)

- Proseguito lo sviluppo CRM senza ripetere verifiche già concluse.
- `nextway-cloud.js` ora consente a `platform_admin` di consultare separatamente le richieste `pending` e quelle `ready_for_activation`. Prima dell'intervento, la coda mostrava soltanto le richieste pendenti: dopo l'approvazione una richiesta scompariva dalla vista amministrativa.
- Aggiunto in `nextway-cloud.js` il pulsante **Mostra pronte per attivazione**. La nuova vista è di sola consultazione: mostra i dati essenziali e la nota amministrativa, senza creare account, profili, clienti o partner.
- Aggiornato `scripts/validate-nextway-audit.mjs` con controlli statici per filtro stato, accesso alla nuova coda e distinzione tra approvazione e provisioning.
- Commit frontend: `f9610df5de3a58ed2626d8354b94238f81e26303`.
- Commit validatore: `0131284d52100fc6ecba10ead98f8da9307561bc`.
- GitHub Actions run #114: **FAILURE** nel validatore statico, perché il primo commit frontend ha cambiato la firma della funzione prima dell'aggiornamento delle asserzioni. Run #115, sul commit del validatore aggiornato: **SUCCESS**; la pipeline completa è passata, incluso il type-check Deno dell'AI Setter. Il run #113 precedente era **SUCCESS**.
- Nessuna modifica a Supabase live, nessun deploy Netlify e nessuna creazione account eseguiti.

### Prossimo sviluppo
1. Realizzare il provisioning server-side idempotente delle richieste `ready_for_activation`, con invito Auth e creazione dei record applicativi in un'unica procedura controllata.
2. Prima del provisioning, definire il contratto dati esatto per `profiles`, `partner_details` e `clients` e la gestione dei fallimenti parziali; non assumere colonne o creare utenti automaticamente.
3. Collegare la UI amministrativa all'azione di attivazione solo dopo aver implementato e validato il backend. La chiave service-role deve restare esclusivamente nei secrets server-side.

## PROVISIONING CONVERSIONI CRM — 11 NOVEMBRE 2026

### Implementazione nel repository
- Creata la migrazione additiva `supabase/migrations/20261111001500_nextway_conversion_provisioning.sql`.
- La migrazione estende lo stato richiesta con `provisioning` e `activated`, aggiunge claim token/lease, timestamp e utente Auth di attivazione; aggiunge `nextway_conversion_request_id` univoco su `partner_details` e `clients` per impedire duplicazioni.
- RPC server-only: `nextway_claim_conversion_activation`, `nextway_finalize_conversion_activation`, `nextway_release_conversion_activation`. Solo `service_role` può eseguirle.
- Le richieste partner creano un invito Supabase Auth; il trigger esistente `on_auth_user_created` crea il profilo base e la RPC completa `profiles` e `partner_details`, collegando sponsor. `team_side` resta NULL e `language='it'`, `status='active'`.
- Le richieste cliente non creano account Auth: inseriscono `clients` associato al proprietario/sponsor, con stato `potential`.
- La finalizzazione aggiorna anche lo stato Lead a `Convertito partner` o `Convertito cliente`.
- Edge Function `supabase/functions/nextway-conversion-provisioning/index.ts`: verifica JWT e ruolo `platform_admin`, legge i dati esclusivamente dalla richiesta approvata, usa service-role solo lato server, invia l'invito partner, finalizza e applica compensazione/rilascio claim in caso di errore. Recupera gli inviti già creati dalla stessa richiesta per i retry.
- UI `nextway-cloud.js`: aggiunti i comandi amministrativi **Invita e attiva partner** e **Registra cliente** nella coda `ready_for_activation`.
- Workflow GitHub Actions aggiornato per eseguire il type-check Deno della nuova Edge Function.
- Documentazione deployment aggiornata in `NEXTWAY-CLOUD-SETUP.md` e README della funzione.

### Commit principali
- Migrazione provisioning: `427bca08367f1d06f286623313576f297fac285f` (include retry claim scaduto).
- Edge Function iniziale: `3601f450208d48a969558906ef7081636fed4369`; recupero inviti idempotenti: `cbdcdfe7986123a76e8da34cdab8e461664db713`.
- Collegamento UI: `4e1449069382cee0105673de9694db9f9e1ef23f`.
- Validatore: `4272fcd763e0da39626524e25830f98766035b5f`.
- Workflow CI: `2deecc6f3b968f79020cfa0cbdac796f73b18e8d`.
- Documentazione setup: `45b995d2c43f23bdef114eb4dd913479ee4ce7cf`.

### Stato e limiti
| Componente | Stato |
|---|---|
| Codice SQL provisioning | IMPLEMENTATO nel repository; NON applicato su Supabase live |
| Edge Function provisioning | IMPLEMENTATA nel repository; NON pubblicata su Supabase |
| UI amministrativa | IMPLEMENTATA nel repository; NON pubblicata su Netlify |
| Type-check / validazione CI | Run #121 e #123 superati; run #124 in corso al momento dell'aggiornamento |
| Creazione account Auth reale | NON ESEGUITA |
| Test end-to-end cliente/partner | DA ESEGUIRE dopo applicazione migrazione, secret e deploy |

### Procedura di rilascio successiva
1. Eseguire nel SQL Editor Supabase la migrazione `20261111001500_nextway_conversion_provisioning.sql`.
2. Configurare il secret `SUPABASE_SERVICE_ROLE_KEY` in Edge Functions Secrets, senza inserirlo nel repository o nel browser.
3. Pubblicare `nextway-conversion-provisioning`.
4. Pubblicare il frontend Netlify.
5. Eseguire prima un test cliente controllato; successivamente un invito partner autorizzato. Non usare contatti reali senza consenso e autorizzazione.
- Il campo `partner_details.team_side` resta NULL: l'assegnazione A/B è una decisione separata e non viene inventata.

### Esito CI aggiornato — provisioning conversioni
- GitHub Actions run #127: **SUCCESS** sul commit `2c7bc627fd0781c817eede12a5bcb50b906dd24d`.
- Passati: validatore NEXTWAY, type-check AI Setter e type-check Edge Function `nextway-conversion-provisioning`.
- Il run #124 e il run #125 erano falliti per errori di tipo nel helper di recupero inviti; corretti con tipizzazione esplicita e verificati nel run #127.
- Migrazione provisioning aggiornata con vincolo di coerenza degli stati (`pending`, `ready_for_activation`, `provisioning`, `rejected`, `activated`): commit `45dc8f1840b05b90b4a19cf1ff86322890dbc19f`.
- Edge Function con recupero degli inviti creati dalla stessa richiesta: commit `2c7bc627fd0781c817eede12a5bcb50b906dd24d`.
- CI conferma la validità statica e il type-check; non equivale a esecuzione SQL su Supabase, deploy della Edge Function o test runtime di invito.
- Stato attuale: codice pronto per la fase di installazione controllata. Prima azione richiesta all'utente: applicare la migrazione `20261111001500_nextway_conversion_provisioning.sql` nel SQL Editor Supabase. Non creare ancora account reali.


## AGGIORNAMENTO OPERATIVO — 11 NOVEMBRE 2026 (secret Edge Function provisioning)

- L'utente ha creato con successo in Supabase Edge Functions → Secrets il secret personalizzato `NEXTWAY_SERVICE_ROLE_KEY`, contenente il valore della chiave service_role del progetto. Il valore non è stato condiviso in chat né inserito nel repository.
- Supabase ha rifiutato il prefisso riservato `SUPABASE_`; il codice è stato adeguato a leggere `NEXTWAY_SERVICE_ROLE_KEY` lato server.
- Aggiornati: `supabase/functions/nextway-conversion-provisioning/index.ts`, README della funzione, `NEXTWAY-CLOUD-SETUP.md` e validatore statico. Commit: `49b26b23024300d7efb41ca3fc98093d681009f3`, `c9ad2d219815dc422d50ef869cbd3878b0797b5e`, `9280048a530717d2747fae5a15a47d39809b5ead`, `473c4d3a5b3200d4767f1855a1c90466c812a8e3`.
- Il secret è stato salvato dall'utente; non è stata ancora pubblicata la Edge Function aggiornata. Occorre attendere/verificare GitHub Actions, poi pubblicare la funzione. Migrazione SQL provisioning riferita dall'utente come eseguita con esito positivo; il testo esatto dell'esito è stato confermato nella conversazione.
- Nessuna attivazione partner/cliente è stata eseguita e nessun account reale è stato creato.

## AGGIORNAMENTO OPERATIVO — 11 NOVEMBRE 2026 (deploy provisioning e test autenticazione)

### Pubblicazione Supabase
- La CLI Supabase è stata autenticata correttamente sull'account dell'utente.
- Pubblicata con successo la sola Edge Function `nextway-conversion-provisioning` sul progetto `obqwbtlltxjfeirstsya`, usando il codice presente nel repository locale aggiornato da `origin/main`.
- Output CLI: `Deployed Functions on project obqwbtlltxjfeirstsya: nextway-conversion-provisioning`.
- L'utente ha verificato nella Dashboard Supabase che la funzione è presente e che il deploy risulta recente.
- Le funzioni `hyper-api` e `nextway-ai-setter` non sono state selezionate né ridistribuite.

### Test runtime iniziale
- Dalla scheda **Test** della funzione è stata inviata una richiesta POST senza Request Body, senza Headers e senza Query Parameters.
- Risposta JSON osservata: `{"error":"Autenticazione richiesta"}`.
- Esito: la funzione rifiuta una richiesta priva di autenticazione. Questo conferma il raggiungimento dell'handler e il blocco della richiesta anonima; non certifica ancora il controllo del ruolo `platform_admin`, il provisioning partner/cliente o l'invio email.
- Il test non conteneva `request_id`; non è stata richiesta né eseguita alcuna conversione e non sono stati creati account, profili, partner o clienti.
- Non è stato ancora eseguito un test autenticato. Il test del controllo ruolo amministratore resta da fare con una procedura sicura che non attivi conversioni reali.

### Stato aggiornato
| Componente | Stato |
|---|---|
| Migrazione SQL provisioning su Supabase | **ESEGUITA** secondo conferma dell'utente; esito SQL positivo |
| Secret `NEXTWAY_SERVICE_ROLE_KEY` | **CONFIGURATO** dall'utente; valore non condiviso né salvato nel repository |
| Edge Function `nextway-conversion-provisioning` | **PUBBLICATA E VISIBILE** nella Dashboard Supabase |
| Richiesta anonima POST senza body/header | **TESTATA**; risposta `Autenticazione richiesta` |
| Verifica controllo ruolo `platform_admin` | **DA COMPLETARE** |
| Test provisioning cliente/partner e invito email | **DA COMPLETARE**; nessuna attivazione reale eseguita |
| Deploy frontend Netlify con i pulsanti provisioning | **DA COMPLETARE**; non dichiarato pubblicato |
| Test end-to-end dalla UI | **DA COMPLETARE** |

### Prossimo passo operativo
1. Verificare il controllo del ruolo senza inviare un `request_id` valido e senza creare dati: predisporre una richiesta autenticata controllata che possa solo dimostrare il rifiuto di un ruolo non amministratore, oppure verificare il ramo di autorizzazione con un test isolato.
2. Dopo il controllo autorizzativo, verificare il deploy frontend Netlify e i pulsanti amministrativi, mantenendo disabilitata qualsiasi attivazione reale fino a quando il test non è stato progettato e autorizzato.
3. Non considerare il provisioning completo finché non sono stati verificati i percorsi cliente e partner, l'idempotenza e la gestione degli errori senza creare duplicati.

## AGGIORNAMENTO OPERATIVO — 11 NOVEMBRE 2026 (hardening test autorizzazione provisioning)

- Vincolo operativo aggiornato: fino al 4 dicembre 2026 non è disponibile il token Netlify. Nessun deploy, accesso operativo o tentativo di pubblicazione Netlify va richiesto prima di tale data. Lo sviluppo continua su GitHub e Supabase senza dipendere dal frontend pubblicato.
- Aggiunto `scripts/test-nextway-provisioning-security.mjs`, test statico del contratto di sicurezza della Edge Function.
- Il test controlla che la verifica JWT preceda la lettura del ruolo; che il controllo `platform_admin` preceda claim, invito Auth e finalizzazione; che la service-role key sia letta solo lato server; che il browser non contenga credenziali privilegiate e invii soltanto il `request_id`; che l'endpoint non abiliti CORS wildcard.
- Aggiornato `.github/workflows/nextway-static-validation.yml` per eseguire il nuovo test a ogni modifica rilevante.
- Commit test: `cba63a35785f3c8b70ae5b2465c0d52df333137d`.
- Commit workflow: `ede84dae7eda0eb1442e1ad2e57ccdea7d52cadb`.
- Blob SHA verificati al momento della modifica: test aggiunto; workflow aggiornato.
- Stato CI sul commit workflow: **IN ATTESA DI RISCONTRO**; non dichiarare superato finché GitHub Actions non mostra esito SUCCESS.
- Nessuna modifica a Supabase live, nessuna conversione, nessun invito email, nessuna creazione account e nessuna operazione Netlify sono state eseguite in questa attività.
- Prossimo passo: verificare l'esito GitHub Actions; se il nuovo controllo passa, proseguire con hardening e test isolati del backend senza introdurre record reali. Il test statico non sostituisce un test runtime con un account non-admin.


## AGGIORNAMENTO OPERATIVO — 11 NOVEMBRE 2026 (audit e correzione coerenza claim)

- Audit statico della migrazione provisioning e della Edge Function completato sui file presenti in `main`.
- Rilevata un'incoerenza: la finalizzazione impostava `activation_claim_token = null` ma lasciava valorizzato `activation_claimed_at`. Il record risultava `activated` conservando un timestamp del claim non più attivo.
- Correzione predisposta con nuova migrazione additiva `supabase/migrations/20261111150000_nextway_conversion_claim_cleanup.sql`:
  - la constraint dello stato `activated` richiede ora anche `activation_claimed_at IS NULL`;
  - la funzione `nextway_finalize_conversion_activation` azzera entrambi i campi del claim;
  - nessuna conversione o account viene creato dalla migrazione.
- Aggiunto al test statico `scripts/test-nextway-provisioning-security.mjs` un controllo che impedisce regressioni su questa invariante.
- Commit migrazione: `d4c7ba429470717ede0b64989d7105d71db7bc40`.
- Commit test statico: `7b06de90faf7f8cbcf8167f7d90d5542c90f20dc`.
- La workflow esistente include già tutte le migrazioni SQL e lo script di test nei trigger; non è stato necessario modificarla.
- **Stato installazione:** la nuova migrazione è soltanto su GitHub e NON è ancora applicata a Supabase. La vecchia migrazione già eseguita non viene modificata retroattivamente.
- **Stato verifica:** GitHub Actions run #132 sul commit migrazione e run #133 sul commit del test completati entrambi con **SUCCESS**. Il run #133 include validatore NEXTWAY, contratto sicurezza provisioning aggiornato e type-check delle Edge Function. È una verifica statica/di compilazione, non un'esecuzione SQL su Supabase. Nessun test runtime di conversione, nessun invito, nessun account creato, nessun deploy Netlify.
- Vincolo invariato: nessuna operazione Netlify fino al 4 dicembre 2026.
- Prossimo passo: verificare il nuovo run GitHub Actions; solo dopo esito positivo preparare l'applicazione controllata della nuova migrazione SQL su Supabase.

- Run #132: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43030253715 (SUCCESS).
- Run #133: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43030268058 (SUCCESS).


### Integrazione audit — compatibilità con richieste già attivate (11 novembre 2026)

- Durante il controllo pre-applicazione è stata aggiunta una salvaguardia alla migrazione `20261111150000_nextway_conversion_claim_cleanup.sql`.
- Prima di sostituire il vincolo, la migrazione normalizza le righe storiche con `status='activated'`, token già nullo e timestamp claim ancora valorizzato, impostando `activation_claimed_at = null`.
- L'operazione è limitata alle sole righe già attivate e non crea inviti, utenti o conversioni.
- Il test automatico ora verifica che la normalizzazione delle righe storiche preceda l'aggiunta del nuovo vincolo.
- Commit migrazione aggiornata: `683a411ff92ef68566261af02a78e679a7573e98`.
- Commit test aggiornato: `b8aeab779b280d4caa53f0d15576aabc8a4e6fef`.
- La nuova esecuzione CI è in attesa di completamento; non applicare ancora la migrazione a Supabase fino alla conferma del controllo.

- CI aggiornata: GitHub Actions run #135 completato con **SUCCESS** sul commit `b8aeab779b280d4caa53f0d15576aabc8a4e6fef`; job `validate` e tutti gli step superati, incluso il contratto di sicurezza provisioning e i type-check Deno. Link: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43030467392.


### Rettifica tecnica — migrazione claim compatibile con trigger immutabilità (11 novembre 2026)

- L'ulteriore verifica ha mostrato che la tabella conversioni protegge anche le righe già in stato `activated`: un UPDATE storico diretto potrebbe essere respinto dal trigger di transizione.
- Per evitare qualsiasi bypass o disattivazione dei trigger, è stata rimossa dalla migrazione la normalizzazione UPDATE delle righe storiche.
- La constraint mantiene per lo stato `activated` i requisiti già compatibili con i record esistenti (`activation_claim_token IS NULL`, `activated_at IS NOT NULL`), senza imporre retroattivamente `activation_claimed_at IS NULL`.
- La funzione di finalizzazione aggiornata azzera comunque sia `activation_claim_token` sia `activation_claimed_at` per tutte le nuove attivazioni.
- Il test statico ora controlla che la migrazione non tenti di riscrivere righe storiche attivate e che la funzione finale pulisca entrambi i campi.
- Questa rettifica sostituisce la nota precedente sulla normalizzazione dei record storici: nessun aggiornamento storico viene eseguito.
- Commit migrazione rettificata: `b2306e515d36f0b401c8961483432105e9cd29ad`.
- Commit test rettificato: `f8ec2b3f5e75d17365ff04eebc5c8cb3ce6979e4`.
- La CI per questi ultimi commit deve ancora essere verificata. La migrazione non è da applicare finché non viene confermato il nuovo esito.


### Esito CI della rettifica trigger-safe — 11 novembre 2026

- La versione definitiva della migrazione evita UPDATE retroattivi sulle richieste già attivate; la funzione di finalizzazione azzera i due campi claim per le nuove attivazioni.
- Test statico corretto per verificare la pulizia nella funzione e impedire una riscrittura diretta dei record storici.
- Commit test definitivo: `4dcac78c65e7559ee263fbfa9225540046eeb5eb`.
- GitHub Actions run #139: **SUCCESS**, job `validate` completato; controlli audit, sicurezza provisioning e type-check Deno superati.
- Link CI: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43030744978.
- Migrazione definitiva presente su `main`, non ancora applicata a Supabase. Netlify resta fuori dal flusso fino al 4 dicembre.

## AGGIORNAMENTO OPERATIVO — 11 NOVEMBRE 2026 (migrazione claim cleanup applicata e verificata su Supabase)

- L'utente ha applicato nel SQL Editor del progetto Supabase `nextway-platform` (ref `obqwbtlltxjfeirstsya`) la migrazione `supabase/migrations/20261111150000_nextway_conversion_claim_cleanup.sql`.
- Esito restituito da Supabase: `Success. No rows returned`.
- Eseguita successivamente una query read-only che ha restituito la definizione di `public.nextway_finalize_conversion_activation(uuid,uuid,uuid)` e la constraint `nextway_conversion_activation_state_check`.
- Verificato nel testo live della funzione che la finalizzazione imposta entrambi i campi a NULL: `activation_claim_token=null` e `activation_claimed_at=null`.
- Verificata la constraint live: per lo stato `activated` richiede `activation_claim_token IS NULL` e `activated_at IS NOT NULL`; non impone `activation_claimed_at IS NULL` sui record storici, per evitare incompatibilità retroattive con righe protette dal trigger. Le nuove finalizzazioni puliscono comunque entrambi i campi.
- **Esito:** migrazione installata e verifica SQL read-only superata. Nessun record storico è stato riscritto; nessuna conversione, invito, account, profilo partner o cliente è stato creato.
- Distinzione importante: la verifica riguarda la funzione SQL e il vincolo nel database; non costituisce un test runtime di provisioning partner/cliente o dell'invio email.
- Vincolo invariato: Netlify non va toccato né deployato fino al 4 dicembre 2026.
- Prossimo lavoro: proseguire l'audit statico di idempotenza, gestione degli errori e coerenza tra provisioning Edge Function e funzioni SQL; mantenere nessuna creazione di dati reali durante i test.

## AUDIT STATICO SUCCESSIVO — 11 NOVEMBRE 2026 (idempotenza, claim, retry e compensazione)

Esaminati su `main`:
- `supabase/migrations/20261111001500_nextway_conversion_provisioning.sql`
- `supabase/migrations/20261111150000_nextway_conversion_claim_cleanup.sql`
- `supabase/functions/nextway-conversion-provisioning/index.ts`
- `scripts/test-nextway-provisioning-security.mjs`

Esiti:
- **Claim concorrente:** la RPC blocca la riga con `FOR UPDATE`; un claim attivo entro 10 minuti non può essere duplicato. Il recupero di un claim scaduto è consentito solo al servizio e la transizione è verificata dal trigger.
- **Release:** il servizio può rilasciare soltanto il claim che possiede; la richiesta torna a `ready_for_activation` e i due campi claim vengono azzerati.
- **Finalizzazione:** inserimento partner/cliente, passaggio della richiesta ad `activated` e aggiornamento del Lead avvengono nella stessa transazione SQL. La ripetizione su una richiesta già attivata restituisce `already_activated` senza ripetere gli inserimenti.
- **Cliente:** l'indice univoco parziale su `clients.nextway_conversion_request_id` e l'upsert rendono idempotente l'inserimento per richiesta.
- **Partner:** l'invito recuperato dopo un timeout è cercato tramite email e metadato `nextway_conversion_request_id`; non viene collegato un account Auth estraneo che condivide soltanto l'indirizzo email. L'indice univoco sulla richiesta in `partner_details` impedisce associazioni duplicate.
- **Compensazione:** se la finalizzazione restituisce errore, la Edge Function controlla prima se la richiesta sia comunque stata attivata; se non lo è, tenta la cancellazione dell'utente invitato e rilascia il claim. Se la cancellazione fallisce, l'errore viene registrato e il retry può recuperare l'invito tramite il metadato della richiesta.
- **Autorizzazione:** JWT verificato prima del lookup del profilo; il ruolo `platform_admin` è verificato prima di claim, invito o finalizzazione. La chiave service role resta lato server.
- **Trigger e immutabilità:** i dati originari della richiesta e i dati di revisione approvati sono protetti; le transizioni di stato sono limitate ai percorsi previsti.

Limiti residui:
- L'audit è statico e basato sul codice; non sostituisce test runtime di concorrenza, invito email, account non-admin o provisioning end-to-end.
- La ricerca di inviti preesistenti scorre al massimo 10 pagine da 1.000 utenti ciascuna; oltre tale volume massimo il recupero automatico non è garantito e andrà rivisto prima di una scala molto elevata.
- Nessun dato reale è stato creato o modificato durante l'audit. Nessun deploy Netlify effettuato; il blocco fino al 4 dicembre 2026 resta valido.
- **Esito statico:** non emerge un difetto bloccante nei percorsi esaminati; nessuna modifica al codice ritenuta necessaria in questa fase.


## AUDIT AUTORIZZAZIONI RPC E TRIGGER — 11 NOVEMBRE 2026

### Verifiche completate
- Le RPC di provisioning `nextway_claim_conversion_activation`, `nextway_finalize_conversion_activation` e `nextway_release_conversion_activation` mantengono EXECUTE esclusivamente a `service_role` (oltre al proprietario postgres); anon e authenticated non sono autorizzati.
- Le due firme di `nextway_save_ai_analysis` hanno ACL coerenti: EXECUTE a `authenticated` e `service_role`, non a `anon` o PUBLIC. Entrambe verificano autenticazione e proprietà del Lead, con eccezione per `platform_admin`.
- La prima firma (argomenti `uuid,text,jsonb,smallint...`) blocca la riga Lead con `FOR UPDATE`, valida modello/analisi e aggiorna anche la qualifica.
- La seconda firma (argomenti `uuid,integer...`) usa `IS DISTINCT FROM` nel controllo proprietario, ma non blocca la riga e non aggiorna la qualifica; inserisce inoltre `analyzer_version='v1'`. Le due implementazioni non sono semanticamente identiche. Non vengono unificate in questa fase per evitare regressioni: nei file frontend/Edge Function esaminati non è stata trovata una chiamata esplicita a queste RPC, ma ciò non dimostra l'assenza di eventuali consumatori esterni.
- `nextway_prune_lead_creation_requests` verifica internamente `auth.uid()` e il ruolo `platform_admin` prima di eliminare esclusivamente richieste più vecchie di 30 giorni. Il grant authenticated viene mantenuto perché la funzione applica il controllo amministrativo internamente.
- `nextway_is_platform_admin` controlla il ruolo del profilo dell'utente autenticato ed è mantenuta per l'uso nelle policy.
- Le funzioni trigger `nextway_validate_setter_owner`, `nextway_apply_lead_qualification_v1`, `nextway_set_lead_updated_at` e `nextway_setter_touch` sono state esaminate; la logica è coerente con i rispettivi trigger.

### Correzione dei privilegi trigger-only
- Creata la migrazione `supabase/migrations/20261111160000_nextway_trigger_function_privileges.sql`.
- La migrazione revoca EXECUTE da `PUBLIC`, `anon` e `authenticated` sulle quattro funzioni esclusivamente trigger sopra elencate. Non revoca il privilegio del proprietario postgres né modifica gli altri grant.
- La migrazione non elimina, disabilita o ricrea trigger e non modifica dati.
- Il test statico in `scripts/validate-nextway-audit.mjs` verifica le quattro revoche e impedisce modifiche accidentali ai trigger o alle RPC non interessate.
- Commit migrazione: `5623fd00236b916c21fd6b5dc05f00efb3b06f7d`.
- Commit validatore corretto: `d9710f4e58e69d5471f4c1b131c38922b814a281`.
- GitHub Actions run #142: **SUCCESS**; validatore NEXTWAY, contratto sicurezza provisioning e type-check Deno superati. https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43035069712
- **Stato database:** la migrazione dei privilegi è presente su GitHub ma NON ancora applicata a Supabase. L'audit dei privilegi letti dal database descrive lo stato precedente alla migrazione.
- Nessun utente, cliente, partner, invito o conversione di prova è stato creato. Nessun intervento Netlify; il blocco fino al 4 dicembre 2026 resta valido.

### Passo operativo successivo
Applicare una sola volta su Supabase SQL Editor la migrazione `20261111160000_nextway_trigger_function_privileges.sql`; quindi eseguire un'unica query aggregata di verifica ACL e stato trigger. Non ripetere i controlli già completati.


## CHIUSURA AUDIT AUTORIZZAZIONI RPC E TRIGGER — 11 NOVEMBRE 2026

Verifica aggregata finale eseguita dopo l'applicazione della migrazione `20261111160000_nextway_trigger_function_privileges.sql`.

Esito per tutte le quattro funzioni trigger-only:
- `nextway_apply_lead_qualification_v1()`: ACL `{postgres=X/postgres,service_role=X/postgres}`; trigger attivo.
- `nextway_set_lead_updated_at()`: ACL `{postgres=X/postgres,service_role=X/postgres}`; trigger attivo.
- `nextway_setter_touch()`: ACL `{postgres=X/postgres,service_role=X/postgres}`; trigger attivo.
- `nextway_validate_setter_owner()`: ACL `{postgres=X/postgres,service_role=X/postgres}`; trigger attivo.

La verifica conferma che `anon`, `authenticated` e `PUBLIC` non dispongono di EXECUTE diretto su queste funzioni; i trigger restano abilitati e operativi. Migrazione applicata manualmente in Supabase SQL Editor con esito `Success. No rows returned`.

Validazione GitHub Actions #142: SUCCESS. Nessun'altra verifica SQL è richiesta per la chiusura di questo audit.

Le due overload di `nextway_save_ai_analysis` restano entrambe presenti e invariate, in attesa di accertare eventuali consumer esterni prima di un'eventuale unificazione. Le differenze semantiche sono documentate nella sezione precedente.

Vincolo operativo invariato: nessun intervento su Netlify fino al 4 dicembre 2026.


## FASE BACKEND SUCCESSIVA — CONTRATTI STATICI EDGE FUNCTIONS (11 NOVEMBRE 2026)

Dopo la chiusura dell'audit RPC/trigger, avviata la copertura automatica dei contratti di sicurezza delle Edge Functions AI Setter e Ricerca NEXTWAY.

- Aggiunto `scripts/test-nextway-edge-functions-security.mjs`: verifica in CI l'ordine dei controlli di autenticazione e accesso, allowlist CORS, limiti del body, validazione UUID/obiettivi, rate limit fail-closed, letture tramite RLS, claim idempotente, staging e completamento, minimizzazione dei dati inviati ai provider, assenza di chiavi service-role nel codice e contratto bozza/non-invio.
- Lo stesso test copre la Edge Function di ricerca: autenticazione, limite 1–5 query, lunghezza massima, rate limit per unità, timeout provider e gestione risultati parziali.
- Workflow `.github/workflows/nextway-static-validation.yml` aggiornato per eseguire il nuovo test e attivarsi anche quando cambia il relativo script.
- Commit test: `9381d3e0cc2dc79ed153cb429d35e6ef3c2a4e24`.
- Commit workflow: `e3525ff976cb4f3def58ea0cbaff82c4af87276b`.
- GitHub Actions #143: **SUCCESS**; tutti gli step del workflow completati, incluso il nuovo test dei contratti Edge Functions e i type-check Deno. Run: https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43036002822.
- Questa attività aggiunge test statici di regressione: non modifica le Edge Functions deployate, non applica migrazioni e non esegue chiamate reali a OpenAI/Tavily.
- Nessun utente, cliente, partner, invito o conversione di prova creato. Nessuna modifica a Supabase live.
- Vincolo Netlify invariato: nessun intervento fino al 4 dicembre 2026.

**Chiarimento stato:** il test statico non sostituisce il collaudo runtime autenticato con due partner e un platform_admin, né il test frontend live. Questi restano subordinati alla disponibilità degli account reali e al ripristino autorizzato del deploy Netlify.


## AUDIT STATICO SQL — RATE LIMIT, IDEMPOTENZA E RECUPERO OUTPUT (11 NOVEMBRE 2026)

Esaminate le migrazioni versionate:
- `20261110000100_nextway_distributed_rate_limit.sql`
- `20261110000200_nextway_setter_idempotency.sql`
- `20261110000300_nextway_rate_limit_units.sql`
- `20261110000400_nextway_idempotency_retention.sql`
- `20261110000500_nextway_setter_output_recovery.sql`
- `20261110000600_nextway_setter_output_authorization_hardening.sql`
- `20261110000700_nextway_clear_stale_staged_output.sql`

Esiti dell'ispezione:
- Tabella rate limit con RLS attiva e accesso diretto revocato a `PUBLIC`, `anon` e `authenticated`; consumo atomico per utente e ambito.
- La migrazione 003 sostituisce la firma iniziale della RPC e porta il limite ricerca pubblica da 3 a 10 unità/minuto; AI Setter resta a 5 generazioni/minuto. Le unità sono limitate a 1–5 e il consumo della ricerca è proporzionale al numero di query.
- Tabella idempotenza con RLS e accesso diretto revocato; unicità per utente/chiave e indice univoco parziale che consente una sola prenotazione pending per conversazione.
- Le RPC di claim e completamento verificano autenticazione, proprietà o ruolo amministrativo, lease e stato conversazione; usano lock di riga. Inserimento bozza e memorizzazione risposta avvengono nella stessa funzione/transazione.
- Le funzioni di staging e recupero validano la struttura JSON e rivalutano autorizzazione, lease e stato della conversazione; non restituiscono output per conversazioni chiuse/archiviate.
- Il trigger di riassegnazione azzera l'output temporaneo quando cambia utente, chiave o conversazione; EXECUTE diretto è revocato ai ruoli client.
- La pulizia retention è manuale, protetta da controllo interno `platform_admin`, conserva completati per 30 giorni e pending scadute per 24 ore; nessun cron automatico viene creato.
- Le funzioni SECURITY DEFINER esaminate fissano `search_path = pg_catalog, public`; i grant client sono limitati alle RPC applicative necessarie.

Copertura automatica aggiunta:
- `scripts/test-nextway-idempotency-sql-security.mjs` verifica i contratti SQL sopra descritti.
- Workflow aggiornato per eseguire anche questo test.
- Commit test: `ad1b2dd41734a73557b2bd7f013fdf789a840718`.
- Commit workflow: `456ee76301ffd95c96145fc99919458dff8d587b`.
- GitHub Actions #144: **SUCCESS**; test audit NEXTWAY, provisioning, Edge Functions, SQL rate limit/idempotenza e type-check Deno superati. https://github.com/servellodm-a11y/misura-test-benessere/actions/runs/43036197153.

**Limite dell'esito:** audit statico dei file repository; non equivale a interrogazione dello schema live né a test runtime di concorrenza con utenti distinti. Nessuna migrazione applicata durante questa fase e nessun dato di test creato.


## PRIORITÀ FUNZIONALE SUCCESSIVA — KNOWLEDGE BASE NEXTWAY AI ASSISTANT

Decisione operativa ricavata dal confronto tra architettura e sorgenti presenti su main (11 novembre 2026).

### Funzionalità mancante
Realizzare il motore di conoscenza documentale dell'assistente NEXTWAY AI. Il CRM, la ricerca Lead e l'AI Setter assistito sono componenti distinti e non sostituiscono un assistente capace di rispondere usando fonti aziendali approvate. L'architettura iniziale descrive i knowledge modules e la tracciabilità delle fonti, ma nei sorgenti consultati non risulta ancora implementato il ciclo completo di caricamento, approvazione, recupero documentale e risposta fondata sulle fonti.

### Perimetro della prima versione
1. Console amministrativa per registrare e gestire fonti/documenti, lingua, settore, versione, validità e stato di approvazione.
2. Pipeline server-side per estrazione e indicizzazione dei contenuti approvati; nessuna chiave segreta nel browser.
3. Recupero delle sole fonti approvate e pertinenti al modulo/settore selezionato.
4. Risposte con riferimenti alle fonti utilizzate; se non esistono evidenze adeguate, dichiarazione esplicita del limite e passaggio a un operatore.
5. Separazione rigorosa dei moduli di conoscenza e delle finalità; nessun riutilizzo automatico di dati personali o sanitari per finalità commerciali.
6. Primo corpus: documentazione Zinzino verificata. Architettura predisposta per moduli settoriali futuri senza duplicare il motore.

### Sequenza di realizzazione
- Prima: ricognizione mirata dei componenti già presenti e definizione del contratto dati/API, senza ripetere audit generici già conclusi.
- Poi: progettazione e implementazione incrementale del servizio di ingestione e retrieval, con gestione delle fonti e approvazione amministrativa.
- Successivamente: interfaccia conversazionale web e collaudo controllato.
- WhatsApp Business Platform resta una fase successiva, subordinata al completamento del motore e alla configurazione autorizzata del canale.

### Stato e vincoli
- Questa è una priorità di sviluppo funzionale, non un nuovo audit di sicurezza.
- La migrazione draft `20261105000100_nextway_ai_assistant_foundation.sql` non va applicata automaticamente: prima occorre confrontarla con lo schema live e definire il modello definitivo.
- Nessun dato di prova, account, partner o cliente deve essere creato per questa fase senza necessità e autorizzazione.
- Nessun intervento su Netlify fino al 4 dicembre 2026.
- Nessuna implementazione di retrieval o collegamento a provider è dichiarata completata con questa registrazione: è una decisione di roadmap.


## SVILUPPO KNOWLEDGE BASE — PRIMA MIGRAZIONE CANDIDATA (11 NOVEMBRE 2026)

Avviata la prima implementazione funzionale del motore documentale NEXTWAY AI, senza riaprire audit già conclusi.

### Componenti aggiunti su GitHub
- Migrazione candidata `supabase/migrations/20261111170000_nextway_knowledge_base.sql`: registro documenti, metadati di settore/lingua/versione/validità, stato di approvazione, hash SHA-256, archivio dei chunk testuali e ricerca full-text italiana PostgreSQL.
- Le fonti sono ricercabili solo quando approvate e nel periodo di validità; i risultati sono filtrati per modulo e lingua.
- RLS attiva su entrambe le tabelle; modifiche amministrative riservate a `platform_admin`; lettura dei soli documenti approvati per utenti autenticati.
- RPC `nextway_search_knowledge(text,text,text,integer)` in SECURITY INVOKER, con limite massimo di 10 risultati e EXECUTE per authenticated/service_role; nessun accesso anonimo.
- Nessuna estensione vettoriale, servizio di embedding, chiamata a provider AI o chiave segreta richiesta in questa prima componente.
- Test statico `scripts/test-nextway-knowledge-base-sql.mjs` aggiunto alla workflow `.github/workflows/nextway-static-validation.yml`.

### Commit
- Migrazione: `f047f759ada7e6292999162d120108479dc21624`.
- Test statico: `6624c7db5e6e78acb2e7c5da36a57949fafb278d`.
- Workflow CI: `92122a4b5d99c54a9d8d76463e4d192bc0f43c59`.

### Stato effettivo e prossimi passaggi
- Codice e migrazione sono presenti su GitHub `main`; la migrazione è **CANDIDATA, NON APPLICATA** a Supabase.
- Il test statico è stato collegato alla CI; esito del run relativo al commit workflow ancora da acquisire.
- Nessuna tabella, policy o funzione live è stata creata o modificata; nessun documento o dato di prova è stato inserito.
- Prima di applicare la migrazione: revisione mirata della compatibilità con lo schema live e delle dipendenze (in particolare `nextway_is_platform_admin()` e disponibilità della configurazione PostgreSQL `italian`), quindi applicazione controllata.
- Il caricamento file/estrazione testo e la console amministrativa non sono ancora implementati. Questa migrazione fornisce registro, chunk e retrieval testuale, non una pipeline di ingestione completa.
- Nessun intervento su Netlify fino al 4 dicembre 2026.


## INGESTIONE DOCUMENTALE NEXTWAY — EDGE FUNCTION V1

Sviluppo successivo della Knowledge Base (11 novembre 2026).

### Componente realizzata
- Edge Function `supabase/functions/nextway-knowledge-ingest/index.ts`.
- Endpoint riservato a `platform_admin`: valida sessione Auth e ruolo sul database prima di usare il client service-role lato server.
- Riceve testo estratto e metadati in JSON; limite richiesta 600 KB e contenuto 500.000 caratteri.
- Normalizza il testo, lo suddivide in chunk da circa 9.000 caratteri con sovrapposizione di 500, calcola SHA-256 e salva documento + chunk.
- Nuovi documenti sempre `pending`; l'endpoint non può approvare o pubblicare contenuti.
- Deduplicazione per modulo + hash, con indice univoco nel candidato SQL e gestione del conflitto concorrente.
- In caso di errore nell'inserimento dei chunk, tenta la rimozione compensativa del documento per non lasciare una voce incompleta.
- Prima versione limitata esplicitamente alla lingua italiana, coerente con la configurazione PostgreSQL `italian` della ricerca full-text.
- Nessun file viene ancora caricato su Storage e nessun PDF/DOCX viene estratto automaticamente: questa funzione riceve testo già estratto. Parser e upload file restano sviluppo successivo.

### Test e CI
- `scripts/test-nextway-knowledge-ingest-security.mjs` aggiunto.
- Workflow `nextway-static-validation.yml` aggiornato: test statico e `deno check` della nuova Edge Function; inclusa anche nei path di pull request.
- Commit Edge Function: `20b6e907f1ef1a29abbe9a4225fb259ec87026e3`.
- Commit test: `1b7bedee5f5a977b102fd3ecd9bf4b1b4bed6938`.
- Commit workflow: `6a74a6d2fba3af470aa31e829ab37c69737097df`.
- Migrazione Knowledge Base aggiornata con indice univoco modulo/hash e vincolo lingua italiana: `b00b1b69613ca4a0adda7dc55e74895f2e51642b`.

### Stato operativo
- Codice e workflow sono su GitHub `main`.
- La migrazione Knowledge Base resta candidata e NON è applicata a Supabase.
- Edge Function NON deployata: richiede prima schema live disponibile.
- Esito CI del commit più recente non ancora verificato; non dichiarare type-check superato fino a risultato GitHub Actions.
- Nessun dato inserito, nessuna funzione live modificata, nessun intervento Netlify (bloccato fino al 4 dicembre 2026).

### Sequenza successiva
1. Attendere/esaminare CI.
2. Rivedere e applicare la migrazione candidata in modo controllato.
3. Deploy della Edge Function e test autenticazione anonima senza creare record.
4. Implementare approvazione amministrativa e gestione documenti.
5. Successivamente upload Storage e parser PDF/DOCX.


## UPLOAD DOCUMENTALE PDF / DOCX / TXT — V1 (11 NOVEMBRE 2026)

### Componenti aggiunti
- Edge Function `supabase/functions/nextway-knowledge-upload/index.ts`.
- Migrazione candidata `supabase/migrations/20261111180000_nextway_knowledge_storage.sql`.
- Test statico `scripts/test-nextway-knowledge-upload-security.mjs`.
- Workflow CI aggiornato per test e type-check della nuova funzione.

### Funzionamento previsto
1. Solo `platform_admin` può invocare l'upload.
2. Accetta PDF, DOCX e TXT fino a 12 MB.
3. Estrae testo da PDF con `pdfjs-dist`, da DOCX con `mammoth`, da TXT con decoder UTF-8 rigoroso.
4. Rifiuta file non riconosciuti, estrazioni vuote o contenuti oltre 500.000 caratteri.
5. Carica il file originale in bucket privato `nextway-knowledge`, percorso `source-files/<module_key>/...`.
6. Passa il testo al servizio di ingestione già implementato, che calcola SHA-256, deduplica e crea chunk in stato `pending`.
7. Collega il percorso Storage al documento; in caso di errore tenta la pulizia compensativa.
8. File duplicati non vengono caricati come nuove fonti permanenti.

### Limiti espliciti V1
- Solo lingua italiana.
- PDF scansiti/immagini non sono elaborati: OCR non implementato.
- Nessuna elaborazione di DOC, XLS/XLSX o PPT/PPTX.
- Nessun frontend di amministrazione o pulsante di upload ancora realizzato.
- L'upload originale è privato e leggibile solo da platform_admin tramite policy Storage; il service-role è usato solo server-side.
- Migrazione Storage e migrazione base Knowledge Base restano candidate: non applicate a Supabase.
- Edge Functions upload e ingest non deployate.
- Nessun documento o file di test caricato; nessuna modifica a dati live.
- CI aggiornata, ma esito dei nuovi test e del type-check Deno da verificare prima del deploy.

### Commit principali
- Upload Edge Function: `78cd94396d85ff51e2e509c85bdeb6eb328dde41`.
- Storage migration: `6f09e85733db006422a91a01cf86cb695f3bffe8`.
- Upload security test: `0040f722730c002c4364d4c10f1c07a4a652ae33`.
- Workflow upload CI: `2676111788c03393f38328d17935d4a2b6ad022a`.
- Ingest body-size alignment: `d2168e1acb4e3ad1854a64691f1a89ac3488224d`.
- Ingest test alignment: `1fa93066fb9817354588663e286aa2dc388f49ae`.

### Architettura multi-azienda — requisito permanente
NEXTWAY resta indipendente dal partner aziendale. Il valore `module_key` separa la Knowledge Base e i contenuti di ciascun progetto. Prossimo sviluppo architetturale: registro `company/workspace profiles` configurabile, con identità aziendale, settore, mercati, prodotti/servizi, parametri di ricerca prospect, criteri di qualificazione, prompt e strategie AI versionati. I dati prospect, documenti, prompt e conversazioni dovranno essere sempre associati al workspace; nessuna commistione tra aziende. Il cambio di azienda dovrà essere una riconfigurazione amministrativa, senza modificare il core né cancellare lo storico. La multi-azienda non è ancora implementata: è requisito di progettazione da sviluppare.

### Prossimi passaggi
1. Ottenere esito CI e correggere eventuali errori di type-check o dipendenze.
2. Revisione congiunta delle due migrazioni Knowledge Base/Storage e compatibilità con schema live.
3. Solo dopo approvazione e backup, applicare le migrazioni e deployare le Edge Functions.
4. Test di sicurezza senza creare documenti persistenti, poi upload di un documento reale solo con autorizzazione.
5. Sviluppare console admin per upload, revisione, approvazione, rifiuto, sostituzione e scadenza documenti.
6. Sviluppare configurazione multi-azienda/workspace e gestione versioni dei prompt e dei criteri prospect.

Netlify resta escluso dagli interventi fino al 4 dicembre 2026.


## FONDAZIONE MULTI-WORKSPACE — REGISTRO AZIENDE E CONFIGURAZIONI (11 NOVEMBRE 2026)

Avviata l'implementazione della struttura multi-azienda, senza alterare le tabelle operative esistenti.

### Componenti aggiunti su GitHub
- Migrazione candidata `supabase/migrations/20261111190000_nextway_multi_workspace_foundation.sql`.
- Tabella `nextway_workspaces`: identità aziendale, partner/brand, settore, descrizione, sito, mercato, lingua, stato e impostazioni JSON strutturate.
- Tabella `nextway_workspace_prompts`: prompt per finalità, versioni immutabili per chiave e stato draft/active/archived.
- Tabella `nextway_workspace_prospect_criteria`: criteri di ricerca e qualificazione versionati, con configurazione JSON.
- Per prompt e criteri è consentita una sola versione active per workspace e chiave; l'attivazione richiede approvatore e timestamp.
- RLS abilitata sulle tre tabelle; CRUD riservato al ruolo `platform_admin`. Nessun accesso anonimo.
- Nessun workspace viene precaricato. Nessuna tabella lead, CRM o Knowledge Base viene modificata in questa migrazione.

### Validazione
- Aggiunto `scripts/test-nextway-multi-workspace-sql.mjs` per verificare struttura, versionamento, RLS, privilegi e assenza di seed/modifiche alle tabelle operative.
- Workflow `.github/workflows/nextway-static-validation.yml` aggiornato per eseguire il test.
- Commit migrazione: `d1acf53f1070de87e0e38a46615bb4f4f248e3d7`.
- Commit test: `a5ec741ebae6a83c36c3116a040556ed8cb0b8b8`.
- Commit workflow: `2b650aca76847bf367009191f29302e4a51262ab`.
- Esito GitHub Actions relativo a questi commit: non ancora verificato; non dichiarare il test superato finché non è disponibile il risultato.

### Limiti e prossimi passaggi
- La migrazione è **CANDIDATA, NON APPLICATA** a Supabase.
- Nessun workspace/azienda è stato creato e nessun dato live è stato modificato.
- La separazione effettiva di lead, documenti, conversazioni e attività per workspace richiederà migrazioni successive con colonne/FK e policy RLS dedicate. Non è ancora operativa.
- La console amministrativa non è ancora implementata; questo blocco fornisce il modello dati.
- Prossimo sviluppo: API amministrative controllate per creare/aggiornare workspace e gestire versioni/approvazioni di prompt e criteri, poi associazione progressiva dei moduli esistenti.
- Netlify resta escluso dagli interventi fino al 4 dicembre 2026.


## API AMMINISTRATIVE WORKSPACE — V1 (11 NOVEMBRE 2026)

Sviluppato il primo servizio backend per gestire workspace, prompt e criteri senza accesso diretto dal browser alle credenziali privilegiate.

### Componenti aggiunti
- Edge Function `supabase/functions/nextway-workspace-admin/index.ts`.
- Migrazione candidata `supabase/migrations/20261111200000_nextway_workspace_activation_rpc.sql`.
- Test statico `scripts/test-nextway-workspace-admin-security.mjs`.
- Workflow CI aggiornato per test statico e `deno check` della nuova Edge Function.

### API disponibili
- `list_workspaces`: elenco amministrativo dei workspace.
- `create_workspace`: crea un workspace in stato draft, senza seed automatici.
- `update_workspace`: aggiorna metadati, impostazioni e stato del workspace.
- `save_prompt_draft` / `save_criteria_draft`: registra nuove versioni in stato draft.
- `activate_prompt` / `activate_criteria`: attiva una bozza e archivia la versione attiva precedente nella stessa transazione PostgreSQL.
- `archive_prompt` / `archive_criteria`: archivia versioni non attive; una versione attiva non può essere archiviata senza sostituzione.

### Sicurezza e limiti
- Ogni richiesta richiede JWT valido e ruolo `platform_admin`; il service-role resta server-side.
- Body limitato a 100 KB, allowlist CORS, validazione UUID, chiavi e campi, errori senza dettagli interni.
- Le RPC di attivazione sono SECURITY DEFINER con search_path fisso, verificano il ruolo amministrativo indicato e sono eseguibili solo da service_role.
- La funzione non crea account, partner, lead o clienti e non invia messaggi.
- Il servizio non è deployato e dipende dalle due migrazioni workspace candidate già versionate.

### Commit
- Edge Function: `1d5577c41c09065e79bb77a74fc8fb5d63720b2c`.
- RPC transazionali: `7146abeb639c0e8e59f69bb15d4747ff05d4f45c`.
- Test sicurezza: `4492b0e5333240151378a6e336fbe8d85258d9df`.
- Workflow: `3c4d1164fa49b6ebdb98277da7f89529e27dda78`.

### Stato
- Codice presente su GitHub main.
- Migrazioni workspace e RPC: **CANDIDATE, NON APPLICATE**.
- Edge Function: **NON DEPLOYATA**.
- CI/type-check: da verificare sul run generato dal push; nessun esito va presunto.
- Nessun workspace, prompt, criterio o dato operativo è stato creato su Supabase.
- Nessun intervento Netlify fino al 4 dicembre 2026.

### Prossimo passo
Dopo la validazione statica e type-check, completare il modello di isolamento workspace per documenti, lead e conversazioni, poi pianificare l'applicazione coordinata delle migrazioni e il deploy. L'associazione dei dati esistenti non va eseguita automaticamente: richiederà una strategia esplicita di migrazione e verifica.


### Integrazione di validazione — aggiornamento
- Corretto il tipo numerico delle versioni nella Edge Function workspace admin.
- Workflow aggiornato anche nei filtri `pull_request` per includere funzione e test amministrativi.
- Commit correzione Edge Function: `177654c9d97325440bb61e3092d0ce610ee3a049`.
- Commit workflow PR paths: `817260aaaef8ac87242b1b518625b00353b56556`.
- Il connettore GitHub disponibile non ha restituito il run push della CI; esito test e `deno check` resta **NON VERIFICATO**. Nessuna dichiarazione di superamento.


### Estensione API amministrativa — lettura versioni
- Aggiunte le azioni `list_prompts` e `list_criteria` per consultare lo storico delle versioni e i relativi stati/approvazioni.
- Test statico aggiornato per includere entrambe le azioni.
- Commit Edge Function: `4ac0cc62e76be216e7716f8484c4a8c5b91c83d1`.
- Commit test: `2f094f5917c9c239a716bde0bbb2fa50686faf42`.
- La CI deve rieseguire il workflow sul push; il risultato non è stato recuperato e resta non verificato.


## ASSOCIAZIONE DATI OPERATIVI AI WORKSPACE — BASE ADDITIVA (11 NOVEMBRE 2026)

### Analisi delle relazioni nel repository
- Prospect: `nextway_leads`, con proprietario `owner_profile_id`.
- Attività CRM: `nextway_lead_activities`, collegate al Lead tramite `lead_id`; il workspace viene ereditato dal Lead, senza duplicare un campo che potrebbe diventare incoerente.
- Richieste di conversione: `nextway_lead_conversion_requests`, collegate al Lead tramite `lead_id`; anche qui il workspace viene ereditato dal Lead.
- Knowledge Base: `nextway_knowledge_documents` e `nextway_knowledge_chunks`; il workspace viene assegnato al documento, mentre i chunk lo ereditano tramite `document_id`.
- AI Setter: le tabelle `nextway_setter_conversations` e `nextway_setter_messages` sono richiamate dal codice e dalle diagnostiche. La definizione completa delle tabelle conversazioni/messaggi non è versionata nelle migrazioni consultate. La nuova migrazione tratta `nextway_setter_conversations` come tabella opzionale e associa i messaggi indirettamente tramite la conversazione. Le richieste idempotenti di generazione ereditano a loro volta il workspace tramite `conversation_id`.
- `clients`, `partner_details` e `profiles` restano entità anagrafiche condivise: non vengono forzate in un singolo workspace, perché una persona può avere relazioni/opportunità in più settori.

### Componenti aggiunti
- Migrazione candidata `supabase/migrations/20261111210000_nextway_workspace_data_association.sql`.
- Test statico `scripts/test-nextway-workspace-data-association.mjs`.
- Workflow CI aggiornato per eseguire il nuovo test su push e pull request.

### Comportamento della migrazione
- Aggiunge `workspace_id uuid` nullable a `nextway_leads` e `nextway_knowledge_documents`; aggiunge la stessa colonna a `nextway_setter_conversations` solo se la tabella esiste.
- Aggiunge foreign key verso `nextway_workspaces(id)` con `ON DELETE RESTRICT` e indici parziali per i record assegnati.
- Non assegna automaticamente i dati esistenti a un workspace.
- Non aggiunge `workspace_id` alle attività, richieste di conversione, messaggi e richieste idempotenti: questi record ereditano il workspace tramite le relazioni già presenti.
- Non modifica policy RLS, grants, RPC, trigger, dati, account o configurazioni.

### Limite di sicurezza fondamentale
Questa è **solo una base di associazione dati**, non l'isolamento effettivo tra workspace. Le policy attuali, in particolare la lettura dei documenti approvati, non sono state ristrette per workspace. Non assegnare documenti o Lead a workspace operativi finché non saranno definite e implementate membership, autorizzazioni workspace-scoped e ricerca KB filtrata per workspace. La migrazione resta candidata e NON è stata applicata a Supabase.

### Commit
- Migrazione: `ae53c9f5170d8c7ae07161f3b6039bf2d9d18d67`.
- Test statico: `a0d50f177a706648506896a34ec75617d616e21d`, con correzione delle asserzioni successiva.
- Workflow CI aggiornato: commit registrato nel repository dopo l'aggiunta del test ai filtri push/pull request.
- Esito CI e `deno check`: non verificati in questa sessione.

### Prossimo blocco
Progettare la tabella di membership workspace e il modello dei permessi (utente ↔ workspace ↔ ruolo), quindi introdurre policy RLS e RPC di ricerca con filtro obbligatorio workspace. Solo dopo potrà essere attivato l'isolamento reale e pianificato il backfill controllato. Nessuna applicazione live, nessun deploy Edge Function e nessun intervento Netlify fino al 4 dicembre 2026.
