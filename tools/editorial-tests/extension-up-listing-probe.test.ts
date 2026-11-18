/** Real reported href, packaged workers and executeScript-style serialization.
 * Isolated DOM/storage/fetch fixtures only: never opens the marketplace. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateBrowserCaptureWithDiagnostics}=require('../../packages/web/lib/browser-capture-contract.ts');
const reportedHref='https://www.mercadolivre.com.br/pisca-pisca-cascata-natal-400-leds-10m-8-funcoes-luz-quente/up/MLBU5148600495?pdp_filters=deal%3AMLB779362-1#polycard_client=offers&amp;deal_print_id=87c8a9c6-aae1-4510-b82b-8811e21570e4&amp;position=4&amp;tracking_id=700d9126-038d-43cb-abbb-9315334b7121&amp;wid=MLB7630035664&amp;sid=offers';
const origin='https://www.bizuminer.com.br';
const popup='chrome-extension://fixture/popup/index.html';
async function probe(version:string,href:string){
 const source=await readFile(new URL(`../../packages/extension/release/bizuminer-extension-v${version}/service-worker.js`,import.meta.url),'utf8');
 const state:Record<string,unknown>={bm_token:'bm_ext_fixture',bm_device_id:'fixture-device',bm_session_origin:origin};
 const listeners:Record<string,Function>={};let sent:any=null,read:any=null,diagnostics:any=null;
 const hook=(name:string)=>({addListener:(fn:Function)=>{listeners[name]=fn;}});
 const chrome={storage:{local:{get:async(keys:string|string[]|null)=>structuredClone(Object.fromEntries((keys===null?Object.keys(state):Array.isArray(keys)?keys:[keys]).map(key=>[key,state[key]]))),set:async(values:object)=>{Object.assign(state,structuredClone(values));}}},
  runtime:{onMessage:hook('message'),onInstalled:hook('installed'),onStartup:hook('startup'),getURL:(path:string)=>'chrome-extension://fixture/'+path},
  alarms:{onAlarm:hook('alarm'),create:async()=>{},clear:async()=>true},action:{onClicked:hook('click'),setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  tabs:{query:async()=>[{id:1,url:'https://www.mercadolivre.com.br/ofertas?promotion_type=lightning'}]},
  scripting:{executeScript:async(options:any)=>{
   assert.equal(typeof options.func,'function');
   const card={textContent:'Produto de teste',querySelector(selector:string){if(selector==='a.poly-component__title')return{href,textContent:'Produto de teste'};if(selector.startsWith('.poly-price'))return{getAttribute:()=> '68 reais'};return null;},querySelectorAll(){return[];}};
   read=vm.runInNewContext(`(${options.func.toString()})()`,{URL,URLSearchParams,Date,location:{href:'https://www.mercadolivre.com.br/ofertas?promotion_type=lightning'},document:{querySelectorAll:()=>[card]},crypto:{randomUUID:()=> '28e6109d-7f8a-43bd-ac09-e01fdcaef529'}});
   return[{result:structuredClone(read)}];
  }}};
 vm.runInNewContext(source,{chrome,console:{error:()=>{},warn:()=>{},log:()=>{}},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Response,Request,Headers,
  fetch:async(url:string,init:RequestInit)=>{
   assert.equal(url,origin+'/api/extension/capture-batches');assert.equal(init.method,'POST');sent=JSON.parse(String(init.body));
   try{diagnostics=validateBrowserCaptureWithDiagnostics(sent.payload).diagnostics;return Response.json({ok:true,mode:'manual',importedCount:diagnostics.valid,alreadyRecordedCount:0,diagnostics});}
   catch(error:any){diagnostics=error.diagnostics;return Response.json({ok:false,error:'invalid_payload',diagnostics},{status:400});}
  }},{filename:`packaged-worker-${version}.js`});
 const send=(type:string)=>new Promise<any>(resolve=>listeners.message!({type},{url:popup},resolve));
 await send('GET_ENV');const prepared=await send('PREPARE_BATCH');const result=prepared.ok?await send('IMPORT_BATCH'):prepared;
 return{prepared,result,read,sent,diagnostics};
}
// HTML uses &amp; for an attribute separator; HTMLAnchorElement.href exposes &.
// Both representations are probed explicitly rather than assuming the literal
// transported through the chat equals the DOM property used by executeScript.
const domHref=reportedHref.replaceAll('&amp;','&');
const previous=await probe('0.3.4',domHref);
assert.equal(previous.prepared.ok,true);assert.equal(previous.read.products[0].externalId,'MLB7630035664');
assert.equal(new URL(previous.read.products[0].productUrl).searchParams.get('wid'),null);
assert.equal(previous.result.ok,false);assert.equal(previous.diagnostics.items[0].reason,'product_identity_invalid');
const current=await probe('0.3.5',domHref);
assert.equal(current.prepared.ok,true);assert.equal(current.read.products[0].externalId,'MLB7630035664');
assert.equal(new URL(current.read.products[0].productUrl).searchParams.get('wid'),'MLB7630035664');
assert.equal(current.result.ok,true);assert.equal(current.diagnostics.valid,1);assert.equal(current.diagnostics.rejected,0);
assert.deepEqual(current.sent.payload,JSON.parse(JSON.stringify(current.read)),'wire serialization must preserve the collected payload');
assert.throws(()=>validateBrowserCaptureWithDiagnostics({...current.sent.payload,products:[{...current.sent.payload.products[0],externalId:'MLB9999999999'}]}),/identity/);
const literal=await probe('0.3.5',reportedHref);assert.equal(literal.prepared.ok,false);assert.equal(literal.sent,null);
console.log(JSON.stringify({passed:true,reportedListing:'MLB7630035664',pathKind:'up/MLBU',pipeline:'packaged worker → executeScript serialized DOM reader → JSON wire → strict validator',
 previous:{version:'0.3.4',keepsWid:false,rejected:previous.diagnostics.rejected,reason:previous.diagnostics.items[0].reason},
 current:{version:'0.3.5',keepsWid:true,valid:current.diagnostics.valid,rejected:current.diagnostics.rejected},
 literalHtmlEntityHref:{prepared:literal.prepared.ok,sent:false},trueMismatch:'rejected'}));
