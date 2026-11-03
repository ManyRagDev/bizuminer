import test from 'node:test';
import assert from 'node:assert/strict';
import {monitoringDecision,monitoringQueue} from '../src/monitoring-policy.ts';
import {discoveryBudget,discoveryKeyword} from '../src/editorial-discovery.ts';
const now=new Date('2026-11-01T12:00:00Z');
const base={productId:'one',marketplace:'shopee' as const,lastObservedAt:new Date(+now-80*3600000),activeWatches:0,clicks7d:0,curationStatus:'held',curationReason:'insufficient_evidence',hasEditorialMerit:true};
test('held for history, weak offer or stale observation can be rechecked with actual merit outside the shelf',()=>{
 for(const curationReason of ['insufficient_evidence','weak_offer','stale_offer']){
  const decision=monitoringDecision({...base,curationReason,inCurrentEdition:false},now);
  assert.equal(decision.tier,'formation');assert.equal(decision.due,true);
 }
 assert.equal(monitoringDecision({...base,hasEditorialMerit:false},now).tier,'archive');
 assert.equal(monitoringDecision({...base,curationStatus:'rejected'},now).tier,'archive');
 assert.equal(monitoringDecision({...base,curationReason:'unavailable'},now).tier,'archive');
 assert.equal(monitoringDecision({...base,curationStatus:'pending',firstSeenAt:new Date(+now-30*86400000),lastObservedAt:now},now).tier,'archive');
});
test('formation, maintenance and discovery share bounded capacity, watches precede discovery',()=>{
 assert.deepEqual(discoveryBudget(20,20,3,true),{monitoring:20,discovery:0});
 assert.deepEqual(discoveryBudget(20,1,3,true),{monitoring:17,discovery:3});
 assert.deepEqual(discoveryBudget(20,0,3,false),{monitoring:20,discovery:0});
 assert.ok(monitoringQueue([base],'shopee',1,now).length===1);
 assert.notEqual(discoveryKeyword(['a','b'],now),discoveryKeyword(['a','b'],new Date(+now+6*3600000)));
});

test('discovery uses one bounded official page, keeps a distinct audit and counts actual saved products',async()=>{
 const {InMemoryStore}=await import('../src/store.ts');
 const {runEditorialDiscovery}=await import('../src/editorial-discovery-run.ts');
 const store=new InMemoryStore();let calls=0;
 const offers=Array.from({length:6},(_,i)=>({marketplace:'shopee',externalId:String(i),title:'Organizador '+i,productUrl:'https://shopee.com.br/'+i,priceCents:i===1 ? -1:2500,capturedAt:now,source:'official_api' as const}));
 const adapter:any={marketplace:'shopee',fetchOffers:async(_c:any,p:any)=>{calls++;assert.equal(p.pageSize,3);assert.equal(p.maxPages,1);return {offers};}};
 const result=await runEditorialDiscovery(adapter,{marketplace:'shopee',secret:{}},store,{tenantId:'a',keyword:'organização',budget:3,policyVersion:1,monitoringRunId:'monitor'}, {runId:'test',log:()=>{}});
 assert.equal(calls,1);assert.equal(result.seen,6);assert.equal(result.captured,2);assert.equal(result.discovered,2);
 assert.equal(store.allRuns[0]?.parameters.captureMode,'exploratory');assert.equal(store.allRuns[0]?.parameters.monitoringRunId,'monitor');assert.equal(store.allRuns[0]?.itemsCaptured,2);
 assert.equal(store.allRuns[0]?.status,'ok');
});
test('memory and postgres contract preserve variants in the same run without an invented price change',async()=>{
 const {InMemoryStore}=await import('../src/store.ts');const store=new InMemoryStore();
 const input={tenantId:'a',marketplace:'shopee',externalId:'1',captureRunId:'r',title:'Produto',productUrl:'https://shopee.com.br/1',priceCents:2500,observedAt:now};
 const evidence=(key:string)=>({version:2 as const,source:{marketplace:'shopee',method:'official_api' as const,url:input.productUrl,capturedAt:now.toISOString()},variantIdentity:{state:'source_verified' as const,key},currency:'BRL',priceType:'exact' as const});
 const first=await store.upsertProductWithObservation({...input,offerEvidence:evidence('red')});
 const second=await store.upsertProductWithObservation({...input,offerEvidence:evidence('green')});
 assert.equal(second.previousPriceCents,undefined);assert.equal((await store.priceRange(first.product.id))?.observations,2);
 await store.upsertProductWithObservation({...input,priceCents:3000,offerEvidence:evidence('red'),observedAt:new Date(+now+1000)});
 assert.equal((await store.priceRange(first.product.id))?.observations,2);assert.equal((await store.latestObservation(first.product.id))?.priceCents,3000);
});

test('formation receives an existing reserved history slot even with a large approved backlog',()=>{
 const approved=Array.from({length:100},(_,i)=>({...base,productId:`approved${i}`,curationStatus:'approved'}));
 const queue=monitoringQueue([...approved,base],'shopee',20,now);
 assert.equal(queue.length,20);assert.ok(queue.some(d=>d.productId==='one'&&d.tier==='formation'));
});
