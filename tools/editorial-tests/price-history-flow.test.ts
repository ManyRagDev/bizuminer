import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {publicDealDetail}=require('../../packages/web/lib/public-offer-db.ts');
const {priceHistoryView}=require('../../packages/web/lib/price-history.ts');
const fx=await commercialFixture();
const e={version:2,currency:'BRL',priceType:'exact',variantIdentity:{state:'source_verified',key:'unit'},packageQuantity:1,
 fieldStates:{sellerId:'not_applicable',packageContents:'not_applicable',dimensions:'not_applicable',payment:'not_applicable',coupon:'not_applicable',region:'not_applicable'}};
try {
 for(const name of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql',
  '20261028041629_durable_product_presentation.sql','20261028041849_watch_comparable_baseline.sql','20261028042010_public_price_history_context.sql']) {
  await fx.pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/'+name,import.meta.url),'utf8'));
 }
 await fx.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status) values('aff_a','a','a','Fixture','active');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at)
 select 'p_'||i,'a','aliexpress',i::text,'Produto '||i,'https://aliexpress.com/product/'||i,1000,now() from generate_series(1,7) i;
 insert into garimpa.product_curation(tenant_id,product_id,status) select tenant_id,id,'approved' from garimpa.product on conflict(tenant_id,product_id) do update set status='approved';
 insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
 select 'pub_'||id,'a','aff_a',id,'web','ali-'||external_id,'active','https://aliexpress.com/affiliate' from garimpa.product;`);
 for(let i=1;i<=7;i++) {
  const current=i===4?{...e,variantIdentity:{state:'unknown'}}:i===5?{...e,currency:undefined}:i===6?{...e,priceType:'range',priceMinCents:1000,priceMaxCents:3000}:e;
  await fx.pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values($1,'a',$2,1000,now()-interval '1 hour',$3)`,['cur_'+i,'p_'+i,JSON.stringify(current)]);
  if(i!==1) for(let d=1;d<=3;d++) await fx.pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values($1,'a',$2,$3,now()-($4*interval '1 day'),$5)`,['old_'+i+'_'+d,'p_'+i,i===3?1000+d*100:1000,d,JSON.stringify(i===7?{...e,currency:'USD'}:current)]);
 }
 const single=await publicDealDetail('ali-1',fx.factory);assert.equal(single.history_context.comparableCount,1);assert.equal(priceHistoryView(single.price_history).state,'single');
 const stable=await publicDealDetail('ali-2',fx.factory);assert.equal(priceHistoryView(stable.price_history).state,'stable');assert.equal(priceHistoryView(stable.price_history).min,1000);
 const varied=await publicDealDetail('ali-3',fx.factory);assert.equal(priceHistoryView(varied.price_history).state,'variable');assert.equal(priceHistoryView(varied.price_history).max,1300);
 for(const [id,reason] of [[4,'configuration_unknown'],[5,'currency_unknown'],[6,'non_exact']]) {
  const result=await publicDealDetail('ali-'+id,fx.factory);assert.equal(result.price_history.length,0);assert.equal(result.history_context.comparison,reason);assert.equal(result.history_context.totalCount,4);assert.equal(result.history_context.excludedCount,4);
 }
 const mixed=await publicDealDetail('ali-7',fx.factory);assert.equal(mixed.price_history.length,1);assert.equal(mixed.history_context.excludedCount,3);

 let changed=false;
 const interleavedFactory=()=>new Proxy(fx.factory(),{get(target,key){
  if(key==='end')return async()=>{if(!changed){changed=true;await fx.pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('race_new','a','p_2',2000,now(),$1)`,[JSON.stringify({...e,currency:'USD'})]);}};
  return Reflect.get(target,key,target);
 }});
 const snapshot=await publicDealDetail('ali-2',interleavedFactory);
 assert.equal(changed,true);assert.equal(snapshot.deal.price_cents,1000);assert.equal(snapshot.deal.currency,'BRL');
 const nextSnapshot=await publicDealDetail('ali-2',fx.factory);assert.equal(nextSnapshot.deal.price_cents,2000);assert.equal(nextSnapshot.deal.currency,'USD');
 console.log('PASS capture between read and response cannot mix old price with new currency');
 assert.equal(await publicDealDetail('missing',fx.factory),null);
 await fx.pg.exec("update garimpa.product_curation set status='rejected' where product_id='p_1'");assert.equal(await publicDealDetail('ali-1',fx.factory),null);
 const {rows}=await fx.pg.query(`select has_function_privilege('anon','garimpa.public_deal_detail(text)','EXECUTE') a,
 has_function_privilege('authenticated','garimpa.public_deal_detail(text)','EXECUTE') b,
 has_table_privilege('garimpa_public_runtime','garimpa.price_observation','SELECT') c`);
 assert.deepEqual(rows[0],{a:false,b:false,c:false});
 console.log('PASS history: single, stable, variable, unknown configuration/currency, range, exclusions, eligibility and restricted permissions; all new migrations together');
} finally {await fx.pg.close();}
