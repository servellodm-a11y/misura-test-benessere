# MASTER NEXTWAY

## AGGIORNAMENTO OPERATIVO — 10 NOVEMBRE 2026 (integrazione frontend AI Setter)

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
| MASTER NEXTWAY | **IN CREAZIONE** fino a rilettura dopo commit |

## 12. Prossimo percorso operativo

1. Salvare e rileggere questo MASTER nel repository.
2. Confrontare `supabase/functions/nextway-ai-setter/index.ts` con il sorgente live in Supabase e verificare l'endpoint effettivo; non effettuare deploy finché il confronto e i test non sono conclusi.
3. Verificare la definizione effettiva della RPC di creazione lead/conversazione e la coerenza con le tabelle reali.
4. Preparare il primo inserimento controllato di un lead di test e la relativa conversazione, solo quando la funzione/RPC e le policy sono coerenti.
5. Testare il flusso AI Setter: generazione bozza, salvataggio, approvazione manuale; nessun invio automatico.
6. Testare isolamento RLS con account distinti partner A, partner B e platform_admin.
7. Solo dopo il superamento dei test, passare alle integrazioni successive.

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
- Le pagine `nextway-ai.html`, `nextway-ricerca.html` e `nextway-motore-ricerca.html` includono lo script Supabase JS e `/nextway-cloud.js`.
- Nota UI da rivedere: `nextway-ai.html` contiene ancora un avviso che descrive l'archivio come solo locale e non sincronizzato tra dispositivi, mentre il modulo cloud offre configurazione, login, sincronizzazione e lettura cloud. La sincronizzazione resta manuale e non completa per aggiornamenti/cancellazioni. Non modificato in questo passaggio.

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
- Il motivo è limitato a 500 caratteri anche nell'interfaccia; l'utente può annullare la richiesta senza eseguire l'archiviazione.
- Rimossa l'assegnazione impropria local_dirty=false dopo la modifica di archiviazione: la funzione non deve nascondere modifiche locali pendenti.
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

- Preparata `supabase/diagnostics/nextway_setter_permissions_readonly.sql`, query read-only che rileva colonne, stato RLS/FORCE RLS, policy USING/WITH CHECK, grants client e foreign key delle tabelle `nextway_setter_conversations` e `nextway_setter_messages`.
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
