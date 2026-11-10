-- NEXTWAY CRM: estensione controllata delle fasi del ciclo commerciale Lead.
-- I valori esistenti restano validi; nessun record viene convertito o cancellato.
-- Applicare manualmente solo dopo verifica del progetto Supabase corretto.

alter table public.nextway_leads
  drop constraint if exists nextway_leads_status_check;

alter table public.nextway_leads
  add constraint nextway_leads_status_check
  check (status in (
    'Da verificare',
    'Verificato',
    'Contattato',
    'In follow-up',
    'In valutazione',
    'Convertito cliente',
    'Convertito partner',
    'Non interessato',
    'Escluso'
  ));

comment on column public.nextway_leads.status is
  'Fase operativa CRM: verifica, contatto, follow-up, valutazione, conversione o chiusura. La conversione è uno stato CRM e non crea automaticamente un record cliente o partner.';
