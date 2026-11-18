import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function fixture(count) {
  const calls={provider:0,writes:0,closed:0,options:[]};
  const sql=async(strings)=>{
    const q=strings.join('?');
    if(q.includes('select id,public_slug'))return[{id:'account',public_slug:'account'}];
    if(q.includes('select p.id,p.external_id'))return Array.from({length:count},(_,i)=>({id:'p'+i,external_id:String(i),product_url:'https://shopee.com.br/product/1/'+i}));
    if(q.includes('insert into')){calls.writes++;return[{id:'pub',affiliate_url:null}];}
    if(q.includes('update garimpa.publication')){calls.writes++;return[];}
    throw new Error('unexpected query');
  };
  sql.end=async()=>{calls.closed++;};
  const exports={};
  const js=ts.transpileModule(readFileSync(new URL('../../persistence/src/shopee-links.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,process:{env:{}},require(id){
    if(id.endsWith('database-ssl.ts'))return{databaseSsl(){throw new Error('unexpected connection');}};
    if(id==='postgres')return{default(){throw new Error('unexpected connection');}};
    if(id.endsWith('shopee/index.ts'))return{ShopeeAdapter:class{constructor(options){calls.options.push(options);}async buildAffiliateLink(){calls.provider++;return'https://s.shopee.com.br/fixture';}}};
    if(id.endsWith('monitoring-db.ts'))return{withMonitoringDb:async(_sql,tenant,fn)=>{assert.equal(tenant,'trial');return fn(sql);}};
    if(id.endsWith('account-credentials.ts'))return{assertAccountActive:async()=>{},withAccountCredential:async(_sql,_tenant,_store,fn)=>fn({marketplace:'shopee',secret:{}})};
    throw new Error('unexpected module '+id);
  }});
  return{run:(extra={})=>exports.ensureShopeeAffiliateLinks({connectionString:'fixture-unused',tenantId:'trial',captureBatchId:'batch',singleProductTrial:true,sqlFactory:()=>sql,...extra},{log(){}}),calls};
}
test('trial affiliate stage uses one adapter attempt and generates at most one link',async()=>{
  const h=fixture(1);const result=await h.run();
  assert.equal(result.generated,1);assert.equal(h.calls.provider,1);assert.equal(h.calls.options[0].maxAttempts,1);assert.equal(h.calls.closed,1);
});
test('trial rejects multiple candidates or absent batch scope before publication/provider effects',async()=>{
  for(const [count,extra]of[[2,{}],[1,{captureBatchId:undefined}]]){
    const h=fixture(count);await assert.rejects(()=>h.run(extra),/capture_trial_/);
    assert.equal(h.calls.provider,0);assert.equal(h.calls.writes,0);assert.equal(h.calls.closed,1);
  }
});
