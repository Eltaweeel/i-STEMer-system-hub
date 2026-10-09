-- Phase B post-check. The apply tool runs it inside the Phase B transaction, after B1..B6 and their ledger rows and
-- before COMMIT; it is digest-pinned like the migrations. Every check RAISES on a mismatch (no ASSERT, which can be
-- disabled), so a failure rolls the whole batch back and nothing of Phase B becomes visible.
--
-- 1. Identity: each affected function exists exactly once under its name, with the reviewed body (SHA-256 of
--    prosrc), language, owner, SECURITY DEFINER flag, search_path setting and the exact set of roles holding EXECUTE.
--    Expected values were captured from the reviewed files on PostgreSQL 17.6 (supabase/tests/hosted-roles.test.mjs
--    re-derives and compares them).
-- 2. Behaviour: the approve/reject entry points refuse a caller with no assurance claim, with aal1, and an aal2
--    caller who is not a member, each with its exact error, using random ids and a NULL digest. The pre-Phase-B bodies
--    let the last two through to 'approval not found' (23503) instead, which aborts this check. Every path raises
--    before any write, and the claims are transaction-local.
-- 3. The new table keeps forced RLS.
do $identity$
declare
  expected constant jsonb := $json$[
    {"fn":"private.approve_agent_revision(uuid,uuid,text)","owner":"postgres","lang":"plpgsql","secdef":true,"body":"e2b0d918620ac2f3d80672d917bc37a5c1ed0ff18fe3c02fcf870b713f254f2a","execute":["authenticated","postgres"]},
    {"fn":"private.reject_agent_revision(uuid,uuid,text,text)","owner":"postgres","lang":"plpgsql","secdef":true,"body":"12a984e8646e9c7a3e15beea41f77dc8624e09f77b1feeba3ac2476d55569566","execute":["authenticated","postgres"]},
    {"fn":"private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)","owner":"bagos_approval_command","lang":"plpgsql","secdef":true,"body":"cd5be5e6083242edafb53dc126eb761c387dbdb66cf4286d0f280f9535159166","execute":["authenticated","bagos_approval_command"]},
    {"fn":"private.read_tenant_approvals(uuid)","owner":"postgres","lang":"plpgsql","secdef":true,"body":"aa679adf927644daa184462fe914dd33d6e6091fee5de1b46920ab7227f288f5","execute":["authenticated","postgres"]},
    {"fn":"private.finished_post_calendar_approved(uuid,uuid)","owner":"postgres","lang":"sql","secdef":true,"body":"275862c2b233b226dd7c47743c848a27e360bbefc053b1b8f755bfb358b643a8","execute":["postgres"]},
    {"fn":"private.retry_agent_workflow(uuid,uuid)","owner":"postgres","lang":"plpgsql","secdef":true,"body":"8386915e08255c4377fd7b3b6cd2b662f929201ede6e45ebb2af1db65046852c","execute":["authenticated","postgres"]},
    {"fn":"public.approve_agent_revision(uuid,uuid,text)","owner":"postgres","lang":"sql","secdef":false,"body":"7086b5d28af9fa312638bb59d7c1a111b5cd872a86e5431722046fbe2dda6ead","execute":["authenticated","postgres"]},
    {"fn":"public.reject_agent_revision(uuid,uuid,text,text)","owner":"postgres","lang":"sql","secdef":false,"body":"c11231492e0f826085378e6f206ff0c6029478df0b0f6ab19c81fc086ff021d2","execute":["authenticated","postgres"]},
    {"fn":"public.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)","owner":"postgres","lang":"sql","secdef":false,"body":"27773e07b4682da0e399cc141c4559143ec51026296c5b0a59d8d37f3391f197","execute":["authenticated","postgres"]},
    {"fn":"public.read_tenant_approvals(uuid)","owner":"postgres","lang":"sql","secdef":false,"body":"bc4cd2be021cc5abc32451f87791a7885a5119ca9fcc37f95dc1fe2db89ee308","execute":["authenticated","postgres"]}
  ]$json$;
  item jsonb;
  fn regprocedure;
  got record;
  overloads integer;
begin
  for item in select value from jsonb_array_elements(expected) loop
    fn := to_regprocedure(item->>'fn');
    if fn is null then raise exception 'phase-b post-check: % is missing', item->>'fn'; end if;
    select pg_get_userbyid(p.proowner)::text as owner, l.lanname as lang, p.prosecdef as secdef, p.proconfig as config,
        encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as body,
        array(select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE' order by 1) as executors,
        p.pronamespace, p.proname
      into got from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = fn;
    if got.owner is distinct from item->>'owner' or got.lang is distinct from item->>'lang'
      or got.secdef is distinct from (item->>'secdef')::boolean or got.config is distinct from array['search_path=""']
      or got.body is distinct from item->>'body'
      or got.executors is distinct from array(select jsonb_array_elements_text(item->'execute') order by 1) then
      raise exception 'phase-b post-check: % differs from the reviewed definition (owner %, lang %, secdef %, config %, body %, executors %)',
        item->>'fn', got.owner, got.lang, got.secdef, got.config, got.body, got.executors;
    end if;
    select count(*) into overloads from pg_proc where pronamespace = got.pronamespace and proname = got.proname;
    if overloads <> 1 then raise exception 'phase-b post-check: % has % definitions, expected exactly one', item->>'fn', overloads; end if;
  end loop;

  if not exists (select 1 from pg_class where oid = to_regclass('public.finished_post_revision_bodies') and relrowsecurity and relforcerowsecurity) then
    raise exception 'phase-b post-check: public.finished_post_revision_bodies is missing or does not force RLS';
  end if;
end $identity$;

do $behaviour$
declare
  outsider constant text := gen_random_uuid()::text;
  cases constant jsonb := $json$[
    {"label":"no assurance claim","claims":{"role":"authenticated"},"expect":"mfa assurance required"},
    {"label":"aal1","claims":{"role":"authenticated","aal":"aal1"},"expect":"mfa assurance required"},
    {"label":"aal2 non-member","claims":{"role":"authenticated","aal":"aal2"},"expect":"owner approval required"}
  ]$json$;
  probe jsonb;
  claims jsonb;
  answer text;
begin
  for probe in select value from jsonb_array_elements(cases) loop
    claims := (probe->'claims') || jsonb_build_object('sub', outsider);
    perform set_config('request.jwt.claim.sub', outsider, true);
    perform set_config('request.jwt.claims', claims::text, true);
    begin
      perform public.approve_agent_revision(gen_random_uuid(), gen_random_uuid(), null);
      raise exception 'phase-b post-check: approve let an outsider through (%)', probe->>'label';
    exception when insufficient_privilege then
      get stacked diagnostics answer = message_text;
      if answer is distinct from probe->>'expect' then
        raise exception 'phase-b post-check: approve answered "%" for %, expected "%"', answer, probe->>'label', probe->>'expect';
      end if;
    end;
    begin
      perform public.reject_agent_revision(gen_random_uuid(), gen_random_uuid(), null, 'phase-b post-check probe');
      raise exception 'phase-b post-check: reject let an outsider through (%)', probe->>'label';
    exception when insufficient_privilege then
      get stacked diagnostics answer = message_text;
      if answer is distinct from probe->>'expect' then
        raise exception 'phase-b post-check: reject answered "%" for %, expected "%"', answer, probe->>'label', probe->>'expect';
      end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $behaviour$;
