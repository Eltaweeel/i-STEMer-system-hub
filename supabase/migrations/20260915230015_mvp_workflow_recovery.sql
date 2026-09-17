-- Durable failure and retry transitions for the workflow run.
begin;

create function private.fail_agent_workflow(wanted_tenant uuid, wanted_run uuid, failure jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_state text;
begin
  if auth.uid() is null or not private.is_member(wanted_tenant, array['owner','operator']) then raise exception 'tenant access denied' using errcode = '42501'; end if;
  if jsonb_typeof(failure) <> 'object' or not (failure ? 'schema_version') then raise exception 'invalid failure' using errcode = '22023'; end if;
  select state into current_state from public.agent_runs where id = wanted_run and tenant_id = wanted_tenant for update;
  if current_state is null then raise exception 'run not found' using errcode = '23503'; end if;
  if current_state in ('succeeded','cancelled') then raise exception 'run is not recoverable' using errcode = '55000'; end if;
  update public.agent_runs set state = 'failed', input_snapshot = input_snapshot || jsonb_build_object('last_failure', failure) where id = wanted_run and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, command_id, evidence)
    values (wanted_tenant, 'system', auth.uid(), 'agent_workflow_failed', wanted_run, gen_random_uuid(), jsonb_build_object('schema_version', 1, 'failure', failure));
  return jsonb_build_object('schema_version', 1, 'run_id', wanted_run, 'status', 'failed');
end;
$$;

create function private.retry_agent_workflow(wanted_tenant uuid, wanted_run uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_state text;
begin
  if auth.uid() is null or not private.is_member(wanted_tenant, array['owner','operator']) then raise exception 'tenant access denied' using errcode = '42501'; end if;
  select state into current_state from public.agent_runs where id = wanted_run and tenant_id = wanted_tenant for update;
  if current_state <> 'failed' then raise exception 'only failed runs are retryable' using errcode = '55000'; end if;
  update public.agent_runs set state = 'queued' where id = wanted_run and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_workflow_retry_requested', wanted_run, gen_random_uuid(), jsonb_build_object('schema_version', 1));
  return jsonb_build_object('schema_version', 1, 'run_id', wanted_run, 'status', 'queued');
end;
$$;

alter function private.fail_agent_workflow(uuid,uuid,jsonb) owner to postgres;
alter function private.retry_agent_workflow(uuid,uuid) owner to postgres;
revoke all on function private.fail_agent_workflow(uuid,uuid,jsonb), private.retry_agent_workflow(uuid,uuid) from public, anon, service_role;
grant execute on function private.fail_agent_workflow(uuid,uuid,jsonb), private.retry_agent_workflow(uuid,uuid) to authenticated;

commit;
