# MASTER NEXTWAY

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
| Edge Function `nextway-ai-setter` | **ESEGUITO MA NON VERIFICATO** nel repository e nell'ambiente live |
| Tabelle lead/conversazioni | **NESSUN RECORD** per il profilo admin nelle query del 10 novembre |
| RPC creazione lead/conversazione | **ESEGUITO MA NON VERIFICATO** |
| Test RLS con due partner e admin | **DA COMPLETARE** |
| WhatsApp Business Platform | **DA COMPLETARE**; non risulta attivata |
| MASTER NEXTWAY | **IN CREAZIONE** fino a rilettura dopo commit |

## 12. Prossimo percorso operativo

1. Salvare e rileggere questo MASTER nel repository.
2. Allineare il codice effettivo della funzione `nextway-ai-setter` e i relativi endpoint/configurazioni con quanto già riportato in chat, senza inventare URL.
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
- Codice versionato AI Setter: **DA COMPLETARE**.
- Collegamento frontend al generatore di bozze: **DA COMPLETARE**.
- Secrets: **RIFERITI DALL'UTENTE, NON VERIFICATI LIVE**.
- Prossimo intervento tecnico: recuperare dal pannello Supabase il codice attualmente pubblicato e l'URL effettivo, quindi salvarli nel repository in `supabase/functions/nextway-ai-setter/index.ts` e documentare il deploy. Non ricostruire il codice da supposizioni e non cambiare endpoint senza prima verificare quello reale.
