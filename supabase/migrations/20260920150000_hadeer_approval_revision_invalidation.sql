-- A pending or already-approved decision describes one specific revision's
-- content. Once a newer revision of the same artifact lands, that decision no
-- longer describes what exists and must stop being actionable. This lives as
-- a trigger on artifact_revisions -- insert-only and immutable since Phase 1A
-- -- rather than inside the three completion commands, so every present and
-- future producer of a new revision inherits the same guarantee without
-- having to remember to invalidate anything itself.
begin;
grant bagos_approval_command to postgres;
grant usage, create on schema private to bagos_approval_command;

grant select, update (status, action_snapshot) on public.approvals to bagos_approval_command;
create policy approval_command_approvals_read on public.approvals for select to bagos_approval_command using (true);
create policy approval_command_approvals_invalidate on public.approvals for update to bagos_approval_command using (true) with check (true);

create function private.invalidate_approvals_on_new_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  stale record;
  actor uuid;
begin
  -- new.id cannot already be referenced by any approval: approvals.artifact_revision_id
  -- has a foreign key to an existing revision, and this row did not exist
  -- before this statement. v.id <> new.id is kept anyway so a self-invalidation
  -- is structurally impossible here, not merely accidental.
  for stale in
    select a.id, a.status, a.action_snapshot, a.action_revision, a.artifact_revision_id
    from public.approvals a
    join public.artifact_revisions v on (v.tenant_id, v.id) = (a.tenant_id, a.artifact_revision_id)
    where v.tenant_id = new.tenant_id and v.artifact_id = new.artifact_id and v.id <> new.id
      and a.status in ('pending', 'approved')
    for update of a
  loop
    -- The requester who was captured on the approval at creation time is the
    -- most faithful actor for an event that supersedes their decision; a
    -- revision with no such record (never produced by this migration's own
    -- auto-create trigger) falls back to naming the new revision itself.
    actor := coalesce(nullif(stale.action_snapshot->>'requester_id', '')::uuid, new.id);
    update public.approvals set status = 'invalidated',
      action_snapshot = stale.action_snapshot || jsonb_build_object('invalidated_at', clock_timestamp(), 'invalidated_by_revision_id', new.id)
      where id = stale.id and tenant_id = new.tenant_id;
    insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, evidence)
      values (new.tenant_id, 'system', actor, 'agent_artifact_approval_invalidated', stale.artifact_revision_id, stale.action_revision, new.id,
        jsonb_build_object('schema_version', 1, 'approval_id', stale.id, 'previous_status', stale.status, 'new_revision_id', new.id));
  end loop;
  return new;
end $$;
alter function private.invalidate_approvals_on_new_revision() owner to bagos_approval_command;
revoke all on function private.invalidate_approvals_on_new_revision() from public, anon, authenticated, service_role;

create trigger invalidate_stale_approvals after insert on public.artifact_revisions
  for each row execute function private.invalidate_approvals_on_new_revision();

revoke create on schema private from bagos_approval_command;
revoke bagos_approval_command from postgres;
commit;
