-- NEXTWAY: hardening del search_path della funzione platform-admin.
-- La logica e i privilegi esistenti restano invariati.
-- Preparata sul branch di lavoro; NON applicare al database senza autorizzazione esplicita.

begin;

create or replace function public.nextway_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role::text = 'platform_admin'
    );
$function$;

comment on function public.nextway_is_platform_admin() is
  'Verifica il ruolo platform_admin dell’utente autenticato con search_path fissato a pg_catalog, public.';

commit;
