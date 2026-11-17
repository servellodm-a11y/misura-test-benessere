# Base commerciale strutturata Zinzino Italia

File dati: `commercial-base.v1.json`

## Scopo

Questo file converte le fonti ufficiali già censite in record leggibili da un futuro motore commerciale NEXTWAY. È separato dalla configurazione di ricerca prospect: non contiene query di ricerca, dati personali o istruzioni di reclutamento.

## Separazione dei percorsi

- `customer`: Shop, Premier Kit, abbonamenti, Credits, ZinoCash e Zinzino4Free.
- `partner`: iscrizione, Partner Kit e piano compensi.
- `source_register`: provenienza, mercato, pubblico, data di osservazione e necessità di aggiornamento.
- `condition_engine`: precedenza delle fonti, campi minimi e regole per gestire conflitti o dati mancanti.

## Regole di lettura dei dati

1. Ogni offerta ha un identificativo stabile, un pubblico e un URL fonte.
2. I valori monetari sono in EUR. Gli importi osservati il 17 novembre 2026 sono snapshot, non listini garantiti.
3. `initial_amount_eur` è l'importo iniziale mostrato nella scheda; `recurring_amount_eur` è il valore dell'abbonamento indicato come mensile. `delivery_every_months` descrive la frequenza di consegna e non modifica la periodicità di addebito.
4. `credits_initial` e `credits_recurring_per_month` sono campi distinti: non sommarli né interpretarli come denaro.
5. Un valore `null` significa che non è stato verificato; non va sostituito con una stima o copiato da un prodotto simile.
6. Le condizioni di cancellazione e durata minima sono specifiche della singola offerta. Non propagare la regola dei 30 giorni ai prodotti per cui la scheda non la conferma.
7. L'etichetta “Full Refund Possible” non costituisce una promessa di rimborso: il regolamento applicabile non è ancora acquisito.
8. Il piano compensi è strutturato in `commercial-base.v1.json` sulla base del master EU 2025 (versione 12/02/2025), la cui applicabilità in Italia fino a novembre 2026 è stata confermata dall'utente. La guida italiana è una sintesi originale, non una traduzione ufficiale integrale. I calcoli restano disabilitati: T-Balance, regole di campagna e casi numerici indipendenti non sono ancora sufficientemente documentati o verificati.

## Stati di validità

- `official_catalog_live`: catalogo ufficiale corrente; riaprire la scheda prima di un preventivo.
- `official_snapshot_refresh_before_quote`: dati estratti da una scheda ufficiale in una data specifica; aggiornare prima di quotare.
- `partial_snapshot_refresh_before_quote`: solo alcuni termini sono stati verificati.
- `pdf_rule_needs_current_page_checkout_revalidation`: regola riportata in un PDF ufficiale storico; confrontare con pagina e checkout correnti.
- `public_page_summary_verified_detailed_terms_pending`: sintesi pubblica riscontrata; acquisire il regolamento completo prima di gestire eccezioni.
- `official_italian_pdf_linked_but_full_document_not_acquired`: fonte ufficiale identificata, documento integrale non ancora acquisito.

## Come NEXTWAY deve usarla

- Prima di rispondere, determinare se la richiesta riguarda un Cliente o un Partner.
- Consultare esclusivamente il ramo corrispondente; non applicare ZinoCash ai compensi Partner o il piano compensi agli acquisti Cliente.
- Per un preventivo, aggiornare prezzo, disponibilità, spedizione e condizioni dalla scheda/checkout ufficiale.
- Per un abbonamento, leggere la singola offerta e riportare importo, frequenza di addebito, frequenza di consegna, durata minima e cancellazione solo se verificati.
- Per una simulazione economica Partner, bloccare il calcolo se il piano compensi ufficiale vigente non è disponibile e validato.
- Mostrare sempre la fonte e la data di verifica; in caso di conflitto o campo mancante, dichiarare il limite e chiedere controllo umano.
- Non generare promesse di reddito, claim medici, rimborsi garantiti o condizioni non documentate.

## Limite di integrazione

La base è stata strutturata nel repository, ma non è ancora caricata nel workspace Zinzino su Supabase e non è ancora letta dal runtime commerciale. Il workspace non è stato creato. Questo passaggio non esegue deploy, attivazioni o test con utenti reali.
