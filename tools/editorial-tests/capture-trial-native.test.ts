/** Disposable PostgreSQL + real staging/publication. All provider transports are synthetic. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
import {PostgresStore} from '../../packages/persistence/src/pg-store.ts';
import {runCapturePlan} from '../../packages/persistence/src/capture-plan.ts';
import {publishCaptureBatch} from '../../packages/persistence/src/capture-publication.ts';
import {ShopeeAdapter} from '../../packages/capture/src/adapters/shopee/index.ts';
import {buildProductOfferQuery} from '../../packages/capture/src/adapters/shopee/queries.ts';
const require=createRequire(import.meta.url);
const {CaptureBatchStore,captureTrialForTenant}=require('../../packages/web/lib/capture-batch-db.ts');
const {executeCaptureBatch}=require('../../packages/web/lib/capture-batch-worker.ts');
const trial={mode:'single_product',version:1};
assert.equal(captureTrialForTenant('trial',{}),undefined);
for(const env of [{CAPTURE_TRIAL_MODE:'wrong'},{CAPTURE_TRIAL_MODE:'single_product'}, {CAPTURE_TRIAL_MODE:'single_product',CAPTURE_TRIAL_TENANTS:'other'}])assert.throws(()=>captureTrialForTenant('trial',env),/capture_trial_not_authorized/);
process.env.CAPTURE_TRIAL_MODE='single_product';process.env.CAPTURE_TRIAL_TENANTS='trial';
const fx=await nativePostgresFixture(),batches=new CaptureBatchStore(fx.factoryA);
const facts=new PostgresStore({connectionString:'unused',sqlFactory:()=>fx.clientB});
const realFetch=globalThis.fetch;globalThis.fetch=(()=>{throw new Error('unexpected_network');}) as typeof fetch;
const counts=async()=>(await fx.admin`select (select count(*)::int from garimpa.product) products,(select count(*)::int from garimpa.price_observation) observations,(select count(*)::int from garimpa.capture_prepared_offer) prepared`)[0];
const create=(options={})=>batches.create('trial',['shopee'],3,'durable',false,undefined,{pageSize:50,planMode:'departments',...options});
const cancel=async(id:string)=>fx.admin`update garimpa.capture_batch set status='error' where id=${id}`;
let captureCalls=0;
const adapter=new ShopeeAdapter({maxAttempts:1,ratePerSecond:100000,fetchImpl:async(_url,init)=>{
 captureCalls++;const {query,variables}=JSON.parse(String(init?.body));assert.deepEqual(variables,{});assert.equal(query,buildProductOfferQuery({keyword:'organizador para casa',page:1,limit:10,sortType:2}));
 return Response.json({data:{productOfferV2:{nodes:[1,2,3].map(id=>({itemId:String(id),productName:'Organizador '+id,productLink:'https://shopee.com.br/p/'+id,priceMin:'10.00',priceMax:'12.00'})),pageInfo:{hasNextPage:true}}}});
}});
try{
 for(const unit of (await replacementRollout()).units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
 for(const file of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql','20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql','20261101193221_improve_editorial_recommendations.sql','20261102131234_optimize_price_observation_scope.sql','20261020002440_garimpa_comparative_evidence_event.sql','20261111042204_pauta_versioned_selection.sql','20261112002243_capture_durable_execution.sql','20261112002247_capture_atomic_publication.sql'])await fx.migrate(file);
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('trial','trial','trial','Trial'),('other','other','other','Other')`;
 await assert.rejects(()=>batches.create('other',['shopee'],1,'durable',false),/capture_trial_not_authorized/);
 for(const markets of [['aliexpress'],['shopee','aliexpress']])await assert.rejects(()=>batches.create('trial',markets,1,'durable',false),/capture_trial_marketplace_invalid/);
 await assert.rejects(()=>batches.create('trial',['shopee'],1,'github',false),/capture_trial_executor_invalid/);
 const requestId=crypto.randomUUID(),batch=await create({requestId});
 assert.equal(batch.pages,1);assert.equal(batch.metadata.execution.pageSize,10);assert.equal(batch.metadata.execution.planMode,'keywords');assert.deepEqual(batch.metadata.execution.trial,trial);
 assert.equal((await create({requestId})).id,batch.id);
 delete process.env.CAPTURE_TRIAL_MODE;
 await assert.rejects(()=>batches.create('trial',['shopee'],1,'durable',false,undefined,{requestId,pageSize:10,planMode:'keywords'}),/capture_request_conflict/);
 process.env.CAPTURE_TRIAL_MODE='single_product';
 let links=0,ai=0;const steps:string[]=[];
 await executeCaptureBatch(batch.id,async(step:any)=>{
  steps.push(step.kind);const execution=(await batches.read(batch.id,'trial')).metadata.execution;
  assert.deepEqual(step.trial,trial);
  if(step.kind==='capture'){
   assert.equal(execution.trialCaptureAttempted,true);
   const summary=await runCapturePlan(adapter,{marketplace:'shopee',secret:{appId:'fixture',appSecret:'fixture'}},facts,{tenantId:'trial',trialSingleProduct:!!step.trial,operationBatchId:step.batchId,operationWorkerId:step.workerId},{runId:'trial',log:()=>{}});
   assert.equal(summary.itemsCaptured,1);assert.equal(summary.queriesPlanned,1);
   assert.deepEqual({...await counts()},{products:0,observations:0,prepared:1});
  }
  if(step.kind==='publish')await publishCaptureBatch(fx.clientB,'trial',step.batchId,step.workerId);
  if(step.kind==='affiliate'){assert.equal(execution.trialAffiliateAttempted,true);links++;}
  if(step.kind==='triage'){assert.equal(execution.trialTriageAttempted,true);ai++;return {ok:true,triage:{processed:1,approved:0,held:1,rejected:0,annotatedPending:0}};}
  return {ok:true};
 },batches,'trial');
 assert.deepEqual(steps,['capture','publish','affiliate','triage']);assert.equal(captureCalls,1);assert.equal(links,1);assert.equal(ai,1);
 assert.equal((await counts()).products,1);assert.equal((await counts()).observations,1);
 assert.equal(await executeCaptureBatch(batch.id,async()=>{throw Error('duplicate');},batches,'trial'),false);
 console.log('PASS persisted allowlist, normalization, idempotency, one official capture request, one staged product, atomic publication, one affiliate/AI invocation');
 for(const stage of ['capture','affiliate','triage']){
  const failed=await create();let stageCalls=0;
  const diagnostic=stage==='affiliate'
   ? {diagnosticCode:'ERR_MODULE_NOT_FOUND',exitCode:null,signal:'SIGKILL',stderrBytes:64,durationMs:13}
   : {version:1,phase:'capture_query',diagnosticCode:'sql_error',sqlState:'42501',exitCode:1,signal:null,stderrBytes:64,durationMs:13};
  await executeCaptureBatch(failed.id,async(step:any)=>{
   if(step.kind===stage){stageCalls++;return {ok:false,failureKind:'transient',error:'step_timeout',diagnostic:{...diagnostic,message:'PRIVATE_FIXTURE_SECRET',query:'PRIVATE_FIXTURE_SECRET'}};}
   if(step.kind==='capture')await fx.admin`insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,status,parameters) values(${crypto.randomUUID()},'trial','shopee',now(),'ok',${fx.admin.json({operationBatchId:failed.id})})`;
   return {ok:true};
  },batches,'trial');
  assert.equal(stageCalls,1);assert.equal((await batches.read(failed.id,'trial')).metadata.execution.phase,'awaiting_reconciliation');
  const failure=(await batches.read(failed.id,'trial')).metadata.execution.trialFailure;
  assert.deepEqual(failure,{stage,phase:stage==='capture'?'capturing':stage==='affiliate'?'affiliating':'triaging',at:failure.at,error:'step_timeout',failureKind:'transient',diagnostic});
  assert.ok(Number.isFinite(Date.parse(failure.at)));
  assert.ok(!JSON.stringify((await batches.read(failed.id,'trial')).metadata).includes('PRIVATE_FIXTURE_SECRET'));
  assert.equal((await batches.scheduled('trial')).length,0);
  await assert.rejects(()=>batches.resolveWait(failed.id,'trial','retry'),/reconciliation/);
  assert.equal(await executeCaptureBatch(failed.id,async()=>{throw Error('replayed');},batches,'trial'),false);
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,phase}','"queued"') where id=${failed.id}`;
  let external=0;await executeCaptureBatch(failed.id,async()=>{external++;return {ok:true};},batches,'trial');
  assert.equal(external,0);
  assert.deepEqual((await batches.read(failed.id,'trial')).metadata.execution.trialFailure,failure,'reentry preserves first failure and original timestamp');
  await cancel(failed.id);
 }
 console.log('PASS failed/uncertain capture, affiliate and AI each stop and cannot be retried or reentered');
 for(const malformed of [false,true]){
  const failed=await create();
  await executeCaptureBatch(failed.id,async()=>{
   if(!malformed)throw Error('PRIVATE_FIXTURE_SECRET');
   return {ok:false,error:'PRIVATE_FIXTURE_SECRET',failureKind:'PRIVATE_FIXTURE_SECRET',diagnostic:{version:2,phase:'PRIVATE_FIXTURE_SECRET',diagnosticCode:'PRIVATE_FIXTURE_SECRET',sqlState:'PRIVATE_FIXTURE_SECRET',exitCode:NaN,signal:'PRIVATE_FIXTURE_SECRET',stderrBytes:-1,durationMs:Infinity,raw:'PRIVATE_FIXTURE_SECRET'}};
  },batches,'trial');
  const execution=(await batches.read(failed.id,'trial')).metadata.execution;
  assert.equal(execution.phase,'awaiting_reconciliation');assert.equal(execution.trialCaptureAttempted,true);
  assert.deepEqual(execution.trialFailure,{stage:'capture',phase:'capturing',at:execution.trialFailure.at,error:'capture_cli_failed'});
  assert.ok(!JSON.stringify(execution).includes('PRIVATE_FIXTURE_SECRET'));
  assert.equal((await batches.scheduled('trial')).length,0);await cancel(failed.id);
 }
 console.log('PASS diagnostics retain only bounded allowlisted fields; thrown/provider secrets and malformed values are never persisted');
 for(const stage of ['capturing','affiliating','triaging']){
  const crashed=await create();
  const attempted=stage==='capturing'?'trialCaptureAttempted':stage==='affiliating'?'trialAffiliateAttempted':'trialTriageAttempted';
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution}',metadata->'execution'||${fx.admin.json({phase:stage,trialCaptureAttempted:true,[attempted]:true,deadline:new Date(0).toISOString()})}::jsonb) where id=${crashed.id}`;
  await batches.recover('trial');assert.equal((await batches.read(crashed.id,'trial')).metadata.execution.phase,'awaiting_reconciliation');
  assert.equal((await batches.scheduled('trial')).length,0);await cancel(crashed.id);
 }
 delete process.env.CAPTURE_TRIAL_MODE;
 const normal=await batches.create('trial',['shopee'],2,'durable',false);
 assert.equal(normal.metadata.execution.trial,undefined);assert.equal(normal.pages,2);
 await executeCaptureBatch(normal.id,async()=>({ok:false,failureKind:'transient'}),batches,'trial');
 assert.equal((await batches.read(normal.id,'trial')).metadata.execution.phase,'retry_wait');
 console.log('PASS crash recovery never repeats trial effects; normal captures retain retry behavior');
}finally{globalThis.fetch=realFetch;await fx.close();}
