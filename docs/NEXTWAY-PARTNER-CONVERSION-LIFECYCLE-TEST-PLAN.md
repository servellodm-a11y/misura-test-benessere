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
- Un retry recupera un invito precedente associato alla stessa richiesta. Se l'utente esiste ma non ha confermato l'email, l'Edge Function ora richiama `inviteUserByEmail` per reinviare l'invito allo stesso account e verifica che ID, email e metadata della richiesta siano rimasti coerenti. Se l'utente ha già confermato l'email, non reinvia e riutilizza quell'ID. Un invito creato dal tentativo corrente può essere eliminato in compensazione solo se non risulta confermato; un invito recuperato non viene eliminato.
- L'attivazione amministrativa della membership richiede email Auth confermata, membership `invited` preesistente e coerenza tra richiesta attivata, utente e workspace.

Questi sono controlli statici sul codice. È stato aggiunto il modulo puro `invite-lifecycle.mjs`, usato dall'Edge Function, e il test Node `scripts/test-nextway-partner-invite-lifecycle.mjs`: esecuzione isolata locale **6/6 superata** per creazione, reinvio, riuso dopo conferma, mismatch email e mismatch request ID. Il test non chiama Supabase Auth e non invia email.

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
| Invito scaduto/non più utilizzabile | Reinviare l'invito all'account non confermato già associato, mantenendo ID e metadata | Implementato; unit test 6/6; API Auth da testare in staging |
| Email già appartenente a un account Auth non legato alla richiesta | Fail closed; nessuna associazione automatica | Da testare in staging |
| Profilo o partner_details incompatibile già esistente | Rollback completo; nessuna sovrascrittura | Da testare in staging |
| Membership già esistente | Bloccare e richiedere riconciliazione; non fare UPSERT cieco | Da testare in staging |
| Richiesta rifiutata prima del provisioning | Nessun invito, profilo o membership | Da testare in staging |
| Invito rifiutato dopo l'invio | Definire una cancellazione/revoca applicativa; Auth non espone uno stato universale di “rifiutato” | Gap di modello |
| Invito scaduto | Consentire un nuovo invito in modo sicuro senza account duplicati né perdita dei metadata | Gap da risolvere |

## Gap da chiudere prima delle migrazioni

### 1. Invito scaduto

Supabase documenta che i link di invito scadono secondo la configurazione Email OTP Expiration e che, se il link scade, occorre inviare un nuovo invito. L'Edge Function è stata aggiornata per richiamare `auth.admin.inviteUserByEmail()` quando trova un utente non confermato già associato alla stessa richiesta. Prima di proseguire verifica che l'API restituisca lo stesso ID; poi rilegge l'utente e controlla email e metadata. Se l'ID cambia o i metadata non corrispondono, il provisioning fallisce in modo chiuso. Gli utenti già confermati non ricevono un nuovo invito.

Questa correzione è supportata dalla documentazione Auth per il reinvio di un invito, ma il comportamento effettivo su un account esistente non confermato deve ancora essere provato in staging. Non viene calcolata localmente una scadenza hardcoded.

### 2. Invito rifiutato o annullato

Lo stato `rejected` della richiesta è previsto per la revisione prima del provisioning. Il modello attuale non definisce una transizione esplicita di annullamento dopo che l'invito è stato creato o dopo che la richiesta è entrata in `provisioning`.

“Rifiutato” non deve essere confuso con “scaduto”: il primo è una decisione di business, il secondo è la scadenza di un link Auth. Prima del DDL va decisa la semantica di annullamento post-invito, inclusi richiesta, membership, profilo e gestione dell'account Auth.

### 3. Coerenza degli stati

`partner_details.status = active` viene creato durante la finalizzazione, mentre la membership workspace resta `invited`. Sono due dimensioni diverse: il Partner può esistere nel sistema ma non avere ancora accesso al workspace. UI e API devono continuare a controllare la membership per ogni accesso workspace; non usare `partner_details.status` come autorizzazione.


## Specifica tecnica di gestione annullamento post-invito — definita, non implementata

La richiesta `rejected` deve restare riservata al rifiuto amministrativo prima del provisioning. Non va riutilizzata per rappresentare un invito ignorato, scaduto o rifiutato dal destinatario.

La proposta tecnica è introdurre una transizione esplicita `cancelled` per la richiesta, con `cancelled_at`, `cancelled_by` e motivo obbligatorio. La cancellazione deve essere un'operazione server-side amministrativa che blocca la richiesta con lock, invalida il claim e impedisce al finalizer di completarla. Se il provisioning è in corso, l'operazione deve coordinarsi con il claim: non deve dichiarare annullata una richiesta mentre un finalizer può ancora completarla.

Regole di sicurezza proposte:
- prima dell'invito: annullare la richiesta senza creare Auth, profilo o membership;
- invito inviato ma non accettato: annullare la richiesta e impedire la finalizzazione; non cancellare automaticamente un account Auth recuperato o già confermato;
- account Auth confermato ma conversione non finalizzata: nessun profilo Partner o membership deve essere creato dalla richiesta annullata; l'account Auth resta un'identità senza accesso NEXTWAY finché non interviene una procedura amministrativa separata;
- conversione già `activated`: non usare la cancellazione della richiesta. Serve un processo distinto di sospensione/offboarding che sospenda la membership e disattivi i dettagli Partner, preservando audit e storico.

La specifica completa, inclusi vincoli da aggiornare, firma RPC, guard, lock e matrice di concorrenza, è registrata in `docs/NEXTWAY-PARTNER-CANCELLATION-TECHNICAL-SPEC.md`. La progettazione è completata; migrazione, RPC e guard non sono state implementate.

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

La semantica di annullamento è ora definita nella specifica tecnica collegata, ma il ciclo Partner non è chiuso finché:
- la procedura per reinviare un invito scaduto non è definita e testata;
- la migrazione, la RPC, la guard e i test di annullamento non sono implementati e superati;
- i test A e B non sono superati;
- il test C non è superato in staging prima dell'applicazione delle migrazioni.

## Protezioni operative

Questo piano non autorizza migrazioni, DDL/DML sul progetto reale, deploy Supabase/Netlify, invii email, creazione utenti reali, merge della PR o modifiche a `main`.


## Aggiornamento audit — 13 novembre 2026

La revisione delle migrazioni esistenti ha precisato i vincoli da coordinare: check dello stato richiesta, check coerenza revisione, check coerenza claim/attivazione e trigger `nextway_guard_conversion_request_review()`. Non è sufficiente aggiungere `cancelled` al solo check dello stato. La nuova specifica tecnica definisce come preservare i dati di revisione quando l'annullamento avviene dopo l'approvazione e come rappresentare l'annullamento da `pending` senza simulare una revisione.

La gara annullamento/finalizzazione deve essere risolta dal lock della stessa riga richiesta. Il progetto staging non è ancora disponibile: test API Auth, test SQL e gare a due sessioni restano bloccati. Nessuna modifica al database reale o invio email è stato effettuato.
