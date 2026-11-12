# NEXTWAY — checklist di rilascio controllato

**Stato:** documento preparatorio. Non autorizza deploy, merge o applicazione di migrazioni.

## 1. Regole inderogabili

- Lavorare sul branch `fix/nextway-password-recovery`; proteggere `main`.
- Non eseguire un `db push` indiscriminato: nel repository convivono migrazioni di moduli differenti e alcuni file sono esplicitamente candidati/draft.
- Prima di ogni migrazione, confrontare la cronologia Supabase effettiva, lo schema, le policy RLS, i trigger e gli oggetti già presenti.
- Backup verificato prima di qualsiasi modifica allo schema.
- Non creare dati aziendali reali durante il collaudo; usare workspace e utenti di test concordati.
- Non distribuire Edge Functions finché la migrazione da cui dipendono non è stata verificata.
- Nessun invio di email, inviti, messaggi o comunicazioni automatiche.
- Nessun deploy Netlify di produzione prima del 4 dicembre 2026, salvo autorizzazione esplicita.
- In caso di errore di migrazione: fermarsi, conservare l'errore e lo stato risultante; non cancellare oggetti o dati e non rilanciare alla cieca.

## 2. Migrazioni: gruppi e dipendenze

L'elenco seguente è una mappa di revisione, non un comando di esecuzione. L'ordine cronologico non sostituisce la verifica delle dipendenze sul progetto Supabase.

### A. AI Setter, rate limit, idempotenza e ciclo di vita Lead

1. `20261110000100_nextway_distributed_rate_limit.sql`
2. `20261110000200_nextway_setter_idempotency.sql`
3. `20261110000300_nextway_rate_limit_units.sql`
4. `20261110000400_nextway_idempotency_retention.sql`
5. `20261110000500_nextway_setter_output_recovery.sql`
6. `20261110000600_nextway_setter_output_authorization_hardening.sql`
7. `20261110000700_nextway_clear_stale_staged_output.sql`
8. `20261110000800_nextway_leads_soft_archive.sql`
9. `20261110000900_nextway_lead_audit_trail.sql`
10. `20261110001000_nextway_audit_data_minimization.sql`
11. `20261110001100_nextway_lead_creation_idempotency.sql`
12. `20261110001200_nextway_lead_activities.sql`
13. `20261110001300_nextway_lead_lifecycle.sql`
14. `20261110001400_nextway_lead_conversion_requests.sql`
15. `20261111001500_nextway_conversion_provisioning.sql`
16. `20261111150000_nextway_conversion_claim_cleanup.sql`
17. `20261111160000_nextway_trigger_function_privileges.sql`

Prerequisiti: verificare che tabelle Lead, conversazioni, messaggi, profili, funzioni RPC e policy citate esistano con le colonne e i vincoli attesi. Le migrazioni che modificano trigger, RPC o RLS richiedono confronto con le definizioni effettive prima dell'applicazione.

### B. Knowledge Base

18. `20261111170000_nextway_knowledge_base.sql`
19. `20261111180000_nextway_knowledge_storage.sql`

Prerequisiti: verificare bucket e policy Storage, limiti di dimensione, privilegi di lettura/scrittura, funzioni di ingestione e dipendenze delle tabelle documenti/chunk. I documenti devono essere creati in stato `pending`; solo l'approvazione amministrativa li rende ricercabili.

### C. Workspace e isolamento multi-tenant

20. `20261111190000_nextway_multi_workspace_foundation.sql`
21. `20261111200000_nextway_workspace_activation_rpc.sql`
22. `20261111210000_nextway_workspace_data_association.sql`
23. `20261111220000_nextway_workspace_memberships.sql`
24. `20261111230000_nextway_workspace_scoped_rls.sql`
25. `20261111240000_nextway_setter_generation_workspace.sql`
26. `20261112000000_nextway_lead_creation_workspace.sql`
27. `20261112010000_nextway_lead_creation_legacy_idempotency_guard.sql`
28. `20261112020000_nextway_setter_generation_table_isolation.sql`
29. `20261112030000_nextway_setter_governance_read_rpc.sql`

Prerequisiti: verificare prima tutte le tabelle, chiavi esterne, funzioni helper e policy preesistenti. La migrazione di RLS deve essere applicata solo dopo aver verificato che tutte le tabelle richieste esistano e abbiano RLS abilitata. Verificare le dipendenze della creazione Lead e l'associazione delle conversazioni prima di abilitare il nuovo flusso.

### D. Migrazione separata da non includere automaticamente

`20261105000100_nextway_ai_assistant_foundation.sql` crea un modello distinto di tabelle `nw_*`. È marcata come draft e non fa parte della sequenza multi-workspace/AI Setter descritta sopra. Non applicarla come parte di questo rilascio senza una decisione e una revisione dedicate.

## 3. Gate prima di ogni gruppo

- [ ] Cronologia migrazioni Supabase acquisita e confrontata con i file del branch.
- [ ] Nessuna migrazione omonima già applicata con contenuto differente.
- [ ] Tabelle, colonne, FK, indici, funzioni e trigger preesistenti verificati.
- [ ] RLS attiva sulle tabelle richieste; policy permissive e restrictive valutate insieme.
- [ ] Grant/revoke verificati per `anon`, `authenticated` e `service_role`.
- [ ] Backup completato e possibilità di ripristino verificata.
- [ ] Piano di correzione forward-only pronto; nessun rollback distruttivo improvvisato.
- [ ] Approvazione esplicita ricevuta prima di eseguire la migrazione.

## 4. Matrice minima di collaudo runtime

Usare due workspace distinti (A e B) e account di test separati.

| Identità | Workspace A | Workspace B |
|---|---|---|
| platform_admin | Gestione centrale autorizzata | Gestione centrale autorizzata |
| workspace_owner / workspace_admin | Gestione autorizzata | Nessun accesso senza membership |
| workspace_manager / workspace_member | Operatività consentita secondo policy | Nessun accesso senza membership |
| workspace_viewer | Sola lettura; niente generazione AI o scrittura | Nessun accesso senza membership |
| Utente senza membership | Nessun accesso | Nessun accesso |

### Test obbligatori

- [ ] Token assente/non valido: API amministrative e funzioni protette rifiutano la richiesta.
- [ ] Utente autenticato non-admin: API amministrative rifiutano le operazioni.
- [ ] Workspace A non può leggere Lead, documenti, chunk, conversazioni, messaggi, prompt o criteri del workspace B.
- [ ] Viewer legge solo i dati consentiti e non può scrivere, approvare, attivare o generare bozze AI.
- [ ] Revoca/sospensione membership blocca le richieste successive.
- [ ] Workspace draft/archived non abilita generazione AI né ricerca operativa.
- [ ] Documento pending/rejected/scaduto/non ancora valido non compare nella ricerca.
- [ ] Documento approved e valido è ricercabile soltanto nel proprio workspace.
- [ ] La generazione AI salva una bozza non approvata e non inviata; nessuna chiamata di invio messaggi è eseguita.
- [ ] Doppia richiesta/concorrenza non crea messaggi duplicati.
- [ ] Chiusura conversazione durante la generazione impedisce il salvataggio.
- [ ] Audit non espone note private o evidenze non necessarie.
- [ ] CORS: preflight e POST restituiscono l'origine esatta consentita; nessun wildcard.
- [ ] Verifica UI browser locale e sito pubblicato dopo il rilascio autorizzato.

## 5. Ordine del rilascio applicativo

1. Chiudere revisione schema e migrazioni; applicare soltanto il gruppo approvato.
2. Eseguire test SQL/RLS con account di prova e registrare gli esiti.
3. Distribuire le Edge Functions dipendenti dalle migrazioni applicate.
4. Verificare CORS, autenticazione, ruoli, isolamento e log senza segreti.
5. Pubblicare l'interfaccia solo dopo i gate precedenti e secondo la finestra di rilascio autorizzata.
6. Eseguire collaudo end-to-end e conservare evidenze, commit e versioni rilasciate.

## 6. Stato al 12 novembre 2026

- Revisione statica del codice multi-workspace, membership, RLS, AI Setter, API amministrativa e Knowledge Base eseguita sul branch.
- Workflow GitHub Actions sul commit `5589ec034e1f1f45100cc3921ba7364088fb25d4`: job `validate` superato, inclusi i type-check Deno e i test statici.
- La console admin locale si apre e riconosce la sessione, ma il servizio amministrativo remoto resta bloccato dal CORS finché la Edge Function corretta non viene distribuita.
- Migrazioni candidate non applicate; Edge Functions non ridistribuite; PR #1 draft e non merged.
- Nessun dato reale creato o modificato durante la revisione.
