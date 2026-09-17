-- Adam -> Nour fan-out. The same atomic, database-enforced pattern as Ziad's
-- auto-enqueue, one hop later: Nour's task must exist the instant Ziad's
-- analysis is durably persisted, in the same transaction as that completion.
begin;
grant bagos_content_calendar_command to postgres;
grant create on schema private to bagos_content_calendar_command;

-- Nour's command role reads exactly the one upstream row it needs to recover
-- the original human requester and run lineage, and nothing else from the
-- reel-analysis schema. bagos_reel_analysis_command is untouched by this
-- migration and gains no content-calendar privilege.
grant select on public.reel_analysis_tasks to bagos_content_calendar_command;
create policy content_calendar_command_ziad_tasks_read on public.reel_analysis_tasks
  for select to bagos_content_calendar_command using (true);

-- Fires inside the very transaction that complete_reel_analysis_attempt uses
-- to insert into reel_analysis_outcomes, so Nour's task becomes durable
-- atomically with Ziad's completion. Unlike Ziad's fan-out, Nour's worker can
-- genuinely produce a real artifact from this brief once claimed, so no
-- "known gap" is recorded here. The idempotency key is Ziad's own attempt id
-- (unique per reel_analysis_outcomes row, itself unique per task), so a
-- second fan-out attempt for the same source collides with the pre-existing
-- unique(tenant_id,requester_id,idempotency_key) constraint on
-- content_calendar_tasks instead of relying on a hand-rolled existence check.
create function private.enqueue_content_calendar_after_reel_analysis() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reel_task public.reel_analysis_tasks%rowtype; reel_run public.agent_runs%rowtype;
  campaign uuid; objective_id uuid; run uuid; artifact uuid; revision_id uuid; task uuid;
  idem uuid; brief jsonb; body jsonb; digest text;
begin
  select * into reel_task from public.reel_analysis_tasks where tenant_id = new.tenant_id and id = new.task_id;
  if not found then raise exception 'missing_reel_analysis_task' using errcode = '55000'; end if;
  select * into reel_run from public.agent_runs where tenant_id = new.tenant_id and id = reel_task.run_id;
  if not found then raise exception 'missing_reel_analysis_run' using errcode = '55000'; end if;
  task := gen_random_uuid(); idem := new.attempt_id;
  insert into public.campaigns(tenant_id,title,owner_membership_id)
    values (new.tenant_id,'Content calendar (auto)',reel_run.requester_membership_id) returning id into campaign;
  insert into public.objectives(tenant_id,campaign_id,content,revision)
    values (new.tenant_id,campaign,'Draft a 7-day calendar from the completed reel analysis',1) returning id into objective_id;
  insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values (new.tenant_id,objective_id,reel_run.requester_membership_id,'content_calendar','queued',
      jsonb_build_object('schema_version',1,'source_task_id',reel_task.id,'source_attempt_id',new.attempt_id),1)
    returning id into run;
  brief := jsonb_build_object('idempotencyKey',idem,'objective','Draft a 7-day calendar from the completed reel analysis',
    'sourceRevisionId',new.artifact_revision_id,'requestedPlatforms',jsonb_build_array('instagram','facebook'));
  body := jsonb_build_object('contractVersion','content-calendar.v1','brief',brief,'liveEffects',false);
  insert into public.artifacts(tenant_id,campaign_id,run_id,type) values (new.tenant_id,campaign,run,'content_calendar_brief') returning id into artifact;
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (new.tenant_id,artifact,1,encode(sha256(convert_to(body::text,'UTF8')),'hex'),'orchestrator',
      jsonb_build_object('schema_version',1,'task_id',task),jsonb_build_object('schema_version',1,'status','submitted')) returning id into revision_id;
  insert into public.content_calendar_revision_bodies(tenant_id,revision_id,body) values (new.tenant_id,revision_id,body);
  update public.artifacts set current_revision_id = revision_id where id = artifact and tenant_id = new.tenant_id;
  digest := encode(sha256(convert_to(brief::text,'UTF8')),'hex');
  insert into public.content_calendar_tasks(id,tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values (task,new.tenant_id,reel_task.requester_id,run,revision_id,idem,digest);
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (new.tenant_id,'system',reel_task.requester_id,'content_calendar_task_auto_enqueued',task,new.attempt_id,
      jsonb_build_object('schema_version',1,'run_id',run,'brief_revision_id',revision_id,'source_task_id',reel_task.id));
  return new;
end $$;
alter function private.enqueue_content_calendar_after_reel_analysis() owner to bagos_content_calendar_command;
revoke all on function private.enqueue_content_calendar_after_reel_analysis()
  from public, anon, authenticated, service_role, bagos_reel_analysis_command, bagos_content_calendar_executor;

create trigger content_calendar_auto_enqueue after insert on public.reel_analysis_outcomes
  for each row execute function private.enqueue_content_calendar_after_reel_analysis();

revoke create on schema private from bagos_content_calendar_command;
revoke bagos_content_calendar_command from postgres;
commit;
