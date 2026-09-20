-- Reading usage back. usage_allowances and usage_records are revoked from
-- authenticated entirely, so every read goes through this one command, which
-- derives the caller from Auth and refuses to widen what that caller may see:
-- a member gets their own figures, an owner additionally gets every member's.
begin;

create function private.read_usage_summary(wanted_tenant uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid; actor_role text; period date; rows jsonb;
begin
  actor := auth.uid();
  if actor is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select m.role into actor_role from public.memberships m
    where m.tenant_id = wanted_tenant and m.user_id = actor and m.status = 'active';
  if actor_role is null then raise exception 'tenant access denied' using errcode = '42501'; end if;
  period := date_trunc('month', clock_timestamp())::date;

  -- consumedTokens sums only rows that carry a reported figure. unreportedRuns
  -- counts the rest separately rather than folding them in as zero: a run whose
  -- provider returned no usage number is not a run that cost nothing, and the
  -- two must stay distinguishable all the way to the screen.
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', m.user_id,
      'role', m.role,
      'limitTokens', a.token_limit,
      'consumedTokens', coalesce(u.reported_total, 0),
      'unreportedRuns', coalesce(u.unreported_runs, 0),
      'remainingTokens', case when a.token_limit is null then null
        else greatest(a.token_limit - coalesce(u.reported_total, 0), 0) end
    ) order by m.user_id), '[]'::jsonb) into rows
  from public.memberships m
  left join public.usage_allowances a
    on a.tenant_id = m.tenant_id and a.member_user_id = m.user_id and a.period_start = period
  left join lateral (
    select sum(r.reported_tokens) filter (where r.usage_reported) as reported_total,
           count(*) filter (where not r.usage_reported) as unreported_runs
    from public.usage_records r
    where r.tenant_id = m.tenant_id and r.requester_id = m.user_id
      and r.created_at >= date_trunc('month', clock_timestamp())
      and r.created_at < date_trunc('month', clock_timestamp()) + interval '1 month'
  ) u on true
  where m.tenant_id = wanted_tenant and m.status = 'active'
    and (actor_role = 'owner' or m.user_id = actor);

  -- A null limit means no allowance row for this period, which the submission
  -- command treats as unlimited; the caller must render that as "no limit set",
  -- never as a zero balance.
  return jsonb_build_object(
    'schemaVersion', 1,
    'tenantId', wanted_tenant,
    'periodStart', period,
    'viewerId', actor,
    'viewerRole', actor_role,
    -- Nothing here reports the upstream subscription balance: no API exposes
    -- it, so it is absent by construction rather than estimated.
    'providerBalance', 'unavailable',
    'members', rows);
end;
$$;

alter function private.read_usage_summary(uuid) owner to postgres;
revoke all on function private.read_usage_summary(uuid) from public, anon, service_role;
grant execute on function private.read_usage_summary(uuid) to authenticated;

-- PostgREST reaches the private command only through a public invoker wrapper,
-- matching submit_research_brief and the retry commands. The wrapper adds no
-- authority of its own: the definer function still derives the caller from Auth
-- and still refuses a non-member.
create function public.read_usage_summary(wanted_tenant uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.read_usage_summary(wanted_tenant); $$;
revoke all on function public.read_usage_summary(uuid) from public, anon, service_role;
grant execute on function public.read_usage_summary(uuid) to authenticated;

commit;
