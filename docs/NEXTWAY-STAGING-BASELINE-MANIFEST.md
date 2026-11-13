# NEXTWAY — Manifest della baseline core per staging

Data: 13 novembre 2026  
Stato: **manifest preparatorio; non è una baseline SQL eseguibile**.

## Scopo

Le migrazioni NEXTWAY presuppongono un nucleo applicativo già esistente. Questo documento separa tali prerequisiti dagli oggetti creati dalle migrazioni versionate, così da non confondere uno staging vuoto con un database NEXTWAY inizializzato.

La baseline dovrà essere prodotta da uno schema-only sanitizzato e revisionato. Non copiare righe, utenti Auth, file Storage, secret, token, dati personali o dati di produzione.

## Oggetti core preesistenti richiesti

| Oggetto | Ruolo nel sistema | Colonne/attributi minimi confermati dalle migrazioni e dai controlli precedenti |
|---|---|---|
| `auth.users` | Identità Supabase Auth | `id`, `email`, `email_confirmed_at`, `raw_user_meta_data` |
| `public.profiles` | Profilo applicativo e ruolo | `id`, `role`; altre colonne relazionali usate dal modello sponsor/team vanno preservate dalla baseline |
| `public.nextway_leads` | CRM Lead | `id`, `owner_profile_id`, `status`, `archived_at`; la migrazione workspace aggiunge `workspace_id` |
| `public.nextway_setter_conversations` | Conversazioni AI Setter | `id`, `owner_profile_id`, `lead_id`, `status`, `last_message_at`; la migrazione workspace aggiunge `workspace_id` |
| `public.nextway_setter_messages` | Messaggi e bozze Setter | `id`, `conversation_id`, `owner_profile_id`, `direction`, `content`, `message_type`, `ai_generated`; le migrazioni successive usano anche i metadati di approvazione/invio e `created_at` |
| `public.partner_details` | Dati profilo partner | `profile_id`, `first_name`, `last_name`, `phone`, `language`, `sponsor_profile_id`, `team_side`, `status`, `nextway_conversion_request_id` |
| `public.clients` | Anagrafica clienti | `id`, `partner_profile_id`, `first_name`, `last_name`, `email`, `phone`, `acquisition_date`, `source`, `status`, `nextway_conversion_request_id` |

Questo elenco è un minimo funzionale, non sostituisce il dump schema-only completo. Non sono sufficienti soltanto le colonne elencate: devono essere conservati anche tipi, enum, default, vincoli, FK, indici, policy RLS, trigger, funzioni e grants originali.

## Oggetti che le migrazioni NEXTWAY creano

Tra gli oggetti creati dalle migrazioni versionate e quindi da NON duplicare nella baseline senza una decisione esplicita:
- `nextway_api_rate_limits`;
- `nextway_setter_generation_requests` (legacy);
- `nextway_setter_workspace_generation_requests` (store corrente);
- `nextway_lead_conversion_requests`;
- tabelle audit e attività Lead;
- `nextway_knowledge_documents` e `nextway_knowledge_chunks`;
- `nextway_workspaces`, `nextway_workspace_prompts`, `nextway_workspace_prospect_criteria`, `nextway_workspace_memberships`;
- `nextway_client_workspace_attributions`.

Alcune migrazioni successive alterano le tabelle core aggiungendo colonne, policy, trigger o vincoli: la baseline deve rappresentare lo stato precedente alle migrazioni candidate, non uno snapshot già migrato da applicare una seconda volta.

## Contenuto richiesto per una baseline accettabile

1. DDL delle sole strutture applicative core, con schema, tipi, default, PK/FK, check, unique e indici.
2. Definizioni dei tipi enum e degli eventuali domini custom richiesti dalle tabelle core.
3. Funzioni e trigger preesistenti necessari alle tabelle core, con owner, SECURITY DEFINER, search_path e grants.
4. Policy RLS e grants originali, senza ampliamenti automatici.
5. Elenco delle estensioni richieste, distinguendo quelle già presenti nel progetto da quelle introdotte dalle migrazioni.
6. Inventario di dipendenze verso gli schemi gestiti Supabase (`auth`, `storage`, `extensions`) senza esportarne dati o oggetti interni non necessari.
7. Verifica che nessuna tabella o funzione creata dalle migrazioni candidate sia già inclusa nella baseline.

## Esclusioni assolute

- Nessun `INSERT`, `COPY`, seed o dump dati.
- Nessun utente Auth o profilo reale.
- Nessun contenuto di `auth.users` o `auth.identities`.
- Nessun file, oggetto o metadato Storage di produzione.
- Nessuna chiave API, service-role key, JWT secret, password o valore di secret.
- Nessuna connessione o modifica a `nextway-platform` durante la preparazione.

## Criterio di accettazione

La baseline è accettabile soltanto dopo confronto automatico tra:
- oggetti baseline dichiarati;
- prerequisiti effettivi di tutte le migrazioni;
- schema risultante atteso dopo l'intera sequenza.

Il test deve essere eseguito su PostgreSQL/Supabase staging pulito. Il Mac Intel da 8 GB non è il target per avviare l'intero stack Supabase locale.

## Mappa delle modifiche introdotte dalle migrazioni

La ricostruzione delle differenze è documentata in `docs/NEXTWAY-CORE-BASELINE-DELTA-MAP.md`. In sintesi, le migrazioni hanno modificato direttamente:
- `nextway_leads`: archiviazione logica, vincolo stato, audit e associazione workspace/RLS;
- `nextway_setter_conversations`: associazione workspace e policy di accesso;
- `nextway_knowledge_documents`: associazione workspace, indici di deduplicazione e policy.

Le tabelle `profiles`, `nextway_setter_messages`, `partner_details` e `clients` non risultano oggetto di ALTER TABLE diretto nelle migrazioni attualmente versionate; devono comunque essere incluse nella baseline con tutte le loro dipendenze originarie.

**Test statico:** `scripts/test-nextway-core-baseline-delta.mjs` controlla che la mappa resti coerente con la sequenza delle migrazioni. Il test non produce una baseline SQL e non certifica l'esecuzione PostgreSQL.
