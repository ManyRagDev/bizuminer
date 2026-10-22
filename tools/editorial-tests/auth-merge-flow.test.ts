import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {mergeAnonymousIntoAuth}=require('../../packages/web/lib/auth-merge.ts');

// No Supabase calls or real credentials; exercise the actual login SQL as garimpa_app.
const {pg,factory}=await commercialFixture();
const ids={anon:'00000000-0000-4000-8000-000000000001',linked:'00000000-0000-4000-8000-000000000002',
  source:'00000000-0000-4000-8000-000000000003',foreign:'00000000-0000-4000-8000-000000000004',
  other:'00000000-0000-4000-8000-000000000005',cross:'00000000-0000-4000-8000-000000000006'};
const input=(authUserId:string,bmUid:string|null)=>({authUserId,bmUid,email:'verified@example.test',displayName:'New name'});
try {
  await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
    ('aff_local','local','bizuminer','Casa'),('aff_other','other','other','Outra');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
    ('p1','local','mercadolivre','1','One','https://example.test/1',1000),
    ('p2','local','mercadolivre','2','Two','https://example.test/2',2000);`);
  await pg.query(`insert into garimpa.app_user(id,tenant_id,auth_user_id) values
    ($1,'local',null),($2,'local','auth_linked'),($3,'local',null),
    ($4,'local','auth_foreign'),($5,'other','auth_other'),($6,'local',null)`,Object.values(ids));
  await pg.query(`insert into garimpa.favorite(tenant_id,user_id,product_id) values
    ('local',$1,'p1'),('local',$2,'p1'),('local',$3,'p1'),('local',$3,'p2'),
    ('local',$4,'p1'),('local',$5,'p2')`,[ids.anon,ids.linked,ids.source,ids.foreign,ids.cross]);
  await pg.query(`insert into garimpa.price_watch(tenant_id,user_id,product_id,baseline_price_cents,target_price_cents) values
    ('local',$1,'p1',1000,900),('local',$2,'p1',1000,800),('local',$2,'p2',2000,1800)`,[ids.linked,ids.source]);
  await pg.query(`insert into garimpa.buyer_profile(tenant_id,user_id,preferred_categories,price_band) values
    ('local',$1,'{keep}','all'),('local',$2,'{source}','under_100')`,[ids.linked,ids.source]);

  assert.equal(await mergeAnonymousIntoAuth(input('auth_adopt',ids.anon),factory),ids.anon);
  assert.equal((await pg.query(`select auth_user_id from garimpa.app_user where id=$1`,[ids.anon])).rows[0].auth_user_id,'auth_adopt');
  assert.equal(await mergeAnonymousIntoAuth(input('auth_adopt',ids.anon),factory),ids.anon);
  console.log('PASS anonymous adoption and repeat login under strict RLS');

  assert.equal(await mergeAnonymousIntoAuth(input('auth_linked',ids.source),factory),ids.linked);
  assert.equal((await pg.query(`select count(*)::int n from garimpa.favorite where user_id=$1`,[ids.linked])).rows[0].n,2);
  assert.equal((await pg.query(`select count(*)::int n from garimpa.app_user where id=$1`,[ids.source])).rows[0].n,0);
  assert.equal((await pg.query(`select target_price_cents from garimpa.price_watch where user_id=$1 and product_id='p1'`,[ids.linked])).rows[0].target_price_cents,900);
  assert.equal((await pg.query(`select count(*)::int n from garimpa.price_watch where user_id=$1`,[ids.linked])).rows[0].n,2);
  assert.deepEqual((await pg.query(`select preferred_categories from garimpa.buyer_profile where user_id=$1`,[ids.linked])).rows[0].preferred_categories,['keep']);
  console.log('PASS favorites, watches and profile merge; account wins conflicts');

  const fresh=await mergeAnonymousIntoAuth(input('auth_fresh',null),factory);
  assert.match(fresh,/^[0-9a-f-]{36}$/);
  assert.equal(await mergeAnonymousIntoAuth(input('auth_fresh',null),factory),fresh);
  const protectedCookie=await mergeAnonymousIntoAuth(input('auth_new_foreign_cookie',ids.foreign),factory);
  assert.notEqual(protectedCookie,ids.foreign);
  assert.equal((await pg.query(`select auth_user_id from garimpa.app_user where id=$1`,[ids.foreign])).rows[0].auth_user_id,'auth_foreign');
  assert.equal((await pg.query(`select count(*)::int n from garimpa.favorite where user_id=$1`,[ids.foreign])).rows[0].n,1);
  console.log('PASS first login, idempotency and cookie linked to another authenticated person');

  assert.equal(await mergeAnonymousIntoAuth(input('auth_other',ids.cross),factory),ids.other);
  assert.equal((await pg.query(`select count(*)::int n from garimpa.favorite where user_id=$1`,[ids.cross])).rows[0].n,1);
  assert.equal((await pg.query(`select tenant_id from garimpa.app_user where id=$1`,[ids.other])).rows[0].tenant_id,'other');
  assert.equal((await pg.query(`select count(*)::int n from garimpa.favorite where user_id=$1`,[ids.other])).rows[0].n,0);
  console.log('PASS cross-home login preserves source data without copying ownership');

  await pg.query(`insert into garimpa.app_user(id,tenant_id) values($1,'local');
    `,[ids.source]);
  await pg.query(`insert into garimpa.favorite(tenant_id,user_id,product_id) values('local',$1,'p2')`,[ids.source]);
  await pg.exec(`create function pg_temp.reject_merge() returns trigger language plpgsql as $$
    begin raise exception 'synthetic_merge_failure'; end $$;
    create trigger reject_merge before insert on garimpa.favorite for each row execute function pg_temp.reject_merge()`);
  await assert.rejects(()=>mergeAnonymousIntoAuth({...input('auth_linked',ids.source),displayName:'Must rollback'},factory),/synthetic_merge_failure/);
  assert.equal((await pg.query(`select display_name from garimpa.app_user where id=$1`,[ids.linked])).rows[0].display_name,'New name');
  assert.equal((await pg.query(`select count(*)::int n from garimpa.favorite where user_id=$1`,[ids.source])).rows[0].n,1);
  assert.equal((await pg.query(`select auth_user_id from garimpa.app_user where id=$1`,[ids.source])).rows[0].auth_user_id,null);
  console.log('PASS failed merge rolls back destination profile update and preserves anonymous rows');

  await assert.rejects(()=>mergeAnonymousIntoAuth({...input('bad',null),tenantId:'../tenant'},factory),/invalid_identity_context/);
  assert.equal((await factory()`select count(*)::int n from garimpa.app_user`)[0].n,0);
  assert.equal((await factory()`select count(*)::int n from garimpa.favorite`)[0].n,0);
  console.log('PASS transaction context does not leak after login');
} finally {await pg.close();}

const legacy=await commercialFixture({migrationCount:0});
try {
  await legacy.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values('aff_local','local','bizuminer','Casa')`);
  const first=await mergeAnonymousIntoAuth(input('auth_before_m1',null),legacy.factory);
  assert.equal(await mergeAnonymousIntoAuth(input('auth_before_m1',null),legacy.factory),first);
  console.log('PASS legacy schema before M1 remains supported');
} finally {await legacy.pg.close();}
