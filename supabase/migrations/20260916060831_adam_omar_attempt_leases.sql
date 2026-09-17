begin;
-- Deployment may grant this NOLOGIN role to a dedicated worker login later.
-- It owns no tables, bypasses no RLS, and receives only command execution rights.
create role bagos_research_executor nologin noinherit nobypassrls;
grant usage on schema private to bagos_research_executor;
grant bagos_research_command to postgres;
grant create on schema private to bagos_research_command;

create table public.research_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  task_id uuid not null,
  run_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 3),
  state text not null check (state in ('running','failed','succeeded')),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  finished_at timestamptz,
  error_code text check (error_code in ('provider_failure','timeout','invalid_contract','uninspected_source','unauthorized','persistence_failure')),
  retryable boolean not null default false,
  retry_requested_at timestamptz,
  unique (tenant_id,id), unique (tenant_id,task_id,attempt_number),
  foreign key (tenant_id,task_id) references public.agent_tasks(tenant_id,id),
  foreign key (tenant_id,run_id) references public.agent_runs(tenant_id,id),
  check ((state = 'running') = (finished_at is null)),
  check ((state = 'failed') = (error_code is not null)),
  check (not retryable or (state = 'failed' and error_code in ('provider_failure','timeout','persistence_failure'))),
  check (retry_requested_at is null or (state = 'failed' and retryable))
);
create unique index research_attempts_one_running on public.research_attempts(tenant_id,task_id) where state = 'running';
create index research_attempts_run_idx on public.research_attempts(tenant_id,run_id);
alter table public.research_attempts enable row level security;
alter table public.research_attempts force row level security;
revoke all on public.research_attempts from public, anon, authenticated, service_role, bagos_research_executor;
grant select on public.research_attempts to authenticated;
create policy research_attempts_member_read on public.research_attempts for select to authenticated using (private.is_member(tenant_id));
grant select, insert, update on public.research_attempts to bagos_research_command;
create policy research_attempts_command on public.research_attempts for all to bagos_research_command using (true) with check (true);
grant update (state) on public.agent_runs to bagos_research_command;
create policy research_run_state_command on public.agent_runs for update to bagos_research_command using (mode = 'research') with check (mode = 'research');

create function private.guard_research_attempt() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'bagos_research_command' then raise exception 'research_command_required' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if (new.id,new.tenant_id,new.task_id,new.run_id,new.attempt_number,new.issued_at,new.expires_at)
      is distinct from (old.id,old.tenant_id,old.task_id,old.run_id,old.attempt_number,old.issued_at,old.expires_at)
      or (old.state <> 'running' and (new.state,new.finished_at,new.error_code,new.retryable)
        is distinct from (old.state,old.finished_at,old.error_code,old.retryable))
      or (old.retry_requested_at is not null and new.retry_requested_at is distinct from old.retry_requested_at) then
      raise exception 'immutable_attempt' using errcode = '23514';
    end if;
  end if;
  if not exists (select 1 from public.agent_tasks t where t.tenant_id = new.tenant_id and t.id = new.task_id and t.run_id = new.run_id) then
    raise exception 'invalid_attempt_binding' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger research_attempt_guard before insert or update on public.research_attempts for each row execute function private.guard_research_attempt();
create trigger no_delete before delete on public.research_attempts for each row execute function private.reject_mutation();

create function private.guard_research_run_insert() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.mode = 'research' and current_user <> 'bagos_research_command' then
    raise exception 'research_command_required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger research_run_insert_guard before insert on public.agent_runs for each row execute function private.guard_research_run_insert();
revoke all on function private.guard_research_attempt(), private.guard_research_run_insert() from public, anon, authenticated, service_role;

create function private.claim_research_task() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; chosen public.agent_tasks%rowtype; previous public.research_attempts%rowtype;
  attempt uuid; attempt_no integer; issued timestamptz; expires timestamptz; failure text; brief jsonb;
begin
  select tenant_id into tenant from private.research_brand_binding where singleton;
  if tenant is null then raise exception 'research_not_configured' using errcode = '55000'; end if;
  -- All research commands acquire tenant then run/attempt locks in this order.
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then return null; end if;
  select t.* into chosen from public.agent_tasks t join public.agent_runs r on (r.tenant_id,r.id) = (t.tenant_id,t.run_id)
    where t.tenant_id = tenant and (r.state = 'queued' or (r.state = 'running' and exists (
      select 1 from public.research_attempts a where a.tenant_id = tenant and a.task_id = t.id and a.state = 'running' and a.expires_at <= clock_timestamp())))
    order by t.created_at,t.id limit 1 for update of r;
  if not found then return null; end if;
  select * into previous from public.research_attempts where tenant_id = tenant and task_id = chosen.id order by attempt_number desc limit 1 for update;
  if previous.state = 'running' then
    update public.research_attempts set state = 'failed', finished_at = clock_timestamp(), error_code = 'timeout', retryable = (attempt_number < 3)
      where id = previous.id;
    update public.agent_runs set state = 'failed' where id = chosen.run_id and tenant_id = tenant;
    insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
      values (tenant,'system',chosen.requester_id,'research_lease_expired',chosen.id,previous.id,jsonb_build_object('schema_version',1,'attempt_id',previous.id));
    return jsonb_build_object('status','failed','runId',chosen.run_id,'code','timeout');
  end if;
  attempt_no := coalesce(previous.attempt_number,0) + 1;
  if attempt_no > 3 then raise exception 'attempt_limit' using errcode = '55000'; end if;
  issued := clock_timestamp(); expires := issued + interval '5 minutes'; attempt := gen_random_uuid();
  if not exists (select 1 from public.memberships where tenant_id = tenant and user_id = chosen.requester_id and status = 'active' and role in ('owner','operator')) then
    failure := 'unauthorized';
  end if;
  insert into public.research_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at,finished_at,error_code)
    values (attempt,tenant,chosen.id,chosen.run_id,attempt_no,case when failure is null then 'running' else 'failed' end,
      issued,expires,case when failure is null then null else issued end,failure);
  update public.agent_runs set state = case when failure is null then 'running' else 'failed' end where id = chosen.run_id and tenant_id = tenant;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'system',chosen.requester_id,case when failure is null then 'research_attempt_started' else 'research_authorization_revoked' end,
      chosen.id,attempt,jsonb_build_object('schema_version',1,'attempt_id',attempt));
  if failure is not null then return jsonb_build_object('status','failed','runId',chosen.run_id,'code',failure); end if;
  select body->'brief' into brief from public.research_revision_bodies where tenant_id = tenant and revision_id = chosen.brief_revision_id;
  if brief is null then raise exception 'missing_brief' using errcode = '55000'; end if;
  return jsonb_build_object('status','claimed','task',jsonb_build_object(
    'contractVersion','research.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,'tenantId',tenant,
    'requesterId',chosen.requester_id,'agentId','competitor_analyst','allowedScope',jsonb_build_array('research:read'),
    'issuedAt',issued,'expiresAt',expires,'brief',brief,'liveEffects',false),
    'handoff',jsonb_build_object('contractVersion','research.v1','taskId',chosen.id,'runId',chosen.run_id,'attemptId',attempt,
      'tenantId',tenant,'fromAgentId','orchestrator','toAgentId','competitor_analyst','inputRevisionIds',jsonb_build_array(chosen.brief_revision_id),'liveEffects',false));
end $$;

create function private.fail_research_attempt(wanted_attempt uuid, failure_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; attempt public.research_attempts%rowtype; requester uuid;
begin
  if failure_code is null or failure_code not in ('provider_failure','timeout','invalid_contract','uninspected_source','unauthorized','persistence_failure') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  select tenant_id into tenant from private.research_brand_binding where singleton;
  update public.tenants set updated_at = clock_timestamp() where id = tenant;
  select * into attempt from public.research_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  if attempt.state = 'failed' and attempt.error_code = failure_code then
    return jsonb_build_object('status','failed','runId',attempt.run_id,'retryable',attempt.retryable);
  end if;
  if attempt.state <> 'running' or attempt.expires_at <= clock_timestamp() then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.research_attempts set state = 'failed', finished_at = clock_timestamp(), error_code = failure_code,
    retryable = (attempt_number < 3 and failure_code in ('provider_failure','timeout','persistence_failure')) where id = wanted_attempt;
  update public.agent_runs set state = 'failed' where tenant_id = tenant and id = attempt.run_id and state = 'running';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  select requester_id into requester from public.agent_tasks where tenant_id = tenant and id = attempt.task_id;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'system',requester,'research_attempt_failed',attempt.task_id,wanted_attempt,
      jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt,'code',failure_code));
  return jsonb_build_object('status','failed','runId',attempt.run_id,'retryable',attempt.attempt_number < 3 and failure_code in ('provider_failure','timeout','persistence_failure'));
end $$;

create function private.retry_research_attempt(wanted_attempt uuid, expected_tenant uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; actor uuid := auth.uid(); member_role text; attempt public.research_attempts%rowtype; requester uuid;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then raise exception 'unauthorized' using errcode = '42501'; end if;
  select tenant_id into tenant from private.research_brand_binding where singleton;
  if tenant is distinct from expected_tenant or expected_tenant is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select role into member_role from public.memberships where tenant_id = tenant and user_id = actor and status = 'active' and role in ('owner','operator');
  if member_role is null or (member_role = 'owner' and (auth.jwt()->>'aal') is distinct from 'aal2') then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into attempt from public.research_attempts where tenant_id = tenant and id = wanted_attempt for update;
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select requester_id into requester from public.agent_tasks where tenant_id = tenant and id = attempt.task_id;
  if requester is distinct from actor then raise exception 'unauthorized' using errcode = '42501'; end if;
  if attempt.retry_requested_at is not null then return jsonb_build_object('status','retry_requested','runId',attempt.run_id); end if;
  if attempt.state <> 'failed' or not attempt.retryable or attempt.attempt_number >= 3 then raise exception 'not_retryable' using errcode = '55000'; end if;
  update public.agent_runs set state = 'queued' where tenant_id = tenant and id = attempt.run_id and state = 'failed';
  if not found then raise exception 'stale_attempt' using errcode = '55000'; end if;
  update public.research_attempts set retry_requested_at = clock_timestamp() where id = wanted_attempt;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'human',actor,'research_retry_requested',attempt.task_id,wanted_attempt,jsonb_build_object('schema_version',1,'attempt_id',wanted_attempt));
  return jsonb_build_object('status','retry_requested','runId',attempt.run_id);
end $$;

alter function private.claim_research_task() owner to bagos_research_command;
alter function private.fail_research_attempt(uuid,text) owner to bagos_research_command;
alter function private.retry_research_attempt(uuid,uuid) owner to bagos_research_command;
revoke all on function private.claim_research_task(), private.fail_research_attempt(uuid,text), private.retry_research_attempt(uuid,uuid)
  from public, anon, authenticated, service_role, bagos_research_executor;
grant execute on function private.claim_research_task(), private.fail_research_attempt(uuid,text) to bagos_research_executor;
grant execute on function private.retry_research_attempt(uuid,uuid) to authenticated;
create function public.retry_research_attempt(wanted_attempt uuid, expected_tenant uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.retry_research_attempt(wanted_attempt,expected_tenant); $$;
revoke all on function public.retry_research_attempt(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.retry_research_attempt(uuid,uuid) to authenticated;
revoke create on schema private from bagos_research_command;
revoke bagos_research_command from postgres;
commit;
