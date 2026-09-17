-- MVP security hardening.
--
-- These objects are server-side control-plane state.  The browser must use an
-- authenticated, tenant-authorized command endpoint; it must never write
-- receipts, platform audit records, or provisioning state directly.

-- Supabase's optional auto-RLS event-trigger helper is not an application RPC.
-- Keep it unreachable through the Data API when it exists on the project.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end $$;

-- RLS is already enabled and forced by Phase 1A.  Explicit deny policies make
-- the intended client boundary visible to advisors and future maintainers.
create policy command_receipts_client_deny on public.command_receipts
  as restrictive for all to anon, authenticated using (false) with check (false);

create policy platform_audit_client_deny on private.platform_audit
  as restrictive for all to anon, authenticated using (false) with check (false);

create policy provisioning_operations_client_deny on private.provisioning_operations
  as restrictive for all to anon, authenticated using (false) with check (false);

-- The agent transport remains server-to-server.  No browser-facing grants,
-- service credentials, publication permissions, or external side effects are
-- introduced by this migration.
