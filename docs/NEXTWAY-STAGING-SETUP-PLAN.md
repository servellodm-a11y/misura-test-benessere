# NEXTWAY — piano tecnico per ambiente di collaudo isolato

Data: 12 novembre 2026  
Branch di riferimento: `fix/nextway-password-recovery`  
Stato: **piano preparatorio; nessun ambiente creato o collegato**.

## Decisione tecnica

Procedere per priorità:

1. **Prima scelta: Supabase locale**, se il Mac dispone di Docker Desktop (o runtime Docker compatibile) e si riesce a installare/usare Supabase CLI senza costi.
2. **Seconda scelta: progetto Supabase cloud separato**, soltanto dopo aver verificato disponibilità del piano gratuito, limiti e possibili costi nel pannello dell'account. Non creare il progetto in automatico.
3. Non usare il progetto di produzione per test, migrazioni di prova, fixture o prove concorrenti.

## Perché il repository non è ancora pronto per un semplice `supabase start`

La ricognizione del branch rileva:

- manca `supabase/config.toml`, necessario alla normale configurazione CLI locale;
- non è presente un seed locale completo;
- le migrazioni NEXTWAY assumono uno schema applicativo già esistente: per esempio `profiles`, `clients`, `partner_details`, `nextway_leads`, RPC e trigger preesistenti;
- `supabase/deploy/nextway_crm_apply.sql` controlla esplicitamente che esistano `public.nextway_leads`, `public.profiles` e la RPC `nextway_create_lead_with_conversation(...)` prima di applicare il gruppo CRM;
- le migrazioni workspace/KB richiedono anche funzioni, Storage e tabelle preesistenti.

Di conseguenza, aggiungere solo un file di configurazione e lanciare tutte le migrazioni non sarebbe un setup affidabile. Prima serve una baseline schema-only, ricostruita e revisionata senza dati personali.

## Fase 1 — verifica ambiente locale (sola lettura)

Verificare sul Mac, senza installare nulla e senza aprire connessioni remote:

- disponibilità di Docker Desktop/runtime e risposta del comando `docker version`;
- disponibilità di Supabase CLI (`supabase --version`);
- spazio disco sufficiente;
- versione macOS compatibile con le versioni correnti degli strumenti.

Node/npm non risultavano disponibili nella verifica del 12 novembre; Python era 3.9.6. Non presumere che Docker o Supabase CLI siano installati. La verifica deve essere eseguita solo se necessaria e con comandi informativi non distruttivi.

## Fase 2 — costruzione baseline locale

Solo se la Fase 1 è praticabile:

1. aggiungere una configurazione Supabase locale minima, revisionata e dedicata al branch;
2. ottenere una definizione schema-only delle sole tabelle/funzioni/trigger/ruoli/policy necessari, senza righe di utenti, Lead, clienti, partner, conversazioni o documenti;
3. verificare e anonimizzare ogni riferimento a URL, ID progetto, email, nomi, segreti e bucket reali;
4. creare seed esclusivamente sintetici per due partner, due workspace e un platform_admin di test;
5. ordinare le migrazioni candidate in gruppi con prerequisiti espliciti; mantenere separata la migrazione draft `20261105000100_nextway_ai_assistant_foundation.sql`;
6. verificare che le fixture e i test siano confinati al database locale.

Se la baseline non è ricostruibile in modo completo e verificabile, fermarsi: non compensare con copie parziali dello schema.

## Fase 3 — test di conversione

Eseguire i sei casi A–F descritti in `NEXTWAY-CONVERSION-CONCURRENCY-TEST-PLAN.md` con due sessioni PostgreSQL indipendenti e fixture sintetiche. Registrare esito, stati e conteggi; non registrare JWT, claim token o segreti. Ripristinare il solo ambiente locale tra scenari.

## Fase 4 — alternativa cloud isolata

Se il locale non è praticabile:

- verificare nel pannello Supabase se è consentito un secondo progetto sul piano disponibile e quali limiti/costi si applicano;
- ottenere autorizzazione esplicita prima della creazione;
- usare schema-only e fixture sintetiche, mai una copia dei dati personali di produzione;
- controllare l'URL/host del database prima di qualsiasi comando SQL;
- mantenere funzioni, secrets, Auth e Storage separati dalla produzione;
- nessuna email o invito reale: provider email disabilitato o indirizzi sintetici controllati.

## Criteri di stop inderogabili

Fermarsi se:

- non si può identificare con certezza il database isolato;
- la baseline schema-only è incompleta o non verificata;
- una migrazione richiede un oggetto non presente o ha esito inatteso;
- un test tenta di usare un account, una email o un record reale;
- è necessario un upgrade o un pagamento non autorizzato.

## Stato al momento della stesura

- Staging cloud: non documentato e non verificabile dagli strumenti GitHub disponibili.
- Supabase locale: non ancora valutato sul Mac; Docker e CLI non verificati.
- Configurazione CLI e seed: assenti.
- Baseline schema-only: da ricostruire e revisionare.
- Test runtime: non eseguiti.
- Nessuna migrazione applicata, nessun progetto creato, nessun deploy o spesa.


## Addendum operativo — profili locali a risorse ridotte — 13 novembre 2026

### Ambiente Mac rilevato (sola lettura)

Risultati forniti dall'utente il 13 novembre 2026:

- Architettura: Intel `x86_64`.
- RAM fisica: 8 GiB.
- Docker Desktop: 29.9.3; daemon attivo, contesto `desktop-linux`.
- Memoria assegnata alla VM Docker: 3.82 GiB.
- Supabase CLI: 3.1.0.
- Spazio libero sul volume dati: 382 GiB.
- Immagini Docker presenti: 2, per 1.56 GB; nessun container attivo.
- Nessuna installazione o modifica è stata effettuata durante queste verifiche.

### Valutazione risorse

La documentazione CLI Supabase raccomanda almeno 7 GB di RAM assegnata a Docker per avviare l'intero stack. Il Mac dispone di 8 GB fisici e Docker ha 3.82 GiB assegnati: non si deve aumentare ora tale limite né tentare l'avvio completo. Lo spazio disco è adeguato.

### Strategia a profili, non avvio completo

Preparare due profili distinti, da validare prima dell'esecuzione:

1. **Profilo SQL isolato:** mantenere il solo motore PostgreSQL e avviare soltanto i componenti strettamente indispensabili alla baseline schema-only. Scopo: validare struttura, vincoli, funzioni SQL, RLS e concorrenza con sessioni PostgreSQL indipendenti. Questo profilo non certifica Auth, API REST, Storage o Edge Functions.
2. **Profilo integrazione ridotto (eventuale):** attivare solo i servizi necessari ai test applicativi NEXTWAY — Auth, PostgREST, Storage API, gateway ed Edge Runtime — ed escludere i componenti non richiesti, ad esempio Realtime, image proxy, Studio, log/telemetria e connection pooler, se la versione CLI/configurazione lo consente. Avviarlo soltanto dopo aver misurato il profilo SQL e verificato la memoria residua.

La CLI documenta l'opzione `supabase start -x` per escludere servizi; la lista effettivamente supportata deve essere verificata sulla CLI 3.1.0 prima di comporre il comando. Non copiare comandi da versioni diverse senza verifica.

### Dipendenze e baseline

- Il repository continua a non avere `supabase/config.toml` né un seed locale completo.
- Non eseguire `supabase init` direttamente nella cartella di lavoro finché non è stato verificato come preservare integralmente la directory `supabase/` già esistente e il contenuto non tracciato `supabase/.temp/`.
- Prima di avviare un profilo occorre preparare e revisionare `config.toml`, baseline schema-only completa e seed esclusivamente sintetico.
- La baseline deve contenere tutte le dipendenze richieste dalle migrazioni selezionate, comprese le strutture Auth/Storage se referenziate. Un profilo PostgreSQL-only non deve essere usato per dichiarare superati test che richiedono i servizi Auth/Storage.
- Non collegare il progetto locale a un ref remoto; nessun comando `--remote`, `db pull`, `db push`, `link`, deploy o accesso al progetto di produzione in questa fase.

### Prossimo ordine di lavoro

1. Inventariare le dipendenze effettive delle migrazioni e dei test A–F, classificandole per PostgreSQL, Auth, Storage, API e Edge Runtime.
2. Definire il profilo SQL e la lista esatta di esclusione compatibile con CLI 3.1.0.
3. Preparare configurazione e baseline in modo non distruttivo, preservando file esistenti e `.temp/`.
4. Avviare soltanto il profilo SQL locale dopo revisione; misurare memoria e stabilità.
5. Valutare il profilo integrazione ridotto solo se il primo lascia risorse sufficienti.

### Stato aggiornato

- Verifica Docker/CLI: **COMPLETATA**.
- Risorse Mac: **MISURATE**; spazio disco adeguato, RAM insufficiente per il full stack raccomandato.
- Configurazione locale, baseline e seed: **DA PREPARARE**.
- Ambiente locale avviato: **NO**.
- Migrazioni/test runtime: **NON ESEGUITI**.
- Produzione, Netlify, progetto cloud, PR e `main`: **NON MODIFICATI**.


## Riferimento alla matrice servizi — 13 novembre 2026

È stato aggiunto `docs/NEXTWAY-LOCAL-SERVICE-MATRIX.md`, che classifica le dipendenze delle migrazioni e separa il profilo SQL/concorrenza dal profilo di integrazione Auth/API/Storage/Edge Functions. La lista dei servizi da escludere resta candidata e deve essere verificata sulla CLI 3.1.0 prima di qualsiasi avvio. La baseline deve ricostruire anche le dipendenze `auth` e `storage`; non si deve dichiarare un test Auth/Storage superato con il solo PostgreSQL.
