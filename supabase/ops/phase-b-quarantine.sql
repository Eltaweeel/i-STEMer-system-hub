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
    -- The owner must be the only holder of EXECUTE: no PUBLIC and no other role, client or not.
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = to_regprocedure(fn) and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner) then
      raise exception 'phase-b quarantine: % is still executable by a role other than its owner', fn;
    end if;
  end loop;
end $verify$;
