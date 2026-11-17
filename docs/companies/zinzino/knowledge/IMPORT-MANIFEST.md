# NEXTWAY — Manifesto importazione Knowledge Base Zinzino Italia

**Workspace target:** zinzino-italia  
**Stato:** contenuti preparati nel repository; non importati perché il workspace non è ancora stato creato/attivato.  
**Importazione:** richiede Admin UI autenticata platform_admin. L'ingestione crea documenti in stato pending e richiede successiva approvazione.

| File | module_key | source_type | Titolo | Validità |
|---|---|---|---|---|
| customer-rewards-program.md | customer_rewards | official_document | Programma a premi Cliente | Da verificare a ogni refresh |
| partner-kits-and-compensation-boundaries.md | partner_program | official_document | Kit Partner e limiti del Piano Compensi | Da verificare a ogni refresh |
| premier-kit-catalog-validation.md | customer_catalog | official_document | Catalogo Premier Kit e stato validazione | Snapshot 17/11/2026 |
| compensation-plan-eu-2025-italian-reference.md | partner_compensation_reference | official_document | Piano Compensi EU 2025 — scheda italiana non ufficiale | Riferimento storico; non abilitare calcoli |

**Controlli prima dell'importazione:**
1. Verificare che il workspace sia draft e appartenga al brand Zinzino Italia.
2. Importare solo contenuti in italiano e con URL fonte ufficiale.
3. Conservare data di osservazione e stato di verifica.
4. Non importare come regola attuale dati storici non riconfermati.
5. Dopo l'importazione, mantenere approval_status=pending fino a revisione amministrativa.
6. Il riferimento EU inglese 2025 è solo una scheda orientativa italiana, non la traduzione ufficiale né il piano italiano corrente.
7. Non abilitare calcoli compensi finché il PDF italiano corrente non è acquisito e riconciliato.
