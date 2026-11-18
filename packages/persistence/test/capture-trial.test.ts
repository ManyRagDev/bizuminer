import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,openSync,closeSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runCapturePlan} from '../src/capture-plan.ts';
import {InMemoryStore} from '../src/store.ts';
import {ShopeeAdapter} from '../../capture/src/adapters/shopee/index.ts';
import {buildProductOfferQuery} from '../../capture/src/adapters/shopee/queries.ts';
const ctx={runId:'trial-fixture',log:()=>{}};
const credential={marketplace:'shopee',secret:{appId:'fixture',appSecret:'fixture'}};
test('CLI trial flag requires owned batch and fixes the dry-run query despite broader arguments',()=>{
 const script=fileURLToPath(new URL('../bin/sweep-shopee.ts',import.meta.url));
 const env={PATH:process.env.PATH};
 const rejected=spawnSync(process.execPath,['--experimental-strip-types',script,'--trial-single-product','--dry-run'],{env,encoding:'utf8'});
 assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/capture_trial_requires_owned_shopee_batch/);
 // The CLI explicitly exits after its preview; a regular file avoids losing buffered pipe output.
 const directory=mkdtempSync(join(tmpdir(),'capture-trial-preview-')),output=join(directory,'stdout'),fd=openSync(output,'w');
 try {
  const preview=spawnSync(process.execPath,['--experimental-strip-types',script,'--trial-single-product','--operation-batch','fixture','--worker','fixture','--dry-run','--keyword','unexpected','--pages','50','--page-size','50'],{env,encoding:'utf8',stdio:['ignore',fd,'pipe']});
  assert.equal(preview.status,0,preview.stderr);const text=readFileSync(output,'utf8');assert.match(text,/single-product-v1/);assert.match(text,/organizador para casa/);assert.doesNotMatch(text,/unexpected/);
 } finally {closeSync(fd);rmSync(directory,{recursive:true,force:true});}
});
test('trial requests ten offers in one query/page and persists one item, including known products',async()=>{
 const store=new InMemoryStore();let calls=0;
 const adapter=new ShopeeAdapter({maxAttempts:1,ratePerSecond:100000,fetchImpl:async(_url,init)=>{
  calls++;const {query,variables}=JSON.parse(String(init?.body));
  assert.deepEqual(variables,{});assert.equal(query,buildProductOfferQuery({keyword:'organizador para casa',page:1,limit:10,sortType:2}));
  return Response.json({data:{productOfferV2:{nodes:[1,2,3].map(id=>({itemId:String(id),productName:'Organizador '+id,productLink:'https://shopee.com.br/p/'+id,priceMin:'10.00',priceMax:'12.00'})),pageInfo:{hasNextPage:true}}}});
 }});
 for(let i=0;i<2;i++){
  const summary=await runCapturePlan(adapter,credential,store,{tenantId:'fixture',trialSingleProduct:true,operationBatchId:'batch',operationWorkerId:'worker',maxPagesPerQuery:20,pageSize:50,mode:'exploratory'},ctx);
  assert.equal(summary.planId,'single-product-v1');assert.equal(summary.queriesPlanned,1);assert.equal(summary.queriesCompleted,1);
  assert.equal(summary.itemsCaptured,1);assert.equal(summary.itemsSeen,1);assert.equal(summary.runs[0]?.pagesRead,1);
  assert.equal(summary.itemsNew,i===0?1:0);
 }
 assert.equal(calls,2);
 await assert.rejects(()=>runCapturePlan(adapter,credential,store,{tenantId:'fixture',trialSingleProduct:true},ctx),/requires_owned_shopee_batch/);
 assert.equal(calls,2);
});
