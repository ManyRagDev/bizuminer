import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const ts=require('../../packages/web/node_modules/typescript');
const {inAccountScope}=require('../../packages/web/lib/account-scope.ts');
const {batchCapturePlan}=require('../../packages/web/lib/batch-capture-plan.ts');
const {prepareAccountCapture,dispatchCaptureBatch}=require('../../packages/web/lib/capture-dispatch.ts');
const {CaptureBatchStore}=require('../../packages/web/lib/capture-batch-db.ts');
const {storeAffiliateSecret}=require('../../packages/web/lib/affiliate-secret.ts');
const {withCommercialDb}=require('../../packages/web/lib/commercial-rollout.ts');
const {pg,factory}=await commercialFixture();
const ctx=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'route-'+t});
let context=ctx('a'),creates=0,transports=0;
const batches=new CaptureBatchStore(factory);
process.env.AFFILIATE_SECRETS_MASTER_KEY='01234567890123456789012345678901';
process.env.SHOPEE_CAPTURE_ENABLED='true';process.env.ALIEXPRESS_CAPTURE_ENABLED='true';
for(const key of ['SHOPEE_APP_ID','SHOPEE_APP_SECRET','ALIEXPRESS_APP_KEY','ALIEXPRESS_APP_SECRET','ALIEXPRESS_TRACKING_ID'])delete process.env[key];
const modules:Record<string,unknown>={
 'next/server':{},
 '../../../../../lib/account-scope.ts':{inAccountScope},
 '../../../../lib/account-scope.ts':{inAccountScope},
 '../../../../../lib/api-auth':{checkAffiliateUser:async()=>({kind:'ok',context,appUserId:context.actorAppUserId,sink:{}}),sinkJson:(_sink:any,body:any,opts:any)=>Response.json(body,opts)},
 '../../../../lib/api-auth':{checkAffiliateUser:async()=>({kind:'ok',context,appUserId:context.actorAppUserId,sink:{}}),sinkJson:(_sink:any,body:any,opts:any)=>Response.json(body,opts)},
 '../../../../../lib/batch-capture-plan':{batchCapturePlan},
 '../../../../../lib/capture-batch-db':{captureBatches:{
  create:async(...args:any[])=>{creates++;return batches.create(...args);},
  publicStatus:(...args:any[])=>batches.publicStatus(...args),
  dispatchFailed:(...args:any[])=>batches.dispatchFailed(...args),
 }},
 '../../../../../lib/capture-dispatch':{
  captureExecutor:()=> 'local',
  prepareAccountCapture:(c:any,m:string[],consent:boolean)=>prepareAccountCapture(c,m,consent,factory),
  dispatchCaptureBatch:(id:string,c:any)=>dispatchCaptureBatch(id,c,factory,async(_id:string,t:string)=>{assert.equal(t,context.tenantId);transports++;}),
 },
};
const source=await readFile(new URL('../../packages/web/app/api/admin/rodagem/lote/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const handlers:any={};
vm.runInNewContext(js,{exports:handlers,require:(id:string)=>{assert.ok(id in modules,'Unexpected dependency '+id);return modules[id];},Response,Error,process:{env:{DATABASE_URL:'fixture'}},console});
async function post(body:any={marketplaces:['shopee','aliexpress']}) {
 const response=await handlers.POST({headers:new Headers({origin:'https://fixture.invalid'}),nextUrl:new URL('https://fixture.invalid/api/admin/rodagem/lote'),json:async()=>body});
 return {status:response.status,body:await response.json()};
}
async function denied(expected:number,body?:any) {
 const before=[creates,transports];const r=await post(body);
 assert.equal(r.status,expected,JSON.stringify(r));assert.deepEqual([creates,transports],before,'denied request created/dispatched batch');return r;
}
try {
 await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values ('aff_a','a','route-a','A'),('aff_b','b','route-b','B');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values ('u_a','a','auth_a'),('u_b','b','auth_b');
 insert into garimpa.app_user_role(app_user_id,role) values ('u_a','afiliado'),('u_b','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_a','owner'),('aff_b','u_b','owner');`);
 for(const t of ['a','b']) for(const marketplace of ['shopee','aliexpress'])await withCommercialDb(ctx(t),(tx:any)=>storeAffiliateSecret({tenantId:t,marketplace,secretId:'credentials_json',secretValue:JSON.stringify({appId:'ID_'+t,appKey:'KEY_'+t,appSecret:'SECRET_'+t,trackingId:'TRACK_'+t})},tx),factory);
 for(const t of ['a','b']) {
  context=ctx(t);
  const result=await post({marketplaces:['shopee','aliexpress'],tenantId:t==='a'?'b':'a'});
  assert.equal(result.status,202,JSON.stringify(result));assert.equal(result.body.batch.tenant_id,t);assert.deepEqual(result.body.batch.requested_marketplaces,['shopee','aliexpress']);
  assert.equal(JSON.stringify(result).includes('SECRET_'),false);
  await pg.query("update garimpa.capture_batch set status='ok',finished_at=now() where id=$1",[result.body.batch.id]);
 }
 assert.equal(creates,2);assert.equal(transports,2);
 console.log('PASS real POST→preflight SQL/RLS→batch→dispatch A/B202 with own secrets and no house env; body tenant cannot redirect authority');
 context=ctx('a');
 process.env.SHOPEE_CAPTURE_ENABLED='false';
 let result=await denied(409,{marketplaces:['shopee']});assert.equal(result.body.skipped[0].reason,'capture_disabled');
 process.env.SHOPEE_CAPTURE_ENABLED='true';
 result=await denied(409,{marketplaces:['mercadolivre'],consent:true});assert.equal(result.body.error,'manual_capture_only');assert.ok(result.body.message);
 const mixed=await denied(409,{marketplaces:['mercadolivre','shopee'],consent:true});assert.equal(mixed.body.error,'manual_capture_only');assert.ok(mixed.body.message);
 const sourceRodagem=await readFile(new URL('../../packages/web/app/api/admin/rodagem/route.ts',import.meta.url),'utf8');
 const jsRodagem=ts.transpileModule(sourceRodagem,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const handlersRodagem:any={};
 vm.runInNewContext(jsRodagem,{exports:handlersRodagem,require:(id:string)=>{assert.ok(id in modules,'Unexpected dependency '+id);return modules[id];},Response,Error,process:{env:{DATABASE_URL:'fixture'}},console});
 const beforeRodagem=[creates,transports];
 const rodagemRes=await handlersRodagem.POST({headers:new Headers({origin:'https://fixture.invalid'}),nextUrl:new URL('https://fixture.invalid/api/admin/rodagem'),json:async()=>({})});
 assert.equal(rodagemRes.status,409);assert.deepEqual([creates,transports],beforeRodagem,'rodagem created/dispatched batch');
 const rodagemBody=await rodagemRes.json();assert.equal(rodagemBody.error,'manual_capture_only');assert.ok(rodagemBody.message);
 await pg.exec("update garimpa.affiliate_secret set status='revoked' where tenant_id='a' and marketplace='shopee'");
 result=await denied(409,{marketplaces:['shopee']});assert.equal(result.body.skipped[0].reason,'account_credentials_missing');
 context={...ctx('a'),tenantId:'b',affiliateId:'aff_b'};await denied(403);
 context=ctx('b');await pg.exec("update garimpa.affiliate_account set status='suspended' where tenant_id='b'");await denied(403);
 console.log('PASS real POST missing secrets, suspension, foreign identity, kill switch and external ML denied before create/transport');
}finally{await pg.close();}
