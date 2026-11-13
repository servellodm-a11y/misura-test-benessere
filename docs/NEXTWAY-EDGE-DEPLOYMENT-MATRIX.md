# NEXTWAY — matrice di preparazione Edge Functions

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Stato: documento preparatorio; **non autorizza deploy**.

## 1. Scopo

Consolidare le dipendenze delle sei Edge Functions NEXTWAY presenti nel branch, così da evitare deploy parziali o funzioni pubblicate senza tabelle, RPC, policy o secrets richiesti. Le dipendenze sotto sono state ricavate dalla lettura statica dei sorgenti `supabase/functions/*/index.ts`; non provano quali versioni siano attualmente distribuite nel progetto Supabase.

## 2. Matrice funzioni / dipendenze

| Edge Function | Dipendenze applicative rilevate nel sorgente | Configurazione server richiesta |
|---|---|---|
| `nextway-ai-setter` | `nextway_setter_conversations`, `nextway_leads`, `nextway_setter_messages`; RPC rate limit, governance workspace, begin/get/store/complete generation | `SUPABASE_URL`, publishable/anon key, `OPENAI_API_KEY`; `OPENAI_MODEL` opzionale (default nel codice); `NEXTWAY_ALLOWED_ORIGINS` opzionale |
| `nextway-search` | RPC `nextway_consume_api_rate_limit` | `SUPABASE_URL`, publishable/anon key, `TAVILY_API_KEY`; `NEXTWAY_ALLOWED_ORIGINS` opzionale |
| `nextway-workspace-admin` | `profiles`, `nextway_workspaces`, `partner_details`, `nextway_workspace_memberships`, `nextway_knowledge_documents`, `nextway_workspace_prompts`, `nextway_workspace_prospect_criteria` | `SUPABASE_URL`, `NEXTWAY_SERVICE_ROLE_KEY`, publishable/anon key; `NEXTWAY_ALLOWED_ORIGINS` opzionale |
| `nextway-knowledge-upload` | `profiles`, `nextway_knowledge_documents`, Storage API e bucket/policy Knowledge | `SUPABASE_URL`, `NEXTWAY_SERVICE_ROLE_KEY`, publishable/anon key; `NEXTWAY_ALLOWED_ORIGINS` opzionale |
| `nextway-knowledge-ingest` | `profiles`, `nextway_workspaces`, `nextway_knowledge_documents`, `nextway_knowledge_chunks`, Storage/Knowledge | `SUPABASE_URL`, `NEXTWAY_SERVICE_ROLE_KEY`, publishable/anon key; `NEXTWAY_ALLOWED_ORIGINS` opzionale |
| `nextway-conversion-provisioning` | `profiles`, `nextway_lead_conversion_requests`; RPC claim/finalize/release conversion activation | `SUPABASE_URL`, `NEXTWAY_SERVICE_ROLE_KEY`, publishable/anon key; `NEXTWAY_ALLOWED_ORIGINS` opzionale |

## 3. Secrets e variabili: nomi, mai valori

I sorgenti accettano la chiave pubblica in questa precedenza:
1. `SUPABASE_PUBLISHABLE_KEYS` (stringa JSON che può contenere più chiavi);
2. `SUPABASE_PUBLISHABLE_KEY`;
3. `SUPABASE_ANON_KEY` (compatibilità legacy).

Le funzioni che usano privilegi server richiedono il nome esatto `NEXTWAY_SERVICE_ROLE_KEY`; non assumere che il secret standard `SUPABASE_SERVICE_ROLE_KEY` sia sufficiente se il codice non lo legge.

Configurazioni specifiche:
- AI Setter: `OPENAI_API_KEY` obbligatoria; `OPENAI_MODEL` facoltativa.
- Ricerca: `TAVILY_API_KEY` obbligatoria.
- CORS: `NEXTWAY_ALLOWED_ORIGINS` è una lista separata da virgole; controllare che contenga solo origini effettivamente autorizzate per l'ambiente.

Non copiare mai valori di secrets in documenti, log, screenshot o chat. Il controllo pre-release deve verificare soltanto presenza e correttezza del nome, mai mostrare il valore.

## 4. Gate prima del deploy

- [ ] Backup/export del database completato e ripristino verificato.
- [x] P0 Rate Limit: tabella, RPC, RLS e accesso RPC verificati dall'utente il 13 novembre 2026.
- [x] P0 Governance: RPC e accesso verificati dall'utente il 13 novembre 2026.
- [ ] Oggetti CRM, conversione, Knowledge Base, Storage e workspace riconciliati con lo schema live; non assumere che tutte le migrazioni del repository siano applicate.
- [ ] Presenza del bucket `nextway-knowledge` e delle policy Storage effettive confermata.
- [ ] Presenza dei secrets richiesti verificata nel dashboard, senza esporre valori.
- [ ] Origini CORS di produzione controllate; non distribuire automaticamente le origini di sviluppo.
- [ ] Versioni correnti delle sei funzioni rilevate e confrontate con il branch prima della sostituzione.
- [ ] CI sul codice applicativo corrente superata.
- [ ] Test runtime su ambiente isolato completati con identità e dati sintetici.
- [ ] Autorizzazione esplicita al deploy ricevuta.

## 5. Ordine di rilascio proposto

1. Verificare e completare schema e policy di tutte le dipendenze, senza applicare migrazioni in blocco.
2. Verificare i secrets e la configurazione CORS dell'ambiente target.
3. Distribuire le funzioni amministrative/di supporto solo dopo che le rispettive tabelle e policy sono confermate.
4. Distribuire AI Setter e ricerca soltanto dopo conferma delle RPC rate limit/governance e delle tabelle Setter.
5. Distribuire conversion provisioning soltanto dopo la verifica delle RPC e dei vincoli di integrità conversione.
6. Eseguire smoke test autenticati, negativi e di isolamento con dati sintetici; non inviare email o inviti reali.
7. Solo dopo il collaudo delle funzioni, valutare la pubblicazione dell'interfaccia.

L'ordine preciso tra funzioni di supporto dovrà seguire le dipendenze live effettivamente riscontrate. La matrice non autorizza a distribuire tutte le funzioni in un unico passaggio.

## 6. Stato e limiti attuali

- La lettura statica delle sei funzioni è stata completata il 13 novembre 2026.
- Il workflow GitHub Actions #269 sul commit `774bdf55a49e0eee69b625bc2571aa84189f8215` risulta SUCCESS; è una validazione statica/type-check, non un test runtime.
- La verifica P0 comunicata dall'utente conferma rate limit e governance nel database, ma non prova la versione delle Edge Functions effettivamente distribuite.
- Versioni remote correnti, presenza effettiva di tutti i secrets e stato live del bucket/policy Storage: **NON VERIFICATI in questo documento**.
- Nessun deploy Supabase/Netlify è stato eseguito da questa attività.
- Il blocco Netlify produzione fino al 4 dicembre 2026 resta invariato.
