/** Offline causal regression: packaged 0.3.4 draft → 0.3.5 resume → 0.3.6
 * explicit unsent replacement. Uses the unchanged compiled Next validator. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=path.join(root,'packages/web',process.env.BIZUMINER_DIST_DIR||'.next-shared-links','server');
require(path.join(server,'app/api/extension/capture-batches/route.js'));
const webpack=require(path.join(server,'webpack-runtime.js'));
const isValidator=f=>typeof f==='function'&&f.toString().includes('product_identity_invalid')&&f.toString().includes('capture_time_invalid');
const entry=Object.entries(webpack.m).find(([,fn])=>isValidator(fn));assert.ok(entry);
const validate=Object.values(webpack(entry[0])).find(isValidator);assert.ok(validate);
const OriginalDate=globalThis.Date;
let time=OriginalDate.parse('2026-11-12T17:38:46.429Z'),sequence=0;
class ClockDate extends OriginalDate{constructor(value){super(value===undefined?time:value);}static now(){return time;}}
globalThis.Date=ClockDate;
const api='https://www.bizuminer.com.br',popup='chrome-extension://fixture/popup/index.html';
const href='https://www.mercadolivre.com.br/pisca-pisca-cascata-natal-400-leds-10m-8-funcoes-luz-quente/up/MLBU5148600495?pdp_filters=deal%3AMLB779362-1#polycard_client=offers&wid=MLB7630035664';
async function harness(version,initial){
 const data=structuredClone(initial),listeners={};let calls=0,reads=0,failRead=false,temporary=false;
 const hook=name=>({addListener:fn=>{listeners[name]=fn;}});
 const chrome={storage:{local:{get:async keys=>structuredClone(Object.fromEntries((keys===null?Object.keys(data):Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]]))),set:async values=>{Object.assign(data,structuredClone(values));}}},
  runtime:{onMessage:hook('message'),onInstalled:hook('installed'),onStartup:hook('startup'),getURL:p=>'chrome-extension://fixture/'+p,getManifest:()=>({version})},
  alarms:{onAlarm:hook('alarm'),create:async()=>{},clear:async()=>true},action:{onClicked:hook('clicked'),setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  tabs:{query:async()=>[{id:1,url:'https://www.mercadolivre.com.br/ofertas'}]},scripting:{executeScript:async options=>{
   reads++;if(failRead)throw new Error('synthetic DOM failure');
   const card={textContent:'Fixture',querySelector:s=>s==='a.poly-component__title'?{href,textContent:'Produto de teste'}:s.startsWith('.poly-price')?{getAttribute:()=> '68 reais'}:null,querySelectorAll:()=>[]};
   const result=vm.runInNewContext(`(${options.func.toString()})()`,{URL,URLSearchParams,Date:ClockDate,location:{href:'https://www.mercadolivre.com.br/ofertas'},document:{querySelectorAll:()=>[card]},crypto:{randomUUID:()=>`28e6109d-7f8a-43bd-ac09-${String(++sequence).padStart(12,'0')}`}});
   return[{result:structuredClone(result)}];
  }}};
 const source=readFileSync(path.join(root,`packages/extension/release/bizuminer-extension-v${version}/service-worker.js`),'utf8');
 vm.runInNewContext(source,{chrome,Date:ClockDate,URL,URLSearchParams,AbortController,Response,Request,Headers,setTimeout,clearTimeout,console:{log:()=>{},warn:()=>{},error:()=>{}},fetch:async(url,init)=>{
  calls++;assert.equal(url,api+'/api/extension/capture-batches');
  if(temporary)return Response.json({ok:false,error:'temporary'},{status:503});
  try{const result=validate(JSON.parse(init.body).payload);return Response.json({ok:true,mode:'manual',importedCount:result.diagnostics.valid,alreadyRecordedCount:0,diagnostics:result.diagnostics});}
  catch(error){return Response.json({ok:false,error:'invalid_payload',diagnostics:error.diagnostics},{status:400});}
 }},{filename:`packaged-${version}.js`});
 const send=type=>new Promise(resolve=>listeners.message({type},{url:popup},resolve));await send('GET_ENV');
 return{data,send,calls:()=>calls,reads:()=>reads,failRead:flag=>{failRead=flag;},temporary:flag=>{temporary=flag;}};
}
try{
 const old=await harness('0.3.4',{bm_token:'bm_ext_fixture',bm_device_id:'device-fixture',bm_session_origin:api});
 assert.equal((await old.send('PREPARE_BATCH')).ok,true);assert.equal(old.calls(),0);
 const draft=structuredClone(old.data),original=JSON.stringify(draft.bm_browser_batch.payload);
 assert.equal(draft.bm_browser_batch.payload.clientCapturedAt,'2026-11-12T17:38:46.429Z');
 assert.equal(new URL(draft.bm_browser_batch.payload.products[0].productUrl).searchParams.get('wid'),null);
 time=OriginalDate.parse('2026-11-12T18:06:04Z');
 const upgraded35=await harness('0.3.5',draft);
 assert.equal((await upgraded35.send('PREPARE_BATCH')).preserved,true);assert.equal(upgraded35.reads(),0);
 assert.equal((await upgraded35.send('IMPORT_BATCH')).ok,false);
 const oldReport=(await upgraded35.send('GET_BATCH_STATE')).lastImport;
 assert.equal(oldReport.at,time);assert.equal(oldReport.diagnostics.items[0].reason,'product_identity_invalid');
 assert.equal(JSON.stringify(upgraded35.data.bm_browser_batch.payload),original);
 const current=await harness('0.3.6',draft);
 let state=await current.send('GET_BATCH_STATE');
 assert.equal(state.capturedAt,'2026-11-12T17:38:46.429Z');assert.equal(state.preparedVersion,null);assert.equal(state.canReplace,true);
 await current.send('PREPARE_BATCH');assert.equal(current.reads(),0);assert.equal(JSON.stringify(current.data.bm_browser_batch.payload),original);
 current.failRead(true);assert.equal((await current.send('REFRESH_BATCH')).ok,false);
 assert.equal(JSON.stringify(current.data.bm_browser_batch.payload),original,'failed reread must preserve the unsent draft');
 current.failRead(false);assert.equal((await current.send('REFRESH_BATCH')).ok,true);
 state=await current.send('GET_BATCH_STATE');assert.equal(state.capturedAt,'2026-11-12T18:06:04.000Z');assert.equal(state.preparedVersion,'0.3.6');
 assert.notEqual(current.data.bm_browser_batch.payload.requestId,draft.bm_browser_batch.payload.requestId);
 assert.equal(new URL(current.data.bm_browser_batch.payload.products[0].productUrl).searchParams.get('wid'),'MLB7630035664');
 assert.equal(current.calls(),0,'resuming and rereading must not call HTTP');
 const fresh=structuredClone(current.data);
 current.temporary(true);assert.equal((await current.send('IMPORT_BATCH')).queued,true);
 const uncertain=JSON.stringify(current.data.bm_browser_batch.payload),reads=current.reads();
 assert.equal((await current.send('REFRESH_BATCH')).ok,false);assert.equal(current.reads(),reads);assert.equal(current.calls(),1);
 assert.equal(JSON.stringify(current.data.bm_browser_batch.payload),uncertain,'uncertain delivery must not be replaced implicitly');
 await current.send('CANCEL_BATCH');time+=1000;assert.equal((await current.send('PREPARE_BATCH')).ok,true);
 assert.notEqual(JSON.stringify(current.data.bm_browser_batch.payload),uncertain);
 const accepted=await harness('0.3.6',fresh);assert.equal((await accepted.send('IMPORT_BATCH')).ok,true);
 const receipt=(await accepted.send('GET_BATCH_STATE')).lastImport;
 assert.equal(receipt.capturedAt,'2026-11-12T18:06:04.000Z');assert.equal(receipt.preparedVersion,'0.3.6');assert.equal(receipt.diagnostics.valid,1);
 console.log(JSON.stringify({passed:true,causalDraftTime:'2026-11-12T17:38:46.429Z',confirmationTime:'2026-11-12T18:06:04Z',
  legacyResume:'preserved old URL and reproduced identity rejection',explicitUnsentReread:'new request/time/version; correct wid accepted',
  failedReread:'old draft preserved',uncertainDelivery:'replacement blocked until explicit discard',networkCalls:0,databaseCalls:0}));
}finally{globalThis.Date=OriginalDate;}
