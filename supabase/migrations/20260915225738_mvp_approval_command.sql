-- Human approval is an explicit, MFA-assured state transition. Publication is
-- still outside this migration and remains impossible through this command.
begin;

alter table public.approvals drop constraint approvals_status_check;
alter table public.approvals add constraint approvals_status_check check (status in ('pending','approved','rejected'));
drop trigger if exists evidence_immutable on public.approvals;

create function private.approve_agent_revision(
  wanted_tenant uuid,
  approval_id uuid,
  expected_digest text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.approvals%rowtype;
  revision public.artifact_revisions%rowtype;
  member_role text;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'mfa assurance required' using errcode = '42501';
  end if;
  select m.role into member_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = auth.uid() and m.status = 'active';
  if member_role <> 'owner' then raise exception 'owner approval required' using errcode = '42501'; end if;
  select a.* into row from public.approvals a where a.id = approval_id and a.tenant_id = wanted_tenant for update;
  if row.id is null then raise exception 'approval not found' using errcode = '23503'; end if;
  if row.status <> 'pending' then raise exception 'approval is not pending' using errcode = '55000'; end if;
  select r.* into revision from public.artifact_revisions r where r.id = row.artifact_revision_id and r.tenant_id = wanted_tenant;
  if revision.content_digest <> expected_digest then raise exception 'approval digest mismatch' using errcode = '22023'; end if;
  update public.approvals set status = 'approved', action_snapshot = action_snapshot || jsonb_build_object('approved_by', auth.uid(), 'approved_at', clock_timestamp()) where id = approval_id and tenant_id = wanted_tenant;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, evidence)
    values (wanted_tenant, 'human', auth.uid(), 'agent_artifact_approved', row.artifact_revision_id, row.action_revision, gen_random_uuid(), jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'content_digest', expected_digest));
  return jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'status', 'approved', 'content_digest', expected_digest);
end;
$$;

alter function private.approve_agent_revision(uuid,uuid,text) owner to postgres;
revoke all on function private.approve_agent_revision(uuid,uuid,text) from public, anon, service_role;
grant execute on function private.approve_agent_revision(uuid,uuid,text) to authenticated;

commit;
