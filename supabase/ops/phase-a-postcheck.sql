-- Phase A post-check. The apply tool runs it inside the Phase A transaction, after 20261008120000 and its ledger row
-- and before COMMIT; it is digest-pinned like the migration. Every check RAISES on a mismatch, rolling Phase A back.
-- EXECUTE holders WITH GRANT OPTION are listed as role* and never match the reviewed lists. Expected values were
-- captured from the reviewed file on PostgreSQL 17.6 (supabase/tests/hosted-roles.test.mjs
-- re-derives and compares them).
do $identity$
declare
  expected constant jsonb := $json$[
    {"fn":"private.record_research_usage(uuid,integer,boolean)","owner":"postgres","lang":"plpgsql","secdef":true,"body":"f5f6941ed67752da666d81c433433eb327fa756387c0e7c5dc0fc8fb9b14267a","execute":["bagos_research_executor","postgres"]},
    {"fn":"private.record_agent_usage(uuid,text,integer,boolean)","owner":"postgres","lang":"plpgsql","secdef":true,"body":"796dff8d748af2a03790cc5ad0cbf620a84b61207da896eceb6dbc510ee1a662","execute":["bagos_content_calendar_executor","bagos_reel_analyst_executor","postgres"]}
  ]$json$;
  item jsonb;
  fn regprocedure;
  got record;
  overloads integer;
begin
  for item in select value from jsonb_array_elements(expected) loop
    fn := to_regprocedure(item->>'fn');
    if fn is null then raise exception 'phase-a post-check: % is missing', item->>'fn'; end if;
    select pg_get_userbyid(p.proowner)::text as owner, l.lanname as lang, p.prosecdef as secdef, p.proconfig as config,
        encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as body,
        array(select (case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end)
            || case when a.is_grantable then '*' else '' end
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE' order by 1) as executors,
        p.pronamespace, p.proname
      into got from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = fn;
    if got.owner is distinct from item->>'owner' or got.lang is distinct from item->>'lang'
      or got.secdef is distinct from (item->>'secdef')::boolean or got.config is distinct from array['search_path=""']
      or got.body is distinct from item->>'body'
      or got.executors is distinct from array(select jsonb_array_elements_text(item->'execute') order by 1) then
      raise exception 'phase-a post-check: % differs from the reviewed definition (owner %, lang %, secdef %, config %, body %, executors %)',
        item->>'fn', got.owner, got.lang, got.secdef, got.config, got.body, got.executors;
    end if;
    select count(*) into overloads from pg_proc where pronamespace = got.pronamespace and proname = got.proname;
    if overloads <> 1 then raise exception 'phase-a post-check: % has % definitions, expected exactly one', item->>'fn', overloads; end if;
  end loop;
end $identity$;
