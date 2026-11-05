# NEXTWAY AI Assistant — Architettura iniziale
Versione: 1.0  
Data: 5 novembre 2026  
Stato: specifica iniziale; nessuna integrazione WhatsApp ancora attivata.

## 1. Obiettivo
NEXTWAY AI Assistant è un modulo autonomo della piattaforma NEXTWAY AI. La prima applicazione supporta l'ecosistema Zinzino (prodotti, test, evidenze scientifiche, indicazioni d'uso autorizzate, attività, formazione e piano compensi). Il motore non deve essere vincolato a Zinzino: in futuro potranno essere aggiunti altri settori tramite moduli di conoscenza separati.

## 2. Principi non negoziabili
- Un solo profilo contatto per persona; non creare duplicati per ogni azienda o opportunità.
- Separare identità e relazione del contatto dai singoli interessi, opportunità e moduli aziendali.
- Conservare provenienza, data, finalità e base giuridica/consenso dei dati.
- Non riutilizzare automaticamente per marketing di un altro settore i dati raccolti per Zinzino: verificare finalità, informativa, consenso o altra base giuridica applicabile e opposizioni.
- Dati e credenziali riservati solo lato server; mai esporre service_role o chiavi segrete nel browser.
- Risposte AI basate su fonti approvate, con data/versione e tracciabilità; se la fonte manca o è ambigua, dichiararlo e passare a un operatore.
- Nessuna diagnosi, prescrizione o promessa di risultato economico/sanitario.

## 3. Architettura logica
1. **Canali**: WhatsApp Business Platform in prima fase; web chat e altri canali possibili in seguito.
2. **Gateway messaggi**: ricezione webhook, verifica firma/token, normalizzazione del messaggio e invio della risposta.
3. **Orchestratore AI**: riconosce intento e settore, applica regole, recupera fonti pertinenti e genera la risposta.
4. **Knowledge modules**: collezioni separate per Zinzino e futuri settori; documenti con fonte, versione, lingua, data di validità e stato di approvazione.
5. **CRM relazionale**: profilo unico del contatto, interessi, competenze, interazioni, opportunità e preferenze/consensi.
6. **Console NEXTWAY**: amministrazione, revisione delle fonti, gestione escalation, statistiche e audit.

## 4. Modello dati concettuale
Il modello si aggiunge gradualmente alle tabelle esistenti (profiles, partner_details, clients, nextway_leads); non sostituisce né modifica queste tabelle senza verifica preventiva.

- contacts: identità centrale e recapiti normalizzati; identificatore interno stabile.
- contact_channels: identificativi di canale (es. numero WhatsApp) collegati al contatto, con verifica e stato.
- contact_interests: interessi dichiarati/inferiti, settore, livello di affidabilità, fonte e data.
- contact_skills: competenze ed esperienze professionali, fonte e data.
- opportunity_modules: catalogo dei settori/progetti (es. zinzino, futuri moduli).
- contact_opportunities: relazione tra contatto e modulo, stato, interesse, fonte e date.
- consent_records: finalità, testo/versione informativa, base giuridica, scelta, timestamp, canale e prova; registrare anche revoca/opposizione.
- knowledge_sources: documenti e fonti autorizzati, settore, lingua, versione, validità, revisore e stato.
- conversations e messages: cronologia essenziale, canale, direzione, timestamp, stato consegna e collegamento al contatto.
- handoffs: richieste che necessitano di intervento umano, motivo, responsabile e stato.
- ai_audit: versione del modello/prompt, fonti recuperate, esito e segnalazioni; minimizzare i dati personali registrati.

I nomi sono concettuali: prima di creare tabelle reali si controllano schema, RLS, vincoli e possibili sovrapposizioni con il database attuale.

## 5. Flusso WhatsApp
1. L'utente invia un messaggio al numero WhatsApp Business.
2. Il webhook server-side verifica la richiesta e identifica il canale.
3. Il sistema collega il numero a un contatto esistente oppure avvia una procedura di creazione controllata.
4. Verifica informativa, preferenze e finalità consentite per la conversazione.
5. Classifica l'intento e seleziona il modulo di conoscenza autorizzato.
6. Recupera documenti approvati e genera una risposta con limiti e fonti interne.
7. Se la richiesta è sanitaria individuale, legale, finanziaria, ambigua o fuori dalla base documentale, evita conclusioni improprie e propone il passaggio a una persona competente.
8. Registra l'interazione secondo minimizzazione e tempi di conservazione definiti.
9. Invia la risposta rispettando le regole WhatsApp, incluse le finestre di assistenza e i template richiesti fuori finestra.

## 6. Sicurezza e privacy
- RLS per ogni tabella e separazione tra amministratore, collaboratore e contatti assegnati.
- Segreti API in variabili d'ambiente server-side.
- Verifica webhook e protezione da replay/duplicati.
- Minimizzazione, retention configurabile, esportazione e cancellazione secondo procedure applicabili.
- Informativa chiara sul fatto che l'utente interagisce con un assistente AI.
- Nessun uso di dati sensibili sulla salute per profilazione commerciale.
- I dati relativi a salute e risultati dei test richiedono valutazione specifica e tutele rafforzate; non vanno inseriti nel CRM commerciale generale.

## 7. Piano di realizzazione
**Fase 0 — Verifica infrastruttura esistente**
- Verificare repository, file Nextway, progetto Supabase, schema e RLS.
- Risolvere prima l'accesso Supabase già segnalato come Invalid login credentials.
- Non effettuare upgrade Netlify né inserire dati di pagamento.

**Fase 1 — Fondazione dati**
- Definire contatto unico, interessi, opportunità e consensi.
- Preparare migrazione SQL additiva, con indici e RLS, solo dopo verifica dello schema attuale.
- Testare con dati fittizi.

**Fase 2 — Assistente AI senza WhatsApp**
- Caricare un primo corpus Zinzino verificato.
- Implementare ricerca documentale e risposte con fonti.
- Testare domande, risposte non supportate, escalation e lingue.

**Fase 3 — WhatsApp**
- Verificare disponibilità e titolarità del numero Business.
- Configurare Meta WhatsApp Business Platform e webhook server-side.
- Testare invio/ricezione e regole di messaggistica prima del rilascio.

**Fase 4 — Estensione**
- Aggiungere nuovi moduli settoriali senza duplicare il contatto.
- Usare gli interessi solo per finalità legittime e trasparenti.

## 8. Decisioni ancora aperte
- Numero WhatsApp Business dedicato o numero esistente, previa verifica di compatibilità.
- Accesso solo per utenti che scrivono spontaneamente o anche messaggi proattivi con template e consensi appropriati.
- Fornitore AI e limiti di spesa; preferire un'astrazione che consenta di cambiare provider.
- Lingue iniziali: italiano prima, altre lingue in seguito.
- Chi può approvare fonti, gestire escalation e vedere conversazioni.
