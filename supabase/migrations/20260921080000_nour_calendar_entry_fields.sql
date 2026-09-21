-- The calendar entry gained the fields a post actually needs -- objective,
-- hook, caption, call to action, asset requirement and evidence references --
-- so the completion validation's exact key set has to match, or every genuine
-- artifact would be rejected as invalid_contract.
begin;

create or replace function private.validate_content_calendar_completion(
  task public.content_calendar_tasks, attempt public.content_calendar_attempts, artifact jsonb
) returns void language plpgsql set search_path = '' as $$
declare brief jsonb; entry jsonb; binding jsonb; day_indexes jsonb; reference jsonb;
  binding_keys text[] := array['contractVersion','tenantId','taskId','runId','attemptId','liveEffects','sourceRevisionId'];
  artifact_keys text[] := binding_keys || array['producedBy','entries'];
  entry_keys text[] := binding_keys || array['dayIndex','platform','format','conceptTitle',
    'objective','hook','caption','callToAction','assetRequirement','evidenceRefs'];
begin
  if artifact is null or jsonb_typeof(artifact) is distinct from 'object' or octet_length(artifact::text) > 1048576 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  select body->'brief' into brief from public.content_calendar_revision_bodies
    where tenant_id = task.tenant_id and revision_id = task.brief_revision_id;
  if brief is null or not private.content_calendar_platforms_valid(brief->'requestedPlatforms')
    or jsonb_typeof(brief->'sourceRevisionId') is distinct from 'string'
    or coalesce(brief->>'sourceRevisionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  binding := jsonb_build_object('contractVersion','content-calendar.v1','tenantId',task.tenant_id,
    'taskId',task.id,'runId',task.run_id,'attemptId',attempt.id,'liveEffects',false,'sourceRevisionId',brief->'sourceRevisionId');
  if not (artifact ?& artifact_keys) or artifact - artifact_keys <> '{}'::jsonb
    or not (artifact @> binding) or artifact->>'producedBy' is distinct from 'content_creator'
    or jsonb_typeof(artifact->'entries') is distinct from 'array' then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  if jsonb_array_length(artifact->'entries') <> 7 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
  for entry in select jsonb_array_elements(artifact->'entries') loop
    -- A whitelist membership check on the raw text avoids ever casting an
    -- attacker-controlled jsonb number to int inside a boolean OR chain,
    -- whose operand evaluation order Postgres does not guarantee.
    if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& entry_keys) or entry - entry_keys <> '{}'::jsonb
      or not (entry @> binding) or coalesce(entry->>'format','') not in ('post','reel','story','carousel')
      or not private.research_text_valid(entry->'conceptTitle')
      or not private.research_text_valid(entry->'objective')
      or not private.research_text_valid(entry->'hook')
      or not private.research_text_valid(entry->'caption')
      or not private.research_text_valid(entry->'callToAction')
      or not private.research_text_valid(entry->'assetRequirement')
      or jsonb_typeof(entry->'evidenceRefs') is distinct from 'array'
      or jsonb_array_length(entry->'evidenceRefs') > 12
      or jsonb_typeof(entry->'dayIndex') is distinct from 'number'
      or coalesce(entry->>'dayIndex','') not in ('0','1','2','3','4','5','6') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
    -- evidenceRefs may be empty -- an entry can rest on the analysis as a whole
    -- rather than a numbered finding -- but any entry present must be real text,
    -- not a null or an object smuggled through an untyped array.
    for reference in select jsonb_array_elements(entry->'evidenceRefs') loop
      if not private.research_text_valid(reference) then
        raise exception 'invalid_contract' using errcode = '22023';
      end if;
    end loop;
    if coalesce(entry->>'platform','') not in ('instagram','facebook') then
      raise exception 'invalid_contract' using errcode = '22023';
    end if;
    if not (brief->'requestedPlatforms' @> jsonb_build_array(entry->'platform')) then
      raise exception 'unrequested_platform' using errcode = '22023';
    end if;
  end loop;
  select coalesce(jsonb_agg(distinct e->'dayIndex'),'[]'::jsonb) into day_indexes from jsonb_array_elements(artifact->'entries') e;
  if jsonb_array_length(day_indexes) <> 7 then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;
end $$;

commit;
