import test from 'node:test';
import assert from 'node:assert/strict';
import {ShopeeClient} from '../src/adapters/shopee/client.ts';
import {ShopeeAdapter} from '../src/adapters/shopee/index.ts';
const ctx={runId:'fixture',log:()=>{}};
const fields={appId:'fixture',appSecret:'fixture'};
test('normal requests retain five attempts; trial performs one even with override',async()=>{
 for(const maxAttempts of [undefined,1]){
  let calls=0;
  const client=new ShopeeClient({maxAttempts,ratePerSecond:100000,fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'0'}});}});
  await assert.rejects(()=>client.request(fields,'query {}',{},ctx));
  assert.equal(calls,maxAttempts??5);
  if(maxAttempts===1){calls=0;await assert.rejects(()=>client.request(fields,'query {}',{},ctx,5));assert.equal(calls,1);}
 }
});
test('trial ten-offer request cannot trigger system-error smaller-page retry',async()=>{
 let calls=0;
 const adapter=new ShopeeAdapter({maxAttempts:1,ratePerSecond:100000,fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(String(init?.body));assert.deepEqual(body.variables,{});assert.match(body.query,/limit:\s*10\b/);
  return Response.json({errors:[{message:'fixture',extensions:{code:10000}}]});
 }});
 await assert.rejects(()=>adapter.fetchOffers({marketplace:'shopee',secret:fields},{pageSize:10},ctx));
 assert.equal(calls,1);
});
