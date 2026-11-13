# NEXTWAY — Piano di test del ciclo di conversione Partner

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`

## Scopo e limiti

Questo documento definisce il collaudo del percorso Lead → richiesta Partner → invito Auth → profilo Partner → membership workspace.

Il collaudo non deve creare utenti, inviti, email o dati di prova nel progetto Supabase reale `nextway-platform`. Non applicare migrazioni e non eseguire test contro il database remoto di produzione.

## Stato dell'audit statico

- L'Edge Function richiede una sessione valida e il ruolo `platform_admin`.
- L'ID workspace non è accettato dal client: la finalizzazione usa lo snapshot memorizzato nella richiesta.
- L'invito Auth contiene `nextway_conversion_request_id` nei metadata.
- Il finalizer verifica ID utente, email e metadata prima di creare i record Partner.
- Il finalizer crea `profiles`, `partner_details` e, se la richiesta ha un workspace, una membership `workspace_member / invited` nella stessa transazione.
- I profili e i dettagli Partner preesistenti incompatibili causano un errore, senza UPSERT distruttivi.
- Un retry recupera un invito precedente associato alla stessa richiesta. Un invito creato dal tentativo corrente può essere eliminato in compensazione solo se non risulta confermato; un invito recuperato non viene eliminato.
- L'attivazione amministrativa della membership richiede email Auth confermata, membership `invited` preesistente e coerenza tra richiesta attivata, utente e workspace.

Questi sono controlli statici sul codice, non test runtime.

## Casi del ciclo da collaudare

| Caso | Comportamento atteso | Stato |
|---|---|---|
| Nuova richiesta Partner approvata | Claim esclusivo; un solo invito legato alla richiesta | Da testare in staging |
| Finalizzazione riuscita | Profilo e partner_details coerenti; membership `invited`; richiesta `activated` | Da testare in staging |
| Retry dopo timeout prima della finalizzazione | Riutilizzo del solo account con metadata della stessa richiesta; nessun account duplicato | Da testare in staging |
| Retry dopo finalizzazione già riuscita | Risposta idempotente; nessuna seconda membership o profilo | Da testare in staging |
| Errore dopo creazione invito nel tentativo corrente | Cleanup solo se l'account non è stato confermato; claim rilasciato | Da testare in staging |
| Errore dopo recupero di invito precedente | Non eliminare l'account recuperato; rendere possibile il retry | Da testare in staging |
| Invito accettato prima del retry | Riutilizzare lo stesso Auth user; non cancellarlo; completare la finalizzazione se ancora pendente | Da testare in staging |
| Invito scaduto/non più utilizzabile | Non trattarlo silenziosamente come invito valido; prevedere un reinvio controllato | Gap da risolvere |
| Email già appartenente a un account Auth non legato alla richiesta | Fail closed; nessuna associazione automatica | Da testare in staging |
| Profilo o partner_details incompatibile già esistente | Rollback completo; nessuna sovrascrittura | Da testare in staging |
| Membership già esistente | Bloccare e richiedere riconciliazione; non fare UPSERT cieco | Da testare in staging |
| Richiesta rifiutata prima del provisioning | Nessun invito, profilo o membership | Da testare in staging |
| Invito rifiutato dopo l'invio | Definire una cancellazione/revoca applicativa; Auth non espone uno stato universale di “rifiutato” | Gap di modello |
| Invito scaduto | Consentire un nuovo invito in modo sicuro senza account duplicati né perdita dei metadata | Gap da risolvere |

## Gap da chiudere prima delle migrazioni

### 1. Invito scaduto

Supabase documenta che i link di invito scadono secondo la configurazione Email OTP Expiration (default documentato: un'ora) e che, se il link scade, occorre inviare un nuovo invito. L'Edge Function attuale trova un utente non confermato con lo stesso metadata e lo riutilizza, ma non verifica se il link precedente è ancora valido e non attiva un percorso di reinvio.

Non introdurre una stima dell'expiry basata su un valore hardcoded: la durata è configurabile. La soluzione deve usare una procedura Auth supportata e verificata, preservare lo stesso legame richiesta/utente e non eliminare account già accettati. Va anche verificato il comportamento dell'API Auth con un utente non confermato già esistente.

### 2. Invito rifiutato o annullato

Lo stato `rejected` della richiesta è previsto per la revisione prima del provisioning. Il modello attuale non definisce una transizione esplicita di annullamento dopo che l'invito è stato creato o dopo che la richiesta è entrata in `provisioning`.

“Rifiutato” non deve essere confuso con “scaduto”: il primo è una decisione di business, il secondo è la scadenza di un link Auth. Prima del DDL va decisa la semantica di annullamento post-invito, inclusi richiesta, membership, profilo e gestione dell'account Auth.

### 3. Coerenza degli stati

`partner_details.status = active` viene creato durante la finalizzazione, mentre la membership workspace resta `invited`. Sono due dimensioni diverse: il Partner può esistere nel sistema ma non avere ancora accesso al workspace. UI e API devono continuare a controllare la membership per ogni accesso workspace; non usare `partner_details.status` come autorizzazione.

## Strategia di test senza utenti fittizi nel database reale

### Livello A — test statici e unitari

- Verificare la logica di classificazione dei casi Auth con risposte simulate.
- Verificare idempotenza, claim concorrenti, cleanup e protezione degli inviti accettati.
- Verificare che il client non possa fornire workspace o Auth user ID da associare.
- Nessuna chiamata Auth reale, nessuna email, nessuna modifica al database.

### Livello B — test SQL transazionale su ambiente isolato

Usare esclusivamente un progetto Supabase di staging/disposable, separato da `nextway-platform`, con fixture sintetiche. Il test SQL deve fare rollback di tutte le modifiche DB e verificare:

1. richiesta Partner in `provisioning`;
2. Auth user sintetico con email e metadata request ID corrispondenti;
3. profilo e partner_details creati una sola volta;
4. membership `invited`, mai `active` dal finalizer;
5. mismatch di email, metadata, sponsor, profilo o workspace con rollback completo;
6. retry/idempotenza e membership già esistente;
7. email non confermata: impossibilità di attivare la membership;
8. email confermata: attivazione consentita solo dopo la conversione completata e per lo stesso utente/workspace.

La creazione dell'utente Auth avviene tramite Admin API solo nel progetto isolato; deve essere rimossa in un blocco di cleanup anche in caso di errore. Il rollback SQL da solo non annulla un utente creato via API.

### Livello C — test email end-to-end

Solo in ambiente isolato, con casella di test controllata: invio, accettazione, link scaduto, reinvio, retry dopo timeout e annullamento. Nessuna email a contatti reali.

## Gate di uscita

Non considerare il ciclo Partner chiuso finché:
- la procedura per reinviare un invito scaduto non è definita e testata;
- la semantica di annullamento dopo l'invio non è definita;
- i test A e B non sono superati;
- il test C non è superato in staging prima dell'applicazione delle migrazioni.

## Protezioni operative

Questo piano non autorizza migrazioni, DDL/DML sul progetto reale, deploy Supabase/Netlify, invii email, creazione utenti reali, merge della PR o modifiche a `main`.
