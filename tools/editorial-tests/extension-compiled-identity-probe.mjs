/** Run offline: node probe.mjs <web-root> <canonical-worker.js> [dist-dir]
 * Loads compiled validation only. No route handler, database or provider call. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';

for (const name of ['DATABASE_URL','CAPTURE_LISTEN_DATABASE_URL','GEMINI_API_KEY','SUPABASE_SERVICE_ROLE_KEY'])
  if (process.env[name]) throw new Error('run_without_private_environment');
const [webArg,workerArg,distArg]=process.argv.slice(2);
assert.ok(webArg&&workerArg,'usage: node probe.mjs <web-root> <canonical-worker.js> [dist-dir]');
const server=path.resolve(webArg,distArg||'.next','server');
const require=createRequire(path.join(server,'webpack-runtime.js'));
// Registration constructs the Next route module but never invokes GET/POST.
require(path.join(server,'app/api/extension/capture-batches/route.js'));
const webpack=require(path.join(server,'webpack-runtime.js'));
const isValidator=fn=>typeof fn==='function'&&fn.toString().includes('product_identity_invalid')&&fn.toString().includes('capture_time_invalid');
const moduleEntry=Object.entries(webpack.m).find(([,fn])=>isValidator(fn));
assert.ok(moduleEntry,'compiled_browser_validator_module_not_found');
const validate=Object.values(webpack(moduleEntry[0])).find(isValidator);
assert.ok(validate,'compiled_browser_validator_export_not_found');
const worker=readFileSync(path.resolve(workerArg),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const reported='https://www.mercadolivre.com.br/pisca-pisca-cascata-natal-400-leds-10m-8-funcoes-luz-quente/up/MLBU5148600495?pdp_filters=deal%3AMLB779362-1#polycard_client=offers&amp;deal_print_id=87c8a9c6-aae1-4510-b82b-8811e21570e4&amp;position=4&amp;tracking_id=700d9126-038d-43cb-abbb-9315334b7121&amp;wid=MLB7630035664&amp;sid=offers';
const api='https://www.bizuminer.com.br',popup='chrome-extension://fixture/popup/index.html';
const stored={bm_token:'bm_ext_offline_fixture',bm_device_id:'offline-device',bm_session_origin:api};
const listeners={};let collected,sent,validation,requests=0;
const hook=name=>({addListener:fn=>{listeners[name]=fn;}});
const chrome={storage:{local:{get:async keys=>structuredClone(Object.fromEntries((keys===null?Object.keys(stored):Array.isArray(keys)?keys:[keys]).map(k=>[k,stored[k]]))),set:async values=>{Object.assign(stored,structuredClone(values));}}},
 runtime:{onMessage:hook('message'),onInstalled:hook('installed'),onStartup:hook('startup'),getURL:p=>'chrome-extension://fixture/'+p},
 alarms:{onAlarm:hook('alarm'),create:async()=>{},clear:async()=>true},action:{onClicked:hook('click'),setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
 tabs:{query:async()=>[{id:1,url:'https://www.mercadolivre.com.br/ofertas?promotion_type=lightning'}]},
 scripting:{executeScript:async options=>{
   assert.equal(typeof options.func,'function');
   const card={textContent:'Fixture',querySelector:s=>s==='a.poly-component__title'?{href:reported.replaceAll('&amp;','&'),textContent:'Produto de teste'}:s.startsWith('.poly-price')?{getAttribute:()=> '68 reais'}:null,querySelectorAll:()=>[]};
   collected=vm.runInNewContext(`(${options.func.toString()})()`,{URL,URLSearchParams,Date,location:{href:'https://www.mercadolivre.com.br/ofertas'},document:{querySelectorAll:()=>[card]},crypto:{randomUUID:()=> '28e6109d-7f8a-43bd-ac09-e01fdcaef529'}});
   return[{result:structuredClone(collected)}];
 }}};
vm.runInNewContext(worker,{chrome,URL,URLSearchParams,Date,AbortController,Response,Request,Headers,setTimeout,clearTimeout,console:{log:()=>{},warn:()=>{},error:()=>{}},
 fetch:async(url,init)=>{
  requests++;assert.equal(url,api+'/api/extension/capture-batches');assert.equal(init.method,'POST');
  sent=JSON.parse(init.body);validation=validate(sent.payload);
  return Response.json({ok:true,mode:'manual',importedCount:validation.diagnostics.valid,alreadyRecordedCount:0,diagnostics:validation.diagnostics});
 }},{filename:'canonical-worker.js'});
const send=type=>new Promise(resolve=>listeners.message({type},{url:popup},resolve));
await send('GET_ENV');assert.equal((await send('PREPARE_BATCH')).ok,true);
assert.equal((await send('IMPORT_BATCH')).ok,true);
assert.equal(requests,1);assert.equal(sent.payload.products[0].externalId,'MLB7630035664');
assert.equal(new URL(sent.payload.products[0].productUrl).searchParams.get('wid'),'MLB7630035664');
assert.deepEqual(validation.diagnostics,{received:1,valid:1,duplicates:0,rejected:0,items:[]});
assert.throws(()=>validate({...sent.payload,products:[{...sent.payload.products[0],externalId:'MLB9999999999'}]}),/identity/);
console.log(JSON.stringify({passed:true,moduleId:moduleEntry[0],validatorSha256:sha(validate.toString()),workerSha256:sha(worker),
 pipeline:'canonical packaged worker → serialized DOM reader → JSON → compiled Next validator',
 externalId:'MLB7630035664',productPath:new URL(sent.payload.products[0].productUrl).pathname,wid:'MLB7630035664',
 diagnostics:validation.diagnostics,trueMismatch:'rejected',networkCalls:0,databaseCalls:0,syntheticPrice:true}));
