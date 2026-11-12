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
