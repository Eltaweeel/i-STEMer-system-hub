-- Phase B access quarantine. Applied ALONE, before Phase B, by the apply tool (--quarantine), committed, and left in
-- place until Phase B commits. It stops new calls of the approval decision commands, whose currently applied bodies
-- have NULL-blind owner and assurance checks: PostgreSQL checks EXECUTE when a call starts, so once this commits no
-- session can start one. (A call that was already running is the drain check's job: the Phase B batch refuses to start
-- while any transaction older than itself is still open.) No ledger row: this is not a migration.
--
-- The reviewed holders of EXECUTE on these four functions are `authenticated` and the owner `postgres`
-- (supabase/ops/phase-b-postcheck.sql). Phase B restores `authenticated` in the same transaction as the repaired
-- bodies (phase-b-reopen.sql). If Phase B fails, the quarantine stays: approvals are unavailable, never vulnerable.
revoke execute on function public.approve_agent_revision(uuid,uuid,text) from authenticated;
revoke execute on function public.reject_agent_revision(uuid,uuid,text,text) from authenticated;
revoke execute on function private.approve_agent_revision(uuid,uuid,text) from authenticated;
revoke execute on function private.reject_agent_revision(uuid,uuid,text,text) from authenticated;

do $verify$
declare
  fn text;
begin
  foreach fn in array array['public.approve_agent_revision(uuid,uuid,text)', 'public.reject_agent_revision(uuid,uuid,text,text)',
    'private.approve_agent_revision(uuid,uuid,text)', 'private.reject_agent_revision(uuid,uuid,text,text)'] loop
    if to_regprocedure(fn) is null then raise exception 'phase-b quarantine: % is missing', fn; end if;
    -- Anyone but the owner able to call it, directly or through PUBLIC or a role, means the quarantine is not in effect.
    if exists (select 1 from pg_roles r where r.rolname in ('authenticated', 'anon', 'service_role')
               and has_function_privilege(r.oid, to_regprocedure(fn), 'EXECUTE')) then
      raise exception 'phase-b quarantine: % is still executable by a client role', fn;
    end if;
  end loop;
end $verify$;
