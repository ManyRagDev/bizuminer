import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setTimeout as pause} from 'node:timers/promises';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const {accountDatabase}=require('../../packages/web/lib/database-pool.ts');
const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
const fx=await nativePostgresFixture();
const context=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'pool-'+t});
const uri=`postgres://garimpa_app@localhost:${fx.clientA.options.port[0]}/postgres`;
const factory=()=>accountDatabase(uri);
const sessions=async()=>Number((await fx.admin`select count(*)::int n from pg_stat_activity where application_name='bizuminer-web' and usename='garimpa_app'`)[0].n);
try {
 const {units}=await replacementRollout();for(const unit of units)await fx.admin.begin(async(tx:any)=>tx.unsafe(unit.sql));
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','pool-a','A'),('aff_b','b','pool-b','B')`;
 await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('u_a','a','auth_a'),('u_b','b','auth_b')`;
 await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('u_a','afiliado'),('u_b','afiliado')`;
 await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','u_a','owner'),('aff_b','u_b','owner')`;
 await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('p_a','a','shopee','1','A','https://example.invalid/a',100),('p_b','b','shopee','2','B','https://example.invalid/b',200)`;
 let peak=0,monitoring=true;
 const monitor=(async()=>{while(monitoring){peak=Math.max(peak,await sessions());await pause(5);}})();
 try {
  const rows=await Promise.all(Array.from({length:28},(_,i)=>{
   const t=i%2?'a':'b';return withAccountDb(context(t),async(tx:any)=>{
    await tx`select pg_sleep(0.02)`;
    const result=await tx`select id from garimpa.product order by id`;
    assert.deepEqual(result.map((r:any)=>r.id),['p_'+t]);return result;
   },()=>accountDatabase(uri,context(t)));
  }));assert.equal(rows.length,28);
 }finally{monitoring=false;await monitor;}
 assert.ok(peak>0 && peak<=3,`physical connections ${peak}`);
 const later=await withAccountDb(context('a'),async(tx:any)=>tx`select id from garimpa.product`,factory);assert.deepEqual(later.map((r:any)=>r.id),['p_a']);
 await assert.rejects(()=>withAccountDb({...context('a'),tenantId:'b',affiliateId:'aff_b'},async()=>true,factory),/forbidden/);
 await assert.rejects(()=>withAccountDb(context('a'),async(tx:any)=>{await tx`select 1/0`;},factory),(e:any)=>e.code==='22012');
 const noContext=factory();assert.equal((await noContext`select count(*)::int n from garimpa.product`)[0].n,0);
 const settings=await noContext`select current_setting('garimpa.tenant_id',true) tenant,current_setting('garimpa.actor_app_user_id',true) actor`;
 assert.ok(!settings[0].tenant);assert.ok(!settings[0].actor);await noContext.end();
 const a=accountDatabase(uri,context('a')),b=accountDatabase(uri,context('b'));
 const busy=b.begin('isolation level repeatable read read only',async(tx:any)=>{
  await tx`select pg_sleep(0.04)`;
  const [opts]=await tx`select current_setting('transaction_isolation') isolation,current_setting('transaction_read_only') read_only`;
  assert.equal(opts.isolation,'repeatable read');assert.equal(opts.read_only,'on');
  return (await tx`select id from garimpa.product`)[0].id;
 });
 await a.end();assert.equal(await busy,'p_b');await b.end();
 await assert.rejects(()=>a.begin(async()=>true),/database_handle_closed/);
 console.log(`PASS native ${fx.version}: 28 concurrent A/B transactions, physical peak${peak}<=3, RLS/identity/rollback/GUC/end/options`);
 const cancelHandle=factory();const slow=cancelHandle`select pg_sleep(10)`.execute();
 const cancelled=assert.rejects(async()=>await slow,(e:any)=>e.code==='57014');
 let running=false;
 for(let i=0;i<100;i++){
  running=Boolean((await fx.admin`select exists(select 1 from pg_stat_activity where application_name='bizuminer-web' and state='active' and query like '%pg_sleep(10)%') present`)[0].present);
  if(running)break;await pause(10);
 }
 assert.equal(running,true);slow.cancel();await cancelled;await cancelHandle.end();
 const after=factory();assert.equal((await after`select 42 value`)[0].value,42);await after.end();
 assert.ok(await sessions()<=3);
 for(let i=0;i<80 && await sessions()>0;i++)await pause(100);
 assert.equal(await sessions(),0);
 console.log('PASS native cancellation57014 frees capacity; next query works; idle physical sessions reach0');
}finally{await fx.close();}
