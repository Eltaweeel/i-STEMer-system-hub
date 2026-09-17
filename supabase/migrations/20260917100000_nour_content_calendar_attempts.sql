begin;

create role bagos_content_calendar_command nologin noinherit nobypassrls;
grant bagos_content_calendar_command to postgres;
grant usage, create on schema private to bagos_content_calendar_command;
grant usage on schema public, auth to bagos_content_calendar_command;
grant execute on function auth.uid(), auth.jwt() to bagos_content_calendar_command;
grant usage on type private.bounded_payload, private.sha256 to bagos_content_calendar_command;

-- Provisioning this binding is an explicit later staging step, not a seed.
create table private.content_calendar_brand_binding (
  singleton boolean primary key default true check (singleton),
  tenant_id uuid not null references public.tenants(id)
);
alter table private.content_calendar_brand_binding enable row level security;
alter table private.content_calendar_brand_binding force row level security;
revoke all on private.content_calendar_brand_binding from public, anon, authenticated, service_role;
grant select on private.content_calendar_brand_binding to bagos_content_calendar_command;
create policy command_binding_read on private.content_calendar_brand_binding
  for select to bagos_content_calendar_command using (true);

alter table public.agent_runs drop constraint agent_runs_mode_check;
alter table public.agent_runs add constraint agent_runs_mode_check check (mode in ('synthetic','research','reel_analysis','content_calendar'));

-- A separate queue prevents the reel-analysis claimant from consuming calendar work.
create table public.content_calendar_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  requester_id uuid not null,
  run_id uuid not null,
  brief_revision_id uuid not null,
  contract_version text not null default 'content-calendar.v1' check (contract_version = 'content-calendar.v1'),
  agent_id text not null default 'content_creator' check (agent_id = 'content_creator'),
  live_effects boolean not null default false check (not live_effects),
  idempotency_key uuid not null,
  input_digest private.sha256 not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,run_id), unique (tenant_id,requester_id,idempotency_key),
  foreign key (tenant_id,requester_id) references public.memberships(tenant_id,user_id),
  foreign key (tenant_id,run_id) references public.agent_runs(tenant_id,id),
  foreign key (tenant_id,brief_revision_id) references public.artifact_revisions(tenant_id,id)
);
create table public.content_calendar_revision_bodies (
  tenant_id uuid not null,
  revision_id uuid primary key,
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 1048576),
  foreign key (tenant_id,revision_id) references public.artifact_revisions(tenant_id,id)
);
create index content_calendar_bodies_tenant_idx on public.content_calendar_revision_bodies(tenant_id,revision_id);
create index content_calendar_tasks_brief_idx on public.content_calendar_tasks(tenant_id,brief_revision_id);

alter table public.content_calendar_tasks enable row level security;
alter table public.content_calendar_tasks force row level security;
alter table public.content_calendar_revision_bodies enable row level security;
alter table public.content_calendar_revision_bodies force row level security;
revoke all on public.content_calendar_tasks, public.content_calendar_revision_bodies from public, anon, authenticated, service_role;
grant select on public.content_calendar_tasks, public.content_calendar_revision_bodies to authenticated;
create policy content_calendar_tasks_read on public.content_calendar_tasks for select to authenticated using (private.is_member(tenant_id));
create policy content_calendar_bodies_read on public.content_calendar_revision_bodies for select to authenticated using (private.is_member(tenant_id));
create trigger no_update before update on public.content_calendar_tasks for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.content_calendar_tasks for each row execute function private.reject_mutation();
create trigger no_update before update on public.content_calendar_revision_bodies for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.content_calendar_revision_bodies for each row execute function private.reject_mutation();

-- Command owner has no membership in client/service roles and owns no tables.
-- No existing client policy or grant is relaxed.
grant select, update (updated_at) on public.tenants to bagos_content_calendar_command;
grant select on public.memberships to bagos_content_calendar_command;
create policy content_calendar_command_tenants_read on public.tenants for select to bagos_content_calendar_command using (true);
create policy content_calendar_command_tenant_lock on public.tenants for update to bagos_content_calendar_command using (true) with check (true);
create policy content_calendar_command_members_read on public.memberships for select to bagos_content_calendar_command using (true);
grant select, insert on public.campaigns, public.objectives, public.agent_runs,
  public.artifacts, public.artifact_revisions, public.content_calendar_tasks, public.content_calendar_revision_bodies to bagos_content_calendar_command;
grant update (current_revision_id) on public.artifacts to bagos_content_calendar_command;
grant insert on public.audit_log to bagos_content_calendar_command;
do $$ declare relation text; begin
  foreach relation in array array['campaigns','objectives','agent_runs','artifacts','artifact_revisions','content_calendar_tasks','content_calendar_revision_bodies'] loop
    execute format('create policy content_calendar_command_read on public.%I for select to bagos_content_calendar_command using (true)', relation);
    execute format('create policy content_calendar_command_insert on public.%I for insert to bagos_content_calendar_command with check (true)', relation);
  end loop;
end $$;
create policy content_calendar_command_artifact_pointer on public.artifacts for update to bagos_content_calendar_command using (true) with check (true);
create policy content_calendar_command_audit on public.audit_log for insert to bagos_content_calendar_command with check (true);

-- Invoker triggers see the active definer role. Legacy postgres-owned commands
-- cannot cross into content_calendar state, even when a caller knows its run UUID.
create function private.guard_content_calendar_run() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.mode = 'content_calendar' or new.mode = 'content_calendar' then
    if current_user <> 'bagos_content_calendar_command' then
      raise exception 'content_calendar_command_required' using errcode = '42501';
    end if;
    if (new.mode,new.objective_id,new.requester_membership_id,new.authorization_version,new.input_snapshot)
      is distinct from (old.mode,old.objective_id,old.requester_membership_id,old.authorization_version,old.input_snapshot) then
      raise exception 'immutable_content_calendar_authority' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger content_calendar_run_guard before update on public.agent_runs
  for each row execute function private.guard_content_calendar_run();

create function private.guard_content_calendar_artifact() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.agent_runs r where r.tenant_id = new.tenant_id and r.id = new.run_id and r.mode = 'content_calendar')
    and current_user <> 'bagos_content_calendar_command' then
    raise exception 'content_calendar_command_required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.agent_runs r where r.tenant_id = old.tenant_id and r.id = old.run_id and r.mode = 'content_calendar') then
    if current_user <> 'bagos_content_calendar_command' or new.run_id is distinct from old.run_id or new.campaign_id is distinct from old.campaign_id then
      raise exception 'immutable_content_calendar_authority' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger content_calendar_artifact_guard before insert or update on public.artifacts
  for each row execute function private.guard_content_calendar_artifact();

-- Human approval of the calendar itself is a separate, not-yet-built command
-- surface; this queue must not let the generic approval path attach early.
create function private.reject_content_calendar_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.artifact_revisions v join public.artifacts a on (a.tenant_id,a.id) = (v.tenant_id,v.artifact_id)
    join public.agent_runs r on (r.tenant_id,r.id) = (a.tenant_id,a.run_id)
    where v.tenant_id = new.tenant_id and v.id = new.artifact_revision_id and r.mode = 'content_calendar') then
    raise exception 'content_calendar_approval_not_enabled' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger content_calendar_approval_guard before insert or update on public.approvals
  for each row execute function private.reject_content_calendar_approval();
revoke all on function private.guard_content_calendar_run(), private.guard_content_calendar_artifact(), private.reject_content_calendar_approval()
  from public, anon, authenticated, service_role;

-- Deployment may grant this NOLOGIN role to a dedicated worker login later.
-- It owns no tables, bypasses no RLS, and receives only command execution rights.
create role bagos_content_calendar_executor nologin noinherit nobypassrls;
grant usage on schema private to bagos_content_calendar_executor;

create table public.content_calendar_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  task_id uuid not null,
  run_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 3),
  state text not null check (state in ('running','failed','succeeded')),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  finished_at timestamptz,
  error_code text check (error_code in ('provider_failure','timeout','invalid_contract','unrequested_platform','unauthorized','persistence_failure')),
  retryable boolean not null default false,
  retry_requested_at timestamptz,
  unique (tenant_id,id), unique (tenant_id,task_id,attempt_number),
  foreign key (tenant_id,task_id) references public.content_calendar_tasks(tenant_id,id),
  foreign key (tenant_id,run_id) references public.agent_runs(tenant_id,id),
  check ((state = 'running') = (finished_at is null)),
  check ((state = 'failed') = (error_code is not null)),
  check (not retryable or (state = 'failed' and error_code in ('provider_failure','timeout','persistence_failure'))),
  check (retry_requested_at is null or (state = 'failed' and retryable))
);
create unique index content_calendar_attempts_one_running on public.content_calendar_attempts(tenant_id,task_id) where state = 'running';
create index content_calendar_attempts_run_idx on public.content_calendar_attempts(tenant_id,run_id);
alter table public.content_calendar_attempts enable row level security;
alter table public.content_calendar_attempts force row level security;
revoke all on public.content_calendar_attempts from public, anon, authenticated, service_role, bagos_content_calendar_executor;
grant select on public.content_calendar_attempts to authenticated;
create policy content_calendar_attempts_member_read on public.content_calendar_attempts for select to authenticated using (private.is_member(tenant_id));
grant select, insert, update on public.content_calendar_attempts to bagos_content_calendar_command;
create policy content_calendar_attempts_command on public.content_calendar_attempts for all to bagos_content_calendar_command using (true) with check (true);
grant update (state) on public.agent_runs to bagos_content_calendar_command;
create policy content_calendar_run_state_command on public.agent_runs for update to bagos_content_calendar_command using (mode = 'content_calendar') with check (mode = 'content_calendar');

create function private.guard_content_calendar_attempt() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'bagos_content_calendar_command' then raise exception 'content_calendar_command_required' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if (new.id,new.tenant_id,new.task_id,new.run_id,new.attempt_number,new.issued_at,new.expires_at)
      is distinct from (old.id,old.tenant_id,old.task_id,old.run_id,old.attempt_number,old.issued_at,old.expires_at)
      or (old.state <> 'running' and (new.state,new.finished_at,new.error_code,new.retryable)
        is distinct from (old.state,old.finished_at,old.error_code,old.retryable))
      or (old.retry_requested_at is not null and new.retry_requested_at is distinct from old.retry_requested_at) then
      raise exception 'immutable_attempt' using errcode = '23514';
    end if;
  end if;
  if not exists (select 1 from public.content_calendar_tasks t where t.tenant_id = new.tenant_id and t.id = new.task_id and t.run_id = new.run_id) then
    raise exception 'invalid_attempt_binding' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger content_calendar_attempt_guard before insert or update on public.content_calendar_attempts for each row execute function private.guard_content_calendar_attempt();
create trigger no_delete before delete on public.content_calendar_attempts for each row execute function private.reject_mutation();

create function private.guard_content_calendar_run_insert() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.mode = 'content_calendar' and current_user <> 'bagos_content_calendar_command' then
    raise exception 'content_calendar_command_required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger content_calendar_run_insert_guard before insert on public.agent_runs for each row execute function private.guard_content_calendar_run_insert();
revoke all on function private.guard_content_calendar_attempt(), private.guard_content_calendar_run_insert() from public, anon, authenticated, service_role;

create function private.claim_content_calendar_task() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; chosen public.content_calendar_tasks%rowtype; previous public.content_calendar_attempts%rowtype;
  attempt uuid; attempt_no integer; issued timestamptz; expires timestamptz; failure text; brief jsonb;
  upstream_ids jsonb; input_revision_ids jsonb;
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
  return jsonb_build_object('status','claimed','task',jsonb_build_object(
    'contractVersion','content-calendar.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,'tenantId',tenant,
    'requesterId',chosen.requester_id,'agentId','content_creator','allowedScope',jsonb_build_array('content-calendar:write'),
    'issuedAt',issued,'expiresAt',expires,'brief',brief,'liveEffects',false),
    'handoff',jsonb_build_object('contractVersion','content-calendar.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,
      'tenantId',tenant,'fromAgentId','orchestrator','toAgentId','content_creator','inputRevisionIds',input_revision_ids,'liveEffects',false));
end $$;

create function private.fail_content_calendar_attempt(wanted_attempt uuid, failure_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; attempt public.content_calendar_attempts%rowtype; requester uuid;
begin
  if failure_code is null or failure_code not in ('provider_failure','timeout','invalid_contract','unrequested_platform','unauthorized','persistence_failure') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  select tenant_id into tenant from private.content_calendar_brand_binding where singleton;
  update public.tenants set updated_at = clock_timestamp() where id = tenant;
  select * into attempt from public.content_calendar_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  if attempt.state = 'failed' and attempt.error_code = failure_code then
    return jsonb_build_object('status','failed','runId',attempt.run_id,'retryable',attempt.retryable);
  end if;
  if attempt.state <> 'running' or attempt.expires_at <= clock_timestamp() then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.content_calendar_attempts set state = 'failed', finished_at = clock_timestamp(), error_code = failure_code,
    retryable = (attempt_number < 3 and failure_code in ('provider_failure','timeout','persistence_failure')) where id = wanted_attempt;
  update public.agent_runs set state = 'failed' where tenant_id = tenant and id = attempt.run_id and state = 'running';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  select requester_id into requester from public.content_calendar_tasks where tenant_id = tenant and id = attempt.task_id;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'system',requester,'content_calendar_attempt_failed',attempt.task_id,wanted_attempt,
      jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt,'code',failure_code));
  return jsonb_build_object('status','failed','runId',attempt.run_id,'retryable',attempt.attempt_number < 3 and failure_code in ('provider_failure','timeout','persistence_failure'));
end $$;

create function private.retry_content_calendar_attempt(wanted_attempt uuid, expected_tenant uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; actor uuid := auth.uid(); member_role text; attempt public.content_calendar_attempts%rowtype; requester uuid;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then raise exception 'unauthorized' using errcode = '42501'; end if;
  select tenant_id into tenant from private.content_calendar_brand_binding where singleton;
  if tenant is distinct from expected_tenant or expected_tenant is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select role into member_role from public.memberships where tenant_id = tenant and user_id = actor and status = 'active' and role in ('owner','operator');
  if member_role is null or (member_role = 'owner' and (auth.jwt()->>'aal') is distinct from 'aal2') then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into attempt from public.content_calendar_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select requester_id into requester from public.content_calendar_tasks where tenant_id = tenant and id = attempt.task_id;
  if requester is distinct from actor then raise exception 'unauthorized' using errcode = '42501'; end if;
  if attempt.retry_requested_at is not null then return jsonb_build_object('status','retry_requested','runId',attempt.run_id); end if;
  if attempt.state <> 'failed' or not attempt.retryable or attempt.attempt_number >= 3 then raise exception 'not_retryable' using errcode = '55000'; end if;
  update public.agent_runs set state = 'queued' where tenant_id = tenant and id = attempt.run_id and state = 'failed';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.content_calendar_attempts set retry_requested_at = clock_timestamp() where id = wanted_attempt;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'human',actor,'content_calendar_retry_requested',attempt.task_id,wanted_attempt,jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt));
  return jsonb_build_object('status','retry_requested','runId',attempt.run_id);
end $$;

alter function private.claim_content_calendar_task() owner to bagos_content_calendar_command;
alter function private.fail_content_calendar_attempt(uuid,text) owner to bagos_content_calendar_command;
alter function private.retry_content_calendar_attempt(uuid,uuid) owner to bagos_content_calendar_command;
revoke all on function private.claim_content_calendar_task(), private.fail_content_calendar_attempt(uuid,text), private.retry_content_calendar_attempt(uuid,uuid)
  from public, anon, authenticated, service_role, bagos_content_calendar_executor;
grant execute on function private.claim_content_calendar_task(), private.fail_content_calendar_attempt(uuid,text) to bagos_content_calendar_executor;
grant execute on function private.retry_content_calendar_attempt(uuid,uuid) to authenticated;
create function public.retry_content_calendar_attempt(wanted_attempt uuid, expected_tenant uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.retry_content_calendar_attempt(wanted_attempt,expected_tenant); $$;
revoke all on function public.retry_content_calendar_attempt(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.retry_content_calendar_attempt(uuid,uuid) to authenticated;
revoke create on schema private from bagos_content_calendar_command;
revoke bagos_content_calendar_command from postgres;
commit;
