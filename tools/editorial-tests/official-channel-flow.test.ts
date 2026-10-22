import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const w=require('../../packages/web/lib/commercial-workflow.ts');
const {createApprovedAdapter}=require('../../packages/web/lib/distribution-channel-adapters.ts');
const {executeDispatchCycle,scheduleAuthorizedDispatch}=require('../../packages/web/lib/dispatch-worker.ts');
const {storeAffiliateSecret,resolveAffiliateSecret}=require('../../packages/web/lib/affiliate-secret.ts');
const {withCommercialDb}=require('../../packages/web/lib/commercial-rollout.ts');
const {pg,factory}=await commercialFixture();
process.env.AFFILIATE_SECRETS_MASTER_KEY='01234567890123456789012345678901';
const ctx=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'official-'+t});
const evidence={version:2,currency:'BRL',priceType:'exact',variantIdentity:{state:'source_verified',key:'unit',attributes:{}},packageQuantity:1,fieldStates:{sellerId:'not_applicable',packageContents:'not_applicable',dimensions:'not_applicable',payment:'not_applicable',coupon:'not_applicable',region:'not_applicable'}};
let inTx=false;
const trackedFactory=()=>{const sql=factory(),begin=sql.begin;sql.begin=(...args:any[])=>begin(...args.slice(0,-1),async(tx:any)=>{inTx=true;try{return await args.at(-1)(tx);}finally{inTx=false;}});return sql;};
try {
 for(const t of ['a','b']) {
  await pg.query(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values($1,$2,$3,$2)`,['aff_'+t,t,'official-'+t]);
  await pg.query(`insert into garimpa.app_user(id,tenant_id,auth_user_id) values($1,$2,$3)`,['u_'+t,t,'auth_'+t]);
  await pg.query(`insert into garimpa.app_user_role(app_user_id,role) values($1,'afiliado')`,['u_'+t]);
  await pg.query(`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values($1,$2,'owner')`,['aff_'+t,'u_'+t]);
  await pg.query(`insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values($1,$2,'test','active','2026-01-01','{"maxActiveCampaigns":10,"maxDailyKits":20,"allowedMarketplaces":["shopee"]}','fixture')`,[t,'aff_'+t]);
  await pg.query(`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values($1,$2,'shopee',$2,'Produto teste','https://shopee.com.br/product',10000)`,['p_'+t,t]);
  await pg.query(`insert into garimpa.product_curation(tenant_id,product_id,status) values($1,$2,'approved')`,[t,'p_'+t]);
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values($1,$2,$3,10000,$4)`,['obs_'+t,t,'p_'+t,JSON.stringify(evidence)]);
  await pg.query(`insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values($1,$2,$3,$4,'web',$5,'active','https://s.shopee.com.br/fixture')`,['web_'+t,t,'aff_'+t,'p_'+t,'official-'+t+'--shp-test']);
  const channel=t==='a'?'telegram_channel':'webhook';
  const campaign=await w.createCampaignForAccount(ctx(t),{name:'Official test',objective:'Fixture',audience:'Fixture audience',requestId:'campaign-'+t},factory);
  const kit=await w.createKitForAccount(ctx(t),{campaignId:campaign.campaignId,productId:'p_'+t,channel,reason:'Fixture valid',requestId:'kit-'+t},factory);
  const validated=await w.validateKitForAccount(ctx(t),{kitId:kit.kitId,expectedVersion:kit.kitVersion,requestId:'val-'+t},factory);
  assert.equal(validated.valid,true,JSON.stringify(validated));
  await w.approveKitForAccount(ctx(t),{kitId:kit.kitId,expectedVersion:validated.kitVersion,requestId:'approve-'+t},factory);
  const [pub]=(await pg.query('select * from garimpa.campaign_publication where id=$1',[kit.publicationId])).rows as any[];
  const target=t==='a'?'@synthetic_channel':'https://receiver.example.invalid/hook';
  await withCommercialDb(ctx(t),async(tx:any)=>{
   await storeAffiliateSecret({tenantId:t,marketplace:channel,secretId:'channel-secret',secretValue:'SYNTHETIC_'+t},tx);
   await tx`update garimpa.destination set external_target_ref=${target},secret_ref='channel-secret',automation_mode='scheduled' where id=${pub.destination_id} and tenant_id=${t}`;
   await tx`insert into garimpa.dispatch_control(tenant_id,kill_switch,configuration,updated_by) values(${t},false,${tx.json({maxPerWindow:10,windowSeconds:86400,cooldownSeconds:0,windowAnchor:'2026-01-01T00:00:00Z',channelApprovalRef:'fixture-only'})},${'u_'+t})`;
  },factory);
  const job=await scheduleAuthorizedDispatch(ctx(t),{campaignPublicationId:pub.id,kitRevisionId:pub.kit_revision_id,destinationId:pub.destination_id,scheduledAt:new Date(Date.now()-1000).toISOString(),idempotencyKey:'official-job-'+t},factory);
  let calls=0;
  const adapter=createApprovedAdapter({channel,resolveSecret:(ref:string)=>withCommercialDb(ctx(t),(tx:any)=>resolveAffiliateSecret(t,channel,ref,tx),factory),fetch:async(url:string,opts:any)=>{
   assert.equal(inTx,false);calls++;
   if(t==='a')assert.ok(url.includes('SYNTHETIC_a'));
   else {assert.equal(opts.headers['X-BizuMiner-Signature'],'sha256='+createHmac('sha256','SYNTHETIC_b').update(opts.body).digest('hex'));const body=JSON.parse(opts.body);assert.equal(body.offer.productId,'p_b');assert.equal(body.campaign.id,campaign.campaignId);}
   if(calls<=2)return Response.json(t==='a'?{parameters:{retry_after:30}}:{},{status:429,headers:t==='b'?{'Retry-After':'600'}:{}});
   return Response.json({ok:true,result:{message_id:42}});
  }});
  const now=new Date();const runtime={factory:trackedFactory,origin:'https://fixture.invalid',validateCredential:async()=>true,now:()=>now,random:()=>0.5};
  for(const expectedSeconds of (t==='b'?[600,600]:[66,132])) {
   const result=await executeDispatchCycle(runtime,ctx(t),adapter,{workerToken:'fixture-worker-'+t,maxAttempts:3});assert.equal(result.status,'queued',JSON.stringify(result));
   const row=(await pg.query('select next_attempt_at from garimpa.dispatch_job where id=$1',[job.id])).rows[0] as any;
   assert.equal(new Date(row.next_attempt_at).getTime()-now.getTime(),expectedSeconds*1000);
   await pg.query("update garimpa.dispatch_job set next_attempt_at=now()-interval '1 second' where id=$1",[job.id]);
  }
  const final=await executeDispatchCycle(runtime,ctx(t),adapter,{workerToken:'fixture-worker-final-'+t,maxAttempts:3});assert.equal(final.status,'succeeded',JSON.stringify(final));assert.equal(calls,3);
  console.log('PASS official '+channel+' kit→outbox→worker, own credential, signed frozen facts and persisted retry (exponential jitter / real HTTP Retry-After floor600)');
 }
}finally{await pg.close();}
