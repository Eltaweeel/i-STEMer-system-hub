-- Phase B access reopen. Run by the apply tool INSIDE the Phase B transaction, after B1..B6 and before the post-check,
-- so the repaired approval commands and their restored access become visible together, at the single COMMIT. It
-- restores exactly what phase-b-quarantine.sql removed; the post-check then verifies the complete EXECUTE holder sets.
grant execute on function public.approve_agent_revision(uuid,uuid,text) to authenticated;
grant execute on function public.reject_agent_revision(uuid,uuid,text,text) to authenticated;
grant execute on function private.approve_agent_revision(uuid,uuid,text) to authenticated;
grant execute on function private.reject_agent_revision(uuid,uuid,text,text) to authenticated;
