/** Literal reviewed VPS schema/ACL; disposable PostgreSQL only, no provider/data export. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {realGarimpaBaselineFixture} from './real-garimpa-baseline-fixture.ts';
import {PostgresStore} from '../../packages/persistence/src/pg-store.ts';
import {withMonitoringDb} from '../../packages/persistence/src/monitoring-db.ts';
import {runCapturePlan} from '../../packages/persistence/src/capture-plan.ts';
import type {CaptureAdapter} from '../../packages/capture/src/types.ts';
const require=createRequire(import.meta.url);
const {CaptureBatchStore}=require('../../packages/web/lib/capture-batch-db.ts');
const schema=process.env.GARIMPA_BASELINE_SCHEMA,grants=process.env.GARIMPA_BASELINE_GRANTS;
if(!schema||!grants)throw Error('reviewed_baseline_schema_and_grants_required');
assert.equal(createHash('sha256').update(await readFile(grants)).digest('hex'),'0e6628c84f4c9611e7887e8009f4e39a451f1b0bb6a9ec55ad5d98799a2568a7','unreviewed_grants_hash');
const fx=await realGarimpaBaselineFixture(schema,grants);
const fetchBefore=globalThis.fetch;globalThis.fetch=(()=>{throw Error('unexpected_provider_network');}) as typeof fetch;
const tenant='trial_baseline',worker=randomUUID();
process.env.CAPTURE_TRIAL_MODE='single_product';process.env.CAPTURE_TRIAL_TENANTS=tenant;
const batches=new CaptureBatchStore(fx.factoryA),facts=new PostgresStore({connectionString:'unused',sqlFactory:()=>fx.clientB});
try{
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status) values('fixture_trial_baseline',${tenant},'fixture-trial-baseline','Fixture trial','active')`;
 const batch=await batches.create(tenant,['shopee'],1,'durable',false,undefined,{requestId:randomUUID()});
 const claimed=await batches.claim(batch.id,worker,tenant);assert.ok(claimed);
 const execution=claimed.metadata.execution;execution.trialCaptureAttempted=true;execution.stores.shopee={status:'running'};
 await batches.update(batch.id,worker,execution,'running',tenant);
 const permission=await withMonitoringDb(fx.clientB,tenant,async tx=>(await tx`select current_user as role,
  current_setting('garimpa.tenant_id',true) as tenant,garimpa.active_tenant(${tenant}) as active,
  has_table_privilege(current_user,'garimpa.capture_batch','SELECT,UPDATE') as batch_read_lock,
  has_table_privilege(current_user,'garimpa.capture_run','SELECT,INSERT,UPDATE') as run_write,
  has_function_privilege(current_user,'garimpa.active_tenant(text)','EXECUTE') as tenant_function`)[0]);
 console.log(JSON.stringify({scope:permission}));
 let capturedError:any=null,runId:string|undefined;
 try{
  runId=await facts.startCaptureRun({tenantId:tenant,marketplace:'shopee',startedAt:new Date(),collectorRunId:'sweep-shopee-fixture:single-product-casa-v1',parameters:{keyword:'organizador para casa',pageSize:10,maxPages:1,captureExecutionId:'sweep-shopee-fixture',operationBatchId:batch.id,operationWorkerId:worker,capturePlanId:'single-product-v1',captureQueryId:'single-product-casa-v1',captureMode:'directed',targetCategory:'Casa',maxNewItems:8,maxNewPerFamily:5,saturationThreshold:0.6,minCandidatesForSaturation:10}});
 }catch(error:any){capturedError=error;console.log(JSON.stringify({startCaptureRunError:{name:error?.name,code:error?.code,message:error?.message,schema_name:error?.schema_name,table_name:error?.table_name,column_name:error?.column_name,constraint_name:error?.constraint_name,routine:error?.routine,where:error?.where}}));}
 const counts=(await fx.admin`select (select count(*)::int from garimpa.capture_run) runs,(select count(*)::int from garimpa.product) products,(select count(*)::int from garimpa.price_observation) observations`)[0];
 console.log(JSON.stringify({result:capturedError?'start_capture_run_failed':'start_capture_run_committed',counts,providerCalls:0}));
 if(capturedError)throw capturedError;
 assert.ok(runId);assert.deepEqual({...counts},{runs:1,products:0,observations:0});
 assert.equal(await facts.captureRunCheckpoint(runId,tenant),null);
 console.log('PASS literal baseline startCaptureRun committed before any provider invocation');
 // Match the VPS login pattern: a non-superuser runtime inherits garimpa_app, rather than logging in as the group.
 await fx.admin`create role fixture_runtime login inherit nosuperuser nobypassrls`;
 await fx.admin`grant garimpa_app to fixture_runtime with inherit true, set true`;
 const [{port}]=await fx.admin`select inet_server_port() as port`;
 const runtimeFacts=new PostgresStore({connectionString:`postgresql://fixture_runtime@127.0.0.1:${port}/postgres?sslmode=disable`});
 let providerBoundary=0;
 const boundaryAdapter:CaptureAdapter={marketplace:'shopee',capabilities:{search:true,offerFeed:true,linkGeneration:true,conversionReport:false,source:'official_api'},
  validateCredential:async()=>{throw Error('unexpected_validation');},fetchOffers:async()=>{throw Error('unexpected_fetch');},
  async *streamOffers(){providerBoundary++;throw Error('fixture_provider_boundary_no_network');}};
 try{
  const summary=await runCapturePlan(boundaryAdapter,{marketplace:'shopee',secret:{}},runtimeFacts,
   {tenantId:tenant,trialSingleProduct:true,operationBatchId:batch.id,operationWorkerId:worker},
   {runId:'sweep-shopee-fixture',log:()=>{}});
  assert.equal(providerBoundary,1,'runtime must reach provider boundary only after start and checkpoint SQL succeed');
  assert.equal(summary.queriesFailed,1);assert.equal(summary.itemsCaptured,0);
  const [run]=await fx.admin`select status,error from garimpa.capture_run where id=${runId}`;
  assert.equal(run.status,'error');assert.equal(run.error,'fixture_provider_boundary_no_network');
  console.log('PASS inherited runtime + actual pool configuration reaches stream boundary; SQL start/checkpoint/finish succeed, provider calls remain zero');
 }finally{await runtimeFacts.close();}
}finally{globalThis.fetch=fetchBefore;await fx.close();}
