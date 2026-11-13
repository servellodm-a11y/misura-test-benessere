# NEXTWAY — Perimetro MVP commerciale personale

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`

## Decisione di prodotto

La prima versione di NEXTWAY è uno strumento commerciale personale, con un solo titolare operativo: il platform admin (Domenico). I prospect acquisiti dal motore di ricerca confluiscono nel suo archivio Lead. La selezione, la verifica, la priorità, il contatto e la qualificazione sono gestiti centralmente da lui.

L'eventuale distribuzione di Lead ai collaboratori è una decisione umana successiva, non una funzione richiesta per il MVP.

## Fuori perimetro MVP

Non sviluppare nella prima versione:
- gestione quotidiana dei collaboratori e delle loro dashboard;
- assegnazione automatica o distribuzione a rotazione dei Lead;
- code di Lead per collaboratore e metriche individuali;
- notifiche, sincronizzazioni e automazioni specifiche per una rete multiutente;
- onboarding e provisioning automatico dei collaboratori come parte del flusso commerciale.

## Funzioni che restano prioritarie

1. Ricerca di prospect per segmento e area geografica.
2. Risultati con URL, fonte ed evidenza verificabile.
3. Profilazione e classificazione: potenziale cliente oppure partner, con sottocategorie professionali.
4. Arricchimento limitato a recapiti professionali pubblicamente esposti e utilizzabili lecitamente; nessun dato inventato.
5. Deduplicazione e acquisizione controllata nell'archivio Lead personale.
6. Scoring motivato e ordinamento per pertinenza.
7. Preparazione di messaggi individuali basati su evidenze pubbliche.
8. Gestione degli stati, delle attività e dei follow-up.
9. Qualificazione e passaggio al titolare per l'incontro Zoom.
10. Invii tramite canali esterni solo quando integrazione, base giuridica, consenso ove richiesto e opt-out sono gestiti correttamente.

## Regola per l'assegnazione futura

Il campo/concetto di assegnazione può essere reintrodotto in una fase successiva, se necessario, senza costruire ora una piattaforma multi-collaboratore. Il titolare decide manualmente a chi affidare un contatto e mantiene la visibilità sul Lead.

## Nota tecnica: memoria e complessità

Rimuovere una schermata o un flusso non riduce in modo significativo la memoria RAM del Mac: le pagine web statiche consumano memoria soprattutto quando sono aperte nel browser. Il beneficio reale di questa scelta è ridurre complessità applicativa, query, permessi, processi e manutenzione. Non cancellare tabelle, dati o migrazioni già presenti nel database per ottenere un presunto risparmio RAM.

## Vincoli di rilascio

Questa decisione non autorizza deploy, merge, migrazioni, modifiche al database remoto o creazione di dati reali. Le modifiche restano sul branch di lavoro e la PR resta draft.
