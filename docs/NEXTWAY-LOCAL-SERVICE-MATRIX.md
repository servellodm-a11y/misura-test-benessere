# NEXTWAY — matrice dei servizi per il collaudo locale

Data: 13 novembre 2026  
Branch: `fix/nextway-password-recovery`  
Stato: inventario statico del repository; nessun ambiente avviato e nessuna migrazione applicata.

## 1. Obiettivo

Ridurre il carico sul Mac Intel (8 GiB RAM fisica, 3.82 GiB assegnati a Docker) senza confondere un test SQL con un test applicativo completo.

La documentazione Supabase raccomanda almeno 7 GB assegnati a Docker per l'intero stack. Sul Mac attuale non si deve tentare il full stack né aumentare la memoria Docker.

## 2. Dipendenze individuate nelle migrazioni

L'inventario statico delle 31 migrazioni nel branch mostra che il database NEXTWAY non è autonomo: si appoggia a uno schema applicativo preesistente e a oggetti Supabase gestiti.

### Schema applicativo preesistente

Le migrazioni fanno riferimento, fra gli altri, a:

- `public.profiles`
- `public.clients`
- `public.partner_details`
- `public.nextway_leads`
- `public.nextway_setter_conversations`
- `public.nextway_setter_messages`
- RPC e trigger preesistenti per creazione Lead, qualificazione e gestione Setter.

Questi oggetti devono essere inclusi nella baseline schema-only nella loro versione coerente. Non si devono inventare tabelle sostitutive o ricostruire soltanto i nomi: servono colonne, tipi, vincoli, indici, funzioni, trigger, grant e policy realmente richiesti.

### Schemi Supabase gestiti

Le migrazioni fanno inoltre riferimento a:

- `auth.users`, `auth.uid()`, `auth.role()` e ruoli/claim Supabase;
- `storage.buckets` e `storage.objects` per la Knowledge Base;
- oggetti e permessi PostgreSQL necessari a RLS e alle funzioni `SECURITY DEFINER`.

Una baseline SQL che ometta questi prerequisiti non è sufficiente per dichiarare superate le migrazioni o i test di autorizzazione. L'esistenza di nomi/placeholder non equivale al comportamento reale dei servizi Auth e Storage.

### Migrazioni da tenere distinte

- `20261105000100_nextway_ai_assistant_foundation.sql`: resta una migrazione draft separata; non inserirla automaticamente nella sequenza di collaudo.
- Migrazioni CRM/Lead, conversione, Knowledge Base, Storage e workspace: ordinare per prerequisiti e applicare soltanto in ambiente locale isolato, dopo revisione.
- `20261112020000_nextway_setter_generation_table_isolation.sql`: risulta già applicata sul progetto Supabase live secondo il MASTER; non riapplicarla in produzione. La sua eventuale riproduzione locale deve essere parte della baseline/cronologia coerente, non una nuova azione live.

## 3. Matrice dei servizi per tipo di test

| Servizio | Test che lo richiedono | Priorità locale |
|---|---|---|
| PostgreSQL | Schema, migrazioni SQL, vincoli, trigger, RLS, RPC SQL e concorrenza con due sessioni | Indispensabile |
| Auth / GoTrue | Login, utenti Auth, JWT reali, verifica proprietario e flussi di provisioning | Solo per test Auth/integrati |
| PostgREST | Invocazione delle RPC e delle tabelle attraverso API Supabase | Solo per test API |
| Kong / gateway | Accesso tramite URL locale Supabase e routing delle API | Solo per test API/Edge |
| Storage API | Upload/download e applicazione effettiva delle policy Storage | Solo per test Knowledge Base |
| Edge Runtime | Esecuzione locale delle Edge Functions NEXTWAY | Solo per test end-to-end |
| Realtime | Nessuna dipendenza individuata nei test A–F e nei piani pre-release esaminati | Escludibile salvo nuova evidenza |
| Image proxy | Non necessario per i test SQL/CRM/Setter esaminati | Escludibile |
| Studio / postgres-meta | Interfaccia amministrativa locale, non necessaria ai test SQL automatizzabili | Escludibile inizialmente |
| Log/telemetria e vector/logflare | Non individuati come prerequisiti dei test A–F | Escludibili se la CLI lo consente |
| Supavisor | Pooling non necessario per due sessioni PostgreSQL di test | Escludibile inizialmente |

L'esclusione è una proposta di profilo, non un comando già validato. La CLI 3.1.0 deve essere interrogata/verificata prima di usare qualsiasi lista `-x`.

## 4. Profili raccomandati

### Profilo A — SQL e concorrenza

Scopo:
- validare migrazioni selezionate;
- verificare funzioni SQL, lock, rollback, idempotenza e vincoli;
- eseguire i test A–F con due sessioni PostgreSQL indipendenti.

Limite:
- non dimostra che Auth, REST, Storage o Edge Functions funzionino;
- per RLS e funzioni che usano `auth.uid()` servono ruoli, schemi e claim locali coerenti. Se tali prerequisiti non sono disponibili nel solo PostgreSQL, il profilo deve includere i servizi minimi necessari oppure fermarsi.

### Profilo B — Integrazione applicativa ridotta

Da valutare solo dopo il Profilo A e dopo aver misurato memoria e stabilità. Componenti candidati: PostgreSQL, Auth, PostgREST, gateway, Storage API ed Edge Runtime. Escludere i servizi non usati dai test, se compatibile con la CLI e con la configurazione.

Scopo:
- verificare chiamate API, JWT, RLS via API, Storage e Edge Functions;
- eseguire un sottoinsieme end-to-end dei test NEXTWAY con fixture sintetiche.

Se il profilo non è stabile entro le risorse Docker disponibili, non forzare l'avvio: spostare i test d'integrazione su una macchina futura più potente o valutare separatamente un ambiente cloud isolato, senza creare progetti o sostenere costi senza autorizzazione.

## 5. Regole di sicurezza

- Non collegare la directory locale a un progetto remoto.
- Non usare `--remote`, `db pull`, `db push`, `link`, deploy o secrets remoti durante questa preparazione.
- Non copiare righe o dati personali dalla produzione.
- Usare soltanto fixture sintetiche, chiaramente marcate.
- Non creare inviti o email esterne; eventuali test Auth devono essere configurati per intercettare o sopprimere la posta.
- Non eseguire `supabase init` finché non è stata definita una procedura che preservi l'attuale directory `supabase/` e `supabase/.temp/`.
- Non eseguire `supabase start` finché config, baseline, seed e lista servizi non sono stati revisionati.
- Nessuna migrazione, deploy, merge o modifica a `main`; nessun intervento Netlify produzione prima del 4 dicembre 2026.

## 6. Prossimo passo

Completare la baseline schema-only e la matrice di prerequisiti migration-by-migration. Solo dopo si potrà definire il comando locale esatto per il Profilo A. Il presente documento non autorizza l'avvio dei container né l'applicazione di migrazioni.
