-- The second approval stage had a vocabulary but nothing to decide on: no
-- artifact existed for a finished post. This assembles one from an approved
-- calendar entry and raises the finished_post approval bound to it.
begin;

create table public.finished_post_revision_bodies (
  tenant_id uuid not null,
  revision_id uuid primary key,
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 1048576),
  foreign key (tenant_id,revision_id) references public.artifact_revisions(tenant_id,id)
);
create index finished_post_bodies_tenant_idx on public.finished_post_revision_bodies(tenant_id,revision_id);
alter table public.finished_post_revision_bodies enable row level security;
alter table public.finished_post_revision_bodies force row level security;
revoke all on public.finished_post_revision_bodies from public, anon, authenticated, service_role;
grant select on public.finished_post_revision_bodies to authenticated;
create policy finished_post_bodies_read on public.finished_post_revision_bodies
  for select to authenticated using (private.is_member(tenant_id));
create trigger no_update before update on public.finished_post_revision_bodies for each row execute function private.reject_mutation();
create trigger no_delete before delete on public.finished_post_revision_bodies for each row execute function private.reject_mutation();

grant select, insert on public.finished_post_revision_bodies to bagos_approval_command;
create policy approval_command_finished_post_read on public.finished_post_revision_bodies
  for select to bagos_approval_command using (true);
create policy approval_command_finished_post_insert on public.finished_post_revision_bodies
  for insert to bagos_approval_command with check (true);
grant select on public.content_calendar_revision_bodies to bagos_approval_command;
-- This command, unlike the auto-create trigger, derives its caller from Auth,
-- so its owner needs the same narrow auth access the other command roles hold.
grant usage on schema auth to bagos_approval_command;
grant execute on function auth.uid(), auth.jwt() to bagos_approval_command;
grant execute on function private.is_member(uuid, text[]) to bagos_approval_command;
grant execute on function private.research_text_valid(jsonb) to bagos_approval_command;
grant select on public.memberships, public.objectives to bagos_approval_command;
create policy approval_command_objectives_read on public.objectives
  for select to bagos_approval_command using (true);
create policy approval_command_members_read on public.memberships
  for select to bagos_approval_command using (true);
create policy approval_command_calendar_bodies_read on public.content_calendar_revision_bodies
  for select to bagos_approval_command using (true);
-- Assembling a package writes one artifact and one revision of its own. Insert
-- only: this role never updates or deletes an existing artifact, and the
-- current-revision pointer is the single column it may set.
grant insert on public.artifacts, public.artifact_revisions to bagos_approval_command;
grant update (current_revision_id) on public.artifacts to bagos_approval_command;
create policy approval_command_artifacts_insert on public.artifacts
  for insert to bagos_approval_command with check (true);
create policy approval_command_revisions_insert on public.artifact_revisions
  for insert to bagos_approval_command with check (true);
create policy approval_command_artifact_pointer on public.artifacts
  for update to bagos_approval_command using (true) with check (true);

create function private.create_finished_post_package(
  wanted_tenant uuid, calendar_revision uuid, day_index integer, asset jsonb, destination jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid; calendar jsonb; entry jsonb; caption text; artifact_id uuid; package_revision uuid;
  package jsonb; digest text; approval_id uuid; campaign uuid;
begin
  actor := auth.uid();
  if actor is null or not private.is_member(wanted_tenant, array['owner','operator']) then
    raise exception 'tenant access denied' using errcode = '42501';
  end if;
  if day_index is null or day_index < 0 or day_index > 6 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  -- The asset is one of exactly two shapes. A package that could omit the
  -- distinction would let a placeholder be approved as a finished graphic.
  if jsonb_typeof(asset) is distinct from 'object'
    or coalesce(asset->>'kind','') not in ('supplied','placeholder')
    or (asset->>'kind' = 'supplied' and not (asset ?& array['kind','reference','description'] and asset - array['kind','reference','description'] = '{}'::jsonb))
    or (asset->>'kind' = 'placeholder' and not (asset ?& array['kind','reason'] and asset - array['kind','reason'] = '{}'::jsonb)) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if jsonb_typeof(destination) is distinct from 'object'
    or not (destination ?& array['platform','accountLabel']) or destination - array['platform','accountLabel'] <> '{}'::jsonb
    or coalesce(destination->>'platform','') not in ('instagram','facebook')
    or not private.research_text_valid(destination->'accountLabel') then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;

  select b.body into calendar from public.content_calendar_revision_bodies b
    where b.tenant_id = wanted_tenant and b.revision_id = calendar_revision;
  if calendar is null then raise exception 'missing_calendar' using errcode = '55000'; end if;
  select e into entry from jsonb_array_elements(calendar->'entries') e
    where (e->>'dayIndex')::int = day_index;
  if entry is null then raise exception 'missing_calendar_entry' using errcode = '55000'; end if;
  -- Copied from the stored entry, never accepted from the caller: the second
  -- approval only means something if it covers the exact text the first
  -- approval already covered.
  caption := entry->>'caption';
  if not private.research_text_valid(to_jsonb(caption)) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;

  package := jsonb_build_object('contractVersion','finished-post.v1','tenantId',wanted_tenant,
    'sourceRevisionId',calendar_revision,'dayIndex',day_index,'caption',caption,
    'asset',asset,'destination',destination,'liveEffects',false);

  -- The calendar's own artifact hangs off its run, not a campaign, so the
  -- campaign is resolved through the run's objective. artifacts requires one of
  -- the two, and this package deliberately carries no run.
  select o.campaign_id into campaign from public.artifacts a
    join public.artifact_revisions v on (v.tenant_id,v.artifact_id) = (a.tenant_id,a.id)
    join public.agent_runs r on (r.tenant_id,r.id) = (a.tenant_id,a.run_id)
    join public.objectives o on (o.tenant_id,o.id) = (r.tenant_id,r.objective_id)
    where v.tenant_id = wanted_tenant and v.id = calendar_revision;
  if campaign is null then raise exception 'missing_calendar' using errcode = '55000'; end if;
  -- Deliberately carries no run_id: a human assembles this package after the
  -- calendar run finished, so attributing it to that run would credit the agent
  -- with work it did not do -- and the run-scoped guards correctly refuse any
  -- writer but the calendar's own command. Lineage back to the calendar lives
  -- in provenance.source_revision_ids instead.
  insert into public.artifacts(tenant_id,campaign_id,type)
    values (wanted_tenant,campaign,'finished_post_package') returning id into artifact_id;
  digest := encode(sha256(convert_to(package::text,'UTF8')),'hex');
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (wanted_tenant,artifact_id,1,digest,'orchestrator',
      jsonb_build_object('schema_version',1,'source_revision_ids',jsonb_build_array(calendar_revision),'day_index',day_index),
      jsonb_build_object('schema_version',1,'status','assembled_from_approved_calendar')) returning id into package_revision;
  insert into public.finished_post_revision_bodies(tenant_id,revision_id,body) values (wanted_tenant,package_revision,package);
  update public.artifacts set current_revision_id = package_revision where id = artifact_id and tenant_id = wanted_tenant;

  insert into public.approvals(tenant_id,artifact_revision_id,action_snapshot,action_digest,action_revision,
      tier,confirmation_required,stage,destination)
    values (wanted_tenant,package_revision,
      jsonb_build_object('schema_version',1,'kind','finished_post_package','day_index',day_index,'asset_kind',asset->>'kind'),
      digest,1,1,true,'finished_post',
      jsonb_build_object('schema_version',1,'kind','finished_post',
        'platform',destination->>'platform','accountLabel',destination->>'accountLabel')) returning id into approval_id;
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (wanted_tenant,'human',actor,'finished_post_package_created',package_revision,gen_random_uuid(),
      jsonb_build_object('schema_version',1,'approval_id',approval_id,'day_index',day_index,'asset_kind',asset->>'kind'));

  return jsonb_build_object('schemaVersion',1,'approvalId',approval_id,'revisionId',package_revision,
    'contentDigest',digest,'assetKind',asset->>'kind');
end;
$$;

-- postgres must be able to SET ROLE to the command owner during ALTER FUNCTION.
-- Keep the membership temporary; the runtime must not inherit this command role.
grant bagos_approval_command to postgres;
alter function private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb) owner to bagos_approval_command;
revoke bagos_approval_command from postgres;
revoke all on function private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)
  from public, anon, service_role, bagos_content_calendar_command, bagos_content_calendar_executor;
grant execute on function private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb) to authenticated;

create function public.create_finished_post_package(
  wanted_tenant uuid, calendar_revision uuid, day_index integer, asset jsonb, destination jsonb
) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.create_finished_post_package(wanted_tenant, calendar_revision, day_index, asset, destination);
$$;
revoke all on function public.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb) from public, anon, service_role;
grant execute on function public.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb) to authenticated;

commit;
