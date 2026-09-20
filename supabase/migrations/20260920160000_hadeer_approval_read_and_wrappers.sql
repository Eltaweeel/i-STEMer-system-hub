-- Making the approval stage reachable from the application. Two gaps closed:
-- approvals is revoked from authenticated entirely, so Hadeer had no way to see
-- what was waiting for her; and the approve/reject commands live in private,
-- which PostgREST does not expose, so the existing route could not call them.
begin;

-- Any active member may see what is pending; only an owner at AAL2 may decide,
-- which the approve/reject commands enforce for themselves. Reading is
-- deliberately the wider permission: an operator who cannot approve still needs
-- to know the work is blocked on someone who can.
create function private.read_tenant_approvals(wanted_tenant uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid; actor_role text; rows jsonb;
begin
  actor := auth.uid();
  if actor is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select m.role into actor_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = actor and m.status = 'active';
  if actor_role is null then raise exception 'tenant access denied' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'approvalId', ap.id,
      'stage', ap.stage,
      'status', ap.status,
      'artifactRevisionId', ap.artifact_revision_id,
      -- The digest a decision must echo back. Surfacing it is what lets the
      -- client bind its decision to the exact revision it was shown, so a
      -- revision that changes underneath produces a refused decision rather
      -- than a silently misapplied one.
      'contentDigest', v.content_digest,
      'revision', v.revision,
      'createdAt', ap.created_at
    ) order by ap.created_at desc), '[]'::jsonb) into rows
  from public.approvals ap
  join public.artifact_revisions v on (v.tenant_id, v.id) = (ap.tenant_id, ap.artifact_revision_id)
  where ap.tenant_id = wanted_tenant;

  return jsonb_build_object('schemaVersion', 1, 'tenantId', wanted_tenant,
    'viewerRole', actor_role, 'canDecide', actor_role = 'owner', 'approvals', rows);
end;
$$;

alter function private.read_tenant_approvals(uuid) owner to postgres;
revoke all on function private.read_tenant_approvals(uuid) from public, anon, service_role;
grant execute on function private.read_tenant_approvals(uuid) to authenticated;

-- PostgREST reaches private commands only through public invoker wrappers, the
-- convention submit_research_brief and the retry commands already follow. These
-- add no authority: each definer function still derives the caller from Auth and
-- still demands owner plus AAL2 before recording a decision.
create function public.read_tenant_approvals(wanted_tenant uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.read_tenant_approvals(wanted_tenant); $$;
create function public.approve_agent_revision(wanted_tenant uuid, approval_id uuid, expected_digest text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.approve_agent_revision(wanted_tenant,approval_id,expected_digest); $$;
create function public.reject_agent_revision(wanted_tenant uuid, approval_id uuid, expected_digest text, reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.reject_agent_revision(wanted_tenant,approval_id,expected_digest,reason); $$;

revoke all on function public.read_tenant_approvals(uuid) from public, anon, service_role;
revoke all on function public.approve_agent_revision(uuid,uuid,text) from public, anon, service_role;
revoke all on function public.reject_agent_revision(uuid,uuid,text,text) from public, anon, service_role;
grant execute on function public.read_tenant_approvals(uuid) to authenticated;
grant execute on function public.approve_agent_revision(uuid,uuid,text) to authenticated;
grant execute on function public.reject_agent_revision(uuid,uuid,text,text) to authenticated;

commit;
