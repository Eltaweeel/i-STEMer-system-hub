-- Rejection is the other half of a revision-bound decision. It mirrors
-- 20260915225738's approve_agent_revision gate exactly: an authenticated
-- tenant owner at AAL2, the same digest binding against the stored revision,
-- refused unless the approval is still pending, and audited in the same
-- transaction. Only the terminal status and the recorded reason differ.
begin;

create function private.reject_agent_revision(
  wanted_tenant uuid,
  approval_id uuid,
  expected_digest text,
  reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.approvals%rowtype;
  revision public.artifact_revisions%rowtype;
  member_role text;
  trimmed_reason text;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  select m.role into member_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = auth.uid() and m.status = 'active';
  if member_role <> 'owner' then raise exception 'owner approval required' using errcode = '42501'; end if;
  trimmed_reason := btrim(reason);
  if trimmed_reason is null or length(trimmed_reason) not between 1 and 2000 then
    raise exception 'rejection reason required' using errcode = '22023';
  end if;
  select a.* into row from public.approvals a where a.id = approval_id and a.tenant_id = wanted_tenant for update;
  if row.id is null then raise exception 'approval not found' using errcode = '23503'; end if;
  if row.status <> 'pending' then raise exception 'approval is not pending' using errcode = '55000'; end if;
  select r.* into revision from public.artifact_revisions r where r.id = row.artifact_revision_id and r.tenant_id = wanted_tenant;
  if revision.content_digest <> expected_digest then raise exception 'approval digest mismatch' using errcode = '22023'; end if;
  update public.approvals set status = 'rejected', action_snapshot = action_snapshot || jsonb_build_object('rejected_by', auth.uid(), 'rejected_at', clock_timestamp(), 'reason', trimmed_reason) where id = approval_id and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_artifact_rejected', row.artifact_revision_id, row.action_revision, gen_random_uuid(), jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'content_digest', expected_digest, 'reason', trimmed_reason));
  return jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'status', 'rejected', 'content_digest', expected_digest);
end;
$$;

alter function private.reject_agent_revision(uuid,uuid,text,text) owner to postgres;
revoke all on function private.reject_agent_revision(uuid,uuid,text,text) from public, anon, service_role;
grant execute on function private.reject_agent_revision(uuid,uuid,text,text) to authenticated;

commit;
