import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames } from './migration-inventory.mjs';

// No URLs, environment credentials, sockets, persistent DB or Supabase client.
const db = new PGlite();
const publicTables = ['tenants', 'memberships', 'tenant_invitations', 'audit_log',
  'command_receipts', 'campaigns', 'objectives', 'agent_runs', 'file_objects',
  'artifacts', 'artifact_revisions', 'approvals'];
const privateTables = ['platform_admins', 'platform_audit', 'provisioning_operations'];
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const A = uuid(1), B = uuid(2), ownerA = uuid(101), ownerB = uuid(102);
const operator = uuid(103), multi = uuid(104), revoked = uuid(105), admin = uuid(106);
const payload = '{"schema_version":1,"source":"synthetic_test"}';
const digest = 'a'.repeat(64);
let migration;

async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
async function as(subject, action, role = 'authenticated', operation = 'object.get_authenticated') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('storage.operation', $2, true)", [subject ?? '', operation]);
    await db.exec(`set session authorization ${role}`);
    return await action();
  } finally {
    await db.exec('rollback');
    await db.exec('set session authorization postgres');
    await db.exec('reset role');
    assert.equal(await scalar('select current_user'), 'postgres');
  }
}
async function rejectsSql(sql, code = '42501', params = []) {
  await assert.rejects(db.query(sql, params), (error) => error.code === code);
}
async function rollbackProbe(action) {
  await db.exec('begin');
  try { await action(); } finally { await db.exec('rollback'); }
}

before(async () => {
  await db.exec(await readFile(new URL('./platform-stubs.sql', import.meta.url), 'utf8'));
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(files, migrationNames, 'review both baseline and full-chain fixtures before adding migrations');
  // Keep every original baseline assertion intact on the original migration.
  // research-packet.test.mjs separately executes the entire exact migration chain.
  migration = await readFile(new URL(`../migrations/${files[0]}`, import.meta.url), 'utf8');
  await db.exec(migration); // Executes the exact migration, no SQL rewriting.
  await db.exec('begin');
  await db.query("insert into public.tenants (id,name) values ($1,'Synthetic A'),($2,'Synthetic B')", [A, B]);
  // No user creation is authorized. Disable only Auth FK triggers during the
  // synthetic subject setup; all application constraints/RLS triggers stay on.
  const authTriggers = (await db.query(`select n.nspname, c.relname, t.tgname
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_constraint k on k.oid=t.tgconstraint
    where k.confrelid='auth.users'::regclass and t.tgrelid=k.conrelid`)).rows;
  for (const t of authTriggers) await db.exec(`alter table ${t.nspname}.${t.relname} disable trigger "${t.tgname}"`);
  for (const [id, tenant, subject, role, status] of [
    [201,A,ownerA,'owner','active'],[202,B,ownerB,'owner','active'],
    [203,A,operator,'operator','active'],[204,A,multi,'owner','active'],
    [205,B,multi,'operator','active'],[206,A,revoked,'operator','revoked'],
  ]) await db.query('insert into public.memberships(id,tenant_id,user_id,role,status) values ($1,$2,$3,$4,$5)', [uuid(id),tenant,subject,role,status]);
  await db.query('insert into private.platform_admins(user_id,active,granted_by) values ($1,true,$1)', [admin]);
  await db.exec('set constraints all immediate');
  for (const t of authTriggers) await db.exec(`alter table ${t.nspname}.${t.relname} enable trigger "${t.tgname}"`);
  await db.exec('set constraints all deferred');
  await db.exec("update public.tenants set status='active'");
  for (const [tenant, offset, ownerId] of [[A,0,201],[B,1000,202]]) {
    await db.query("insert into public.campaigns(id,tenant_id,title,owner_membership_id) values ($1,$2,'Synthetic campaign',$3)", [uuid(301+offset),tenant,uuid(ownerId)]);
    await db.query("insert into public.objectives(id,tenant_id,campaign_id,content,revision) values ($1,$2,$3,'Synthetic objective',1)", [uuid(302+offset),tenant,uuid(301+offset)]);
    await db.query("insert into public.agent_runs(id,tenant_id,objective_id,requester_membership_id,state,input_snapshot,authorization_version) values ($1,$2,$3,$4,'succeeded',$5,1)", [uuid(303+offset),tenant,uuid(302+offset),uuid(ownerId),payload]);
    await db.query('insert into public.file_objects(id,tenant_id,object_key,content_digest,content_type,size_bytes,provenance) values ($1,$2,$3,$4,$5,10,$6)', [uuid(304+offset),tenant,`${tenant}/${uuid(304+offset)}/${uuid(900+offset)}`,digest,'text/plain',payload]);
    await db.query("insert into public.artifacts(id,tenant_id,campaign_id,run_id,type) values ($1,$2,$3,$4,'text')", [uuid(305+offset),tenant,uuid(301+offset),uuid(303+offset)]);
    await db.query("insert into public.artifact_revisions(id,tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa,file_id) values ($1,$2,$3,1,$4,'synthetic_test',$5,$5,$6)", [uuid(306+offset),tenant,uuid(305+offset),digest,payload,uuid(304+offset)]);
    await db.query('update public.artifacts set current_revision_id=$1 where id=$2', [uuid(306+offset),uuid(305+offset)]);
    await db.query('insert into public.approvals(id,tenant_id,artifact_revision_id,action_snapshot,action_digest,action_revision,tier,confirmation_required) values ($1,$2,$3,$4,$5,1,2,true)', [uuid(307+offset),tenant,uuid(306+offset),payload,digest]);
    await db.query("insert into public.audit_log(tenant_id,actor_kind,actor_reference,event_type,command_id,evidence) values ($1,'system',$2,'synthetic_fixture',$3,$4)", [tenant,uuid(ownerId),uuid(308+offset),payload]);
    await db.query("insert into storage.objects(bucket_id,name) values ('phase-one-artifacts',$1)", [`${tenant}/${uuid(304+offset)}/${uuid(900+offset)}`]);
  }
  // Orphan and forged names must not become readable just by sharing a prefix.
  await db.query("insert into storage.objects(bucket_id,name) values ('phase-one-artifacts',$1),('phase-one-artifacts',$2)", [`${A}/${uuid(888)}/${uuid(889)}`,`${A}/${uuid(1304)}/${uuid(1900)}`]);
  await db.query('insert into public.file_objects(id,tenant_id,object_key,content_digest,content_type,size_bytes,provenance) values ($1,$2,$3,$4,$5,0,$6)', [uuid(888),A,`${A}/${uuid(888)}/${uuid(889)}`,digest,'text/plain',payload]);
  await db.exec('commit');
});
after(async () => { await db.close(); });

test('migration scope, all RLS flags, and no Auth users/invitations', async () => {
  const rows = (await db.query(`select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r'`)).rows;
  assert.deepEqual(rows.map((r) => `${r.nspname}.${r.relname}`).sort(), [
    ...publicTables.map((t) => `public.${t}`), ...privateTables.map((t) => `private.${t}`),
  ].sort());
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  assert.equal(await scalar('select count(*)::int from auth.users'), 0);
  assert.equal(await scalar('select count(*)::int from public.tenant_invitations'), 0);
  assert.equal(await scalar("select count(*)::int from pg_trigger where tgenabled='D'"), 0);
});

test('explicit grants deny anonymous access, client DML, receipts and private tables', async () => {
  for (const table of publicTables) {
    for (const role of ['anon','authenticated','service_role']) {
      for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
        assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role,`public.${table}`,privilege]), false, `${role}/${table}/${privilege}`);
    }
    assert.equal(await scalar("select has_any_column_privilege('anon',$1,'SELECT')", [`public.${table}`]), false);
  }
  for (const table of ['public.command_receipts', ...privateTables.map((t) => `private.${t}`)])
    assert.equal(await scalar("select has_any_column_privilege('authenticated',$1,'SELECT')", [table]), false);
  for (const [table,column] of [['tenant_invitations','token_hash'],['tenant_invitations','auth_delivery_reference'],['audit_log','evidence']])
    assert.equal(await scalar("select has_column_privilege('authenticated',$1,$2,'SELECT')", [`public.${table}`,column]), false);
});

for (const [label, subject, expected] of [['owner A',ownerA,[A]],['owner B',ownerB,[B]],
  ['operator',operator,[A]],['multi-member',multi,[A,B]],['revoked',revoked,[]],['platform-only',admin,[]],['unknown',uuid(999),[]]]) {
  test(`${label}: positive own reads and negative other-tenant reads`, async () => {
    await as(subject, async () => {
      assert.deepEqual((await db.query('select id from public.tenants order by id')).rows.map((r) => r.id), expected);
      for (const table of ['campaigns','objectives','agent_runs','artifacts','artifact_revisions','approvals','file_objects']) {
        assert.deepEqual((await db.query(`select distinct tenant_id from public.${table} order by tenant_id`)).rows.map((r) => r.tenant_id), expected, table);
      }
      assert.equal(await scalar('select count(*)::int from storage.objects'), expected.length);
      assert.equal(await scalar(`select count(*)::int from public.approvals p join public.artifact_revisions r
        on (p.tenant_id,p.artifact_revision_id)=(r.tenant_id,r.id) join public.file_objects f
        on (f.tenant_id,f.id)=(r.tenant_id,r.file_id)`), expected.length);
    });
  });
}

test('operator sees only own membership; owner sees tenant roster; roles are tenant scoped', async () => {
  await as(operator, async () => assert.equal(await scalar('select count(*)::int from public.memberships'), 1));
  await as(ownerA, async () => assert.equal(await scalar('select count(*)::int from public.memberships'), 4));
  await as(multi, async () => {
    assert.equal(await scalar('select private.is_member($1,array[\'owner\'])', [A]), true);
    assert.equal(await scalar('select private.is_member($1,array[\'owner\'])', [B]), false);
  });
});

test('helpers have constrained owners, fixed paths, no escalation or enumeration', async () => {
  const helpers = (await db.query(`select p.proname,p.prosecdef,p.proconfig,r.rolname,r.rolcanlogin,r.rolbypassrls
    from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.prosecdef`)).rows;
  assert.equal(helpers.length, 2);
  assert.ok(helpers.every((r) => !r.rolcanlogin && !r.rolbypassrls && r.proconfig.includes('search_path=""')));
  for (const role of ['bagos_membership_reader','bagos_platform_reader']) {
    assert.equal(await scalar("select pg_has_role('authenticated',$1,'MEMBER')", [role]), false);
    assert.equal(await scalar("select has_schema_privilege($1,'private','CREATE')", [role]), false);
    assert.equal(await scalar('select count(*)::int from pg_class where relowner=(select oid from pg_roles where rolname=$1)', [role]), 0);
  }
  await as(admin, async () => {
    assert.equal(await scalar('select private.is_platform_admin()'), true);
    assert.equal(await scalar('select private.is_member($1)', [A]), false);
  });
  await as(ownerA, async () => assert.equal(await scalar('select private.is_platform_admin()'), false));
  await as(ownerA, () => rejectsSql('select * from private.platform_admins'));
  await as(ownerA, () => rejectsSql('set role bagos_membership_reader'));
  await as(null, () => rejectsSql('select private.is_member($1)', '42501', [A]), 'anon');
});

test('all direct DML is denied, including owner approvals and operator escalation', async () => {
  for (const table of publicTables) {
    for (const sql of [`insert into public.${table} default values`, `update public.${table} set id=id`, `delete from public.${table}`])
      await as(ownerA, () => rejectsSql(sql));
  }
  await as(operator, () => rejectsSql("update public.memberships set role='owner'"));
  await as(null, () => rejectsSql('select * from public.campaigns'), 'anon');
});

test('cross-tenant FK injections rejected with privileged SQL (not hidden by RLS)', async () => {
  for (const sql of [
    `update public.campaigns set owner_membership_id='${uuid(202)}' where id='${uuid(301)}'`,
    `update public.objectives set campaign_id='${uuid(1301)}' where id='${uuid(302)}'`,
    `update public.agent_runs set objective_id='${uuid(1302)}' where id='${uuid(303)}'`,
    `update public.agent_runs set requester_membership_id='${uuid(202)}' where id='${uuid(303)}'`,
    `update public.artifacts set campaign_id='${uuid(1301)}' where id='${uuid(305)}'`,
    `update public.artifacts set run_id='${uuid(1303)}' where id='${uuid(305)}'`,
    `update public.artifacts set current_revision_id='${uuid(1306)}' where id='${uuid(305)}'`,
    `insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa,file_id)
      values ('${A}','${uuid(305)}',2,'${digest}','test','${payload}','${payload}','${uuid(1304)}')`,
    `insert into public.approvals(tenant_id,artifact_revision_id,action_snapshot,action_digest,action_revision,tier,confirmation_required)
      values ('${A}','${uuid(1306)}','${payload}','${digest}',1,2,true)`,
  ]) await rollbackProbe(() => rejectsSql(sql, '23503'));
});

test('current revision cannot point at a different artifact in the SAME tenant', async () => {
  await rollbackProbe(async () => {
    await db.query("insert into public.artifacts(id,tenant_id,campaign_id,type) values ($1,$2,$3,'text')", [uuid(777),A,uuid(301)]);
    await rejectsSql('update public.artifacts set current_revision_id=$1 where id=$2', '23503', [uuid(306),uuid(777)]);
  });
});

test('immutable identities, append-only evidence, and no deletes even for fixture writer', async () => {
  for (const table of ['memberships','campaigns','objectives','agent_runs','artifacts'])
    await rollbackProbe(() => rejectsSql(`update public.${table} set tenant_id='${B}' where tenant_id='${A}'`, '23514'));
  for (const table of ['audit_log','artifact_revisions','approvals','file_objects'])
    await rollbackProbe(() => rejectsSql(`update public.${table} set updated_at=now()`, '23514'));
  await rollbackProbe(() => rejectsSql('delete from public.tenants', '23514'));
  await rollbackProbe(() => rejectsSql('update public.memberships set user_id=$1 where id=$2', '23514', [ownerB,uuid(203)]));
});

test('active-owner invariant rejects activation without owner and last-owner loss', async () => {
  await rollbackProbe(async () => {
    await db.query("insert into public.tenants(name,status) values ('Ownerless','active')");
    await rejectsSql('set constraints all immediate', '23514');
  });
  await rollbackProbe(async () => {
    await db.query("update public.memberships set status='revoked' where tenant_id=$1 and role='owner'", [B]);
    await rejectsSql('set constraints all immediate', '23514');
  });
});

test('same JWT subject loses database and Storage access after revocation/suspension', async () => {
  for (const change of [
    `update public.memberships set status='revoked' where user_id='${operator}'`,
    `update public.tenants set status='suspended' where id='${A}'`,
  ]) {
    await rollbackProbe(async () => {
      await db.exec(change);
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation','object.get_authenticated',true)", [operator]);
      await db.exec('set local role authenticated');
      assert.equal(await scalar('select count(*)::int from public.approvals'), 0);
      assert.equal(await scalar('select count(*)::int from storage.objects'), 0);
    });
  }
});

test('Storage linkage, read operation restrictions, and writes despite permissive policies', async () => {
  assert.equal(await scalar("select public from storage.buckets where id='phase-one-artifacts'"), false);
  for (const operation of ['', 'object.list', 'object.sign', 'object.get_signed', 'object.sign_upload_url'])
    await as(ownerA, async () => assert.equal(await scalar('select count(*)::int from storage.objects'), 0), 'authenticated', operation);
  await as(ownerA, async () => assert.equal(await scalar('select count(*)::int from public.file_objects'), 1));
  await db.exec(`grant all on storage.objects to authenticated;
    create policy test_existing_broad_policy on storage.objects for all to authenticated using (true) with check (true)`);
  try {
    await as(ownerA, async () => assert.equal(await scalar('select count(*)::int from storage.objects'), 1));
    await as(ownerA, () => rejectsSql("insert into storage.objects(bucket_id,name) values ('phase-one-artifacts','forged')"));
    await as(ownerA, async () => {
      assert.equal((await db.query("update storage.objects set name='tampered' returning id")).rows.length, 0);
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0);
    });
  } finally {
    await db.exec('drop policy test_existing_broad_policy on storage.objects; revoke insert,update,delete,truncate,references,trigger on storage.objects from authenticated');
  }
});

test('schema validation rejects invalid digests, viewer, live runs and forged file paths', async () => {
  for (const sql of [
    "update public.memberships set role='viewer'",
    "update public.agent_runs set mode='live'",
    `insert into public.file_objects(tenant_id,object_key,content_digest,content_type,size_bytes,provenance)
      values ('${A}','forged','${digest}','text/plain',1,'${payload}')`,
    `select 'placeholder'::private.sha256`,
    `select '{"schema_version":2}'::private.bounded_payload`,
  ]) await rollbackProbe(() => rejectsSql(sql, '23514'));
  await rollbackProbe(() => rejectsSql('insert into public.memberships(tenant_id,user_id,role) values ($1,$2,\'operator\')', '23503', [A,uuid(999)]));
});

test('existing broad bucket policies cannot make the protected bucket public', async () => {
  await db.exec(`grant all on storage.buckets to authenticated;
    create policy test_bucket_broad on storage.buckets for all to authenticated using (true) with check (true)`);
  try {
    await as(ownerA, async () => {
      assert.equal((await db.query("update storage.buckets set public=true where id='phase-one-artifacts' returning id")).rows.length, 0);
      assert.equal((await db.query("delete from storage.buckets where id='phase-one-artifacts' returning id")).rows.length, 0);
    });
  } finally {
    await db.exec('drop policy test_bucket_broad on storage.buckets; revoke all on storage.buckets from authenticated');
  }
});

test('receipts enforce replay-key uniqueness and immutable input, not command execution', async () => {
  const insert = `insert into public.command_receipts(tenant_id,actor_reference,command_kind,idempotency_key,input_digest,result_reference)
    values ($1,$2,'synthetic_test','retry-1',$3,$4)`;
  await rollbackProbe(async () => {
    await db.query(insert, [A,ownerA,digest,payload]);
    await rejectsSql(insert, '23505', [A,ownerA,'b'.repeat(64),payload]);
  });
  await rollbackProbe(async () => {
    await db.query(insert, [A,ownerA,digest,payload]);
    await rejectsSql('update public.command_receipts set input_digest=$1', '23514', ['b'.repeat(64)]);
  });
});

test('migration collisions fail atomically without adopting existing schema/data', async () => {
  const existing = new PGlite();
  try {
    await existing.exec(await readFile(new URL('./platform-stubs.sql', import.meta.url), 'utf8'));
    await existing.exec("create table public.tenants(id integer primary key, marker text); insert into public.tenants values (1,'preserve')");
    await assert.rejects(existing.exec(migration), (error) => error.code === '42P07');
    await existing.exec('rollback');
    assert.equal((await existing.query('select marker from public.tenants')).rows[0].marker, 'preserve');
    assert.equal((await existing.query("select count(*)::int as n from pg_namespace where nspname='private'")).rows[0].n, 0);
    assert.equal((await existing.query("select count(*)::int as n from pg_roles where rolname like 'bagos_%'")).rows[0].n, 0);
  } finally { await existing.close(); }
});

test('static: migrations never create users/invitations, broad DML, or future entities', () => {
  assert.doesNotMatch(migration, /insert\s+into\s+(auth\.users|public\.tenant_invitations)/i);
  assert.doesNotMatch(migration, /create\s+table\s+.*\b(approval_decisions|feedback|outbox_events|agent_manifests|sop_revisions)\b/i);
  assert.doesNotMatch(migration, /grant\s+(?:all|insert|update|delete)\b[^;]*\bto\s+(?:authenticated|anon)\b/i);
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data|security_invoker\s*=\s*false/i);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /commit;\s*$/);
});
