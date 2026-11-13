# NEXTWAY — Mappa delle modifiche da escludere dalla baseline core

Data: 13 novembre 2026  
Stato: **mappa statica delle migrazioni; non è DDL eseguibile**.

## Perché serve

Il file `/tmp/nextway-public-schema.sql` già prodotto in precedenza è uno snapshot dello schema pubblico corrente, non una baseline pre-migrazioni. Le migrazioni versionate hanno aggiunto colonne, vincoli, indici, trigger, funzioni e policy alle tabelle core. Copiare lo snapshot così com'è in uno staging e poi riapplicare tutte le migrazioni rischierebbe duplicazioni o stati incoerenti.

Questa mappa documenta ciò che le migrazioni hanno aggiunto alle tabelle preesistenti e che deve essere distinto dalla DDL originaria. Non rimuovere queste parti dallo snapshot con semplici sostituzioni testuali: il ripristino va effettuato solo dopo aver confrontato i blocchi DDL completi del dump.

## Tabelle core preesistenti

| Tabella | Modifiche aggiunte dalle migrazioni NEXTWAY | File di riferimento |
|---|---|---|
| `public.nextway_leads` | Colonne `archived_at`, `archived_by`, `archive_reason`; vincolo `nextway_leads_archive_state_check`; indici per Lead attivi/archiviati; trigger e funzione `nextway_set_lead_archive_metadata`; ridefinizione del check di `status`; trigger audit; `workspace_id`, FK e indice; trigger di protezione assegnazione workspace; policy SELECT e scope workspace | `20261110000800`, `20261110000900`, `20261110001000`, `20261110001300`, `20261111210000`, `20261111230000` |
| `public.nextway_setter_conversations` | `workspace_id`, FK e indice; policy di lettura/scope workspace; policy aggiornate per l'accesso dei membri attivi | `20261111210000`, `20261111240000` |
| `public.nextway_knowledge_documents` | `workspace_id`, FK e indice; sostituzione dell'indice unique globale con indici distinti per documenti globali e workspace; policy di scope workspace e aggiornamento RPC di ricerca | `20261111210000`, `20261111230000` |
| `public.partner_details` | Colonna `nextway_conversion_request_id` con FK RESTRICT e indice unique parziale | `20261111001500` |
| `public.clients` | Colonna `nextway_conversion_request_id` con FK RESTRICT e indice unique parziale | `20261111001500` |

## Tabelle core senza ALTER TABLE diretto individuato

La scansione statica delle migrazioni versionate non ha individuato `ALTER TABLE` diretto sulle seguenti tabelle:
- `public.profiles`;
- `public.nextway_setter_messages`;
- `public.partner_details`;
- `public.clients`.

Questo non certifica che siano prive di dipendenze: le funzioni, le policy e i trigger delle altre tabelle possono referenziarle. La loro DDL originaria deve comunque essere preservata integralmente.

## Oggetti creati dalle migrazioni, da non includere come tabelle core preesistenti

Tra gli oggetti versionati:
- rate limit: `nextway_api_rate_limits`;
- Setter: `nextway_setter_generation_requests` (legacy) e `nextway_setter_workspace_generation_requests` (store corrente);
- CRM: `nextway_lead_audit_logs`, `nextway_lead_creation_requests`, `nextway_lead_activities`, `nextway_lead_conversion_requests`;
- Knowledge Base: `nextway_knowledge_documents`, `nextway_knowledge_chunks`;
- Workspace: `nextway_workspaces`, `nextway_workspace_prompts`, `nextway_workspace_prospect_criteria`, `nextway_workspace_memberships`;
- attribuzione: `nextway_client_workspace_attributions`.

Alcune tabelle create dalle migrazioni ricevono poi colonne o policy aggiuntive; devono essere ricostruite dalla sequenza completa delle migrazioni, non dalla baseline core.

## Punto delicato: schema dump corrente

Il dump noto è stato generato da `public` dopo che almeno parte del modello NEXTWAY era già presente. Non abbiamo in questo repository:
1. il dump SQL originale precedente alla prima migrazione NEXTWAY;
2. una versione storica immutabile della DDL di `profiles`, `nextway_leads`, `nextway_setter_conversations`, `nextway_setter_messages`, `partner_details` e `clients`;
3. il catalogo completo delle policy, trigger e funzioni core prima delle modifiche versionate.

Di conseguenza non è tecnicamente corretto inventare una baseline eseguibile a partire dalle sole colonne minime o dal dump corrente. Una baseline così costruita potrebbe perdere vincoli/RLS oppure duplicare modifiche.

## Procedura sicura per completare la baseline

1. Recuperare la DDL core originaria da un backup/schema dump precedente alle migrazioni, se esiste. In particolare, la migrazione `20261111001500` aggiunge una colonna e un indice a `partner_details` e `clients`, quindi anche queste due tabelle non possono essere copiate dallo snapshot corrente senza riconciliazione.
2. In assenza di tale backup, usare il dump schema-only corrente e questa mappa per una ricostruzione controllata, con revisione statement per statement. Ogni oggetto rimosso deve essere ricondotto a una migrazione specifica; nessuna cancellazione automatica.
3. Separare le definizioni core originarie dalle tabelle/funzioni/policy create dalle migrazioni.
4. Eseguire la baseline in un database PostgreSQL isolato e vuoto, non in `nextway-platform`.
5. Applicare tutte le migrazioni in ordine, senza traffico applicativo tra le migrazioni Setter `20261111240000` e `20261112020000`.
6. Eseguire il preflight read-only e i test transazionali in staging.

## Criterio di completamento

La baseline diventa eseguibile solo dopo che la DDL originaria è stata recuperata o ricostruita e confrontata con:
- tutte le migrazioni in `supabase/migrations`;
- il preflight `supabase/diagnostics/nextway_staging_baseline_preflight_readonly.sql`;
- l'inventario strutturale atteso prima e dopo la sequenza.

Nessuna operazione è stata eseguita sul progetto `nextway-platform`.
