-- set_usage_allowance lives in private, which PostgREST does not expose, so the
-- owner had no way to set a limit from the application at all. The wrapper adds
-- no authority: the definer function still derives the caller from Auth and
-- still demands owner plus AAL2 before writing.
begin;

-- The period is derived here rather than accepted from the caller, from the
-- same date_trunc('month', clock_timestamp()) expression the submission
-- command reads when it checks consumption. Passing it in would let a caller
-- write an allowance against a window enforcement never looks at, and would
-- let the two expressions drift apart.
create function public.set_usage_allowance(wanted_tenant uuid, member_user uuid, limit_tokens integer)
returns jsonb
language sql security invoker set search_path = '' as $$
  select private.set_usage_allowance(wanted_tenant, member_user,
    date_trunc('month', clock_timestamp())::date, limit_tokens);
$$;
revoke all on function public.set_usage_allowance(uuid,uuid,integer) from public, anon, service_role;
grant execute on function public.set_usage_allowance(uuid,uuid,integer) to authenticated;

commit;
