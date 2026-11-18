import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('/app/packages/web/package.json');
const postgres=require('postgres');
let externalAttempts=0;globalThis.fetch=async()=>{externalAttempts++;throw new Error('probe_external_http_forbidden');};
const {inAccountScope}=await import('/app/packages/web/lib/account-scope.ts');
const {withAccountDb}=await import('/app/packages/web/lib/tenant-db.ts');
const {readOperationProgress,readOperationHistory}=await import('/app/packages/web/lib/operation-progress-db.ts');
const {readCaptureActivities,readCaptureActivity}=await import('/app/packages/web/lib/capture-activity-db.ts');
const {readOperationalOffer}=await import('/app/packages/web/lib/pauta-db.ts');
const {capturePathReference}=await import('/app/packages/web/lib/capture-activity.ts');
const {owner,operator}=JSON.parse(await readFile('/proof/context.json','utf8'));
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,onnotice:()=>{}});
const snapshot=()=>withAccountDb(owner,async tx=>{
 const [row]=await tx`select
  (select md5(coalesce(string_agg(id||observed_at::text||price_cents::text||coalesce(offer_evidence::text,''),'|' order by id),'')) from garimpa.price_observation where tenant_id=${owner.tenantId}) facts,
  (select md5(coalesce(string_agg(id::text||status||attempts::text||updated_at::text,'|' order by id),'')) from garimpa.curation_attribute_job where tenant_id=${owner.tenantId}) jobs,
  (select md5(coalesce(string_agg(device_id||request_id::text||fingerprint||result::text,'|' order by device_id,request_id),'')) from garimpa.extension_capture_receipt where tenant_id=${owner.tenantId}) receipts,
  (select md5(coalesce(string_agg(id||status,'|' order by id),'')) from garimpa.publication where tenant_id=${owner.tenantId}) publications,
  (select md5(coalesce(string_agg(channel||edition_id::text||confirmed_at::text,'|' order by channel,edition_id,confirmed_at),'')) from garimpa.recommendation_exposure where tenant_id=${owner.tenantId}) exposures,
  (select md5(coalesce(string_agg(kind||marketplace||local_day::text||consumed::text,'|' order by kind,marketplace,local_day),'')) from garimpa.curation_external_budget where tenant_id=${owner.tenantId}) budget`;
 return JSON.stringify(row);
});
try{
 const [{rolsuper,rolbypassrls}]=await sql`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`;assert.equal(rolsuper,false);assert.equal(rolbypassrls,false);
 const before=await snapshot();
 const state=await inAccountScope(owner,()=>readOperationProgress(owner));assert.equal(state.mode,'v2');assert.ok(state.evaluation);assert.ok(state.stores?.length===4);assert.ok(Object.values(state.availability).every(Boolean),'one progress section unavailable');
 const list=await inAccountScope(owner,()=>readCaptureActivities(owner,{limite:100}));assert.equal(list.available,true);
 const manual=list.items.find(x=>x.origin==='manual'),batch=list.items.find(x=>x.origin==='batch');assert.ok(manual);assert.ok(batch);
 const receipt=await inAccountScope(owner,()=>readCaptureActivity(owner,capturePathReference(encodeURIComponent(manual.reference)),{}));assert.ok(receipt?.available&&receipt.products.items.length>0);
 const b=await inAccountScope(owner,()=>readCaptureActivity(owner,batch.reference,{}));assert.ok(b?.available&&b.searchSummary);
 const item=await inAccountScope(owner,()=>readOperationalOffer(owner,receipt.products.items[0].id));assert.ok(item&&item.processingAvailable);
 const hist=await inAccountScope(owner,()=>readOperationHistory(owner));assert.equal(hist.available,true);
 const foreign={...owner,tenantId:'operation_unbound_account',affiliateId:'operation_unbound_account'};
 const blocked=await inAccountScope(foreign,()=>readOperationProgress(foreign));assert.equal(blocked.evaluation,null);assert.ok(Object.values(blocked.availability).every(x=>!x));assert.equal(blocked.problems.length,0);
 let opResult=null;
 if(operator){
  const op=await inAccountScope(operator,()=>readOperationProgress(operator));assert.deepEqual(op.evaluation,state.evaluation);assert.ok(Object.values(op.availability).every(Boolean));
  const raw=await withAccountDb(operator,tx=>tx`select id from garimpa.curation_attribute_job`);assert.equal(raw.length,0);
  const [{id}]=await withAccountDb(owner,tx=>tx`select id from garimpa.curation_attribute_job where tenant_id=${owner.tenantId} and status='reconciliation' limit 1`);
  await assert.rejects(withAccountDb(operator,tx=>tx`select garimpa.release_uncertain_attribute_job(${owner.tenantId},${id}::uuid,'Denied deployment probe')`),/reconciliation_forbidden/);
  opResult={sameState:true,rawJobsPrivate:true,releaseDenied:true};
 }
 assert.equal(await snapshot(),before,'readers changed business data');assert.equal(externalAttempts,0);
 const safe={ok:true,mode:state.mode,counts:{queued:state.evaluation.queued,waiting:state.evaluation.waiting,running:state.evaluation.running,uncertain:state.evaluation.uncertain,captures:list.items.length,batchSearches:b.searchSummary.total,receiptProducts:receipt.products.items.length},channels:{whatsapp:state.pauta.whatsapp?{active:state.pauta.whatsapp.active,count:state.pauta.whatsapp.count}:null,stories:state.pauta.stories?{active:state.pauta.stories.active,count:state.pauta.stories.count}:null},fourStores:true,owner:true,operator:opResult,foreignDenied:true,dataPreserved:true,externalAttempts};
 console.log(JSON.stringify(safe));
}finally{await sql.end({timeout:5});process.exitCode=process.exitCode??0;setTimeout(()=>process.exit(process.exitCode),100).unref();}
