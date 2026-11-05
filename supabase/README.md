# NEXTWAY AI - preparazione Supabase

## Scopo
Questa migrazione aggiunge la tabella `public.nextway_leads` senza alterare le tabelle esistenti `profiles`, `partner_details` e `clients`.

## Regole di accesso
- Ogni partner legge e modifica esclusivamente i lead di cui è proprietario (`owner_profile_id = auth.uid()`).
- `platform_admin` può leggere e gestire tutti i record.
- Gli altri ruoli non ottengono automaticamente visibilità sui lead degli altri partner.
- RLS è abilitata sulla tabella.

## Campi e qualità
La tabella conserva evidenze professionali pubbliche, URL e data di verifica, classificazione e cinque componenti del punteggio (30+20+15+20+15). Il database impedisce punteggi fuori scala, URL duplicati per lo stesso proprietario e qualifiche senza identità confermata e punteggio minimo 50.

## Procedura
1. Aprire il progetto Supabase corretto.
2. Aprire SQL Editor.
3. Incollare ed eseguire `supabase/nextway_leads.sql`.
4. Verificare che `nextway_leads` esista e che RLS sia attiva.
5. Non inserire chiavi Supabase nel repository pubblico.

## Non ancora implementato
Questa migrazione prepara il database, ma non collega ancora le pagine HTML a Supabase. Prima di attivare la sincronizzazione occorre configurare URL e chiave pubblicabile del progetto, autenticazione e testare le policy con due account partner distinti e un account `platform_admin`. Non usare mai la service-role key nel browser.
