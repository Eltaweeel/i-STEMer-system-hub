-- Per-employee token allowances and real, self-reported usage. Neither this
-- table nor either command below touches the upstream provider's own
-- subscription balance: this system has no API for that figure and must
-- never render a guess in its place. See private.record_agent_usage for how
-- "the provider reported no figure" stays distinct from "it reported zero."
begin;

create table public.usage_allowances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  member_user_id uuid not null,
  -- Calendar-month window, UTC. period_start is always the first day of the
  -- month this allowance governs; a period's consumption is every
  -- usage_records row for that member whose created_at falls in
  -- [period_start, period_start + 1 month).
  period_start date not null check (period_start = date_trunc('month', period_start)::date),
  token_limit integer not null check (token_limit > 0),
  set_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  unique (tenant_id,member_user_id,period_start),
  foreign key (tenant_id,member_user_id) references public.memberships(tenant_id,user_id)
);
create index usage_allowances_member_idx on public.usage_allowances(tenant_id,member_user_id);
alter table public.usage_allowances enable row level security;
alter table public.usage_allowances force row level security;
revoke all on public.usage_allowances from public, anon, authenticated, service_role;
grant select on public.usage_allowances to authenticated;
create policy usage_allowances_read on public.usage_allowances for select to authenticated using (
  private.is_member(tenant_id) and (member_user_id = (select auth.uid()) or private.is_member(tenant_id,array['owner']))
);
create trigger no_delete before delete on public.usage_allowances for each row execute function private.reject_mutation();

-- Every attempt, across every agent pipeline, may be metered at most once:
-- the primary key on attempt_id is that guarantee, not an application check.
create table public.usage_records (
  attempt_id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  run_id uuid not null,
  -- task_id is not foreign-keyed: which task table it names depends on
  -- agent_id, and private.record_agent_usage only ever writes a task_id it
  -- has itself just read out of that agent's own attempt/task tables, never
  -- one supplied by a caller -- so the value is authoritative by construction.
  task_id uuid not null,
  agent_id text not null check (agent_id in ('competitor_analyst','reel_analyst','content_creator')),
  requester_id uuid not null,
  -- reported_tokens is null exactly when usage_reported is false: "the
  -- provider reported no figure for this run" is a distinct, first-class
  -- state from "this run reported using zero tokens," never collapsed into it.
  reported_tokens integer check (reported_tokens is null or reported_tokens >= 0),
  usage_reported boolean not null,
  created_at timestamptz not null default now(),
  check ((usage_reported and reported_tokens is not null) or (not usage_reported and reported_tokens is null)),
  foreign key (tenant_id,run_id) references public.agent_runs(tenant_id,id),
  foreign key (tenant_id,requester_id) references public.memberships(tenant_id,user_id)
);
create index usage_records_requester_idx on public.usage_records(tenant_id,requester_id,created_at);
alter table public.usage_records enable row level security;
alter table public.usage_records force row level security;
revoke all on public.usage_records from public, anon, authenticated, service_role;
grant select on public.usage_records to authenticated;
create policy usage_records_read on public.usage_records for select to authenticated using (
  private.is_member(tenant_id) and (requester_id = (select auth.uid()) or private.is_member(tenant_id,array['owner']))
);
create trigger no_update before update on public.usage_records for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.usage_records for each row execute function private.reject_mutation();

-- Owner + AAL2, mirroring private.approve_agent_revision: a human authority
-- decision, not a pipeline command, so it needs no dedicated command role and
-- no worker executor -- postgres owns it directly, exactly as that command does.
create function private.set_usage_allowance(wanted_tenant uuid, member_user uuid, period date, limit_tokens integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); normalized_period date; saved public.usage_allowances%rowtype;
begin
  if actor is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships m where m.tenant_id = wanted_tenant and m.user_id = actor and m.status = 'active' and m.role = 'owner') then
    raise exception 'owner approval required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships m where m.tenant_id = wanted_tenant and m.user_id = member_user and m.status = 'active') then
    raise exception 'not a tenant member' using errcode = '22023';
  end if;
  if limit_tokens is null or limit_tokens <= 0 then
    raise exception 'allowance must be a positive token count' using errcode = '22023';
  end if;
  if period is null then raise exception 'invalid_contract' using errcode = '22023'; end if;
  normalized_period := date_trunc('month', period)::date;
  insert into public.usage_allowances(tenant_id,member_user_id,period_start,token_limit,set_by)
    values (wanted_tenant,member_user,normalized_period,limit_tokens,actor)
  on conflict (tenant_id,member_user_id,period_start) do update
    set token_limit = excluded.token_limit, set_by = excluded.set_by, updated_at = clock_timestamp()
  returning * into saved;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (wanted_tenant,'human',actor,'usage_allowance_set',saved.id,gen_random_uuid(),
      jsonb_build_object('schema_version',1,'member_user_id',member_user,'period_start',normalized_period,'token_limit',limit_tokens));
  return jsonb_build_object('schema_version',1,'tenantId',wanted_tenant,'memberUserId',member_user,
    'periodStart',normalized_period,'tokenLimit',limit_tokens,'setBy',actor);
end;
$$;
alter function private.set_usage_allowance(uuid,uuid,date,integer) owner to postgres;
revoke all on function private.set_usage_allowance(uuid,uuid,date,integer) from public, anon, service_role;
grant execute on function private.set_usage_allowance(uuid,uuid,date,integer) to authenticated;

-- Only a worker that just finished driving an attempt observes what the
-- provider reported for it, so only the three executor roles that complete
-- attempts may call this -- never authenticated, anon or service_role, and
-- never proxied through a public wrapper meant for browser sessions.
create function private.record_agent_usage(wanted_attempt uuid, agent text, reported_tokens integer, usage_reported boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_tenant uuid; found_task uuid; found_run uuid; found_requester uuid; attempt_state text;
  existing public.usage_records%rowtype;
begin
  if agent not in ('competitor_analyst','reel_analyst','content_creator') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if usage_reported is null
    or (usage_reported and (reported_tokens is null or reported_tokens < 0))
    or (not usage_reported and reported_tokens is not null) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  -- Every field is read back from the authoritative attempt/task tables, never
  -- accepted from the caller, so a worker cannot misattribute usage to a
  -- tenant, task or requester its own attempt does not belong to.
  if agent = 'competitor_analyst' then
    select a.tenant_id, a.task_id, a.run_id, a.state into found_tenant, found_task, found_run, attempt_state
      from public.research_attempts a where a.id = wanted_attempt;
    if found_tenant is not null then
      select t.requester_id into found_requester from public.agent_tasks t where t.tenant_id = found_tenant and t.id = found_task;
    end if;
  elsif agent = 'reel_analyst' then
    select a.tenant_id, a.task_id, a.run_id, a.state into found_tenant, found_task, found_run, attempt_state
      from public.reel_analysis_attempts a where a.id = wanted_attempt;
    if found_tenant is not null then
      select t.requester_id into found_requester from public.reel_analysis_tasks t where t.tenant_id = found_tenant and t.id = found_task;
    end if;
  else
    select a.tenant_id, a.task_id, a.run_id, a.state into found_tenant, found_task, found_run, attempt_state
      from public.content_calendar_attempts a where a.id = wanted_attempt;
    if found_tenant is not null then
      select t.requester_id into found_requester from public.content_calendar_tasks t where t.tenant_id = found_tenant and t.id = found_task;
    end if;
  end if;
  if found_tenant is null or found_requester is null then raise exception 'stale_attempt' using errcode = '55000'; end if;
  if attempt_state = 'running' then raise exception 'stale_attempt' using errcode = '55000'; end if;

  select * into existing from public.usage_records where attempt_id = wanted_attempt;
  if found then
    if existing.usage_reported is distinct from usage_reported or existing.reported_tokens is distinct from reported_tokens then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object('attemptId',existing.attempt_id,'usageReported',existing.usage_reported,'reportedTokens',existing.reported_tokens);
  end if;
  insert into public.usage_records(attempt_id,tenant_id,run_id,task_id,agent_id,requester_id,reported_tokens,usage_reported)
    values (wanted_attempt,found_tenant,found_run,found_task,agent,found_requester,reported_tokens,usage_reported);
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (found_tenant,'system',found_requester,'agent_usage_recorded',wanted_attempt,wanted_attempt,
      jsonb_build_object('schema_version',1,'agent_id',agent,'usage_reported',usage_reported,'reported_tokens',reported_tokens));
  return jsonb_build_object('attemptId',wanted_attempt,'usageReported',usage_reported,'reportedTokens',reported_tokens);
end;
$$;
alter function private.record_agent_usage(uuid,text,integer,boolean) owner to postgres;
revoke all on function private.record_agent_usage(uuid,text,integer,boolean) from public, anon, authenticated, service_role;
grant execute on function private.record_agent_usage(uuid,text,integer,boolean)
  to bagos_research_executor, bagos_reel_analyst_executor, bagos_content_calendar_executor;
commit;
