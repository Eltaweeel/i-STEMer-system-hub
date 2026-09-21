-- The same NULL-blind shape as the approval gate, found by sweeping for it.
--
-- `select state into current_state ... where id = wanted_run` leaves NULL when
-- no such run exists, and `NULL <> 'failed'` is NULL, which plpgsql's IF treats
-- as false. So `if current_state <> 'failed'` was skipped entirely for a run id
-- matching nothing. The UPDATE that followed touched no row, which hid the
-- consequence: an `agent_workflow_retry_requested` audit entry was written for
-- a run that never existed, and the caller was told the run was queued.
--
-- Nothing was corrupted -- no state changed and the tenant guard above still
-- held, so this was never cross-tenant -- but the audit trail is the record the
-- owner is asked to trust, and an entry for a run that does not exist is worse
-- than a refusal. Reporting 'queued' for a no-op is the same failure in the
-- response.
--
-- `fail_agent_workflow`, defined directly above this one in 20260915230015,
-- already had the correct `is null` guard. Only retry omitted it, which is why
-- the inconsistency went unnoticed inside a single file.
begin;

create or replace function private.retry_agent_workflow(wanted_tenant uuid, wanted_run uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_state text;
begin
  if auth.uid() is null or not private.is_member(wanted_tenant, array['owner','operator']) then raise exception 'tenant access denied' using errcode = '42501'; end if;
  select state into current_state from public.agent_runs where id = wanted_run and tenant_id = wanted_tenant for update;
  -- Absence is its own refusal, and must not depend on a comparison against
  -- NULL to fire. Matches the wording fail_agent_workflow already uses.
  if current_state is null then raise exception 'run not found' using errcode = '23503'; end if;
  if current_state <> 'failed' then raise exception 'only failed runs are retryable' using errcode = '55000'; end if;
  update public.agent_runs set state = 'queued' where id = wanted_run and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_workflow_retry_requested', wanted_run, gen_random_uuid(), jsonb_build_object('schema_version', 1));
  return jsonb_build_object('schema_version', 1, 'run_id', wanted_run, 'status', 'queued');
end;
$$;

commit;
