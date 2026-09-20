-- Employees with no configured allowance row are unlimited by design:
-- shipping metering must never silently freeze a tenant that has not yet set
-- any limits. Consumption counts only substantiated usage_records rows
-- (usage_reported = true); an unreported attempt is never priced as zero, so
-- it can never by itself push a requester over an allowance it did not
-- actually consume. The gate only applies to genuinely new task creation --
-- an idempotent replay of an already-accepted brief still returns its cached
-- receipt regardless of the requester's current balance.
begin;
grant bagos_research_command to postgres;

-- The enforcement point needs to read tables it did not originate: the same
-- one-off cross-domain select the reel-analysis and content-calendar
-- commands already use for artifacts they did not create (20260920090000).
grant select on public.usage_allowances, public.usage_records to bagos_research_command;
create policy usage_command_allowances_read on public.usage_allowances for select to bagos_research_command using (true);
create policy usage_command_records_read on public.usage_records for select to bagos_research_command using (true);

create or replace function private.submit_research_brief(brief jsonb, expected_tenant uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); tenant uuid; member uuid; member_role text;
  idem uuid; objective text; input_hash text; existing public.agent_tasks%rowtype;
  campaign uuid; objective_id uuid; run uuid; artifact uuid; revision_id uuid; task uuid;
  revision_body jsonb; source_url text; allowance_limit integer; consumed_tokens bigint;
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
  -- Only reached when a genuinely new task is about to be created: a replay
  -- above already returned, so this can never re-block a task the requester
  -- already paid for.
  select token_limit into allowance_limit from public.usage_allowances
    where tenant_id = tenant and member_user_id = actor and period_start = date_trunc('month', clock_timestamp())::date;
  if allowance_limit is not null then
    select coalesce(sum(reported_tokens),0) into consumed_tokens from public.usage_records
      where tenant_id = tenant and requester_id = actor and usage_reported
        and created_at >= date_trunc('month', clock_timestamp())
        and created_at < date_trunc('month', clock_timestamp()) + interval '1 month';
    if consumed_tokens >= allowance_limit then
      raise exception 'usage_allowance_exhausted' using errcode = '53400';
    end if;
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
-- Replacement keeps the original owner and ACL; restating both keeps the
-- access boundary readable without cross-referencing 20260916055804.
alter function private.submit_research_brief(jsonb,uuid) owner to bagos_research_command;
revoke all on function private.submit_research_brief(jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function private.submit_research_brief(jsonb,uuid) to authenticated;
revoke bagos_research_command from postgres;
commit;
