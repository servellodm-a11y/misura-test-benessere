-- NEXTWAY: harden remaining public-only search_path settings on SECURITY DEFINER functions.
-- Applied to Supabase project nextway-platform on 2026-11-17.
-- Application objects and auth.uid() are explicitly schema-qualified.

alter function public.nextway_is_platform_admin()
  set search_path = pg_catalog, public;

alter function public.nextway_save_ai_analysis(
  uuid, text, jsonb, smallint, smallint, smallint, smallint, smallint
)
  set search_path = pg_catalog, public;
