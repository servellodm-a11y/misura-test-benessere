# NEXTWAY — Manifesto importazione Knowledge Base Zinzino Italia

**Workspace target:** zinzino-italia  
**Stato:** contenuti preparati nel repository; non importati perché il workspace non è ancora stato creato/attivato.  
**Importazione:** richiede Admin UI autenticata platform_admin. L'ingestione crea documenti in stato pending e richiede successiva approvazione.

| File | module_key | source_type | Titolo | Validità |
|---|---|---|---|---|
| customer-rewards-program.md | customer_rewards | training_material | Programma a premi Cliente | Da verificare a ogni refresh |
| partner-kits-and-compensation-boundaries.md | partner_program | training_material | Kit Partner e limiti del Piano Compensi | Da verificare a ogni refresh |
| premier-kit-catalog-validation.md | customer_catalog | training_material | Catalogo Premier Kit e stato validazione | Snapshot 17/11/2026 |
| compensation-plan-eu-2025-italian-reference.md | partner_compensation_reference | training_material | Piano Compensi Zinzino — guida italiana al master europeo vigente | Corrispondenza IT/EN confermata dall'utente il 18/11/2026; vigente in Italia a novembre 2026 secondo conferma utente; 20 regole strutturate, calcoli disabilitati |
| compensation-plan-eu-2025-structured-rules.md | partner_compensation_rules | training_material | Regole Piano Compensi EU 2025 — estrazione strutturata fase 2 | 20 regole; test di coerenza tabellare; calcoli disabilitati | 
| balancetest-product-and-use-reference.md | customer_product_education | training_material | BalanceTest — scheda prodotto e istruzioni ufficiali | Product Sheet italiano 06/10/2026; aggiornare prima di ogni uso commerciale |
| shop-catalog-index.md | customer_catalog | training_material | Shop Zinzino Italia — indice categorie e prodotti | Indice consultato 17/11/2026; schede e checkout da aggiornare prima dell'uso |

**Controlli prima dell'importazione:**
1. Verificare che il workspace sia draft e appartenga al brand Zinzino Italia.
2. Importare solo contenuti in italiano e con URL fonte ufficiale.
3. Conservare data di osservazione e stato di verifica.
4. Non importare come regola attuale dati storici non riconfermati.
5. Dopo l'importazione, mantenere approval_status=pending fino a revisione amministrativa.
6. Il PDF italiano localizzato (14/11/2024) e il master EU inglese (12/02/2025) sono considerati corrispondenti sulla base della verifica già completata e confermata dall'utente il 18/11/2026. La versione EU 2025 è dichiarata dall'utente vigente in Italia a novembre 2026. La guida italiana è una sintesi originale, non una traduzione ufficiale integrale. Il report di confronto resta documentazione interna e non viene importato come contenuto destinato al Partner.
7. Non abilitare calcoli compensi finché tutte le regole, formule, soglie, eccezioni e periodicità non sono state strutturate e validate con test.

**Classificazione Knowledge:** i file elencati sono sintesi e riferimenti operativi NEXTWAY derivati da fonti ufficiali indicate nei singoli documenti; non sono originali policy Zinzino. Per l'importazione usare `import-manifest.v1.json` (source_type `training_material`).
