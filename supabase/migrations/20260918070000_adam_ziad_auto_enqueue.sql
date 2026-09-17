-- Adam -> Ziad fan-out. Hadeer submits only the first brief; every downstream
-- task must appear on its own, the instant its upstream evidence is durable.
begin;
grant bagos_reel_analysis_command to postgres;
grant create on schema private to bagos_reel_analysis_command;

-- Ziad's command role reads exactly the one upstream row it needs to recover
-- the original human requester and run lineage for the task it is about to
-- create, and nothing else from the research schema. bagos_research_command
-- is untouched by this migration and gains no reel-analysis privilege.
grant select on public.agent_tasks to bagos_reel_analysis_command;
create policy reel_analysis_command_omar_tasks_read on public.agent_tasks
  for select to bagos_reel_analysis_command using (true);

-- Fires inside the very transaction that complete_research_attempt uses to
-- insert into research_outcomes, so Ziad's task becomes durable atomically
-- with Omar's completion: either both persist or, on any failure here, the
-- whole completion rolls back with it. The idempotency key is Omar's own
-- attempt id (unique per research_outcomes row, itself unique per task), so a
-- second fan-out attempt for the same source collides with the
-- pre-existing unique(tenant_id,requester_id,idempotency_key) constraint on
-- reel_analysis_tasks instead of relying on a hand-rolled existence check.
create function private.enqueue_reel_analysis_after_research() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  research_task public.agent_tasks%rowtype; research_run public.agent_runs%rowtype;
  campaign uuid; objective_id uuid; run uuid; artifact uuid; revision_id uuid; task uuid;
  idem uuid; brief jsonb; body jsonb; digest text;
begin
  select * into research_task from public.agent_tasks where tenant_id = new.tenant_id and id = new.task_id;
  if not found then raise exception 'missing_research_task' using errcode = '55000'; end if;
  select * into research_run from public.agent_runs where tenant_id = new.tenant_id and id = research_task.run_id;
  if not found then raise exception 'missing_research_run' using errcode = '55000'; end if;
  task := gen_random_uuid(); idem := new.attempt_id;
  insert into public.campaigns(tenant_id,title,owner_membership_id)
    values (new.tenant_id,'Reel analysis (auto)',research_run.requester_membership_id) returning id into campaign;
  insert into public.objectives(tenant_id,campaign_id,content,revision)
    values (new.tenant_id,campaign,'Analyze reel media for the completed research evidence',1) returning id into objective_id;
  insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values (new.tenant_id,objective_id,research_run.requester_membership_id,'reel_analysis','queued',
      jsonb_build_object('schema_version',1,'source_task_id',research_task.id,'source_attempt_id',new.attempt_id),1)
    returning id into run;
  -- No reel media exists yet at this point in the chain: attaching supplied
  -- frames/audio/transcript is a separate, not-yet-built ingestion step.
  -- suppliedModalities starts empty on purpose, so Ziad's own worker fails
  -- closed with 'uninspected_modality' instead of guessing over media it was
  -- never actually given.
  brief := jsonb_build_object('idempotencyKey',idem,'objective','Analyze reel media for the completed research evidence',
    'sourceRevisionId',new.artifact_revision_id,'requestedModalities',jsonb_build_array('video_frames','audio','transcript'),
    'suppliedModalities','[]'::jsonb);
  body := jsonb_build_object('contractVersion','reel-analysis.v1','brief',brief,'liveEffects',false);
  insert into public.artifacts(tenant_id,campaign_id,run_id,type) values (new.tenant_id,campaign,run,'reel_analysis_brief') returning id into artifact;
  insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values (new.tenant_id,artifact,1,encode(sha256(convert_to(body::text,'UTF8')),'hex'),'orchestrator',
      jsonb_build_object('schema_version',1,'task_id',task),jsonb_build_object('schema_version',1,'status','submitted')) returning id into revision_id;
  insert into public.reel_analysis_revision_bodies(tenant_id,revision_id,body) values (new.tenant_id,revision_id,body);
  update public.artifacts set current_revision_id = revision_id where id = artifact and tenant_id = new.tenant_id;
  digest := encode(sha256(convert_to(brief::text,'UTF8')),'hex');
  insert into public.reel_analysis_tasks(id,tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values (task,new.tenant_id,research_task.requester_id,run,revision_id,idem,digest);
  insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,target_reference,command_id,evidence)
    values (new.tenant_id,'system',research_task.requester_id,'reel_analysis_task_auto_enqueued',task,new.attempt_id,
      jsonb_build_object('schema_version',1,'run_id',run,'brief_revision_id',revision_id,'source_task_id',research_task.id));
  return new;
end $$;
alter function private.enqueue_reel_analysis_after_research() owner to bagos_reel_analysis_command;
revoke all on function private.enqueue_reel_analysis_after_research()
  from public, anon, authenticated, service_role, bagos_research_command, bagos_reel_analyst_executor;

create trigger reel_analysis_auto_enqueue after insert on public.research_outcomes
  for each row execute function private.enqueue_reel_analysis_after_research();

revoke create on schema private from bagos_reel_analysis_command;
revoke bagos_reel_analysis_command from postgres;
commit;
