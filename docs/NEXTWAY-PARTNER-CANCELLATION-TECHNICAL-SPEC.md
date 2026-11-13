# NEXTWAY — Specifica tecnica annullamento conversione Partner

Data: 13 novembre 2026  
Branch di lavoro: `fix/nextway-password-recovery`  
Stato: **specifica completata; implementazione SQL non autorizzata e non applicata**.

## 1. Obiettivo e confini

Introdurre un annullamento amministrativo esplicito per una richiesta di conversione non ancora finalizzata. L'annullamento deve prevalere su un provisioning concorrente oppure essere respinto se la finalizzazione ha già completato la conversione.

Non usare `rejected` per un annullamento successivo all'approvazione: `rejected` resta l'esito della revisione amministrativa iniziale. Non usare l'annullamento della richiesta per disattivare un Partner già attivo: quello è un processo separato di offboarding.

## 2. Stati e transizioni ammesse

| Stato attuale | Operazione | Stato finale | Regola |
|---|---|---|---|
| `pending` | Annullamento platform_admin | `cancelled` | Ammesso; nessuna revisione o provisioning creati |
| `ready_for_activation` | Annullamento platform_admin | `cancelled` | Ammesso; conserva i dati della revisione |
| `provisioning` | Annullamento platform_admin | `cancelled` | Ammesso; invalida il claim |
| `activated` | Annullamento | Nessuna modifica | Rifiutare; richiede offboarding separato |
| `rejected` | Annullamento | Nessuna modifica | Rifiutare; richiesta già chiusa |
| `cancelled` | Retry annullamento | `cancelled` | Idempotente: restituire già annullata |

L'annullamento richiede un motivo non vuoto e limitato a 1.000 caratteri. L'attore deve essere un utente autenticato il cui profilo è `platform_admin`. Nessuna chiamata dal browser può fornire o modificare il claim token.

## 3. Modello dati da introdurre

Aggiungere alla tabella `nextway_lead_conversion_requests`:

- `cancelled_at timestamptz null`;
- `cancelled_by uuid null references public.profiles(id) on delete restrict`;
- `cancellation_reason text null`, con limite 1.000 caratteri e contenuto non vuoto quando la richiesta è annullata.

Aggiornare il vincolo di stato affinché includa `cancelled`. Aggiornare il vincolo di coerenza della revisione senza sovraccaricare `reviewed_by/reviewed_at`:

- `pending`: revisione assente;
- `ready_for_activation`, `provisioning`, `rejected`, `activated`: revisione presente;
- `cancelled`: revisione assente se annullata da `pending`, oppure conservata se annullata dopo approvazione.

Aggiungere un vincolo di coerenza annullamento:

- per `cancelled`: `cancelled_at`, `cancelled_by` e `cancellation_reason` obbligatori;
- per ogni altro stato: i tre campi devono essere null.

Aggiornare il vincolo di stato di attivazione: una richiesta `cancelled` deve avere claim token, claim timestamp, activation user e activated timestamp null. Non modificare retroattivamente richieste storiche `activated`.

## 4. RPC amministrativa e serializzazione

Firma proposta:

`nextway_cancel_conversion_activation(p_request_id uuid, p_reason text) returns jsonb`

Contratto:

1. Richiede `auth.uid()` non null e verifica `nextway_is_platform_admin()`.
2. Valida request ID e motivo.
3. Blocca la riga richiesta con `SELECT ... FOR UPDATE`.
4. Se `activated`, rifiuta e indica che serve offboarding.
5. Se già `cancelled`, restituisce `already_cancelled=true` senza cambiare autore, data o motivo originari.
6. Se `pending`, `ready_for_activation` o `provisioning`, imposta `cancelled`, registra autore/data/motivo e azzera `activation_claim_token` e `activation_claimed_at`.
7. Non modifica Lead, profili, partner_details, membership o clienti.
8. Restituisce solo request ID, stato, esito idempotente e timestamp; non espone token o dati Auth.

La funzione deve essere `SECURITY DEFINER`, avere `search_path = pg_catalog, public`, revocare EXECUTE a PUBLIC/anon e concederlo soltanto ad authenticated. La verifica platform_admin deve essere eseguita dentro la funzione, non delegata alla UI.

## 5. Guard delle transizioni

Aggiornare `nextway_guard_conversion_request_review()` per ammettere la transizione verso `cancelled` soltanto quando:

- l'attore è autenticato e platform_admin;
- i metadati di annullamento sono completi;
- il claim token e il claim timestamp risultano null;
- activation user e activated timestamp restano null;
- i dati originari della richiesta restano immutati;
- i dati della revisione restano immutati se la richiesta era già stata approvata.

La guard deve continuare a negare ogni altra transizione non prevista. Non concedere UPDATE diretto agli utenti authenticated per i campi di annullamento: la RPC è l'unico percorso.

## 6. Gara tra annullamento e finalizzazione

La serializzazione è ottenuta dal lock sulla stessa riga richiesta, già usato dal finalizer.

**Caso A — vince l'annullamento**
- La RPC amministrativa blocca la richiesta e imposta `cancelled`, azzerando il claim.
- Il finalizer, quando ottiene il lock, trova uno stato diverso da `provisioning` o un claim non corrispondente e fallisce.
- Nessun profilo Partner, partner_details o membership viene creato dalla finalizzazione annullata.

**Caso B — vince la finalizzazione**
- Il finalizer blocca la richiesta e completa atomicamente Partner, membership e Lead, impostando `activated`.
- L'annullamento, dopo aver ottenuto il lock, trova `activated` e viene rifiutato.
- Per rimuovere l'accesso serve l'offboarding, non la cancellazione.

**Caso C — annullamento mentre l'Edge Function ha già inviato l'invito**
- L'account Auth può essere stato creato prima della transazione SQL.
- Il finalizer non può completare dopo l'annullamento perché il claim è stato invalidato.
- L'Edge Function deve rilevare lo stato corrente prima di ogni cleanup compensativo.
- Può eliminare soltanto un account creato dal tentativo corrente e ancora non confermato, secondo le protezioni già presenti.
- Non eliminare account recuperati da tentativi precedenti né account con email confermata.
- Un account Auth confermato ma non finalizzato resta senza profilo/membership NEXTWAY creati da quella richiesta; la sua gestione è amministrativa e separata.

La cancellazione SQL non può annullare un'email già consegnata né revocare in modo garantito un link già ricevuto. Il blocco effettivo è la mancata finalizzazione e l'assenza di membership.

## 7. Claim, retry e retention

- `nextway_claim_conversion_activation` deve continuare ad accettare soltanto `ready_for_activation` o un claim `provisioning` scaduto; `cancelled` resta non reclamabile.
- `nextway_release_conversion_activation` deve continuare ad aggiornare soltanto la riga ancora `provisioning` con lo stesso token: dopo annullamento deve essere un no-op.
- Ogni cleanup dei claim scaduti deve escludere esplicitamente `cancelled`.
- Il controllo applicativo di richieste attive deve trattare `pending`, `ready_for_activation` e `provisioning` come attive; `cancelled` e `rejected` non devono impedire una nuova richiesta.
- Gli indici univoci parziali storici coprono `pending` e `ready_for_activation`, mentre la RPC di creazione controlla anche `provisioning` sotto advisory lock. Non ampliare o sostituire gli indici senza una migrazione coordinata e un controllo delle duplicazioni esistenti.

## 8. Matrice test obbligatoria

1. Annullamento da `pending`: nessun claim, Auth user, profilo o membership.
2. Annullamento da `ready_for_activation`: revisione conservata e claim nullo.
3. Annullamento da `provisioning`: claim invalidato e finalizer successivo respinto.
4. Finalizer che ottiene il lock prima dell'annullamento: annullamento respinto su `activated`.
5. Annullamento che ottiene il lock prima del finalizer: finalizer respinto.
6. Doppio annullamento: seconda chiamata idempotente e metadati originali invariati.
7. Motivo nullo, vuoto o oltre limite: rifiutato.
8. Utente non autenticato o non platform_admin: rifiutato.
9. Tentativo UPDATE diretto dei campi cancellation da authenticated: negato.
10. Invito non confermato creato dal tentativo corrente: cleanup compensativo consentito solo dopo conferma dello stato non attivato.
11. Invito recuperato da un tentativo precedente: non eliminato.
12. Account Auth già confermato: mai eliminato automaticamente.
13. Richiesta `rejected` o `activated`: nessuna transizione a `cancelled`.
14. Richiesta legacy con workspace NULL: stessi controlli di annullamento; nessun backfill workspace.
15. RLS, audit e permessi RPC: nessun accesso ai dati di un altro workspace e nessuna esposizione del claim token.

I test di concorrenza devono essere eseguiti con due sessioni PostgreSQL indipendenti in staging. Un test unitario puro non prova i lock del database.

## 9. Sequenza d'implementazione futura

1. Riconciliare i vincoli e la guard effettivamente presenti sul database staging.
2. Preparare una sola migrazione transazionale per colonne, check constraints, guard e RPC.
3. Aggiungere test statici per firma, privilegi, transizioni e immutabilità.
4. Aggiungere test SQL rollback-only per i casi 1–9 e 13–15.
5. Eseguire gare concorrenti con due sessioni in staging.
6. Integrare l'azione di annullamento nella console admin solo dopo il superamento dei test SQL.
7. Collaudare l'Edge Function con account Auth sintetici in staging, senza destinatari reali.

## 10. Stato operativo

- Specifica tecnica: completata sul branch.
- Migrazione di annullamento: non creata e non applicata.
- RPC e guard: non modificate.
- Test runtime Auth e PostgreSQL concorrente: bloccati finché non esiste un progetto staging separato.
- Database `nextway-platform`: non modificato.
- Edge Function remota: non distribuita.
- Email: nessuna inviata.
- `main`: non modificato; PR #1 resta draft e non mergeata.
