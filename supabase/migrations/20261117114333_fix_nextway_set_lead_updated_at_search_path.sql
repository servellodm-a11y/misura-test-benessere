-- NEXTWAY: harden the Lead updated_at trigger function search_path.
-- Applied to Supabase project nextway-platform on 2026-11-17.
-- The trigger only updates NEW.updated_at and resolves built-ins from pg_catalog.

alter function public.nextway_set_lead_updated_at()
  set search_path = pg_catalog, public;
