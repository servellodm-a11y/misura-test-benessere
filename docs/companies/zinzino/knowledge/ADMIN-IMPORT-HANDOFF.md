# NEXTWAY — Passaggio amministrativo import Knowledge Zinzino

**Stato:** PREPARATO — NON ESEGUITO  
**Workspace key:** `zinzino-italia`  
**Manifest:** `docs/companies/zinzino/knowledge/import-manifest.v1.json`  
**Lingua del lotto:** `it`  
**Documenti previsti:** 7  
**Approvazione iniziale:** `pending`

## Scopo e limiti

Questa scheda prepara l'operatore amministrativo all'importazione controllata della Knowledge Base Zinzino. Non autorizza né esegue la creazione/attivazione del workspace, l'upload, l'ingestione o l'approvazione dei documenti.

## Lotto autorizzabile dopo il via libera amministrativo

Il manifest è la fonte unica dell'elenco: non aggiungere file manualmente e non importare l'intera cartella.

- `customer-rewards-program.md`
- `partner-kits-and-compensation-boundaries.md`
- `premier-kit-catalog-validation.md`
- `compensation-plan-eu-2025-italian-reference.md`
- `compensation-plan-eu-2025-structured-rules.md`
- `balancetest-product-and-use-reference.md`
- `shop-catalog-index.md`

I documenti inglesi `*.draft.md`, `*.review-required.md` e il report interno di confronto IT/EN non fanno parte del lotto. Il materiale Customer Rewards in inglese con mercato UK non deve essere importato per l'Italia.

## Prerequisiti bloccanti

1. L'operatore deve accedere con un account autenticato autorizzato come `platform_admin`.
2. Il workspace `zinzino-italia` deve essere stato creato e predisposto tramite il flusso amministrativo previsto. Non crearne uno con SQL manuale o privilegi di servizio.
3. Verificare che il workspace selezionato corrisponda esattamente alla chiave del manifest.
4. Verificare che il manifest contenga esattamente 7 documenti e che il lotto sia in italiano.
5. Non procedere se la UI segnala sessione scaduta, workspace diverso, file mancanti, duplicati o errore di autorizzazione.

## Procedura quando autorizzata

1. Aprire l'area amministrativa Knowledge Base.
2. Selezionare il workspace Zinzino Italia corretto.
3. Selezionare la lingua italiana e caricare il manifest indicato sopra.
4. Controllare il riepilogo: 7 documenti, nomi corrispondenti al manifest, nessun documento inglese o file aggiuntivo.
5. Eseguire l'importazione una sola volta. La deduplicazione deve restare basata su `content_sha256`.
6. Verificare il risultato restituito dall'operazione e annotare separatamente documenti creati, duplicati e rifiutati.
7. Lasciare i documenti nello stato `pending`: l'importazione non equivale all'approvazione e non rende i contenuti disponibili all'AI Setter.
8. L'approvazione, se autorizzata, è un passaggio amministrativo distinto e successivo; non usare scorciatoie, SQL manuale o chiavi `service_role`.

## Criteri di arresto e gestione errori

- In caso di errore JWT/sessione: interrompere, autenticarsi nuovamente e ripetere solo dopo aver verificato la sessione.
- In caso di workspace mancante o non corrispondente: interrompere; non creare o sostituire workspace autonomamente.
- In caso di file mancante, contenuto vuoto, duplicato inatteso o metadati incoerenti: interrompere e correggere il manifest sul branch prima di un nuovo tentativo.
- Non ripetere alla cieca un lotto con esito incerto: usare il risultato dell'operazione e la deduplicazione per riconciliare lo stato prima di un eventuale retry.
- Non approvare automaticamente i documenti importati.

## Controlli dopo l'importazione autorizzata

- Conteggio documenti coerente con il risultato (nuovi + duplicati + rifiutati).
- Tutti i documenti associati al workspace corretto e con `language_code=it`.
- Stato di approvazione `pending` finché un amministratore non effettua l'approvazione esplicita.
- Nessun contenuto inglese, documento draft o materiale UK inserito nel lotto.
- Nessun utilizzo di OpenAI o token AI: l'importazione documentale non deve invocare la generazione AI.

## Stato corrente

- Contratto statico del lotto: PASS su GitHub Actions run 1151.
- Edge Functions Knowledge live: JWT obbligatorio e approvazione pending mantenuti, secondo verifiche già registrate nel MASTER.
- Workspace Zinzino: non creato/attivato.
- Documenti Knowledge Supabase: nessuno caricato.
- Approvazioni: nessuna.
- Deploy frontend/merge: non eseguiti.
