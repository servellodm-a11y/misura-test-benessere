# Configurazione aziendale NEXTWAY — Zinzino

## Stato

- Azienda attiva per l'MVP: Zinzino.
- Identificativo stabile: `zinzino`.
- Lingua iniziale: italiano.
- La configurazione è separata dal motore NEXTWAY.
- Nessuna seconda azienda è attiva nell'MVP.

## Presenza online del consulente: due siti, due funzioni

NEXTWAY deve mantenere distinti i due siti personali configurati in `nextway-company-config.js`:

| Sito | Ruolo | Quando usarlo |
|---|---|---|
| [Misura Test Benessere](https://misura-test-benessere.netlify.app) | Sito generale, con comunicazione centrata sul benessere e sul metodo di misurazione, senza presentazione esplicita del marchio Zinzino | Primo contatto e approfondimento generale con persone interessate al benessere o a conoscere il metodo |
| [Sito replica personale Zinzino](https://www.zinzino.com/2017234122) | Riferimento personale del consulente nell'ambiente Zinzino | Quando la persona ha già espresso interesse specifico per Zinzino, prodotti, test o collaborazione |

Il sito Misura Test Benessere non deve essere descritto come sito ufficiale Zinzino. Il sito replica non deve essere proposto automaticamente a ogni nuovo contatto.

### Regole di scelta del link

1. Per un contatto ancora esplorativo, privilegiare il sito generale Misura Test Benessere, se un link è utile alla conversazione.
2. Per una persona che chiede informazioni specifiche su Zinzino, usare il sito replica personale come possibile approfondimento.
3. Per i prospect professionali o partner, non inserire link nel primo messaggio se non aggiungono valore: prima avviare una conversazione pertinente e personalizzata.
4. Non affermare di aver verificato contenuti o funzionalità dei siti se non è stato eseguito un controllo effettivo.
5. I link sono canali del consulente, non fonti ufficiali sufficienti per validare prezzi, caratteristiche dei prodotti o piano compensi.

## Dati aziendali da alimentare

Questa cartella è il punto di raccolta della documentazione ufficiale da cui ricavare i contenuti aziendali. Non inserire dati commerciali per supposizione.

| Area | Fonte richiesta | Stato |
|---|---|---|
| Presentazione aziendale | Presentazione ufficiale aggiornata | Da acquisire |
| Catalogo prodotti | Catalogo ufficiale valido per l'Italia | Da acquisire |
| Schede prodotto | Schede tecniche e ingredienti ufficiali | Da acquisire |
| Test e strumenti | Documentazione ufficiale di BalanceTest e strumenti collegati | Da acquisire |
| Piano compensi | Piano commerciale/compensi vigente in Italia, con condizioni e definizioni | Da acquisire |
| Regole commerciali | Policy, termini, condizioni, codici etici e regole di comunicazione | Da acquisire |
| Formazione | Materiali ufficiali per clienti, nuovi partner e leader | Da acquisire |
| Claim consentiti | Claim autorizzati, avvertenze e materiali conformi UE/Italia | Da acquisire |
| Prezzi e abbonamenti | Listini e condizioni ufficiali aggiornati per il mercato italiano | Da acquisire |

## Come NEXTWAY deve usare questi dati

1. Il motore di ricerca usa i criteri in `nextway-company-config.js`.
2. L'AI Setter riceve solo informazioni aziendali approvate e pertinenti alla conversazione.
3. Le bozze di contatto distinguono clienti, professionisti wellness, networker, imprenditori e persone interessate a un'attività aggiuntiva.
4. Il CRM registra l'identificativo aziendale associato al prospect.
5. La generazione dei messaggi può proporre il sito generale o il sito replica in base al contesto, senza inserire automaticamente un link in ogni messaggio.
6. Ogni affermazione su prodotti, prezzi, risultati, compensi o qualifiche deve poter essere ricondotta a una fonte ufficiale aggiornata.

## Regole di affidabilità

- Non inventare prezzi, provvigioni, percentuali, bonus, requisiti o tempi di qualificazione.
- Non promettere guadagni e non rappresentare un'opportunità imprenditoriale come reddito garantito.
- Non fare diagnosi, promesse terapeutiche o affermazioni sanitarie non autorizzate.
- Separare fatti documentati, dichiarazioni pubbliche di terzi e valutazioni interne.
- Indicare data/versione e mercato geografico di ogni documento commerciale.
- In caso di conflitto tra materiali, prevale la versione ufficiale più recente applicabile all'Italia.

## Fuori perimetro del primo collegamento

L'attuale integrazione rende Zinzino il contesto di ricerca attivo e conserva l'associazione aziendale nel Lead. Non equivale ancora a un archivio documentale completo né a un AI Setter che consulta l'intero catalogo e piano compensi. Queste funzioni richiedono l'acquisizione e l'indicizzazione dei documenti ufficiali.
