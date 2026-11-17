# NEXTWAY — Manifesto importazione Knowledge Base Zinzino Italia

**Workspace target:** zinzino-italia  
**Stato:** contenuti preparati nel repository; non importati perché il workspace non è ancora stato creato/attivato.  
**Importazione:** richiede Admin UI autenticata platform_admin. L'ingestione crea documenti in stato pending e richiede successiva approvazione.

| File | module_key | source_type | Titolo | Validità |
|---|---|---|---|---|
| customer-rewards-program.md | customer_rewards | official_document | Programma a premi Cliente | Da verificare a ogni refresh |
| partner-kits-and-compensation-boundaries.md | partner_program | official_document | Kit Partner e limiti del Piano Compensi | Da verificare a ogni refresh |
| premier-kit-catalog-validation.md | customer_catalog | official_document | Catalogo Premier Kit e stato validazione | Snapshot 17/11/2026 |
| compensation-plan-eu-2025-italian-reference.md | partner_compensation_reference | official_document | Piano Compensi Zinzino — guida italiana al master europeo vigente | Vigente a novembre 2026 secondo conferma utente; 20 regole strutturate, test tabellari, calcoli disabilitati |
| compensation-plan-italian-2024-comparison.md | partner_compensation_reference | official_document | Confronto PDF italiano 2024 e master EU 2025 | Riferimento localizzato 14/11/2024; differenze/ambiguità note; non usare da solo per calcoli |
| compensation-plan-eu-2025-structured-rules.md | partner_compensation_rules | official_document | Regole Piano Compensi EU 2025 — estrazione strutturata fase 2 | 20 regole; test di coerenza tabellare; calcoli disabilitati | 
| balancetest-product-and-use-reference.md | customer_product_education | official_document | BalanceTest — scheda prodotto e istruzioni ufficiali | Product Sheet italiano 06/10/2026; aggiornare prima di ogni uso commerciale |
| shop-catalog-index.md | customer_catalog | official_document | Shop Zinzino Italia — indice categorie e prodotti | Indice consultato 17/11/2026; schede e checkout da aggiornare prima dell'uso |

**Controlli prima dell'importazione:**
1. Verificare che il workspace sia draft e appartenga al brand Zinzino Italia.
2. Importare solo contenuti in italiano e con URL fonte ufficiale.
3. Conservare data di osservazione e stato di verifica.
4. Non importare come regola attuale dati storici non riconfermati.
5. Dopo l'importazione, mantenere approval_status=pending fino a revisione amministrativa.
6. Il master ufficiale EU inglese del 12/02/2025 è considerato vigente in Italia a novembre 2026 sulla base della conferma esplicita dell'utente del 17/11/2026. La guida italiana è una sintesi originale, non una traduzione ufficiale integrale.
7. Non abilitare calcoli compensi finché tutte le regole, formule, soglie, eccezioni e periodicità non sono state strutturate e validate con test.
