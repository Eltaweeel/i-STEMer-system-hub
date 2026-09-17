-- Persist agent outputs as immutable revisions and approval candidates.
begin;

create function private.record_agent_artifacts(
  wanted_tenant uuid,
  wanted_run uuid,
  artifact_payload jsonb,
  approval_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  approval jsonb;
  artifact_id uuid;
  revision_id uuid;
  approval_id uuid;
  digest text;
  stored_artifacts jsonb := '[]'::jsonb;
  stored_approvals jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not private.is_member(wanted_tenant, array['owner','operator']) then
    raise exception 'tenant access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agent_runs r where r.id = wanted_run and r.tenant_id = wanted_tenant) then
    raise exception 'run not found' using errcode = '23503';
  end if;
  if jsonb_typeof(artifact_payload) <> 'array' or jsonb_typeof(approval_payload) <> 'array' then
    raise exception 'invalid artifact payload' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(artifact_payload) loop
    digest := encode(extensions.digest(convert_to((item->'data')::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.artifacts(tenant_id, run_id, type)
      values (wanted_tenant, wanted_run, coalesce(item->>'kind', 'agent_artifact'))
      returning id into artifact_id;
    insert into public.artifact_revisions(tenant_id, artifact_id, revision, content_digest, producer_reference, provenance, qa)
      values (wanted_tenant, artifact_id, 1, digest, coalesce(item->>'produced_by', 'unknown'),
        jsonb_build_object('schema_version', 1, 'agent_artifact_id', item->>'id', 'source_revision_ids', coalesce(item->'source_revision_ids','[]'::jsonb)),
        jsonb_build_object('schema_version', 1, 'status', 'synthetic'))
      returning id into revision_id;
    update public.artifacts set current_revision_id = revision_id where id = artifact_id and tenant_id = wanted_tenant;
    stored_artifacts := stored_artifacts || jsonb_build_object('artifact_id', artifact_id, 'agent_artifact_id', item->>'id', 'revision_id', revision_id, 'content_digest', digest);
  end loop;

  for approval in select value from jsonb_array_elements(approval_payload) loop
    select (entry->>'revision_id')::uuid into revision_id
    from jsonb_array_elements(stored_artifacts) entry
    where entry->>'agent_artifact_id' = approval->>'artifact_id';
    if revision_id is null then raise exception 'approval artifact not found' using errcode = '23503'; end if;
    digest := encode(extensions.digest(convert_to(approval::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.approvals(tenant_id, artifact_revision_id, action_snapshot, action_digest, action_revision, tier, confirmation_required)
      values (wanted_tenant, revision_id,
        jsonb_build_object('schema_version', 1, 'stage', approval->>'stage', 'destination', approval->>'destination', 'artifact_id', approval->>'artifact_id'),
        digest, 1, 1, true) returning id into approval_id;
    stored_approvals := stored_approvals || jsonb_build_object('approval_id', approval_id, 'artifact_id', approval->>'artifact_id', 'revision_id', revision_id, 'stage', approval->>'stage');
  end loop;
  update public.agent_runs set state = 'awaiting_approval' where id = wanted_run and tenant_id = wanted_tenant;
  return jsonb_build_object('schema_version', 1, 'artifacts', stored_artifacts, 'approvals', stored_approvals);
end;
$$;

alter function private.record_agent_artifacts(uuid,uuid,jsonb,jsonb) owner to postgres;
revoke all on function private.record_agent_artifacts(uuid,uuid,jsonb,jsonb) from public, anon, service_role;
grant execute on function private.record_agent_artifacts(uuid,uuid,jsonb,jsonb) to authenticated;

commit;
