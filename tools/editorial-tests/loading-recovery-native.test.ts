import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const {getPublishedEditorialSelection}=require('../../packages/web/lib/editorial-selection-db.ts');
const {catalogPage}=require('../../packages/web/lib/db.ts');
const {databaseHandle,WEB_STATEMENT_TIMEOUT_MS,WEB_LOCK_TIMEOUT_MS}=require('../../packages/web/lib/database-pool.ts');
const fx=await nativePostgresFixture();
process.env.DATABASE_URL='postgresql://isolated-fixture-unused';
let passed=0;
const scenario=async(name:string,fn:()=>Promise<void>)=>{await fn();passed++;console.log('PASS '+name);};
const scope=(tenantId:string)=>({tenantId,affiliateId:'aff_'+tenantId,actor:'worker',requestId:'recovery'});
const scoped=(tenant:string,fn:(tx:any)=>Promise<any>)=>databaseHandle(fx.clientA,scope(tenant)).begin(fn);
try {
 const {units}=await replacementRollout();
 for(const unit of units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
 for(const file of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql','20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql','20261101193221_improve_editorial_recommendations.sql'])await fx.migrate(file);
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','a','A'),('aff_b','b','b','B')`;
 await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,image_url,last_price_cents,last_seen_at)
 values('pa','a','shopee','a','Achado A','https://shopee.com.br/product/1/1','https://example.test/a.jpg',2500,now()),
 ('pb','b','shopee','b','Achado B','https://shopee.com.br/product/2/2','https://example.test/b.jpg',3500,now())`;
 await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status) values('a','pa','approved'),('b','pb','approved')
 on conflict(tenant_id,product_id) do update set status='approved'`;
 await fx.admin`insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
 values('pub_a','a','aff_a','pa','web','shp-a','active','https://s.shopee.com.br/test'),('pub_b','b','aff_b','pb','web','shp-b','active','https://s.shopee.com.br/test')`;
 await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at)
 values('oa','a','pa',2500,now()),('ob','b','pb',3500,now())`;
 // Compare real role read/write outcomes, including errors, before/after DDL.
 async function matrix(){
  const results:any[]=[];
  for(const active of [true,false]){
   await fx.admin`update garimpa.affiliate_account set status=${active?'active':'suspended'} where tenant_id='a'`;
   for(const tenant of ['a','b','unknown',''])for(const platform of ['', 'platform_admin','service_role','spoofed']){
    for(const operation of ['read','insert_own','insert_other','update','move','delete']){
     let outcome:any;
     try{await fx.clientA.begin(async(tx:any)=>{
      await tx`select set_config('garimpa.tenant_id',${tenant},true),set_config('garimpa.platform_role',${platform},true),set_config('garimpa.actor_type','worker',true)`;
      if(operation==='read')outcome=(await tx`select id from garimpa.price_observation order by id`).map((r:any)=>r.id);
      if(operation.startsWith('insert')){
       const dest=operation==='insert_own'?'a':'b';
       outcome=(await tx`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at) values('trial',${dest},${dest==='a'?'pa':'pb'},2000,now()) returning id`).map((r:any)=>r.id);
      }
      if(operation==='update')outcome=(await tx`update garimpa.price_observation set price_cents=2400 where id='oa' returning id`).map((r:any)=>r.id);
      if(operation==='move')outcome=(await tx`update garimpa.price_observation set tenant_id='b',product_id='pb' where id='oa' returning id`).map((r:any)=>r.id);
      if(operation==='delete')outcome=(await tx`delete from garimpa.price_observation where id='oa' returning id`).map((r:any)=>r.id);
      throw Error('fixture_rollback');
     });}catch(error:any){if(error.message!=='fixture_rollback')outcome={code:error.code,message:error.message};}
     results.push({active,tenant,platform,operation,outcome});
    }
   }
  }
  await fx.admin`update garimpa.affiliate_account set status='active' where tenant_id='a'`;
  return results;
 }
 const before=await matrix();
 await fx.migrate('20261102131234_optimize_price_observation_scope.sql');
 await scenario('192 read/write authorization outcomes are equivalent, including suspended, missing and spoofed scopes',async()=>{
  const after=await matrix();assert.equal(after.length,192);assert.deepEqual(after,before);
  for(const result of after.filter(r=>r.operation==='read')){
   const expected=result.tenant==='a'&&result.active?['oa']:result.tenant==='b'?['ob']:[];
   assert.deepEqual(result.outcome,expected);
  }
 });
 await scenario('A → B → A, rollback and suspension revalidate the shared physical connection',async()=>{
  for(const tenant of ['a','b','a'])assert.deepEqual((await scoped(tenant,(tx:any)=>tx`select tenant_id from garimpa.price_observation`)).map((r:any)=>r.tenant_id),[tenant]);
  await assert.rejects(()=>scoped('b',async(tx:any)=>{await tx`select id from garimpa.price_observation`;throw Error('rollback');}),/rollback/);
  await scoped('a',async(tx:any)=>{
   assert.equal((await tx`select count(*)::int n from garimpa.price_observation`)[0].n,1);
   await fx.admin`update garimpa.affiliate_account set status='suspended' where tenant_id='a'`;
   assert.equal((await tx`select count(*)::int n from garimpa.price_observation`)[0].n,0);
  });
  await fx.admin`update garimpa.affiliate_account set status='active' where tenant_id='a'`;
  assert.equal((await scoped('a',(tx:any)=>tx`select count(*)::int n from garimpa.price_observation`))[0].n,1);
 });
 await scenario('account checks use InitPlans once per statement rather than once per observation',async()=>{
  await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at)
   select 'history_'||i,'a','pa',2500,now()-(i*interval '1 hour') from generate_series(1,6000) i`;
  const plan=await scoped('a',(tx:any)=>tx`explain (analyze,format json) select count(*) from garimpa.price_observation`);
  const tree=plan[0]['QUERY PLAN'][0];const initPlans:any[]=[];
  function visit(node:any){if(node['Parent Relationship']==='InitPlan')initPlans.push(node);for(const child of node.Plans??[])visit(child);}
  visit(tree.Plan);assert.ok(initPlans.length>=2,JSON.stringify(tree));
  for(const node of initPlans)assert.equal(node['Actual Loops'],1);
  console.log('Native count with 6001 observations: '+tree['Execution Time']+' ms');
 });
 await scenario('public catalog works without private candidate access and creates no editions',async()=>{
  await fx.admin`revoke select on garimpa.curation_queue_facts from garimpa_app`;
  try{
   for(const tenant of ['a','b','a']){
    const selection=await getPublishedEditorialSelection('home',tenant,fx.factoryA);
    assert.equal(selection.mode,'catalog');assert.equal(selection.products.length,0);assert.ok(!selection.homepageReady);
    const {page}=await catalogPage({},tenant,fx.factoryA,selection);
    assert.equal(page.deals.length,1);assert.equal(page.deals[0].id,tenant==='a'?'pa':'pb');
   }
   for(const channel of ['whatsapp','stories'])assert.equal((await getPublishedEditorialSelection(channel,'a',fx.factoryA)).products.length,0);
   assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_edition`)[0].n,0);
   assert.equal((await fx.admin`select count(*)::int n from garimpa.homepage_edition`)[0].n,0);
  }finally{await fx.admin`grant select on garimpa.curation_queue_facts to garimpa_app`;}
 });
 await scenario('web query budgets are transaction local, cancel a stalled statement and recover without scope leakage',async()=>{
  const original=(await fx.clientA`show statement_timeout`)[0].statement_timeout;
  await scoped('a',async(tx:any)=>{
   assert.equal((await tx`select current_setting('statement_timeout') s`)[0].s,WEB_STATEMENT_TIMEOUT_MS/1000+'s');
   assert.equal((await tx`select current_setting('lock_timeout') l`)[0].l,WEB_LOCK_TIMEOUT_MS/1000+'s');
  });
  const start=performance.now();
  await assert.rejects(()=>scoped('a',(tx:any)=>tx`select pg_sleep(16)`),(e:any)=>e.code==='57014');
  assert.ok(performance.now()-start>=WEB_STATEMENT_TIMEOUT_MS-100);
  assert.equal((await fx.clientA`show statement_timeout`)[0].statement_timeout,original);
  assert.equal((await fx.clientA`select nullif(current_setting('garimpa.tenant_id',true),'') t`)[0].t,null);
  assert.deepEqual((await scoped('b',(tx:any)=>tx`select id from garimpa.price_observation`)).map((r:any)=>r.id),['ob']);
 });
 console.log(`${passed} loading recovery scenarios passed on ${fx.version}`);
}finally{await fx.close();}
