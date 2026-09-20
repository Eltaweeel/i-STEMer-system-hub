-- Nour's completed calendar is the strategy Hadeer must approve. This trigger
-- creates that pending approval atomically with private.complete_content_calendar_attempt's
-- own insert into content_calendar_outcomes -- either both persist, or a
-- failure here rolls the whole completion back with it, the same guarantee
-- 20260918070100's fan-out trigger gives the downstream task it creates.
begin;

-- content_calendar_approval_guard existed only because no command could yet
-- create or judge an approval for a content-calendar artifact ("a separate,
-- not-yet-built command surface"). That command is this migration; the guard
-- would now block its own insert (and the reject/invalidate commands that
-- follow), so it is retired rather than worked around. research/reel-analysis
-- approvals remain unbuilt and their guards are untouched.
drop trigger content_calendar_approval_guard on public.approvals;

create role bagos_approval_command nologin noinherit nobypassrls;
grant bagos_approval_command to postgres;
grant usage, create on schema private to bagos_approval_command;
grant usage on schema public to bagos_approval_command;
grant usage on type private.bounded_payload, private.sha256 to bagos_approval_command;

-- Exactly the two reads this trigger needs: the landed revision's own digest
-- and revision number (never a caller-supplied digest), and the human
-- requester behind the completed task, attributed the same way system audit
-- entries elsewhere name the person who asked for the work.
grant select on public.artifact_revisions, public.content_calendar_tasks to bagos_approval_command;
create policy approval_command_revisions_read on public.artifact_revisions for select to bagos_approval_command using (true);
create policy approval_command_calendar_tasks_read on public.content_calendar_tasks for select to bagos_approval_command using (true);

-- research_approval_guard and reel_analysis_approval_guard (20260916055804,
-- 20260917090000) still fire on every insert or update to public.approvals --
-- they are what keeps those two stages unbuilt -- and they are not security
-- definer, so they run as whichever role is writing the row. Their own EXISTS
-- checks read public.artifacts and public.agent_runs to decide whether the
-- targeted revision belongs to their mode; without read access here those
-- checks fail closed on a permission error instead of the clean "not this
-- mode" pass a content-calendar-bound approval must get.
grant select on public.artifacts, public.agent_runs to bagos_approval_command;
create policy approval_command_artifacts_read on public.artifacts for select to bagos_approval_command using (true);
create policy approval_command_runs_read on public.agent_runs for select to bagos_approval_command using (true);

grant insert on public.approvals to bagos_approval_command;
create policy approval_command_approvals_insert on public.approvals for insert to bagos_approval_command with check (true);
grant insert on public.audit_log to bagos_approval_command;
create policy approval_command_audit_insert on public.audit_log for insert to bagos_approval_command with check (true);

create function private.create_strategy_approval_after_content_calendar_outcome() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  revision public.artifact_revisions%rowtype;
  requester uuid;
  approval_id uuid;
begin
  select * into revision from public.artifact_revisions where tenant_id = new.tenant_id and id = new.artifact_revision_id;
  if not found then raise exception 'missing_content_calendar_revision' using errcode = '55000'; end if;
  select requester_id into requester from public.content_calendar_tasks where tenant_id = new.tenant_id and id = new.task_id;
  if requester is null then raise exception 'missing_content_calendar_task' using errcode = '55000'; end if;
  insert into public.approvals(tenant_id, artifact_revision_id, action_snapshot, action_digest, action_revision, tier, confirmation_required, status, stage, destination)
    values (new.tenant_id, new.artifact_revision_id,
      jsonb_build_object('schema_version', 1, 'task_id', new.task_id, 'attempt_id', new.attempt_id, 'requester_id', requester),
      revision.content_digest, revision.revision, 1, true, 'pending', 'strategy',
      jsonb_build_object('schema_version', 1, 'kind', 'content_calendar_strategy', 'task_id', new.task_id, 'attempt_id', new.attempt_id))
    returning id into approval_id;
  insert into public.audit_log(tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, evidence)
    values (new.tenant_id, 'system', requester, 'strategy_approval_auto_created', new.artifact_revision_id, revision.revision, new.attempt_id,
      jsonb_build_object('schema_version', 1, 'approval_id', approval_id, 'task_id', new.task_id));
  return new;
end $$;
alter function private.create_strategy_approval_after_content_calendar_outcome() owner to bagos_approval_command;
revoke all on function private.create_strategy_approval_after_content_calendar_outcome()
  from public, anon, authenticated, service_role, bagos_content_calendar_command, bagos_content_calendar_executor;

create trigger strategy_approval_auto_create after insert on public.content_calendar_outcomes
  for each row execute function private.create_strategy_approval_after_content_calendar_outcome();

revoke create on schema private from bagos_approval_command;
revoke bagos_approval_command from postgres;
commit;
