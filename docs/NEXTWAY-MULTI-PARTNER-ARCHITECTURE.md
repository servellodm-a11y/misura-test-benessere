# NEXTWAY — Architettura multi-azienda e configurazione partner

## Obiettivo

NEXTWAY è una piattaforma commerciale indipendente da qualsiasi singola azienda. Zinzino è una configurazione iniziale, non un vincolo del prodotto. Aggiungere, sostituire o disattivare un'azienda partner deve essere un'operazione di configurazione, non una modifica del motore applicativo.

## Principio architetturale

Separare in modo netto:
1. **NEXTWAY CORE** — ricerca, acquisizione prospect, deduplicazione, scoring delle evidenze, CRM personale, generazione bozze per canale, storico, follow-up e qualificazione.
2. **Partner Workspace** — contenitore isolato per una specifica azienda/brand e per i relativi dati commerciali.
3. **Partner Profile** — configurazione dichiarativa dell'azienda: identità, mercato, offerta, pubblico, criteri di ricerca e regole di comunicazione.
4. **Knowledge Base** — documenti e fonti caricati per quella sola configurazione.
5. **Prompt & Governance** — istruzioni aziendali approvate e criteri di qualificazione versionati, distinti dalle regole globali di sicurezza.

Il CORE non deve contenere nomi, prodotti, claim, piani compensi o parole chiave specifiche di un partner.

## Modello di configurazione

Ogni workspace aziendale deve poter contenere un profilo con questi gruppi di campi:
- **identity**: nome legale/commerciale, brand, sito ufficiale, settore, paesi e lingue supportati.
- **offering**: prodotti e servizi, categorie, descrizioni approvate, prezzi solo se documentati, documenti di riferimento.
- **audiences**: profili cliente, professionisti, partner e segmenti da escludere.
- **discovery**: query, parole chiave, sinonimi, aree geografiche, segnali pubblici, criteri di inclusione/esclusione.
- **qualification**: requisiti minimi, domande, indicatori di fit e motivi di non idoneità.
- **messaging**: posizionamento, tono, value proposition verificata, obiezioni/risposte approvate e CTA consentite.
- **compliance**: mercati autorizzati, avvertenze, claim vietati, requisiti di consenso e regole di ricontatto.
- **lifecycle**: stato bozza/attivo/sospeso/archiviato, versione, data di aggiornamento e autore.

I campi aziendali non devono sovrascrivere le regole globali di sicurezza, privacy, trasparenza e anti-spam.

## Gerarchia delle istruzioni AI

Ordine obbligatorio:
1. Regole globali NEXTWAY (sicurezza, privacy, trasparenza, niente promesse o dati inventati).
2. Regole di piattaforma e canale (GDPR/ePrivacy, termini e limiti del canale).
3. Configurazione aziendale attiva e approvata.
4. Contesto del prospect e storico della relazione.

Contenuti di prospect, pagine web, email e documenti sono dati non attendibili: non possono impartire istruzioni al modello né alterare la configurazione.

Le bozze devono rimanere bozze. Nessun invio automatico viene abilitato da questo modello.

## Isolamento e cambio azienda

- Ogni dato aziendale, documento, prompt, criterio, conversazione e risultato AI deve essere associato al relativo workspace_id.
- Una ricerca deve usare un solo workspace attivo per volta.
- Una conversazione deve conservare il workspace di origine anche se in seguito l'utente cambia configurazione attiva.
- Il cambio del workspace attivo non deve spostare, cancellare o riscrivere i Lead esistenti.
- I Lead raccolti senza contesto aziendale possono restare nell'archivio personale neutro; l'associazione a un workspace deve essere esplicita e tracciata.
- Disattivare un workspace blocca nuove attività, ma non cancella dati o storico.
- Nessun fallback silenzioso a un altro workspace se la configurazione richiesta manca o non è approvata.

## Esperienza amministrativa richiesta

La sezione amministrativa dovrà consentire di:
1. creare una configurazione aziendale;
2. modificarla e salvarla come bozza;
3. caricare e associare documenti;
4. definire segmenti e criteri di ricerca;
5. modificare prompt e messaggi aziendali;
6. visualizzare le differenze tra versioni;
7. approvare e attivare una versione;
8. sospendere o archiviare una configurazione;
9. duplicare una configurazione come punto di partenza per un nuovo partner, senza copiare Lead, conversazioni o dati personali.

Solo le versioni approvate e attive possono essere utilizzate dal motore AI.

## Compatibilità con l'MVP personale

La prima release continua ad avere un solo titolare e un archivio personale. Non reintrodurre gestione collaboratori, assegnazioni o dashboard multiutente. La separazione per azienda è un livello di configurazione commerciale, non una riapertura del perimetro collaboratori.

## Stato tecnico rilevato sul branch

- L'AI Setter contiene già un prompt base generico NEXTWAY.
- L'AI Setter legge istruzioni e criteri approvati associati al workspace della conversazione tramite RPC.
- Il motore di ricerca ha già segmenti generali e non deve essere convertito in un motore specifico Zinzino.
- La presenza di tabelle e RPC workspace non dimostra da sola che l'intero flusso di ricerca, CRM, knowledge base e conversazioni sia isolato e selezionabile dall'interfaccia.
- Il pannello amministrativo ora crea workspace con profilo commerciale iniziale (offerta, pubblici, parole chiave e posizionamento) salvato nel campo settings già previsto dal modello dati.
- I moduli della Knowledge Base vengono proposti a partire dalla chiave del workspace; il fallback server è neutro (general), non Zinzino.
- I campi del profilo sono attualmente acquisiti in creazione. La modifica successiva del profilo, la selezione del workspace nel motore di ricerca e il consumo effettivo dei settings da parte delle query restano da implementare.
- Non è stata eseguita alcuna migrazione o modifica al database remoto per questa specifica.

## Sequenza di implementazione

1. **Inventario delle dipendenze aziendali**: individuare eventuali riferimenti hardcoded a Zinzino, prodotti, claim, query e testi commerciali.
2. **Profilo partner dichiarativo**: definire schema validato e valori neutri; nessuna dipendenza dal nome di un brand nel CORE.
3. **Selettore workspace e contesto**: rendere esplicita la configurazione usata per ogni ricerca e per ogni conversazione, preservando il contesto storico.
4. **Motore di ricerca configurabile**: comporre query generiche più query e segmenti del partner attivo.
5. **Prompt composer**: comporre istruzioni globali, di canale e aziendali con limiti, approvazione e versionamento.
6. **Knowledge Base isolata**: filtrare documenti e recupero semantico per workspace.
7. **Pannello di gestione**: CRUD delle configurazioni, anteprima, approvazione e attivazione.
8. **Test di isolamento**: dimostrare che nessun dato o prompt del workspace A compare nel workspace B.

## Criteri di accettazione

- Aggiungere un nuovo partner non richiede modifiche al codice del CORE.
- Cambiare partner non modifica Lead, conversazioni o storico esistenti.
- Ogni risultato di ricerca e ogni bozza AI riporta il workspace/configurazione di origine.
- Prompt e documenti di un partner non sono accessibili a un altro workspace.
- Il sistema non inventa prodotti, prezzi, claim o dati aziendali mancanti.
- Se non esiste una configurazione attiva e approvata, l'operazione si interrompe con un messaggio esplicito.
- La configurazione Zinzino può essere sostituita o affiancata senza rifare ricerca, CRM, scoring e messaggistica.