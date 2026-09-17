begin;
grant bagos_research_command to postgres;
grant create on schema private to bagos_research_command;

create table public.research_outcomes (
  tenant_id uuid not null,
  task_id uuid not null,
  attempt_id uuid primary key,
  artifact_revision_id uuid not null,
  completion_digest private.sha256 not null,
  inspection_receipts jsonb not null check (jsonb_typeof(inspection_receipts) = 'array' and octet_length(inspection_receipts::text) <= 1048576),
  created_at timestamptz not null default now(),
  unique (tenant_id,task_id),
  foreign key (tenant_id,task_id) references public.agent_tasks(tenant_id,id),
  foreign key (tenant_id,attempt_id) references public.research_attempts(tenant_id,id),
  foreign key (tenant_id,artifact_revision_id) references public.artifact_revisions(tenant_id,id)
);
create index research_outcomes_revision_idx on public.research_outcomes(tenant_id,artifact_revision_id);
alter table public.research_outcomes enable row level security;
alter table public.research_outcomes force row level security;
revoke all on public.research_outcomes from public, anon, authenticated, service_role, bagos_research_executor;
grant select on public.research_outcomes to authenticated;
create policy research_outcomes_read on public.research_outcomes for select to authenticated using (private.is_member(tenant_id));
grant select, insert on public.research_outcomes to bagos_research_command;
create policy research_outcomes_command_read on public.research_outcomes for select to bagos_research_command using (true);
create policy research_outcomes_command_insert on public.research_outcomes for insert to bagos_research_command with check (true);
create trigger no_update before update on public.research_outcomes for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.research_outcomes for each row execute function private.reject_mutation();

create function private.research_text_valid(candidate jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(candidate) = 'string' and length(btrim(candidate #>> '{}')) between 1 and 8000,false);
$$;
create function private.research_gaps_valid(candidate jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(candidate) is distinct from 'array' then false else
    jsonb_array_length(candidate) <= 30 and not exists (
      select 1 from jsonb_array_elements(candidate) gap where not private.research_text_valid(gap)) end;
$$;
revoke all on function private.research_text_valid(jsonb), private.research_gaps_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.research_text_valid(jsonb), private.research_gaps_valid(jsonb) to bagos_research_command;

create function private.validate_research_completion(
  task public.agent_tasks, attempt public.research_attempts, artifact jsonb, receipts jsonb
) returns void language plpgsql set search_path = '' as $$
declare receipt jsonb; evidence jsonb; inspected timestamptz; source_list jsonb;
  artifact_keys text[] := array['contractVersion','taskId','runId','attemptId','tenantId','producedBy','sourceRevisionIds','evidence','gaps','liveEffects'];
  receipt_keys text[] := array['contractVersion','taskId','runId','attemptId','tenantId','receiptId','sourceUrl','inspectedAt','contentHash'];
  evidence_keys text[] := array['sourceUrl','inspectionReceiptId','inspectedAt','observation','interpretation','confidence','gaps'];
begin
  if artifact is null or receipts is null or jsonb_typeof(artifact) is distinct from 'object' or jsonb_typeof(receipts) is distinct from 'array'
    or octet_length(artifact::text) + octet_length(receipts::text) > 1048576 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if not (artifact ?& artifact_keys) or artifact - artifact_keys <> '{}'::jsonb
    or artifact->>'contractVersion' is distinct from 'research.v1'
    or artifact->>'tenantId' is distinct from task.tenant_id::text or artifact->>'taskId' is distinct from task.id::text
    or artifact->>'runId' is distinct from task.run_id::text or artifact->>'attemptId' is distinct from attempt.id::text
    or artifact->>'producedBy' is distinct from 'competitor_analyst' or artifact->'liveEffects' is distinct from 'false'::jsonb
    or artifact->'sourceRevisionIds' is distinct from jsonb_build_array(task.brief_revision_id)
    or jsonb_typeof(artifact->'evidence') is distinct from 'array' or not private.research_gaps_valid(artifact->'gaps') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if jsonb_array_length(artifact->'evidence') not between 1 and 100 or jsonb_array_length(receipts) not between 1 and 100
    or (select count(distinct r->>'receiptId') from jsonb_array_elements(receipts) r) <> jsonb_array_length(receipts) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  select body->'brief'->'sources' into source_list from public.research_revision_bodies
    where tenant_id = task.tenant_id and revision_id = task.brief_revision_id;
  for receipt in select jsonb_array_elements(receipts) loop
    if jsonb_typeof(receipt) is distinct from 'object' or not (receipt ?& receipt_keys) or receipt - receipt_keys <> '{}'::jsonb
      or receipt->>'contractVersion' is distinct from 'research.v1' or receipt->>'tenantId' is distinct from task.tenant_id::text
      or receipt->>'taskId' is distinct from task.id::text or receipt->>'runId' is distinct from task.run_id::text
      or receipt->>'attemptId' is distinct from attempt.id::text
      or coalesce(receipt->>'receiptId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(receipt->'contentHash') is distinct from 'string'
      or coalesce(receipt->>'contentHash','') !~ '^[0-9a-f]{64}$'
      or not coalesce(source_list @> jsonb_build_array(receipt->'sourceUrl'),false)
      or jsonb_typeof(receipt->'inspectedAt') is distinct from 'string'
      or coalesce(receipt->>'inspectedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
      raise exception 'uninspected_source' using errcode = '22023';
    end if;
    begin inspected := (receipt->>'inspectedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'uninspected_source' using errcode = '22023'; end;
    if inspected < attempt.issued_at or inspected >= attempt.expires_at or inspected > clock_timestamp() then
      raise exception 'uninspected_source' using errcode = '22023';
    end if;
  end loop;
  for evidence in select jsonb_array_elements(artifact->'evidence') loop
    if jsonb_typeof(evidence) is distinct from 'object' or not (evidence ?& evidence_keys) or evidence - evidence_keys <> '{}'::jsonb
      or not private.research_text_valid(evidence->'observation')
      or (evidence->'interpretation' is distinct from 'null'::jsonb and not private.research_text_valid(evidence->'interpretation'))
      or coalesce(evidence->>'confidence','') not in ('low','medium','high') or not private.research_gaps_valid(evidence->'gaps') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
    if not exists (select 1 from jsonb_array_elements(receipts) r where r->'receiptId' = evidence->'inspectionReceiptId'
      and r->'sourceUrl' = evidence->'sourceUrl' and r->'inspectedAt' = evidence->'inspectedAt') then
      raise exception 'uninspected_source' using errcode = '22023';
    end if;
  end loop;
end $$;
revoke all on function private.validate_research_completion(public.agent_tasks,public.research_attempts,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function private.validate_research_completion(public.agent_tasks,public.research_attempts,jsonb,jsonb) to bagos_research_command;

-- Only the trusted system worker supplies host-observed receipts. Model output
-- and browser JSON must never be forwarded as the receipts argument.
create function private.complete_research_attempt(wanted_attempt uuid, artifact jsonb, receipts jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; attempt public.research_attempts%rowtype; task public.agent_tasks%rowtype;
  outcome public.research_outcomes%rowtype; digest text; artifact_id uuid; revision_id uuid;
begin
  select tenant_id into tenant from private.research_brand_binding where singleton;
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into attempt from public.research_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  select * into task from public.agent_tasks where tenant_id = tenant and id = attempt.task_id;
  if not exists (select 1 from public.memberships where tenant_id = tenant and user_id = task.requester_id and status = 'active' and role in ('owner','operator')) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  perform private.validate_research_completion(task,attempt,artifact,receipts);
  digest := encode(sha256(convert_to(jsonb_build_object('artifact',artifact,'receipts',receipts)::text,'UTF8')),'hex');
  select * into outcome from public.research_outcomes where tenant_id = tenant and attempt_id = wanted_attempt;
  if found then
    if outcome.completion_digest <> digest then raise exception 'idempotency_conflict' using errcode = '22023'; end if;
    return jsonb_build_object('status','succeeded','runId',attempt.run_id,'attemptId',wanted_attempt,'revisionId',outcome.artifact_revision_id);
  end if;
  if attempt.state <> 'running' or attempt.expires_at <= clock_timestamp()
    or exists (select 1 from public.research_attempts a where a.tenant_id = tenant and a.task_id = task.id and a.attempt_number > attempt.attempt_number) then
    raise exception 'stale_attempt' using errcode = '55000';
  end if;
  insert into public.artifacts(tenant_id,run_id,type) values (tenant,attempt.run_id,'research_evidence') returning id into artifact_id;
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (tenant,artifact_id,1,encode(sha256(convert_to(artifact::text,'UTF8')),'hex'),'competitor_analyst',
      jsonb_build_object('schema_version',1,'task_id',task.id,'attempt_id',wanted_attempt,'source_revision_ids',jsonb_build_array(task.brief_revision_id)),
      jsonb_build_object('schema_version',1,'status','inspection_receipts_validated')) returning id into revision_id;
  insert into public.research_revision_bodies(tenant_id,revision_id,body) values (tenant,revision_id,artifact);
  update public.artifacts set current_revision_id = revision_id where id = artifact_id and tenant_id = tenant;
  insert into public.research_outcomes(tenant_id,task_id,attempt_id,artifact_revision_id,completion_digest,inspection_receipts)
    values (tenant,task.id,wanted_attempt,revision_id,digest,receipts);
  update public.research_attempts set state = 'succeeded', finished_at = clock_timestamp()
    where id = wanted_attempt and state = 'running' and expires_at > clock_timestamp();
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.agent_runs set state = 'succeeded' where tenant_id = tenant and id = attempt.run_id and state = 'running';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'agent',task.id,'research_attempt_completed',artifact_id,wanted_attempt,
      jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt,'revision_id',revision_id));
  return jsonb_build_object('status','succeeded','runId',attempt.run_id,'attemptId',wanted_attempt,'revisionId',revision_id);
end $$;
alter function private.complete_research_attempt(uuid,jsonb,jsonb) owner to bagos_research_command;
revoke all on function private.complete_research_attempt(uuid,jsonb,jsonb) from public, anon, authenticated, service_role, bagos_research_executor;
grant execute on function private.complete_research_attempt(uuid,jsonb,jsonb) to bagos_research_executor;
revoke create on schema private from bagos_research_command;
revoke bagos_research_command from postgres;
commit;
