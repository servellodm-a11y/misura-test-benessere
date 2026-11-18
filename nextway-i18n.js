(function () {
  "use strict";

  const translations = {
    "Area operativa · prototipo 1": "Operations area · prototype 1",
    "Torna al sito": "Back to website",
    "Torna all'area operativa": "Back to operations",
    "Gestione Lead": "Lead management",
    "Motore multi-ricerca": "Multi-search engine",
    "Apri modulo Ricerca Lead": "Open Lead search",
    "Analisi e prequalificazione": "Lead analysis and prequalification",
    "Dashboard": "Dashboard",
    "AI Setter": "AI Setter",
    "Amministrazione NEXTWAY": "NEXTWAY administration",
    "Inserisci, documenta, valuta e organizza persone individuate da fonti pubbliche.": "Add, document, assess and organize people identified through public sources.",
    "Nota:": "Note:",
    "Lead attivi": "Active Leads",
    "Da verificare": "To be verified",
    "Priorità A": "Priority A",
    "URL duplicati": "Duplicate URLs",
    "Contattati": "Contacted",
    "In follow-up": "Follow-up",
    "In valutazione": "Under evaluation",
    "Convertiti": "Converted",
    "Nuovo Lead": "New Lead",
    "Nome / identificativo pubblico *": "Name / public identifier *",
    "Professione": "Profession",
    "Professione o attività *": "Profession or activity *",
    "Azienda / brand dichiarato": "Company / declared brand",
    "Località pubblicata": "Published location",
    "Categoria CRM": "CRM category",
    "Potenziale Partner": "Potential Partner",
    "Cliente finale": "End customer",
    "Professionista wellness": "Wellness professional",
    "Risultato da qualificare": "Result to qualify",
    "Profilo Partner": "Partner profile",
    "Non applicabile / da definire": "Not applicable / to be defined",
    "Non applicabile": "Not applicable",
    "Networker settore wellness": "Wellness networker",
    "Networker alle prime armi": "Beginner networker",
    "Networker di altri settori": "Networker in other sectors",
    "Networker attivo di altra azienda": "Active networker at another company",
    "Ex-networker": "Former networker",
    "Imprenditore / professionista": "Entrepreneur / professional",
    "Altro profilo individuale": "Other individual profile",
    "Percorso commerciale": "Commercial pathway",
    "Da classificare": "To be classified",
    "Cliente — prodotti e abbonamenti": "Customer — products and subscriptions",
    "Partner — kit e attività professionale": "Partner — kits and professional activity",
    "Individuazione": "Discovery method",
    "Interesse espresso": "Expressed interest",
    "Affinità professionale": "Professional affinity",
    "Modalità di individuazione": "Discovery method",
    "Segnale pubblico rilevato": "Observed public signal",
    "Da definire": "To be defined",
    "Ricerca nuove collaboratrici / persone": "Recruiting new collaborators / people",
    "Invito a entrare nel team": "Invitation to join the team",
    "Dichiara di ampliare il team": "States they are expanding their team",
    "Formazione / leadership del gruppo": "Team training / leadership",
    "Attività commerciale / e-commerce personale": "Business activity / personal e-commerce",
    "Esperienza precedente nel network marketing": "Previous network marketing experience",
    "Altro segnale documentato": "Other documented signal",
    "Fonte / piattaforma *": "Source / platform *",
    "URL pubblico verificabile *": "Verifiable public URL *",
    "Evidenza pubblica e motivo di pertinenza *": "Public evidence and reason for relevance *",
    "Data della verifica": "Verification date",
    "Data verifica": "Verification date",
    "Identità individuale": "Individual identity",
    "Identità individuale *": "Individual identity *",
    "Confermata": "Confirmed",
    "Incerta": "Uncertain",
    "Esito prequalificazione": "Prequalification outcome",
    "Da approfondire": "Needs further review",
    "Qualificato": "Qualified",
    "Escluso": "Excluded",
    "Coerenza target (0–30)": "Target fit (0–30)",
    "Coerenza con il target (0–30)": "Target fit (0–30)",
    "Attività verificabile (0–20)": "Verifiable activity (0–20)",
    "Presenza pubblica (0–15)": "Public presence (0–15)",
    "Presenza pubblica pertinente (0–15)": "Relevant public presence (0–15)",
    "Interesse pubblico (0–20)": "Public interest (0–20)",
    "Segnali pubblici di interesse (0–20)": "Public signals of interest (0–20)",
    "Pertinenza approccio (0–15)": "Approach relevance (0–15)",
    "Pertinenza di un possibile approccio (0–15)": "Relevance of a potential approach (0–15)",
    "Note / prossima azione": "Notes / next action",
    "Note e motivazione aggiuntiva": "Notes and additional rationale",
    "Salva Lead": "Save Lead",
    "Salva nell'archivio Lead": "Save to Lead archive",
    "Annulla modifica": "Cancel edit",
    "Pulisci": "Clear",
    "Azzera modulo": "Reset form",
    "Archivio": "Archive",
    "Archivio Lead": "Lead archive",
    "Priorità di verifica": "Verification priority",
    "Verifica alta": "High priority",
    "Verifica media": "Medium priority",
    "Senza punteggio": "No score",
    "Mostra priorità alta": "Show high-priority items",
    "Tutte le categorie": "All categories",
    "Potenziali Partner": "Potential Partners",
    "Clienti finali": "End customers",
    "Professionisti wellness": "Wellness professionals",
    "Risultati da qualificare": "Results to qualify",
    "Lead archiviati": "Archived Leads",
    "Tutti i Lead": "All Leads",
    "Tutti gli stati": "All statuses",
    "Verificato": "Verified",
    "Contattato": "Contacted",
    "Convertito cliente": "Converted to customer",
    "Convertito partner": "Converted to Partner",
    "Non interessato": "Not interested",
    "Tutte le qualificazioni": "All qualification statuses",
    "Tutti i profili partner": "All Partner profiles",
    "Professionista salute e benessere": "Health and wellness professional",
    "Networker wellness": "Wellness networker",
    "Persona interessata a reddito extra": "Person interested in additional income",
    "Persona interessata ad attività imprenditoriale": "Person interested in a business opportunity",
    "Tutte le qualificazioni commerciali": "All commercial qualification statuses",
    "Prospect con recapiti utilizzabili": "Prospect with usable contact details",
    "Prospect molto pertinente": "Highly relevant prospect",
    "Prospect interessante · da verificare": "Interesting prospect · needs verification",
    "Non adatto · da scartare": "Not suitable · discard",
    "Tutte le qualità documentali": "All evidence quality levels",
    "Alta (80–100)": "High (80–100)",
    "Media (50–79)": "Medium (50–79)",
    "Bassa (0–49)": "Low (0–49)",
    "Non disponibile": "Unavailable",
    "Tutti i tipi di risultato": "All result types",
    "Possibile profilo individuale": "Possible individual profile",
    "Identità individuale non confermata": "Individual identity not confirmed",
    "Azienda o organizzazione": "Company or organization",
    "Directory / articolo / annuncio": "Directory / article / listing",
    "Priorità commerciale suggerita": "Suggested commercial priority",
    "Qualità ricerca più alta": "Highest research quality",
    "Punteggio commerciale più alto": "Highest commercial score",
    "Più recenti": "Newest",
    "Meno recenti": "Oldest",
    "Nome A-Z": "Name A–Z",
    "Carica prossimi follow-up": "Load upcoming follow-ups",
    "Esporta CSV": "Export CSV",
    "Backup completo JSON": "Full JSON backup",
    "Scarica modello CSV": "Download CSV template",
    "Elimina tutti i test tecnici": "Delete all technical tests",
    "Svuota archivio": "Clear archive",
    "Importa Lead da Excel / CSV": "Import Leads from Excel / CSV",
    "Verifica file": "Validate file",
    "Importa record validi": "Import valid records",
    "Nessun file verificato.": "No file validated.",
    "Ripristina backup JSON": "Restore JSON backup",
    "Verifica backup": "Validate backup",
    "Unisci backup": "Merge backup",
    "Il backup verrà unito ai record attuali senza sovrascriverli.": "The backup will be merged with current records without overwriting them.",
    "Il punteggio indica pertinenza documentata, non probabilità di acquisto o adesione.": "The score indicates documented relevance, not the likelihood of purchase or joining.",
    "I record TEST TECNICO sono esclusi dai conteggi. Puoi rimuoverli senza toccare i Lead reali.": "TECHNICAL TEST records are excluded from totals. You can remove them without affecting real Leads.",
    "Dashboard operativa": "Operations dashboard",
    "Dashboard Lead": "Lead dashboard",
    "Lead totali": "Total Leads",
    "Record in archivio": "Records in archive",
    "Identità confermate": "Confirmed identities",
    "Dati identificativi confermati": "Confirmed identity details",
    "Punteggio da 80 a 100": "Score from 80 to 100",
    "Stato operativo": "Operational status",
    "Distribuzione per categoria": "Distribution by category",
    "Distribuzione per stato": "Distribution by status",
    "Fasce di pertinenza": "Relevance bands",
    "Fonti più utilizzate": "Most-used sources",
    "Attività recente": "Recent activity",
    "Apri archivio Lead": "Open Lead archive",
    "Analizza un nuovo Lead": "Analyze a new Lead",
    "Non ci sono ancora Lead archiviati. Inserisci il primo nominativo dall'area": "There are no archived Leads yet. Add the first person from the",
    "La data si riferisce all'inserimento del record nel browser, non alla data in cui la fonte è stata pubblicata.": "The date refers to when the record was added in this browser, not when the source was published.",
    "A: 80–100 · B: 65–79 · C: 50–64 · Sotto soglia: meno di 50.": "A: 80–100 · B: 65–79 · C: 50–64 · Below threshold: under 50.",
    "Modulo di analisi e prequalificazione": "Analysis and prequalification module",
    "Analisi e prequalificazione Lead": "Lead analysis and prequalification",
    "Valuta una persona sulla base di evidenze pubbliche verificabili. Il punteggio si aggiorna mentre compili la scheda.": "Assess a person using verifiable public evidence. The score updates as you complete the form.",
    "Modalità test tecnico": "Technical test mode",
    "Attiva test tecnico": "Enable technical test",
    "Il record sarà contrassegnato TEST, senza URL o verifica reale, e non sarà un Lead operativo.": "The record will be marked TEST, without a real URL or verification, and will not be an operational Lead.",
    "Identificazione e fonte": "Identity and source",
    "Controlli di ammissibilità": "Eligibility checks",
    "È una persona fisica identificabile": "This is an identifiable individual",
    "La fonte è pubblica e verificabile": "The source is public and verifiable",
    "L'evidenza riguarda direttamente questa persona": "The evidence directly concerns this person",
    "Esiste una ragione concreta di pertinenza": "There is a concrete reason for relevance",
    "Non sto usando dati sensibili o inferenze sanitarie": "I am not using sensitive data or health-related inferences",
    "Non sto registrando un'azienda come Lead": "I am not registering a company as a Lead",
    "Completa i controlli per valutare l'ammissibilità.": "Complete the checks to assess eligibility.",
    "Punteggio di pertinenza": "Relevance score",
    "Assegna punti soltanto quando puoi motivarli con elementi osservabili. Non è una previsione di acquisto o adesione.": "Assign points only when you can justify them with observable evidence. This is not a prediction of purchase or joining.",
    "Quanto il profilo corrisponde al segmento scelto.": "How closely the profile matches the selected segment.",
    "Attività recente e documentata nella fonte.": "Recent activity documented in the source.",
    "Profilo pubblico con contenuti professionali pertinenti.": "Public profile with relevant professional content.",
    "Dichiarazioni o richieste pubbliche esplicite; zero se assenti.": "Explicit public statements or requests; zero if absent.",
    "Esiste un motivo professionale, rispettoso e non invasivo per avviare un dialogo.": "There is a professional, respectful and non-intrusive reason to start a conversation.",
    "Punteggio totale": "Total score",
    "Sotto soglia": "Below threshold",
    "Motivazione automatica": "Automatic rationale",
    "Inserisci i punteggi per generare una sintesi.": "Enter the scores to generate a summary.",
    "Ricerca assistita · modulo 2": "Assisted search · module 2",
    "Ricerca Lead": "Lead search",
    "Apri motore multi-ricerca NEXTWAY": "Open NEXTWAY multi-search engine",
    "Genera ricerche mirate e consulta fonti pubbliche. I nominativi entrano nell'archivio solo dopo verifica umana.": "Generate targeted searches and consult public sources. People are added to the archive only after human verification.",
    "Come funziona:": "How it works:",
    "Imposta la ricerca": "Set up the search",
    "Segmento": "Segment",
    "Clienti finali · interesse espresso": "End customers · expressed interest",
    "Potenziali Partner": "Potential Partners",
    "Networker già attivi · altre aziende": "Active networkers · other companies",
    "Ex-networker / esperienza precedente": "Former networkers / previous experience",
    "Modalità": "Method",
    "Interesse espresso pubblicamente": "Publicly expressed interest",
    "Affinità professionale / pubblica": "Professional / public affinity",
    "Area geografica": "Geographic area",
    "Fonte da esplorare": "Source to explore",
    "Motori di ricerca · web": "Search engines · web",
    "Parole chiave aggiuntive": "Additional keywords",
    "Motore": "Search engine",
    "Genera ricerca": "Generate search",
    "Copia query": "Copy query",
    "Query pronta": "Ready-to-use query",
    "Seleziona i criteri e premi “Genera ricerca”.": "Select the criteria and click “Generate search”.",
    "Apri risultati": "Open results",
    "Suggerimento: prova più query e controlla sempre la pagina originale, la data e l'identità della persona.": "Tip: try multiple queries and always check the original page, date and person's identity.",
    "Acquisisci un risultato verificato": "Capture a verified result",
    "Nome della persona *": "Person's name *",
    "Segnale pubblico rilevato": "Observed public signal",
    "Seleziona il segnale": "Select a signal",
    "Regole di qualificazione": "Qualification rules",
    "Solo persone fisiche, mai aziende o organizzazioni come Lead.": "Only individuals, never companies or organizations, can be Leads.",
    "Un professionista può essere qualificato anche se lavora per uno studio o un'azienda.": "A professional may qualify even if they work for a practice or a company.",
    "Networker attivi di altre aziende vanno classificati separatamente.": "Active networkers from other companies must be classified separately.",
    "Non dedurre condizioni di salute, bisogni sanitari o altri dati sensibili.": "Do not infer health conditions, health needs or other sensitive data.",
    "Non considerare un semplice risultato di ricerca come Lead verificato.": "Do not treat a search result alone as a verified Lead.",
    "Conserva URL, evidenza pubblica e data della verifica.": "Keep the URL, public evidence and verification date.",
    "Vai all'archivio Lead": "Go to Lead archive",
    "Motore di ricerca · generatore multi-query": "Search engine · multi-query generator",
    "Ricerca mirata dei profili": "Targeted profile search",
    "Stato del modulo:": "Module status:",
    "Caricamento configurazione aziendale…": "Loading company configuration…",
    "Configura la ricerca": "Configure search",
    "Profilo da individuare": "Profile to find",
    "Professionisti salute e benessere": "Health and wellness professionals",
    "Networker del settore wellness (tutti i livelli)": "Wellness networkers (all levels)",
    "Imprenditori e titolari di attività": "Entrepreneurs and business owners",
    "Persone interessate a un lavoro extra part-time": "People interested in part-time additional work",
    "Persone interessate a un’attività imprenditoriale": "People interested in starting a business",
    "Potenziali clienti interessati al benessere": "Potential customers interested in wellness",
    "Archivio centrale · workspace": "Central archive · workspace",
    "Caricamento workspace autorizzati…": "Loading authorized workspaces…",
    "Fonte": "Source",
    "Tutto il web": "Entire web",
    "Motore di ricerca": "Search engine",
    "Lingua dei risultati": "Results language",
    "Italiano": "Italian",
    "Inglese": "English",
    "Italiano + inglese": "Italian + English",
    "Seleziona la query per la ricerca singola": "Select the query for a single search",
    "Genera prima le query": "Generate queries first",
    "Genera 5 ricerche": "Generate 5 searches",
    "Esegui 1 ricerca · fino a 10 risultati": "Run 1 search · up to 10 results",
    "Esegui tutte le 5 ricerche · fino a 50 risultati": "Run all 5 searches · up to 50 results",
    "Copia tutte le query": "Copy all queries",
    "Esporta query CSV": "Export queries CSV",
    "Per eseguire le ricerche devi aver effettuato l’accesso a NEXTWAY nell’archivio Lead.": "To run searches, you must be signed in to NEXTWAY in the Lead archive.",
    "Ricerche generate": "Generated searches",
    "Imposta i criteri e genera la batteria di ricerca.": "Set the criteria and generate the search batch.",
    "Test tecnico acquisizione locale": "Local capture technical test",
    "Esegui test locale": "Run local test",
    "Rimuovi record di test": "Remove test records",
    "Verifica accesso in corso…": "Checking access…",
    "Risultati trovati": "Results found",
    "La lista giornaliera sarà compilata dopo l'esecuzione della ricerca.": "The daily list will be populated after the search is run.",
    "Storico ricerche su questo browser": "Search history on this browser",
    "Esporta lista giornaliera CSV": "Export daily list CSV",
    "Metodo di lavoro consigliato": "Recommended workflow",
    "Apri una ricerca alla volta e seleziona solo risultati con un segnale professionale chiaro.": "Open one search at a time and select only results with a clear professional signal.",
    "Apri la fonte originale: snippet e titoli dei motori di ricerca non bastano.": "Open the original source: search snippets and titles are not sufficient.",
    "Registra nome, ruolo, azienda/brand dichiarato, URL, data ed evidenza pubblica.": "Record the name, role, declared company/brand, URL, date and public evidence.",
    "Non dedurre che una persona cerchi una nuova opportunità solo perché lavora nel network marketing.": "Do not assume someone is seeking a new opportunity simply because they work in network marketing.",
    "Evita duplicati e interrompi la raccolta quando non emerge una pertinenza documentabile.": "Avoid duplicates and stop collecting when no documentable relevance is found.",
    "Collegamenti:": "Links:",
    "Ricerca assistita": "Assisted search",
    "Imposta una nuova password per il tuo account NEXTWAY. La password non viene salvata in questa pagina.": "Set a new password for your NEXTWAY account. Your password is not stored on this page.",
    "Verifica del collegamento di recupero in corso…": "Verifying recovery link…",
    "Nuova password": "New password",
    "Conferma nuova password": "Confirm new password",
    "Salva nuova password": "Save new password",
    "Torna all'accesso NEXTWAY": "Back to NEXTWAY sign-in",
    "Se il collegamento è scaduto, torna alla pagina di accesso e richiedi un nuovo recupero password.": "If the link has expired, return to the sign-in page and request a new password recovery.",
    "Preflight operativo · sola lettura": "Operational preflight · read-only",
    "Seleziona un workspace e aggiorna i relativi dati per eseguire il preflight.": "Select a workspace and refresh its data to run the preflight.",
    "Workspace": "Workspace",
    "Prepara bozza Zinzino Italia": "Prepare Zinzino Italy draft",
    "Carica e valida i dati iniziali; la creazione richiede un successivo invio esplicito.": "Load and validate the initial data; creation requires a separate explicit submission.",
    "Nome workspace *": "Workspace name *",
    "Chiave univoca *": "Unique key *",
    "Partner / organizzazione": "Partner / organization",
    "Sito ufficiale": "Official website",
    "Settore": "Industry",
    "Paese mercato": "Market country",
    "Lingua": "Language",
    "Descrizione generale dell’azienda": "General company description",
    "Profilo commerciale iniziale (facoltativo)": "Initial commercial profile (optional)",
    "Prodotti e servizi": "Products and services",
    "Pubblici e clienti ideali": "Target audiences and ideal customers",
    "Parole chiave per la ricerca": "Search keywords",
    "Posizionamento e proposta di valore approvati": "Approved positioning and value proposition",
    "Crea workspace in bozza": "Create workspace draft",
    "Workspace registrati": "Registered workspaces",
    "Aggiorna elenco": "Refresh list",
    "Nessun elenco caricato.": "No list loaded.",
    "Configurazione commerciale del workspace": "Workspace commercial configuration",
    "Carica configurazione Zinzino": "Load Zinzino configuration",
    "Seleziona un workspace.": "Select a workspace.",
    "Configurazione commerciale JSON": "Commercial configuration JSON",
    "Salva configurazione nel workspace": "Save configuration to workspace",
    "Nessuna modifica salvata.": "No changes saved.",
    "Membri e ruoli": "Members and roles",
    "Workspace selezionato": "Selected workspace",
    "Carica prima i workspace": "Load workspaces first",
    "Profilo già registrato": "Existing registered profile",
    "Carica i profili": "Load profiles",
    "Cerca profilo": "Search profile",
    "Ruolo": "Role",
    "Owner": "Owner",
    "Admin workspace": "Workspace admin",
    "Manager": "Manager",
    "Member": "Member",
    "Viewer": "Viewer",
    "Stato": "Status",
    "Invited (nessuna email inviata)": "Invited (no email sent)",
    "Active": "Active",
    "Suspended": "Suspended",
    "Salva membership": "Save membership",
    "Aggiorna profili": "Refresh profiles",
    "Seleziona un workspace per consultare le membership.": "Select a workspace to view memberships.",
    "Knowledge Base": "Knowledge Base",
    "Importa pacchetto Zinzino (8 documenti)": "Import Zinzino package (8 documents)",
    "Importazione multipla dei riferimenti Markdown; tutti i nuovi documenti resteranno pending.": "Bulk import of Markdown references; all new documents will remain pending.",
    "Modulo / area documentale": "Module / document area",
    "Titolo documento": "Document title",
    "Tipo fonte": "Source type",
    "Documento ufficiale": "Official document",
    "Pubblicazione scientifica": "Scientific publication",
    "Materiale formativo": "Training material",
    "Versione": "Version",
    "Valido dal": "Valid from",
    "Valido fino al": "Valid until",
    "File PDF / DOCX / TXT": "PDF / DOCX / TXT file",
    "Carica e indicizza": "Upload and index",
    "Documenti del workspace": "Workspace documents",
    "Aggiorna documenti": "Refresh documents",
    "Seleziona un workspace per consultare i documenti.": "Select a workspace to view documents.",
    "Verifica ricerca Knowledge Base": "Knowledge Base search test",
    "Lingua ricerca": "Search language",
    "Query": "Query",
    "Cerca nel workspace": "Search workspace",
    "La ricerca restituisce soltanto contenuti approvati e validi del workspace selezionato.": "Search returns only approved and valid content from the selected workspace.",
    "Istruzioni AI e criteri di qualificazione": "AI instructions and qualification criteria",
    "Istruzioni dell'assistente": "Assistant instructions",
    "Aggiorna istruzioni e criteri": "Refresh instructions and criteria",
    "Chiave istruzione *": "Instruction key *",
    "Scopo dell'istruzione *": "Instruction purpose *",
    "Testo completo dell'istruzione *": "Full instruction text *",
    "Salva istruzione come bozza": "Save instruction as draft",
    "Seleziona un workspace per consultare le istruzioni.": "Select a workspace to view instructions.",
    "Criteri di qualificazione dei contatti": "Contact qualification criteria",
    "Chiave criteri *": "Criteria key *",
    "Nome criteri *": "Criteria name *",
    "Descrizione": "Description",
    "Configurazione JSON": "JSON configuration",
    "Salva criteri come bozza": "Save criteria as draft",
    "Seleziona un workspace per consultare i criteri.": "Select a workspace to view criteria."
  };

  const reverse = Object.fromEntries(Object.entries(translations).map(([it, en]) => [en, it]));
  let currentLanguage = "it";
  let observer = null;

  function translateValue(value, language) {
    const source = String(value ?? "");
    const trimmed = source.trim();
    if (!trimmed) return source;
    const translated = language === "en" ? translations[trimmed] : reverse[trimmed];
    if (!translated) return source;
    const start = source.indexOf(trimmed);
    return source.slice(0, start) + translated + source.slice(start + trimmed.length);
  }

  function translateNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,textarea,input,code,pre,[contenteditable='true']")) return;
    node.nodeValue = translateValue(node.nodeValue, currentLanguage);
  }

  function translateElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.matches("input,textarea,script,style,code,pre,[contenteditable='true']")) return;
    const attrs = ["placeholder", "title", "aria-label"];
    attrs.forEach((name) => {
      if (element.hasAttribute(name)) {
        element.setAttribute(name, translateValue(element.getAttribute(name), currentLanguage));
      }
    });
    if (element.tagName === "TITLE") {
      element.textContent = translateValue(element.textContent, currentLanguage);
    }
    element.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) translateNode(child);
      else if (child.nodeType === Node.ELEMENT_NODE) translateElement(child);
    });
  }

  function applyLanguage(language) {
    currentLanguage = language === "en" ? "en" : "it";
    document.documentElement.lang = currentLanguage;
    document.title = translateValue(document.title, currentLanguage);
    translateElement(document.body);
    const toggle = document.getElementById("nextway-language-toggle");
    if (toggle) {
      toggle.textContent = currentLanguage === "en" ? "IT" : "EN";
      toggle.setAttribute("aria-label", currentLanguage === "en" ? "Switch to Italian" : "Switch to English");
      toggle.title = currentLanguage === "en" ? "Switch to Italian" : "Switch to English";
    }
    try { localStorage.setItem("nextway-language", currentLanguage); } catch (_) {}
  }

  function install() {
    if (!document.body) return;
    const header = document.querySelector("body > header, header");
    const toggle = document.createElement("button");
    toggle.id = "nextway-language-toggle";
    toggle.type = "button";
    toggle.textContent = "EN";
    toggle.setAttribute("aria-label", "Switch to English");
    toggle.title = "Switch to English";
    toggle.style.cssText = "position:fixed;top:12px;right:14px;z-index:99999;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#14213d;padding:7px 11px;font:600 13px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.16)";
    toggle.addEventListener("click", () => applyLanguage(currentLanguage === "it" ? "en" : "it"));
    (header || document.body).appendChild(toggle);

    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") translateNode(mutation.target);
        mutation.addedNodes?.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    let saved = "it";
    try { saved = localStorage.getItem("nextway-language") || "it"; } catch (_) {}
    applyLanguage(saved);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  window.NEXTWAY_I18N = {
    setLanguage: applyLanguage,
    getLanguage: () => currentLanguage,
    translate: (value) => translateValue(value, currentLanguage)
  };
})();