begin;
grant bagos_reel_analysis_command to postgres;
grant create on schema private to bagos_reel_analysis_command;

grant select, insert on public.command_receipts to bagos_reel_analysis_command;
create policy reel_analysis_receipts_read on public.command_receipts for select to bagos_reel_analysis_command
  using (command_kind = 'complete_reel_analysis_attempt');
create policy reel_analysis_receipts_insert on public.command_receipts for insert to bagos_reel_analysis_command
  with check (command_kind = 'complete_reel_analysis_attempt');
grant execute on function private.research_text_valid(jsonb), private.research_gaps_valid(jsonb) to bagos_reel_analysis_command;

create table public.reel_analysis_outcomes (
  tenant_id uuid not null,
  task_id uuid not null,
  attempt_id uuid primary key,
  artifact_revision_id uuid not null,
  completion_digest private.sha256 not null,
  created_at timestamptz not null default now(),
  unique (tenant_id,task_id),
  foreign key (tenant_id,task_id) references public.reel_analysis_tasks(tenant_id,id),
  foreign key (tenant_id,attempt_id) references public.reel_analysis_attempts(tenant_id,id),
  foreign key (tenant_id,artifact_revision_id) references public.artifact_revisions(tenant_id,id)
);
create index reel_analysis_outcomes_revision_idx on public.reel_analysis_outcomes(tenant_id,artifact_revision_id);
alter table public.reel_analysis_outcomes enable row level security;
alter table public.reel_analysis_outcomes force row level security;
revoke all on public.reel_analysis_outcomes from public, anon, authenticated, service_role, bagos_reel_analyst_executor;
grant select on public.reel_analysis_outcomes to authenticated;
create policy reel_analysis_outcomes_read on public.reel_analysis_outcomes for select to authenticated using (private.is_member(tenant_id));
grant select, insert on public.reel_analysis_outcomes to bagos_reel_analysis_command;
create policy reel_analysis_outcomes_command_read on public.reel_analysis_outcomes for select to bagos_reel_analysis_command using (true);
create policy reel_analysis_outcomes_command_insert on public.reel_analysis_outcomes for insert to bagos_reel_analysis_command with check (true);
create trigger no_update before update on public.reel_analysis_outcomes for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.reel_analysis_outcomes for each row execute function private.reject_mutation();

create function private.reel_analysis_modalities_valid(candidate jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(candidate) is distinct from 'array' then false else
    jsonb_array_length(candidate) <= 5
    and (select count(distinct m) from jsonb_array_elements(candidate) m) = jsonb_array_length(candidate)
    and not exists (select 1 from jsonb_array_elements(candidate) m
      where jsonb_typeof(m) <> 'string' or m #>> '{}' not in ('video_frames','audio','transcript','metadata_only','text_only_source')) end;
$$;
revoke all on function private.reel_analysis_modalities_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.reel_analysis_modalities_valid(jsonb) to bagos_reel_analysis_command;

create function private.validate_reel_analysis_completion(
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
  if jsonb_array_length(brief->'suppliedModalities') = 0 then
    raise exception 'uninspected_modality' using errcode = '22023';
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
revoke all on function private.validate_reel_analysis_completion(public.reel_analysis_tasks,public.reel_analysis_attempts,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.validate_reel_analysis_completion(public.reel_analysis_tasks,public.reel_analysis_attempts,jsonb)
  to bagos_reel_analysis_command;

create function private.complete_reel_analysis_attempt(wanted_attempt uuid, artifact jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; attempt public.reel_analysis_attempts%rowtype; task public.reel_analysis_tasks%rowtype;
  digest text; artifact_id uuid; revision_id uuid; command_result jsonb; receipt public.command_receipts%rowtype;
begin
  select tenant_id into tenant from private.reel_analysis_brand_binding where singleton;
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into attempt from public.reel_analysis_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  select * into task from public.reel_analysis_tasks where tenant_id = tenant and id = attempt.task_id;
  if not exists (select 1 from public.memberships where tenant_id = tenant and user_id = task.requester_id and status = 'active' and role in ('owner','operator')) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  perform private.validate_reel_analysis_completion(task,attempt,artifact);
  digest := encode(sha256(convert_to(artifact::text,'UTF8')),'hex');
  select * into receipt from public.command_receipts where tenant_id = tenant and actor_reference = task.requester_id
    and command_kind = 'complete_reel_analysis_attempt' and idempotency_key = wanted_attempt::text;
  if found then
    if receipt.input_digest <> digest then raise exception 'idempotency_conflict' using errcode = '22023'; end if;
    return receipt.result_reference::jsonb - 'schema_version';
  end if;
  if attempt.state <> 'running' or attempt.expires_at <= clock_timestamp()
    or exists (select 1 from public.reel_analysis_attempts a where a.tenant_id = tenant and a.task_id = task.id and a.attempt_number > attempt.attempt_number) then
    raise exception 'stale_attempt' using errcode = '55000';
  end if;
  insert into public.artifacts(tenant_id,run_id,type) values (tenant,attempt.run_id,'reel_analysis_evidence') returning id into artifact_id;
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (tenant,artifact_id,1,encode(sha256(convert_to(artifact::text,'UTF8')),'hex'),'reel_analyst',
      jsonb_build_object('schema_version',1,'task_id',task.id,'attempt_id',wanted_attempt,'source_revision_ids',jsonb_build_array(artifact->'sourceRevisionId')),
      jsonb_build_object('schema_version',1,'status','supplied_modalities_validated')) returning id into revision_id;
  insert into public.reel_analysis_revision_bodies(tenant_id,revision_id,body) values (tenant,revision_id,artifact);
  update public.artifacts set current_revision_id = revision_id where id = artifact_id and tenant_id = tenant;
  insert into public.reel_analysis_outcomes(tenant_id,task_id,attempt_id,artifact_revision_id,completion_digest)
    values (tenant,task.id,wanted_attempt,revision_id,digest);
  update public.reel_analysis_attempts set state = 'succeeded', finished_at = clock_timestamp()
    where id = wanted_attempt and state = 'running' and expires_at > clock_timestamp();
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.agent_runs set state = 'succeeded' where tenant_id = tenant and id = attempt.run_id and state = 'running';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'agent',task.id,'reel_analysis_attempt_completed',artifact_id,wanted_attempt,
      jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt,'revision_id',revision_id));
  command_result := jsonb_build_object('status','succeeded','runId',attempt.run_id,'attemptId',wanted_attempt,'revisionId',revision_id);
  insert into public.command_receipts(tenant_id,actor_reference,command_kind,idempotency_key,input_digest,result_reference)
    values (tenant,task.requester_id,'complete_reel_analysis_attempt',wanted_attempt::text,digest,
      command_result || jsonb_build_object('schema_version',1));
  return command_result;
end $$;
alter function private.complete_reel_analysis_attempt(uuid,jsonb) owner to bagos_reel_analysis_command;
revoke all on function private.complete_reel_analysis_attempt(uuid,jsonb) from public, anon, authenticated, service_role, bagos_reel_analyst_executor;
grant execute on function private.complete_reel_analysis_attempt(uuid,jsonb) to bagos_reel_analyst_executor;
revoke create on schema private from bagos_reel_analysis_command;
revoke bagos_reel_analysis_command from postgres;
commit;
