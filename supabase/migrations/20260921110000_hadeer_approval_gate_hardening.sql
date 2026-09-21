-- Follow-up review of the previous repair found the fixes correct but porous at
-- their edges. These close the edges.
begin;

-- The decision-time gate. Superseding at creation cannot be the only defence:
-- a package built from calendar v1 keeps its own pending approval when v2
-- lands, because each package is its own artifact and the revision-invalidation
-- trigger only retires approvals bound to the superseded artifact. The result
-- was a finished-post decision still approvable on the strength of a calendar
-- approval that had since been invalidated. The gate is therefore re-checked
-- when the decision is actually recorded, not only when the package is built.
create or replace function private.finished_post_calendar_approved(
  wanted_tenant uuid, package_revision uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.finished_post_revision_bodies b
    join public.approvals strategy
      on strategy.tenant_id = b.tenant_id
     and strategy.artifact_revision_id = (b.body->>'sourceRevisionId')::uuid
     and strategy.stage = 'strategy'
    where b.tenant_id = wanted_tenant and b.revision_id = package_revision
      and strategy.status = 'approved');
$$;
alter function private.finished_post_calendar_approved(uuid,uuid) owner to postgres;
revoke all on function private.finished_post_calendar_approved(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.approve_agent_revision(
  wanted_tenant uuid, approval_id uuid, expected_digest text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row public.approvals%rowtype; revision public.artifact_revisions%rowtype; member_role text;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  select m.role into member_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = auth.uid() and m.status = 'active';
  if member_role <> 'owner' then raise exception 'owner approval required' using errcode = '42501'; end if;
  if expected_digest is null then raise exception 'approval digest required' using errcode = '22023'; end if;
  select a.* into row from public.approvals a where a.id = approval_id and a.tenant_id = wanted_tenant for update;
  if row.id is null then raise exception 'approval not found' using errcode = '23503'; end if;
  if row.status <> 'pending' then raise exception 'approval is not pending' using errcode = '55000'; end if;
  select r.* into revision from public.artifact_revisions r where r.id = row.artifact_revision_id and r.tenant_id = wanted_tenant;
  if revision.content_digest is distinct from expected_digest then
    raise exception 'approval digest mismatch' using errcode = '22023';
  end if;
  if row.stage = 'finished_post'
    and not private.finished_post_calendar_approved(wanted_tenant, row.artifact_revision_id) then
    raise exception 'strategy_not_approved' using errcode = '55000';
  end if;
  update public.approvals set status = 'approved',
    action_snapshot = action_snapshot || jsonb_build_object('approved_by', auth.uid(), 'approved_at', clock_timestamp())
    where id = approval_id and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_artifact_approved', row.artifact_revision_id, row.action_revision,
      gen_random_uuid(), jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'content_digest', expected_digest));
  return jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'status', 'approved', 'content_digest', expected_digest);
end;
$$;

create or replace function private.create_finished_post_package(
  wanted_tenant uuid, calendar_revision uuid, day_index integer, asset jsonb, destination jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; calendar jsonb; entry jsonb; caption text; artifact_id uuid; package_revision uuid;
  package jsonb; digest text; approval_id uuid; campaign uuid; strategy_status text; superseded uuid;
  trimmed_reason text;
begin
  actor := auth.uid();
  if actor is null or not private.is_member(wanted_tenant, array['owner','operator']) then
    raise exception 'tenant access denied' using errcode = '42501';
  end if;
  if day_index is null or day_index < 0 or day_index > 6 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
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

  -- Two transactions packaging the same day cannot see each other's uncommitted
  -- insert, so the supersede below would miss and leave two live decisions.
  -- The lock is tenant- and day-scoped, so unrelated packaging never contends.
  perform pg_advisory_xact_lock(hashtextextended(wanted_tenant::text || ':finished_post:' || day_index::text, 0));

  select a.status into strategy_status from public.approvals a
    where a.tenant_id = wanted_tenant and a.artifact_revision_id = calendar_revision and a.stage = 'strategy';
  if strategy_status is null then raise exception 'strategy_approval_missing' using errcode = '55000'; end if;
  if strategy_status <> 'approved' then raise exception 'strategy_not_approved' using errcode = '55000'; end if;

  select b.body into calendar from public.content_calendar_revision_bodies b
    where b.tenant_id = wanted_tenant and b.revision_id = calendar_revision;
  if calendar is null then raise exception 'missing_calendar' using errcode = '55000'; end if;
  select e into entry from jsonb_array_elements(calendar->'entries') e
    where (e->>'dayIndex')::int = day_index;
  if entry is null then raise exception 'missing_calendar_entry' using errcode = '55000'; end if;
  caption := entry->>'caption';
  if not private.research_text_valid(to_jsonb(caption)) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;

  package := jsonb_build_object('contractVersion','finished-post.v1','tenantId',wanted_tenant,
    'sourceRevisionId',calendar_revision,'dayIndex',day_index,'caption',caption,
    'asset',asset,'destination',destination,'liveEffects',false);

  select o.campaign_id into campaign from public.artifacts a
    join public.artifact_revisions v on (v.tenant_id,v.artifact_id) = (a.tenant_id,a.id)
    join public.agent_runs r on (r.tenant_id,r.id) = (a.tenant_id,a.run_id)
    join public.objectives o on (o.tenant_id,o.id) = (r.tenant_id,r.objective_id)
    where v.tenant_id = wanted_tenant and v.id = calendar_revision;
  if campaign is null then raise exception 'missing_calendar' using errcode = '55000'; end if;

  -- Supersedes any pending decision for this day whatever calendar revision it
  -- came from. Scoping it to the same revision left a package built from an
  -- older calendar live alongside the new one.
  -- Wrapped in a CTE and iterated over its select: plpgsql's FOR ... IN with a
  -- bare data-modifying statement performs the update but does not iterate its
  -- RETURNING rows, which silently skipped every audit row.
  for superseded in
    with invalidated as (
      update public.approvals a set status = 'invalidated',
        action_snapshot = a.action_snapshot || jsonb_build_object('invalidated_by','superseded_finished_post_package','invalidated_at',clock_timestamp())
        where a.tenant_id = wanted_tenant and a.stage = 'finished_post' and a.status = 'pending'
          and (a.action_snapshot->>'day_index')::int = day_index
          and exists (select 1 from public.finished_post_revision_bodies b
            where b.tenant_id = a.tenant_id and b.revision_id = a.artifact_revision_id)
        returning a.id, a.artifact_revision_id
    ) select artifact_revision_id from invalidated
  loop
    -- Audited like every other invalidation, so the trail explains the decision
    -- that disappeared rather than only showing the package that replaced it.
    insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
      values (wanted_tenant,'human',actor,'agent_artifact_approval_invalidated',superseded,gen_random_uuid(),
        jsonb_build_object('schema_version',1,'reason','superseded_finished_post_package','day_index',day_index));
  end loop;

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

-- The reason is stored inside a bounded_payload capped at 16384 *bytes*, but
-- the guard counted characters, so a few thousand characters of Arabic
-- overflowed the domain and surfaced as an opaque constraint error instead of a
-- readable refusal. Bound the bytes the payload actually has to hold.
create or replace function private.reject_agent_revision(
  wanted_tenant uuid, approval_id uuid, expected_digest text, reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row public.approvals%rowtype; revision public.artifact_revisions%rowtype; member_role text; trimmed_reason text;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  select m.role into member_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = auth.uid() and m.status = 'active';
  if member_role <> 'owner' then raise exception 'owner approval required' using errcode = '42501'; end if;
  if expected_digest is null then raise exception 'approval digest required' using errcode = '22023'; end if;
  trimmed_reason := btrim(coalesce(reason, ''));
  if trimmed_reason = '' or octet_length(trimmed_reason) > 2000 then
    raise exception 'rejection reason required' using errcode = '22023';
  end if;
  select a.* into row from public.approvals a where a.id = approval_id and a.tenant_id = wanted_tenant for update;
  if row.id is null then raise exception 'approval not found' using errcode = '23503'; end if;
  if row.status <> 'pending' then raise exception 'approval is not pending' using errcode = '55000'; end if;
  select r.* into revision from public.artifact_revisions r where r.id = row.artifact_revision_id and r.tenant_id = wanted_tenant;
  if revision.content_digest is distinct from expected_digest then
    raise exception 'approval digest mismatch' using errcode = '22023';
  end if;
  update public.approvals set status = 'rejected',
    action_snapshot = action_snapshot || jsonb_build_object('rejected_by', auth.uid(), 'rejected_at', clock_timestamp(), 'reason', trimmed_reason)
    where id = approval_id and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_artifact_rejected', row.artifact_revision_id, row.action_revision,
      gen_random_uuid(), jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'content_digest', expected_digest, 'reason', trimmed_reason));
  return jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'status', 'rejected', 'content_digest', expected_digest);
end;
$$;

commit;
