-- The research executor's only way to record usage. private.record_agent_usage
-- (20260920100000_hadeer_usage_allowances) takes the agent category from its
-- caller and does not check the research tenant binding, so a research worker
-- holding it could write the first, and therefore final, usage row for a reel
-- or calendar attempt. This command fixes the category, requires a research
-- attempt of the bound tenant, and is the research executor's replacement for
-- the broad function. Everything it records is still derived from the attempt
-- and task rows by record_agent_usage, never taken from the caller.
--
-- Scope: research executor only. The reel and calendar executors keep their
-- record_agent_usage grants unchanged; they can still record usage for any
-- category, including a research attempt. That reverse path must be closed the
-- same way before either pipeline gets a worker login.
begin;

-- Both tables read below are FORCE RLS with no policy for postgres. The owner
-- therefore has to bypass RLS, or every call would be refused as stale_attempt
-- and usage would silently stop being recorded. Refuse to install instead.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres' and (rolsuper or rolbypassrls)) then
    raise exception 'record_research_usage requires its owner postgres to bypass RLS' using errcode = '55000';
  end if;
end $$;

create function private.record_research_usage(wanted_attempt uuid, reported_tokens integer, usage_reported boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare bound_tenant uuid; attempt_tenant uuid;
begin
  select tenant_id into bound_tenant from private.research_brand_binding where singleton;
  select a.tenant_id into attempt_tenant from public.research_attempts a where a.id = wanted_attempt;
  -- One answer for "not a research attempt" and "a research attempt of another
  -- tenant", matching record_agent_usage's own answer for an unknown attempt.
  if bound_tenant is null or attempt_tenant is distinct from bound_tenant then
    raise exception 'stale_attempt' using errcode = '55000';
  end if;
  return private.record_agent_usage(wanted_attempt, 'competitor_analyst', reported_tokens, usage_reported);
end;
$$;
alter function private.record_research_usage(uuid,integer,boolean) owner to postgres;
revoke all on function private.record_research_usage(uuid,integer,boolean) from public, anon, authenticated, service_role;
grant execute on function private.record_research_usage(uuid,integer,boolean) to bagos_research_executor;

revoke execute on function private.record_agent_usage(uuid,text,integer,boolean) from bagos_research_executor;
commit;
