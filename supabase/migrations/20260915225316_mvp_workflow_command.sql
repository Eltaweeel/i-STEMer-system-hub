-- Server-authorized MVP workflow command.
-- The browser receives only this RPC; agents never receive a database key.
begin;

create function private.create_agent_workflow(
  wanted_tenant uuid,
  command_id uuid,
  idempotency_key text,
  objective_text text,
  input_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
  campaign_id uuid;
  objective_id uuid;
  run_id uuid;
  existing public.command_receipts%rowtype;
  digest text;
begin
  if auth.uid() is null or not private.is_member(wanted_tenant, array['owner','operator']) then
    raise exception 'tenant access denied' using errcode = '42501';
  end if;
  if length(btrim(objective_text)) not between 1 and 8000 then
    raise exception 'invalid objective' using errcode = '22023';
  end if;
  if jsonb_typeof(input_snapshot) <> 'object' or not (input_snapshot ? 'schema_version') then
    raise exception 'invalid input snapshot' using errcode = '22023';
  end if;
  if length(btrim(idempotency_key)) not between 1 and 200 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select m.id into member_id
  from public.memberships m
  where m.tenant_id = wanted_tenant and m.user_id = auth.uid()
    and m.status = 'active' and m.role in ('owner','operator');

  select cr.* into existing
  from public.command_receipts cr
  where cr.tenant_id = wanted_tenant and cr.actor_reference = auth.uid()
    and cr.command_kind = 'create_agent_workflow' and cr.idempotency_key = btrim(idempotency_key);
  if existing.id is not null then
    return existing.result_reference;
  end if;

  digest := encode(extensions.digest(convert_to(input_snapshot::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.campaigns(tenant_id, title, owner_membership_id, status)
    values (wanted_tenant, 'i-STEMer social workflow', member_id, 'draft')
    returning id into campaign_id;
  insert into public.objectives(tenant_id, campaign_id, content, revision)
    values (wanted_tenant, campaign_id, btrim(objective_text), 1)
    returning id into objective_id;
  insert into public.agent_runs(tenant_id, objective_id, requester_membership_id, mode, state, input_snapshot, authorization_version)
    values (wanted_tenant, objective_id, member_id, 'synthetic', 'queued', input_snapshot, 1)
    returning id into run_id;
  insert into public.command_receipts(tenant_id, actor_reference, command_kind, idempotency_key, input_digest, result_reference)
    values (wanted_tenant, auth.uid(), 'create_agent_workflow', btrim(idempotency_key), digest,
      jsonb_build_object('schema_version', 1, 'campaign_id', campaign_id, 'objective_id', objective_id, 'run_id', run_id));
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_workflow_created', run_id, command_id,
      jsonb_build_object('schema_version', 1, 'run_id', run_id, 'idempotency_key', btrim(idempotency_key)));
  return jsonb_build_object('schema_version', 1, 'campaign_id', campaign_id, 'objective_id', objective_id, 'run_id', run_id);
end;
$$;

alter function private.create_agent_workflow(uuid,uuid,text,text,jsonb) owner to postgres;
revoke all on function private.create_agent_workflow(uuid,uuid,text,text,jsonb) from public, anon, service_role;
grant execute on function private.create_agent_workflow(uuid,uuid,text,text,jsonb) to authenticated;

commit;
