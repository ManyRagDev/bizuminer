import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBrowserCapture, validateBrowserCaptureWithDiagnostics, BrowserCaptureValidationError, browserCaptureDiagnosticReasons } from '../lib/browser-capture-contract.ts';

const product=(index)=>({externalId:`MLB${1000000000+index}`,title:`Produto válido ${index}`,priceCents:1000,
  productUrl:`https://produto.mercadolivre.com.br/MLB-${1000000000+index}-teste`});
const capture=(products)=>({version:1,requestId:'123e4567-e89b-42d3-a456-426614174000',marketplace:'mercadolivre',
  clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:'https://www.mercadolivre.com.br/ofertas'},products});
const checkCounts=(d)=>assert.equal(d.received,d.valid+d.duplicates+d.rejected);

test('53 recebidos explicam 35 válidos e 18 rejeitados, com índices originais',()=>{
 const input=capture([...Array.from({length:35},(_,i)=>product(i)),...Array.from({length:18},(_,i)=>({...product(i+35),priceCents:0}))]);
 const {payload,diagnostics}=validateBrowserCaptureWithDiagnostics(input);
 assert.equal(payload.products.length,35);
 assert.deepEqual({...diagnostics,items:undefined},{received:53,valid:35,duplicates:0,rejected:18,items:undefined});
 assert.deepEqual(diagnostics.items.map(i=>i.index),Array.from({length:18},(_,i)=>i+36));
 assert.ok(diagnostics.items.every(i=>i.status==='rejected'&&i.reason==='product_price_invalid'));
 checkCounts(diagnostics);assert.deepEqual(validateBrowserCapture(input),payload);
});

test('duplicatas do payload são separadas de rejeições e válidos são únicos',()=>{
 const input=capture([product(0),product(1),product(0),{...product(2),title:'x'},product(1),product(2)]);
 const {payload,diagnostics}=validateBrowserCaptureWithDiagnostics(input);
 assert.equal(payload.products.length,3);
 assert.equal(diagnostics.valid,3);assert.equal(diagnostics.duplicates,2);assert.equal(diagnostics.rejected,1);
 assert.deepEqual(diagnostics.items.map(i=>[i.index,i.status,i.reason]),[[3,'duplicate','duplicate_external_id'],[4,'rejected','product_title_invalid'],[5,'duplicate','duplicate_external_id']]);
 checkCounts(diagnostics);
});

test('lote sem item válido lança erro tipado com diagnósticos completos e seguros',()=>{
 const input=capture([{...product(0),priceCents:0},{...product(1),productUrl:'https://outside.invalid/private?secret=do-not-return'}]);
 for(const validate of [validateBrowserCaptureWithDiagnostics,validateBrowserCapture]) {
  assert.throws(()=>validate(input),error=>{
   assert.ok(error instanceof BrowserCaptureValidationError);
   assert.equal(error.diagnostics.received,2);assert.equal(error.diagnostics.valid,0);
   assert.equal(error.diagnostics.rejected,2);checkCounts(error.diagnostics);
   assert.equal(JSON.stringify(error.diagnostics).includes('do-not-return'),false);
   assert.ok(browserCaptureDiagnosticReasons.includes(error.message));return true;
  });
 }
});

test('diagnósticos nunca refletem identidade maliciosa, título, URL ou exceção bruta',()=>{
 const secret='cookie=session-secret';
 const input=capture([product(0),{...product(1),externalId:`MLB123456<script>${secret}</script>`,title:secret},
  {...product(2),externalId:'MLB'+'1'.repeat(100),productUrl:`https://evil.invalid/${secret}`},
  {...product(3),productUrl:`https://evil.invalid/${secret}`},null]);
 const {diagnostics}=validateBrowserCaptureWithDiagnostics(input);
 assert.equal(diagnostics.rejected,4);checkCounts(diagnostics);
 const serialized=JSON.stringify(diagnostics);
 for(const forbidden of [secret,'script','https:','productUrl','title','exception'])assert.equal(serialized.includes(forbidden),false);
 for(const item of diagnostics.items){
  assert.ok(browserCaptureDiagnosticReasons.includes(item.reason));
  assert.ok(item.externalId===undefined||/^MLB\d{6,61}$/.test(item.externalId));
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(item))).sort(),item.externalId===undefined?['index','reason','status']:['externalId','index','reason','status']);
 }
});

test('limites de lote e metadados permanecem fechados, sem diagnóstico de produto inventado',()=>{
 for(const input of [capture([]),capture(Array.from({length:201},(_,i)=>product(i))),
  {...capture([product(0)]),marketplace:'unknown'},
  {...capture([product(0)]),version:2},
  {...capture([product(0)]),requestId:'not-a-uuid'},
  {...capture([product(0)]),clientCapturedAt:new Date(Date.now()-31*60_000).toISOString()}]) {
  assert.throws(()=>validateBrowserCaptureWithDiagnostics(input),error=>{
   assert.equal(error instanceof BrowserCaptureValidationError,false);return true;
  });
 }
});
