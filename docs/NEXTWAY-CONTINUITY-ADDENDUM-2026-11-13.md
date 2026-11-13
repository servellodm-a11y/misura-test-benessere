# NEXTWAY — Addendum continuità operativa

**Data:** 13 novembre 2026  
**Branch:** `fix/nextway-password-recovery`  
**PR:** #1, aperta e draft, base `main`  
**HEAD registrato:** `af9b19627a49dc8ab932017cf407202a246ebe17`

## Attività completate in questo passaggio

1. Corretto il filtro `pull_request.paths` di `.github/workflows/nextway-static-validation.yml`: ora include sia il test della diagnostica conversione sia il file SQL read-only. Prima, il workflow eseguiva il test nello step ma una modifica isolata a quei due file non era sufficiente ad attivare il workflow per PR.
2. Rafforzato `scripts/test-nextway-conversion-workspace-preflight.mjs`: oltre a controllare che la query sia catalog-only, read-only e produca un singolo JSON, ora verifica anche che entrambi i file siano inclusi nel trigger pull request.
3. Creato `docs/NEXTWAY-CONVERSION-WORKSPACE-IMPLEMENTATION-GATE.md` con modello autorizzativo, decisioni dati, gate bloccanti, compatibilità legacy e collaudo obbligatorio.

Commit di questo passaggio:
- `4bfa32bea7d2ea65a45bd5c53d74332f03be3ac3` — trigger PR workflow.
- `4cc79fb8b34b0c5ce1e1a906a2e627eedb852c91` — test della copertura trigger.
- `af9b19627a49dc8ab932017cf407202a246ebe17` — gate documentale e HEAD verificato.

## Stato verifiche

- Revisione statica del workflow e del test: **ESEGUITA**.
- Esecuzione GitHub Actions sul nuovo HEAD: **NON DISPONIBILE/DA CONFERMARE**. La lettura delle run associate al commit non ha restituito run; non dichiarare superata la CI di questi commit.
- Diagnostica SQL read-only: preparata, non eseguita.
- Schema effettivo e RLS di `clients` e `partner_details`: da acquisire prima di preparare DDL.
- Test runtime multi-workspace: non eseguiti.

## Vincoli rispettati

Nessuna modifica a `main`; PR #1 non merged e ancora draft. Nessuna query sul database remoto, migrazione, DDL/DML, deploy Supabase/Netlify, import, seed o creazione di dati. Il blocco Netlify produzione fino al 4 dicembre 2026 resta invariato.

## Prossimo gate tecnico

Completare le verifiche statiche del percorso conversione e, quando sarà autorizzata una singola lettura diagnostica, usare il risultato JSON per riconciliare schema/RLS e finalizzare una proposta di migrazione additiva. Non applicare DDL prima di quel gate.
