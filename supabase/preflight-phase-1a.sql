-- READ ONLY. Prepared for later authorized review; NOT executed remotely.
-- A zero-row migration history does not establish an empty database.
begin read only;
select current_user, version();
select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private','storage') and c.relkind in ('r','p','v','m')
order by 1,2;
select nspname from pg_namespace where nspname='private';
select rolname, rolcanlogin, rolbypassrls, rolinherit from pg_roles
where rolname in ('postgres','anon','authenticated','service_role','bagos_membership_reader','bagos_platform_reader');
select to_regprocedure('auth.uid()') as auth_uid,
  to_regprocedure('storage.allow_any_operation(text[])') as storage_operation_helper;
select id, name, public from storage.buckets where id='phase-one-artifacts' or name='phase-one-artifacts';
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','private','storage') order by 1,2,3;
select table_schema,table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema in ('public','private','storage') and grantee in ('anon','authenticated','service_role','PUBLIC')
order by 1,2,3,4;
-- Data API schema exposure and Storage service versions also need dashboard/API
-- review; do not infer those from this catalog output.
rollback;
