-- Upstream evidence travels with the lease. Ziad's and Nour's briefs name the
-- upstream artifact revision by id only, so both agents were being asked to
-- reason over a bare UUID. The claim commands now read the upstream body
-- server-side -- under the same tenant lock, in the same transaction as the
-- attempt they issue -- and return it as 'sourceArtifact' alongside the task.
-- No new authority is created: the host still decides what an agent may see.
begin;
grant bagos_reel_analysis_command to postgres;
grant bagos_content_calendar_command to postgres;
grant create on schema private to bagos_reel_analysis_command;
grant create on schema private to bagos_content_calendar_command;

-- Exactly one extra cross-domain read each, in the shape 20260918070000
-- established for public.agent_tasks: a table-level select plus a policy for
-- that one command role. Neither role gains insert, update or delete, and
-- bagos_research_command / bagos_reel_analysis_command lose nothing and gain
-- nothing downstream. Every read below is still tenant-scoped in SQL.
grant select on public.research_revision_bodies to bagos_reel_analysis_command;
create policy reel_analysis_command_omar_bodies_read on public.research_revision_bodies
  for select to bagos_reel_analysis_command using (true);
grant select on public.reel_analysis_revision_bodies to bagos_content_calendar_command;
create policy content_calendar_command_ziad_bodies_read on public.reel_analysis_revision_bodies
  for select to bagos_content_calendar_command using (true);

create or replace function private.claim_reel_analysis_task() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; chosen public.reel_analysis_tasks%rowtype; previous public.reel_analysis_attempts%rowtype;
  attempt uuid; attempt_no integer; issued timestamptz; expires timestamptz; failure text; brief jsonb;
  source_artifact jsonb;
begin
  select tenant_id into tenant from private.reel_analysis_brand_binding where singleton;
  if tenant is null then raise exception 'reel_analysis_not_configured' using errcode = '55000'; end if;
  -- All reel_analysis commands acquire tenant then run/attempt locks in this order.
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then return null; end if;
  select t.* into chosen from public.reel_analysis_tasks t join public.agent_runs r on (r.tenant_id,r.id) = (t.tenant_id,t.run_id)
    where t.tenant_id = tenant and r.mode = 'reel_analysis' and (r.state = 'queued' or (r.state = 'running' and exists (
      select 1 from public.reel_analysis_attempts a where a.tenant_id = tenant and a.task_id = t.id and a.state = 'running' and a.expires_at <= clock_timestamp())))
    order by t.created_at,t.id limit 1 for update of r;
  if not found then return null; end if;
  select * into previous from public.reel_analysis_attempts where tenant_id = tenant and task_id = chosen.id order by attempt_number desc limit 1 for update;
  if previous.state = 'running' then
    update public.reel_analysis_attempts set state = 'failed', finished_at = clock_timestamp(), error_code = 'timeout', retryable = (attempt_number < 3)
      where id = previous.id;
    update public.agent_runs set state = 'failed' where id = chosen.run_id and tenant_id = tenant;
    insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
      values (tenant,'system',chosen.requester_id,'reel_analysis_lease_expired',chosen.id,previous.id,jsonb_build_object('schema_version',1,'attempt_id',previous.id));
    return jsonb_build_object('status','failed','runId',chosen.run_id,'code','timeout');
  end if;
  attempt_no := coalesce(previous.attempt_number,0) + 1;
  if attempt_no > 3 then raise exception 'attempt_limit' using errcode = '55000'; end if;
  issued := clock_timestamp(); expires := issued + interval '5 minutes'; attempt := gen_random_uuid();
  if not exists (select 1 from public.memberships where tenant_id = tenant and user_id = chosen.requester_id and status = 'active' and role in ('owner','operator')) then
    failure := 'unauthorized';
  end if;
  insert into public.reel_analysis_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at,finished_at,error_code)
    values (attempt,tenant,chosen.id,chosen.run_id,attempt_no,case when failure is null then 'running' else 'failed' end,
      issued,expires,case when failure is null then null else issued end,failure);
  update public.agent_runs set state = case when failure is null then 'running' else 'failed' end where id = chosen.run_id and tenant_id = tenant;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'system',chosen.requester_id,case when failure is null then 'reel_analysis_attempt_started' else 'reel_analysis_authorization_revoked' end,
      chosen.id,attempt,jsonb_build_object('schema_version',1,'attempt_id',attempt));
  if failure is not null then return jsonb_build_object('status','failed','runId',chosen.run_id,'code',failure); end if;
  select body->'brief' into brief from public.reel_analysis_revision_bodies where tenant_id = tenant and revision_id = chosen.brief_revision_id;
  if brief is null then raise exception 'missing_brief' using errcode = '55000'; end if;
  -- Lease identity belongs to the host, never to a stored or caller-supplied brief.
  brief := brief || jsonb_build_object('contractVersion','reel-analysis.v1','tenantId',tenant,
    'taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,'liveEffects',false);
  -- Ziad analyzes Omar's evidence, so the evidence itself has to travel with
  -- the lease; the brief only names its revision. Reading the body here keeps
  -- the choice of what Ziad may see on the host side of the trust boundary,
  -- and the tenant filter keeps a stored revision id from reaching across
  -- brands. Like missing_brief and missing_lineage, an absent body is fatal:
  -- an empty stand-in would invite analysis of evidence that does not exist.
  select body into source_artifact from public.research_revision_bodies
    where tenant_id = tenant and revision_id = (brief->>'sourceRevisionId')::uuid;
  if source_artifact is null then raise exception 'missing_source_artifact' using errcode = '55000'; end if;
  return jsonb_build_object('status','claimed','task',jsonb_build_object(
    'contractVersion','reel-analysis.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,'tenantId',tenant,
    'requesterId',chosen.requester_id,'agentId','reel_analyst','allowedScope',jsonb_build_array('reel-analysis:read'),
    'issuedAt',issued,'expiresAt',expires,'brief',brief,'liveEffects',false),
    'handoff',jsonb_build_object('contractVersion','reel-analysis.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,
      'tenantId',tenant,'fromAgentId','orchestrator','toAgentId','reel_analyst','inputRevisionIds',jsonb_build_array(brief->'sourceRevisionId'),'liveEffects',false),
    'sourceArtifact',source_artifact);
end $$;

create or replace function private.claim_content_calendar_task() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; chosen public.content_calendar_tasks%rowtype; previous public.content_calendar_attempts%rowtype;
  attempt uuid; attempt_no integer; issued timestamptz; expires timestamptz; failure text; brief jsonb;
  upstream_ids jsonb; input_revision_ids jsonb; source_artifact jsonb;
begin
  select tenant_id into tenant from private.content_calendar_brand_binding where singleton;
  if tenant is null then raise exception 'content_calendar_not_configured' using errcode = '55000'; end if;
  -- All content_calendar commands acquire tenant then run/attempt locks in this order.
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then return null; end if;
  select t.* into chosen from public.content_calendar_tasks t join public.agent_runs r on (r.tenant_id,r.id) = (t.tenant_id,t.run_id)
    where t.tenant_id = tenant and r.mode = 'content_calendar' and (r.state = 'queued' or (r.state = 'running' and exists (
      select 1 from public.content_calendar_attempts a where a.tenant_id = tenant and a.task_id = t.id and a.state = 'running' and a.expires_at <= clock_timestamp())))
    order by t.created_at,t.id limit 1 for update of r;
  if not found then return null; end if;
  select * into previous from public.content_calendar_attempts where tenant_id = tenant and task_id = chosen.id order by attempt_number desc limit 1 for update;
  if previous.state = 'running' then
    update public.content_calendar_attempts set state = 'failed', finished_at = clock_timestamp(), error_code = 'timeout', retryable = (attempt_number < 3)
      where id = previous.id;
    update public.agent_runs set state = 'failed' where id = chosen.run_id and tenant_id = tenant;
    insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
      values (tenant,'system',chosen.requester_id,'content_calendar_lease_expired',chosen.id,previous.id,jsonb_build_object('schema_version',1,'attempt_id',previous.id));
    return jsonb_build_object('status','failed','runId',chosen.run_id,'code','timeout');
  end if;
  attempt_no := coalesce(previous.attempt_number,0) + 1;
  if attempt_no > 3 then raise exception 'attempt_limit' using errcode = '55000'; end if;
  issued := clock_timestamp(); expires := issued + interval '5 minutes'; attempt := gen_random_uuid();
  if not exists (select 1 from public.memberships where tenant_id = tenant and user_id = chosen.requester_id and status = 'active' and role in ('owner','operator')) then
    failure := 'unauthorized';
  end if;
  insert into public.content_calendar_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at,finished_at,error_code)
    values (attempt,tenant,chosen.id,chosen.run_id,attempt_no,case when failure is null then 'running' else 'failed' end,
      issued,expires,case when failure is null then null else issued end,failure);
  update public.agent_runs set state = case when failure is null then 'running' else 'failed' end where id = chosen.run_id and tenant_id = tenant;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'system',chosen.requester_id,case when failure is null then 'content_calendar_attempt_started' else 'content_calendar_authorization_revoked' end,
      chosen.id,attempt,jsonb_build_object('schema_version',1,'attempt_id',attempt));
  if failure is not null then return jsonb_build_object('status','failed','runId',chosen.run_id,'code',failure); end if;
  select body->'brief' into brief from public.content_calendar_revision_bodies where tenant_id = tenant and revision_id = chosen.brief_revision_id;
  if brief is null then raise exception 'missing_brief' using errcode = '55000'; end if;
  -- Lease identity belongs to the host, never to a stored or caller-supplied brief.
  brief := brief || jsonb_build_object('contractVersion','content-calendar.v1','tenantId',tenant,
    'taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,'liveEffects',false);
  -- The brief only names Ziad's revision directly; Omar's revision is recovered
  -- from Ziad's own provenance rather than duplicated into every calendar brief.
  select provenance->'source_revision_ids' into upstream_ids from public.artifact_revisions
    where tenant_id = tenant and id = (brief->>'sourceRevisionId')::uuid;
  if upstream_ids is null then raise exception 'missing_lineage' using errcode = '55000'; end if;
  input_revision_ids := upstream_ids || jsonb_build_array(brief->'sourceRevisionId');
  -- Nour plans from Ziad's analysis, so that analysis travels with the lease
  -- for the same reason Omar's evidence travels with Ziad's; see the comment
  -- in private.claim_reel_analysis_task().
  select body into source_artifact from public.reel_analysis_revision_bodies
    where tenant_id = tenant and revision_id = (brief->>'sourceRevisionId')::uuid;
  if source_artifact is null then raise exception 'missing_source_artifact' using errcode = '55000'; end if;
  return jsonb_build_object('status','claimed','task',jsonb_build_object(
    'contractVersion','content-calendar.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,'tenantId',tenant,
    'requesterId',chosen.requester_id,'agentId','content_creator','allowedScope',jsonb_build_array('content-calendar:write'),
    'issuedAt',issued,'expiresAt',expires,'brief',brief,'liveEffects',false),
    'handoff',jsonb_build_object('contractVersion','content-calendar.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,
      'tenantId',tenant,'fromAgentId','orchestrator','toAgentId','content_creator','inputRevisionIds',input_revision_ids,'liveEffects',false),
    'sourceArtifact',source_artifact);
end $$;

-- "Nothing was inspectable" is an honest result, not a failed attempt. The
-- previous blanket refusal of an empty suppliedModalities made it impossible
-- to record one, which stranded every downstream task behind a brief that
-- carries no media. Dropping that one branch does not let a fabricated
-- finding through: findings are still confined to inspectedModalities,
-- inspectedModalities is still confined to suppliedModalities, and
-- unavailableModalities must still cover exactly the requested modalities
-- that were not inspected -- so an empty supply can only ever yield an
-- artifact with no findings and every requested modality reported unavailable.
create or replace function private.validate_reel_analysis_completion(
  task public.reel_analysis_tasks, attempt public.reel_analysis_attempts, artifact jsonb
) returns void language plpgsql set search_path = '' as $$
declare brief jsonb; entry jsonb; unavailable jsonb; missing jsonb; binding jsonb;
  binding_keys text[] := array['contractVersion','tenantId','taskId','runId','attemptId','liveEffects','sourceRevisionId'];
  artifact_keys text[] := binding_keys || array['producedBy','inspectedModalities','findings','unavailableModalities'];
  finding_keys text[] := binding_keys || array['modality','observation','interpretation','confidence','gaps'];
  unavailable_keys text[] := binding_keys || array['modality','reason'];
begin
  if artifact is null or jsonb_typeof(artifact) is distinct from 'object' or octet_length(artifact::text) > 1048576 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  select body->'brief' into brief from public.reel_analysis_revision_bodies
    where tenant_id = task.tenant_id and revision_id = task.brief_revision_id;
  if brief is null or not private.reel_analysis_modalities_valid(brief->'requestedModalities')
    or not private.reel_analysis_modalities_valid(brief->'suppliedModalities')
    or jsonb_array_length(brief->'requestedModalities') = 0
    or not ((brief->'requestedModalities') @> (brief->'suppliedModalities'))
    or jsonb_typeof(brief->'sourceRevisionId') is distinct from 'string'
    or coalesce(brief->>'sourceRevisionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  binding := jsonb_build_object('contractVersion','reel-analysis.v1','tenantId',task.tenant_id,
    'taskId',task.id,'runId',task.run_id,'attemptId',attempt.id,'liveEffects',false,'sourceRevisionId',brief->'sourceRevisionId');
  if not (artifact ?& artifact_keys) or artifact - artifact_keys <> '{}'::jsonb
    or not (artifact @> binding) or artifact->>'producedBy' is distinct from 'reel_analyst'
    or not private.reel_analysis_modalities_valid(artifact->'inspectedModalities')
    or jsonb_typeof(artifact->'findings') is distinct from 'array'
    or jsonb_typeof(artifact->'unavailableModalities') is distinct from 'array' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if jsonb_array_length(artifact->'findings') > 100 or jsonb_array_length(artifact->'unavailableModalities') > 5 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if not ((brief->'suppliedModalities') @> (artifact->'inspectedModalities')) then
    raise exception 'uninspected_modality' using errcode = '22023';
  end if;
  for entry in select jsonb_array_elements(artifact->'findings') loop
    if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& finding_keys) or entry - finding_keys <> '{}'::jsonb
      or not (entry @> binding) or not private.research_text_valid(entry->'observation')
      or (entry->'interpretation' is distinct from 'null'::jsonb and not private.research_text_valid(entry->'interpretation'))
      or coalesce(entry->>'confidence','') not in ('low','medium','high') or not private.research_gaps_valid(entry->'gaps') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
    if not (artifact->'inspectedModalities' @> jsonb_build_array(entry->'modality')) then
      raise exception 'uninspected_modality' using errcode = '22023';
    end if;
  end loop;
  for entry in select jsonb_array_elements(artifact->'unavailableModalities') loop
    if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& unavailable_keys) or entry - unavailable_keys <> '{}'::jsonb
      or not (entry @> binding) or not private.research_text_valid(entry->'reason') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
  end loop;
  select coalesce(jsonb_agg(e->'modality'),'[]'::jsonb) into unavailable from jsonb_array_elements(artifact->'unavailableModalities') e;
  select coalesce(jsonb_agg(m),'[]'::jsonb) into missing from jsonb_array_elements(brief->'requestedModalities') m
    where not (artifact->'inspectedModalities' @> jsonb_build_array(m));
  if not private.reel_analysis_modalities_valid(unavailable) or not (missing @> unavailable and unavailable @> missing) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
end $$;

-- Replacement keeps the original owner and ACL; restating both makes the
-- role separation these commands depend on readable without cross-referencing
-- the migrations that created them.
alter function private.claim_reel_analysis_task() owner to bagos_reel_analysis_command;
alter function private.claim_content_calendar_task() owner to bagos_content_calendar_command;
revoke all on function private.claim_reel_analysis_task() from public, anon, authenticated, service_role, bagos_reel_analyst_executor;
revoke all on function private.claim_content_calendar_task() from public, anon, authenticated, service_role, bagos_content_calendar_executor;
grant execute on function private.claim_reel_analysis_task() to bagos_reel_analyst_executor;
grant execute on function private.claim_content_calendar_task() to bagos_content_calendar_executor;
revoke all on function private.validate_reel_analysis_completion(public.reel_analysis_tasks,public.reel_analysis_attempts,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.validate_reel_analysis_completion(public.reel_analysis_tasks,public.reel_analysis_attempts,jsonb)
  to bagos_reel_analysis_command;

revoke create on schema private from bagos_reel_analysis_command;
revoke create on schema private from bagos_content_calendar_command;
revoke bagos_reel_analysis_command from postgres;
revoke bagos_content_calendar_command from postgres;
commit;
