-- Adam -> Omar only. Local draft until SQL tests and independent review pass.
begin;

create role bagos_research_command nologin noinherit nobypassrls;
grant bagos_research_command to postgres;
grant usage, create on schema private to bagos_research_command;
grant usage on schema public, auth to bagos_research_command;
grant execute on function auth.uid(), auth.jwt() to bagos_research_command;
grant usage on type private.bounded_payload, private.sha256 to bagos_research_command;

-- Provisioning this binding is an explicit later staging step, not a seed.
create table private.research_brand_binding (
  singleton boolean primary key default true check (singleton),
  tenant_id uuid not null references public.tenants(id)
);
alter table private.research_brand_binding enable row level security;
alter table private.research_brand_binding force row level security;
revoke all on private.research_brand_binding from public, anon, authenticated, service_role;
grant select on private.research_brand_binding to bagos_research_command;
create policy command_binding_read on private.research_brand_binding
  for select to bagos_research_command using (true);

alter table public.agent_runs drop constraint agent_runs_mode_check;
alter table public.agent_runs add constraint agent_runs_mode_check check (mode in ('synthetic','research'));

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  requester_id uuid not null,
  run_id uuid not null,
  brief_revision_id uuid not null,
  contract_version text not null default 'research.v1' check (contract_version = 'research.v1'),
  agent_id text not null default 'competitor_analyst' check (agent_id = 'competitor_analyst'),
  live_effects boolean not null default false check (not live_effects),
  idempotency_key uuid not null,
  input_digest private.sha256 not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,run_id), unique (tenant_id,requester_id,idempotency_key),
  foreign key (tenant_id,requester_id) references public.memberships(tenant_id,user_id),
  foreign key (tenant_id,run_id) references public.agent_runs(tenant_id,id),
  foreign key (tenant_id,brief_revision_id) references public.artifact_revisions(tenant_id,id)
);
create table public.research_revision_bodies (
  tenant_id uuid not null,
  revision_id uuid primary key,
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 1048576),
  foreign key (tenant_id,revision_id) references public.artifact_revisions(tenant_id,id)
);
create index research_bodies_tenant_idx on public.research_revision_bodies(tenant_id,revision_id);
create index agent_tasks_brief_idx on public.agent_tasks(tenant_id,brief_revision_id);

alter table public.agent_tasks enable row level security;
alter table public.agent_tasks force row level security;
alter table public.research_revision_bodies enable row level security;
alter table public.research_revision_bodies force row level security;
revoke all on public.agent_tasks, public.research_revision_bodies from public, anon, authenticated, service_role;
grant select on public.agent_tasks, public.research_revision_bodies to authenticated;
create policy research_tasks_read on public.agent_tasks for select to authenticated using (private.is_member(tenant_id));
create policy research_bodies_read on public.research_revision_bodies for select to authenticated using (private.is_member(tenant_id));
create trigger no_update before update on public.agent_tasks for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.agent_tasks for each row execute function private.reject_mutation();
create trigger no_update before update on public.research_revision_bodies for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.research_revision_bodies for each row execute function private.reject_mutation();

-- Command owner has no membership in client/service roles and owns no tables.
-- No existing client policy or grant is relaxed.
grant select, update (updated_at) on public.tenants to bagos_research_command;
grant select on public.memberships to bagos_research_command;
create policy research_command_tenants_read on public.tenants for select to bagos_research_command using (true);
create policy research_command_tenant_lock on public.tenants for update to bagos_research_command using (true) with check (true);
create policy research_command_members_read on public.memberships for select to bagos_research_command using (true);
grant select, insert on public.campaigns, public.objectives, public.agent_runs,
  public.artifacts, public.artifact_revisions, public.agent_tasks, public.research_revision_bodies to bagos_research_command;
grant update (current_revision_id) on public.artifacts to bagos_research_command;
grant insert on public.audit_log to bagos_research_command;
do $$ declare relation text; begin
  foreach relation in array array['campaigns','objectives','agent_runs','artifacts','artifact_revisions','agent_tasks','research_revision_bodies'] loop
    execute format('create policy research_command_read on public.%I for select to bagos_research_command using (true)', relation);
    execute format('create policy research_command_insert on public.%I for insert to bagos_research_command with check (true)', relation);
  end loop;
end $$;
create policy research_command_artifact_pointer on public.artifacts for update to bagos_research_command using (true) with check (true);
create policy research_command_audit on public.audit_log for insert to bagos_research_command with check (true);

-- Invoker triggers see the active definer role. Legacy postgres-owned commands
-- cannot cross into research state, even when a caller knows its run UUID.
create function private.guard_research_run() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.mode = 'research' or new.mode = 'research' then
    if current_user <> 'bagos_research_command' then
      raise exception 'research_command_required' using errcode = '42501';
    end if;
    if (new.mode,new.objective_id,new.requester_membership_id,new.authorization_version,new.input_snapshot)
      is distinct from (old.mode,old.objective_id,old.requester_membership_id,old.authorization_version,old.input_snapshot) then
      raise exception 'immutable_research_authority' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger research_run_guard before update on public.agent_runs
  for each row execute function private.guard_research_run();

create function private.guard_research_artifact() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.agent_runs r where r.tenant_id = new.tenant_id and r.id = new.run_id and r.mode = 'research')
    and current_user <> 'bagos_research_command' then
    raise exception 'research_command_required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.agent_runs r where r.tenant_id = old.tenant_id and r.id = old.run_id and r.mode = 'research') then
    if current_user <> 'bagos_research_command' or new.run_id is distinct from old.run_id or new.campaign_id is distinct from old.campaign_id then
      raise exception 'immutable_research_authority' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger research_artifact_guard before insert or update on public.artifacts
  for each row execute function private.guard_research_artifact();

create function private.reject_research_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.artifact_revisions v join public.artifacts a on (a.tenant_id,a.id) = (v.tenant_id,v.artifact_id)
    join public.agent_runs r on (r.tenant_id,r.id) = (a.tenant_id,a.run_id)
    where v.tenant_id = new.tenant_id and v.id = new.artifact_revision_id and r.mode = 'research') then
    raise exception 'research_approval_not_enabled' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger research_approval_guard before insert or update on public.approvals
  for each row execute function private.reject_research_approval();
revoke all on function private.guard_research_run(), private.guard_research_artifact(), private.reject_research_approval()
  from public, anon, authenticated, service_role;

create function private.submit_research_brief(brief jsonb, expected_tenant uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); tenant uuid; member uuid; member_role text;
  idem uuid; objective text; input_hash text; existing public.agent_tasks%rowtype;
  campaign uuid; objective_id uuid; run uuid; artifact uuid; revision_id uuid; task uuid;
  revision_body jsonb; source_url text;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select tenant_id into tenant from private.research_brand_binding where singleton;
  if tenant is distinct from expected_tenant or expected_tenant is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- Same write lock taken by membership mutations; revocation cannot race creation.
  update public.tenants set updated_at = clock_timestamp() where id = tenant and status = 'active';
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select id, role into member, member_role from public.memberships
    where tenant_id = tenant and user_id = actor and status = 'active' and role in ('owner','operator');
  if member is null or (member_role = 'owner' and (auth.jwt()->>'aal') is distinct from 'aal2') then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if brief is null or jsonb_typeof(brief) is distinct from 'object'
    or octet_length(brief::text) > 65536
    or not (brief ?& array['idempotencyKey','objective','sources'])
    or (brief - array['idempotencyKey','objective','sources']) <> '{}'::jsonb
    or jsonb_typeof(brief->'objective') is distinct from 'string'
    or jsonb_typeof(brief->'idempotencyKey') is distinct from 'string'
    or jsonb_typeof(brief->'sources') is distinct from 'array' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  objective := btrim(brief->>'objective');
  if length(objective) not between 1 and 8000 or jsonb_array_length(brief->'sources') not between 1 and 12 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  begin idem := (brief->>'idempotencyKey')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_contract' using errcode = '22023'; end;
  if exists (select 1 from jsonb_array_elements(brief->'sources') s where jsonb_typeof(s) <> 'string') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  for source_url in select jsonb_array_elements_text(brief->'sources') loop
    -- Syntactic gate only; the worker must enforce DNS/IP/redirect SSRF controls.
    if length(source_url) > 2048 or source_url !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct s) from jsonb_array_elements_text(brief->'sources') s) <> jsonb_array_length(brief->'sources') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  brief := jsonb_set(brief, '{objective}', to_jsonb(objective));
  input_hash := encode(sha256(convert_to(brief::text,'UTF8')),'hex');
  select * into existing from public.agent_tasks where tenant_id = tenant and requester_id = actor and idempotency_key = idem;
  if found then
    if existing.input_digest <> input_hash then raise exception 'idempotency_conflict' using errcode = '22023'; end if;
    return jsonb_build_object('contractVersion','research.v1','taskId',existing.id,'runId',existing.run_id,'tenantId',tenant,
      'requesterId',actor,'briefRevisionId',existing.brief_revision_id,'liveEffects',false);
  end if;
  task := gen_random_uuid();
  insert into public.campaigns(tenant_id,title,owner_membership_id) values (tenant,'Research brief',member) returning id into campaign;
  insert into public.objectives(tenant_id,campaign_id,content,revision) values (tenant,campaign,objective,1) returning id into objective_id;
  insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values (tenant,objective_id,member,'research','queued',jsonb_build_object('schema_version',1,'task_id',task,'live_effects',false),1) returning id into run;
  revision_body := jsonb_build_object('contractVersion','research.v1','brief',brief,'liveEffects',false);
  insert into public.artifacts(tenant_id,campaign_id,run_id,type) values (tenant,campaign,run,'research_brief') returning id into artifact;
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (tenant,artifact,1,encode(sha256(convert_to(revision_body::text,'UTF8')),'hex'),'orchestrator',
      jsonb_build_object('schema_version',1,'task_id',task),jsonb_build_object('schema_version',1,'status','submitted')) returning id into revision_id;
  insert into public.research_revision_bodies(tenant_id,revision_id,body) values (tenant,revision_id,revision_body);
  update public.artifacts set current_revision_id = revision_id where id = artifact and tenant_id = tenant;
  insert into public.agent_tasks(id,tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values (task,tenant,actor,run,revision_id,idem,input_hash);
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (tenant,'human',actor,'research_task_created',task,idem,jsonb_build_object('schema_version',1,'run_id',run,'brief_revision_id',revision_id));
  return jsonb_build_object('contractVersion','research.v1','taskId',task,'runId',run,'tenantId',tenant,
    'requesterId',actor,'briefRevisionId',revision_id,'liveEffects',false);
end $$;
alter function private.submit_research_brief(jsonb,uuid) owner to bagos_research_command;
revoke all on function private.submit_research_brief(jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function private.submit_research_brief(jsonb,uuid) to authenticated;
create function public.submit_research_brief(brief jsonb, expected_tenant uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.submit_research_brief(brief,expected_tenant); $$;
revoke all on function public.submit_research_brief(jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_research_brief(jsonb,uuid) to authenticated;
revoke create on schema private from bagos_research_command;
revoke bagos_research_command from postgres;
commit;
