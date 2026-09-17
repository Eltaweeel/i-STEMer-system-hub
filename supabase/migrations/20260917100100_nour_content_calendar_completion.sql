begin;
grant bagos_content_calendar_command to postgres;
grant create on schema private to bagos_content_calendar_command;

grant select, insert on public.command_receipts to bagos_content_calendar_command;
create policy content_calendar_receipts_read on public.command_receipts for select to bagos_content_calendar_command
  using (command_kind = 'complete_content_calendar_attempt');
create policy content_calendar_receipts_insert on public.command_receipts for insert to bagos_content_calendar_command
  with check (command_kind = 'complete_content_calendar_attempt');
grant execute on function private.research_text_valid(jsonb) to bagos_content_calendar_command;

create table public.content_calendar_outcomes (
  tenant_id uuid not null,
  task_id uuid not null,
  attempt_id uuid primary key,
  artifact_revision_id uuid not null,
  completion_digest private.sha256 not null,
  created_at timestamptz not null default now(),
  unique (tenant_id,task_id),
  foreign key (tenant_id,task_id) references public.content_calendar_tasks(tenant_id,id),
  foreign key (tenant_id,attempt_id) references public.content_calendar_attempts(tenant_id,id),
  foreign key (tenant_id,artifact_revision_id) references public.artifact_revisions(tenant_id,id)
);
create index content_calendar_outcomes_revision_idx on public.content_calendar_outcomes(tenant_id,artifact_revision_id);
alter table public.content_calendar_outcomes enable row level security;
alter table public.content_calendar_outcomes force row level security;
revoke all on public.content_calendar_outcomes from public, anon, authenticated, service_role, bagos_content_calendar_executor;
grant select on public.content_calendar_outcomes to authenticated;
create policy content_calendar_outcomes_read on public.content_calendar_outcomes for select to authenticated using (private.is_member(tenant_id));
grant select, insert on public.content_calendar_outcomes to bagos_content_calendar_command;
create policy content_calendar_outcomes_command_read on public.content_calendar_outcomes for select to bagos_content_calendar_command using (true);
create policy content_calendar_outcomes_command_insert on public.content_calendar_outcomes for insert to bagos_content_calendar_command with check (true);
create trigger no_update before update on public.content_calendar_outcomes for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.content_calendar_outcomes for each row execute function private.reject_mutation();

create function private.content_calendar_platforms_valid(candidate jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(candidate) is distinct from 'array' then false else
    jsonb_array_length(candidate) between 1 and 2
    and (select count(distinct p) from jsonb_array_elements(candidate) p) = jsonb_array_length(candidate)
    and not exists (select 1 from jsonb_array_elements(candidate) p
      where jsonb_typeof(p) <> 'string' or p #>> '{}' not in ('instagram','facebook')) end;
$$;
revoke all on function private.content_calendar_platforms_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.content_calendar_platforms_valid(jsonb) to bagos_content_calendar_command;

create function private.validate_content_calendar_completion(
  task public.content_calendar_tasks, attempt public.content_calendar_attempts, artifact jsonb
) returns void language plpgsql set search_path = '' as $$
declare brief jsonb; entry jsonb; binding jsonb; day_indexes jsonb;
  binding_keys text[] := array['contractVersion','tenantId','taskId','runId','attemptId','liveEffects','sourceRevisionId'];
  artifact_keys text[] := binding_keys || array['producedBy','entries'];
  entry_keys text[] := binding_keys || array['dayIndex','platform','format','conceptTitle'];
begin
  if artifact is null or jsonb_typeof(artifact) is distinct from 'object' or octet_length(artifact::text) > 1048576 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  select body->'brief' into brief from public.content_calendar_revision_bodies
    where tenant_id = task.tenant_id and revision_id = task.brief_revision_id;
  if brief is null or not private.content_calendar_platforms_valid(brief->'requestedPlatforms')
    or jsonb_typeof(brief->'sourceRevisionId') is distinct from 'string'
    or coalesce(brief->>'sourceRevisionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  binding := jsonb_build_object('contractVersion','content-calendar.v1','tenantId',task.tenant_id,
    'taskId',task.id,'runId',task.run_id,'attemptId',attempt.id,'liveEffects',false,'sourceRevisionId',brief->'sourceRevisionId');
  if not (artifact ?& artifact_keys) or artifact - artifact_keys <> '{}'::jsonb
    or not (artifact @> binding) or artifact->>'producedBy' is distinct from 'content_creator'
    or jsonb_typeof(artifact->'entries') is distinct from 'array' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if jsonb_array_length(artifact->'entries') <> 7 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  for entry in select jsonb_array_elements(artifact->'entries') loop
    -- A whitelist membership check on the raw text avoids ever casting an
    -- attacker-controlled jsonb number to int inside a boolean OR chain,
    -- whose operand evaluation order Postgres does not guarantee.
    if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& entry_keys) or entry - entry_keys <> '{}'::jsonb
      or not (entry @> binding) or coalesce(entry->>'format','') not in ('post','reel','story','carousel')
      or not private.research_text_valid(entry->'conceptTitle')
      or jsonb_typeof(entry->'dayIndex') is distinct from 'number'
      or coalesce(entry->>'dayIndex','') not in ('0','1','2','3','4','5','6') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
    if coalesce(entry->>'platform','') not in ('instagram','facebook') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
    if not (brief->'requestedPlatforms' @> jsonb_build_array(entry->'platform')) then
      raise exception 'unrequested_platform' using errcode = '22023';
    end if;
  end loop;
  select coalesce(jsonb_agg(distinct e->'dayIndex'),'[]'::jsonb) into day_indexes from jsonb_array_elements(artifact->'entries') e;
  if jsonb_array_length(day_indexes) <> 7 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
end $$;
revoke all on function private.validate_content_calendar_completion(public.content_calendar_tasks,public.content_calendar_attempts,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.validate_content_calendar_completion(public.content_calendar_tasks,public.content_calendar_attempts,jsonb)
  to bagos_content_calendar_command;

create function private.complete_content_calendar_attempt(wanted_attempt uuid, artifact jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; attempt public.content_calendar_attempts%rowtype; task public.content_calendar_tasks%rowtype;
  digest text; artifact_id uuid; revision_id uuid; command_result jsonb; receipt public.command_receipts%rowtype;
begin
  select tenant_id into tenant from private.content_calendar_brand_binding where singleton;
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into attempt from public.content_calendar_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  select * into task from public.content_calendar_tasks where tenant_id = tenant and id = attempt.task_id;
  if not exists (select 1 from public.memberships where tenant_id = tenant and user_id = task.requester_id and status = 'active' and role in ('owner','operator')) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  perform private.validate_content_calendar_completion(task,attempt,artifact);
  digest := encode(sha256(convert_to(artifact::text,'UTF8')),'hex');
  select * into receipt from public.command_receipts where tenant_id = tenant and actor_reference = task.requester_id
    and command_kind = 'complete_content_calendar_attempt' and idempotency_key = wanted_attempt::text;
  if found then
    if receipt.input_digest <> digest then raise exception 'idempotency_conflict' using errcode = '22023'; end if;
    return receipt.result_reference::jsonb - 'schema_version';
  end if;
  if attempt.state <> 'running' or attempt.expires_at <= clock_timestamp()
    or exists (select 1 from public.content_calendar_attempts a where a.tenant_id = tenant and a.task_id = task.id and a.attempt_number > attempt.attempt_number) then
    raise exception 'stale_attempt' using errcode = '55000';
  end if;
  insert into public.artifacts(tenant_id,run_id,type) values (tenant,attempt.run_id,'content_calendar_evidence') returning id into artifact_id;
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (tenant,artifact_id,1,encode(sha256(convert_to(artifact::text,'UTF8')),'hex'),'content_creator',
      jsonb_build_object('schema_version',1,'task_id',task.id,'attempt_id',wanted_attempt,'source_revision_ids',jsonb_build_array(artifact->'sourceRevisionId')),
      jsonb_build_object('schema_version',1,'status','requested_platforms_validated')) returning id into revision_id;
  insert into public.content_calendar_revision_bodies(tenant_id,revision_id,body) values (tenant,revision_id,artifact);
  update public.artifacts set current_revision_id = revision_id where id = artifact_id and tenant_id = tenant;
  insert into public.content_calendar_outcomes(tenant_id,task_id,attempt_id,artifact_revision_id,completion_digest)
    values (tenant,task.id,wanted_attempt,revision_id,digest);
  update public.content_calendar_attempts set state = 'succeeded', finished_at = clock_timestamp()
    where id = wanted_attempt and state = 'running' and expires_at > clock_timestamp();
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.agent_runs set state = 'succeeded' where tenant_id = tenant and id = attempt.run_id and state = 'running';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'agent',task.id,'content_calendar_attempt_completed',artifact_id,wanted_attempt,
      jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt,'revision_id',revision_id));
  command_result := jsonb_build_object('status','succeeded','runId',attempt.run_id,'attemptId',wanted_attempt,'revisionId',revision_id);
  insert into public.command_receipts(tenant_id,actor_reference,command_kind,idempotency_key,input_digest,result_reference)
    values (tenant,task.requester_id,'complete_content_calendar_attempt',wanted_attempt::text,digest,
      command_result || jsonb_build_object('schema_version',1));
  return command_result;
end $$;
alter function private.complete_content_calendar_attempt(uuid,jsonb) owner to bagos_content_calendar_command;
revoke all on function private.complete_content_calendar_attempt(uuid,jsonb) from public, anon, authenticated, service_role, bagos_content_calendar_executor;
grant execute on function private.complete_content_calendar_attempt(uuid,jsonb) to bagos_content_calendar_executor;
revoke create on schema private from bagos_content_calendar_command;
revoke bagos_content_calendar_command from postgres;
commit;
