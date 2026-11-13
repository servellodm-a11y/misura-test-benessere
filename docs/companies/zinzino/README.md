# Configurazione aziendale NEXTWAY — Zinzino

## Stato

- Azienda attiva per l'MVP: Zinzino.
- Identificativo stabile: `zinzino`.
- Lingua iniziale: italiano.
- La configurazione è separata dal motore NEXTWAY.
- Nessuna seconda azienda è attiva nell'MVP.

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
5. Ogni affermazione su prodotti, prezzi, risultati, compensi o qualifiche deve poter essere ricondotta a una fonte ufficiale aggiornata.

## Regole di affidabilità

- Non inventare prezzi, provvigioni, percentuali, bonus, requisiti o tempi di qualificazione.
- Non promettere guadagni e non rappresentare un'opportunità imprenditoriale come reddito garantito.
- Non fare diagnosi, promesse terapeutiche o affermazioni sanitarie non autorizzate.
- Separare fatti documentati, dichiarazioni pubbliche di terzi e valutazioni interne.
- Indicare data/versione e mercato geografico di ogni documento commerciale.
- In caso di conflitto tra materiali, prevale la versione ufficiale più recente applicabile all'Italia.

## Fuori perimetro del primo collegamento

L'attuale integrazione rende Zinzino il contesto di ricerca attivo e conserva l'associazione aziendale nel Lead. Non equivale ancora a un archivio documentale completo né a un AI Setter che consulta l'intero catalogo e piano compensi. Queste funzioni richiedono l'acquisizione e l'indicizzazione dei documenti ufficiali.
