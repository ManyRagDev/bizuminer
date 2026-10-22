import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
import {resolveWorkerCredential,accountCaptureAdapter,withAccountCredential} from '../../packages/persistence/src/account-credentials.ts';
import {ensureShopeeAffiliateLinks} from '../../packages/persistence/src/shopee-links.ts';
import {ensureAliExpressPublications} from '../../packages/persistence/src/aliexpress-links.ts';
const require=createRequire(import.meta.url);
const {storeAffiliateSecret}=require('../../packages/web/lib/affiliate-secret.ts');
const {withCommercialDb}=require('../../packages/web/lib/commercial-rollout.ts');
const {CaptureBatchStore}=require('../../packages/web/lib/capture-batch-db.ts');
const {executeCaptureBatch}=require('../../packages/web/lib/capture-batch-worker.ts');
const {dispatchCaptureBatch}=require('../../packages/web/lib/capture-dispatch.ts');
const {pg,factory}=await commercialFixture();
process.env.AFFILIATE_SECRETS_MASTER_KEY='01234567890123456789012345678901';
process.env.SHOPEE_CAPTURE_ENABLED='true';process.env.ALIEXPRESS_CAPTURE_ENABLED='true';
process.env.SHOPEE_APP_ID='SYNTHETIC_HOUSE';process.env.SHOPEE_APP_SECRET='SYNTHETIC_HOUSE_SECRET';
const ctx=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'credential-test-'+t});
let inTransaction=false;
const trackedFactory=()=>{const sql=factory();const begin=sql.begin;sql.begin=(...args:any[])=>begin(...args.slice(0,-1),async(tx:any)=>{inTransaction=true;try{return await args.at(-1)(tx);}finally{inTransaction=false;}});return sql;};
const log={runId:'synthetic-run',log:()=>{}};
try {
 await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values ('aff_a','a','cred-a','A'),('aff_b','b','cred-b','B'),('aff_local','local','cred-house','House');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values ('u_a','a','auth_a'),('u_b','b','auth_b');
 insert into garimpa.app_user_role(app_user_id,role) values ('u_a','afiliado'),('u_b','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_a','owner'),('aff_b','u_b','owner');`);
 for(const t of ['a','b']) for(const marketplace of ['shopee','aliexpress']) await withCommercialDb(ctx(t),(tx:any)=>storeAffiliateSecret({tenantId:t,marketplace,secretId:'credentials_json',secretValue:JSON.stringify({tenantId:'local',appId:'ID_'+t,appKey:'KEY_'+t,appSecret:'SECRET_'+t,trackingId:'TRACK_'+t})},tx),factory);
 const seen:string[]=[];
 const provider:any={marketplace:'shopee',capabilities:{search:true},validateCredential:async()=>({ok:true}),fetchOffers:async(c:any)=>{assert.equal(inTransaction,false);seen.push(c.secret.appId);return {offers:[]};},buildAffiliateLink:async(c:any)=>{assert.equal(inTransaction,false);seen.push(c.secret.appId);return 'https://shope.ee/synthetic';}};
 for(const t of ['a','b']) {
   const sql=trackedFactory();const guarded=accountCaptureAdapter(sql,t,provider);
   const own=await resolveWorkerCredential(sql,t,'shopee');await guarded.fetchOffers(own,{},log);
   assert.equal(own.secret.appId,'ID_'+t);assert.equal((own as any).tenantId,undefined);
   const lookup=await withAccountCredential(sql,t,'aliexpress',async c=>{assert.equal(inTransaction,false);return c.secret.trackingId;});assert.equal(lookup,'TRACK_'+t);
 }
 assert.deepEqual(seen,['ID_a','ID_b']);
 console.log('PASS A/B adapter and monitoring lookup receive only own credentials outside SQL transaction');
 const batches=new CaptureBatchStore(factory);
 for(const t of ['a','b']) {
  const batch=await batches.create(t,['shopee'],1,'local',false);
  assert.equal(await executeCaptureBatch(batch.id,async()=>{throw new Error('foreign batch ran');},batches,t==='a'?'b':'a'),false);
  await dispatchCaptureBatch(batch.id,ctx(t),factory,async(id:string,tenant:string)=>{
  assert.equal(await executeCaptureBatch(id,async(step:any)=>{
   assert.equal(step.tenantId,t);
   if(step.kind==='capture'){
    await accountCaptureAdapter(trackedFactory(),t,provider).fetchOffers(await resolveWorkerCredential(factory(),t,'shopee'),{},log);
    await pg.query("insert into garimpa.capture_run(id,tenant_id,marketplace,status,parameters,started_at) values(gen_random_uuid()::text,$1,'shopee','ok',$2,now())",[t,JSON.stringify({operationBatchId:batch.id})]);
    return {ok:true};
   }
   return {ok:true,triage:{evaluated:0,approved:0,held:0,rejected:0,annotatedPending:0}};
  },batches,tenant),true);
  });
  assert.equal((await batches.read(batch.id,t)).status,'ok');
 }
 console.log('PASS persisted worker claim/capture/triage/settlement stays in A/B account');
 await pg.exec(`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
 ('p_a_1','a','shopee','101','A one','https://shopee.com.br/1',10000),('p_a_2','a','shopee','102','A two','https://shopee.com.br/2',10000),
 ('p_b','b','aliexpress','201','B','https://s.click.aliexpress.com/synthetic',10000);`);
 let linkCalls=0;
 const linkProvider:any={...provider,buildAffiliateLink:async(c:any)=>{
  assert.equal(inTransaction,false);assert.equal(c.secret.appId,'ID_a');linkCalls++;
  await pg.exec("update garimpa.affiliate_secret set status='revoked' where tenant_id='a' and marketplace='shopee'");
  return 'https://shope.ee/synthetic';
 }};
 const links=await ensureShopeeAffiliateLinks({connectionString:'fixture',tenantId:'a',sqlFactory:trackedFactory,adapter:linkProvider},log);
 assert.equal(linkCalls,1);assert.equal(links.generated,1);assert.equal(links.failed,1);
 const ali=await ensureAliExpressPublications({connectionString:'fixture',tenantId:'b',sqlFactory:factory},log);assert.equal(ali.linked,1);
 const pubs=(await pg.query('select tenant_id,affiliate_id,slug from garimpa.publication order by tenant_id,slug')).rows;
 assert.ok(pubs.every((p:any)=>p.affiliate_id==='aff_'+p.tenant_id && p.slug.startsWith('cred-'+p.tenant_id+'-')));
 console.log('PASS helpers use account affiliate/slug; secret revoked between Shopee calls blocks the next provider call');
 await assert.rejects(()=>resolveWorkerCredential(factory(),'a','shopee'),(e:any)=>e.code==='account_credentials_missing');
 const b=await batches.create('b',['shopee'],1,'local',false);
 await assert.rejects(()=>dispatchCaptureBatch(b.id,ctx('a'),factory),/capture_batch_not_found/);
 await pg.exec("update garimpa.affiliate_account set status='suspended' where tenant_id in ('b','local')");
 for(const t of ['b','local'])await assert.rejects(()=>resolveWorkerCredential(factory(),t,'shopee'),(e:any)=>e.code==='account_suspended'||e.code==='unauthorized');
 console.log('PASS missing/revoked credentials and suspended A/B/house fail closed; foreign batch never dispatches');
}finally{await pg.close();}
