-- The owner gate on both decision commands was NULL-blind, and the hole was
-- the opposite of an edge case.
--
-- `select m.role into member_role from public.memberships ...` leaves
-- member_role NULL when the caller has no membership row. `NULL <> 'owner'` is
-- NULL, and plpgsql's IF treats a NULL condition as false, so the guard was
-- skipped entirely and execution continued as though the caller were an owner.
-- A member holding the wrong role was refused correctly ('operator' <> 'owner'
-- is plainly true), which is exactly why this survived: every test exercised
-- that case and none exercised a caller with no row at all -- an outsider to
-- the tenant, which is the common case, not a rare one.
--
-- Both functions are security definer owned by a superuser and executable by
-- `authenticated`, so RLS offered no second line of defence: any authenticated
-- user with an AAL2 session of their own could approve or reject any tenant's
-- pending decision, and the audit row would name them as the deciding human.
--
-- The same shape sat one line earlier: a JWT carrying no `aal` claim at all
-- made `(auth.jwt()->>'aal') <> 'aal2'` NULL rather than true, skipping the
-- assurance requirement. `is distinct from` is NULL-safe and says the same
-- thing for every non-null case. The rest of both bodies is carried over
-- unchanged from 20260921110000 and 20260921120000.
begin;

create or replace function private.approve_agent_revision(
  wanted_tenant uuid, approval_id uuid, expected_digest text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row public.approvals%rowtype; revision public.artifact_revisions%rowtype; member_role text;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  select m.role into member_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = auth.uid() and m.status = 'active';
  -- No row and the wrong role are both refusals, and neither may depend on a
  -- comparison against NULL to fire.
  if member_role is null or member_role <> 'owner' then
    raise exception 'owner approval required' using errcode = '42501';
  end if;
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

create or replace function private.reject_agent_revision(
  wanted_tenant uuid, approval_id uuid, expected_digest text, reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row public.approvals%rowtype; revision public.artifact_revisions%rowtype; member_role text; trimmed_reason text;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  select m.role into member_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = auth.uid() and m.status = 'active';
  if member_role is null or member_role <> 'owner' then
    raise exception 'owner approval required' using errcode = '42501';
  end if;
  if expected_digest is null then raise exception 'approval digest required' using errcode = '22023'; end if;
  trimmed_reason := btrim(coalesce(reason, ''));
  if trimmed_reason = '' or octet_length(trimmed_reason) > 8000 then
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
