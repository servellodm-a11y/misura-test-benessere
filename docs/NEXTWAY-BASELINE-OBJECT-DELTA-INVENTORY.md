# NEXTWAY — inventario delle differenze baseline / migrazioni

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Stato: **inventario statico dei file SQL del branch; non è una baseline eseguibile**.

## 1. Metodo e limiti

Sono stati letti i file delle migrazioni nel repository e identificati i DDL espliciti e dinamici che:
- creano nuove tabelle, funzioni, indici, trigger e policy;
- alterano tabelle core preesistenti;
- sostituiscono definizioni o privilegi di oggetti preesistenti;
- operano su schemi Supabase gestiti (`auth` e `storage`).

Il dump di produzione `/tmp/nextway-public-schema.sql` è documentato nel registro di progetto, ma **non è disponibile nel workspace di questa sessione**. Non è quindi possibile estrarre e confrontare qui i blocchi DDL reali né produrre in sicurezza una baseline SQL. Non è stato inventato alcun DDL.

## 2. Modifiche alle tabelle core preesistenti

| Tabella | Delta introdotto dalle migrazioni | Migrazioni |
|---|---|---|
| `public.nextway_leads` | `archived_at`, `archived_by`, `archive_reason`; check archiviazione; indici parziali attivi/archiviati; trigger e funzione archive metadata; ridefinizione check `status`; associazione nullable `workspace_id` + FK RESTRICT + indice; trigger protezione assegnazione workspace; policy workspace-scoped | `10000800`, `10001300`, `11210000`, `11230000` |
| `public.nextway_setter_conversations` | `workspace_id` nullable + FK RESTRICT + indice; policy workspace-scoped e gestione conversazioni | `11210000`, `11240000` |
| `public.nextway_setter_messages` | Nessuna colonna aggiunta individuata; sostituzione/restrizione dei privilegi e policy per lettura e scope workspace | `11240000` |
| `public.partner_details` | `nextway_conversion_request_id` nullable, FK verso richiesta conversione con RESTRICT, unique index parziale | `11001500` |
| `public.clients` | `nextway_conversion_request_id` nullable, FK verso richiesta conversione con RESTRICT, unique index parziale | `11001500` |

### Tabelle create dalle migrazioni, ma successivamente estese

| Tabella | Creazione e successive estensioni |
|---|---|
| `nextway_lead_conversion_requests` | Creata in `10001400`; claim/provisioning e vincoli in `11001500`, `11150000`, `12170000`; workspace snapshot in `13120000`; cancellazione e metadati in `13140000` |
| `nextway_lead_creation_requests` | Creata in `10001100`; aggiunta di campi/guard di workspace e versioni RPC in `12000000`, compatibilità idempotenza in `12010000` |
| `nextway_lead_audit_logs` | Creata in `10000900`; minimizzazione della funzione audit in `10001000`; workspace_id, FK e indice in `11230000` |
| `nextway_setter_generation_requests` | Creata come tabella legacy in `10000200`; colonna output temporaneo in `10000500`; trigger di pulizia in `10000700`; transizione workspace intermedia in `11240000`; dopo separazione, il trigger viene spostato dalla tabella legacy alla tabella workspace in `13150000` |
| `nextway_knowledge_documents` | Creata in `11170000`; workspace_id/FK/indice in `11210000`; sostituzione indice unique globale con indici globali/workspace in `11230000` |
| `nextway_knowledge_chunks` | Creata in `11170000`; policy workspace-scoped in `11230000` |
| `nextway_lead_activities` | Creata in `10001200`; policy workspace-scoped in `11230000` |

## 3. Oggetti creati ex novo dalle migrazioni

L'elenco include le principali tabelle applicative:
- `nextway_api_rate_limits`;
- `nextway_setter_generation_requests` (legacy) e `nextway_setter_workspace_generation_requests` (store operativo separato);
- `nextway_lead_audit_logs`, `nextway_lead_creation_requests`, `nextway_lead_activities`, `nextway_lead_conversion_requests`;
- `nextway_knowledge_documents`, `nextway_knowledge_chunks`;
- `nextway_workspaces`, `nextway_workspace_prompts`, `nextway_workspace_prospect_criteria`, `nextway_workspace_memberships`;
- `nextway_client_workspace_attributions`.

Queste tabelle non devono essere inserite nella baseline core pre-migrazioni. La loro DDL deve invece essere ricostruita dalla sequenza completa delle migrazioni, rispettando le successive alterazioni.

## 4. Funzioni e trigger: catene di sostituzione da preservare

Non è corretto rimuovere una funzione dal dump solo perché il suo nome compare in una migrazione: molte migrazioni usano `CREATE OR REPLACE FUNCTION` per sostituire una funzione preesistente o una versione creata in una migrazione precedente.

Catene e casi che richiedono confronto dei corpi completi:
- `nextway_capture_lead_audit`: creata/definita in `10000900`, minimizzata in `10001000`, poi adattata al contesto workspace in `11230000`;
- `nextway_guard_conversion_request_review`: definita in `10001400`, estesa in `11001500`, successivamente aggiornata in `13120000` e `13140000`;
- `nextway_finalize_conversion_activation`: introdotta in `11001500`, poi aggiornata da cleanup/integrity e finalizzazione workspace;
- RPC di creazione Lead: introdotte/ridefinite in `10001100`, `12000000` e `12010000`;
- RPC Setter `begin/store/get_staged/complete`: prima legate alla tabella legacy, poi reindirizzate allo store workspace in `12020000`;
- trigger di pulizia output Setter: trigger storico sulla tabella legacy in `10000700`, transizione workspace in `11240000`, riallineamento finale in `13150000`.

Per ogni funzione vanno confrontati firma, argomenti, tipo di ritorno, corpo, SECURITY DEFINER, search_path, owner e ACL. Per ogni trigger vanno confrontati tabella, evento, timing, condizione e funzione invocata.

## 5. Policy RLS, grant e schemi managed

Le migrazioni modificano policy RLS non soltanto sulle tabelle nuove, ma anche su oggetti core esistenti, in particolare Lead, conversazioni e messaggi Setter. Le policy vanno ricostruite per tabella e comando (SELECT/INSERT/UPDATE/DELETE), distinguendo permissive e restrictive.

La migrazione `20261111180000_nextway_knowledge_storage.sql` crea policy su `storage.objects`: non appartengono allo schema `public` e non vanno ricreate nella baseline applicativa `public`. Dipendono dallo schema gestito Storage del runtime Supabase.

La migrazione `20261111001500` introduce FK da `nextway_lead_conversion_requests` a `auth.users`; lo schema Auth è fornito dal runtime Supabase e non deve essere ricreato nel dump applicativo.

Le migrazioni `11160000` e le successive revoche/concessioni intervengono anche su privilegi di funzioni trigger. L'ACL finale non può essere dedotta dal solo nome della funzione: deve essere verificata separatamente.

## 6. Ordine logico della baseline ricostruita

La baseline core deve contenere solo gli oggetti preesistenti alle migrazioni NEXTWAY:
1. DDL originaria delle tabelle core e dei tipi custom realmente prerequisito;
2. funzioni, trigger, policy, indici, vincoli e grant originari necessari a tali tabelle;
3. nessuna tabella NEXTWAY creata dalle migrazioni;
4. nessuna colonna, vincolo, indice, trigger o policy introdotta dalle migrazioni;
5. nessun oggetto gestito `auth` o `storage` ricreato nel dump `public`.

Poi, in database locale isolato, le migrazioni vengono applicate in ordine cronologico, rispettando dipendenze e la transizione Setter. La migrazione draft `20261105000100_nextway_ai_assistant_foundation.sql` resta fuori dalla sequenza CRM corrente finché non viene deliberatamente inclusa nel piano.

## 7. Criteri di accettazione prima di generare SQL eseguibile

- Ogni colonna rimossa dalla baseline è collegata a una precisa migrazione e al relativo statement.
- Ogni constraint, indice, trigger e policy rimosso è attribuito a una migrazione specifica.
- Ogni funzione è classificata come preesistente o creata da migrazione; le funzioni preesistenti sostituite devono essere recuperate nella versione originaria, non eliminate.
- Nessuna policy RLS originaria viene persa; policy aggiunte/sostituite sono ricostruite con semantica completa.
- Ownership e grant sono documentati senza trasferire ruoli gestiti Supabase.
- La baseline, applicata a PostgreSQL isolato compatibile con Supabase, supera il preflight e accetta tutte le migrazioni in sequenza senza duplicazioni.
- I test runtime vengono eseguiti solo in ambiente isolato con dati sintetici.

## 8. Stato operativo

- Lettura statica delle migrazioni del branch: **COMPLETATA**.
- Mappa dei delta tabellari core: **COMPLETATA a livello statico**.
- Inventario delle tabelle create dalle migrazioni: **COMPLETATO a livello statico**.
- Confronto puntuale con il dump effettivo: **BLOCCATO in questa sessione: il file locale in /tmp non è accessibile da qui**.
- Ricostruzione dei corpi originari di funzioni, policy, ACL e trigger: **DA COMPLETARE**.
- Baseline SQL eseguibile: **NON PRODOTTA — correttamente sospesa per evitare DDL inventata**.
- Nessuna modifica al database Supabase, nessun deploy, nessun merge, nessuna modifica a `main`.
