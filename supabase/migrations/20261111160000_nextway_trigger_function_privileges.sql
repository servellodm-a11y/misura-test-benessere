-- NEXTWAY: least-privilege EXECUTE grants for trigger-only functions.
-- Existing triggers remain installed; these functions are not public RPC endpoints.
-- CREATE TRIGGER already required the creating role to have EXECUTE permission.
-- Keep postgres ownership and the existing service_role grant unchanged.

begin;

revoke all on function public.nextway_apply_lead_qualification_v1()
  from public, anon, authenticated;

revoke all on function public.nextway_set_lead_updated_at()
  from public, anon, authenticated;

revoke all on function public.nextway_setter_touch()
  from public, anon, authenticated;

revoke all on function public.nextway_validate_setter_owner()
  from public, anon, authenticated;

commit;
