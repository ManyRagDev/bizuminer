import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
import {loadMonitoringCandidates,suppressedMonitoringIds} from '../../packages/persistence/src/monitoring-candidates.ts';
import {monitoringQueue} from '../../packages/persistence/src/monitoring-policy.ts';
import {withMonitoringDb} from '../../packages/persistence/src/monitoring-db.ts';

const require=createRequire(import.meta.url);
const {publicProjectionReady,withPublicDb}=require('../../packages/web/lib/public-offer-db.ts');
const {calculateContentDigest}=require('../../packages/web/lib/commerce-contract.ts');
const fx=await nativePostgresFixture();
const migration=await readFile(new URL('../../packages/persistence/supabase/migrations/20261023041600_optimize_public_link_reads.sql',import.meta.url),'utf8');
const evidence={version:2,currency:'BRL',priceType:'exact',variantIdentity:{state:'source_verified',key:'unit',attributes:{}},packageQuantity:1,
 fieldStates:{sellerId:'not_applicable',packageContents:'not_applicable',dimensions:'not_applicable',payment:'not_applicable',coupon:'not_applicable',region:'not_applicable'}};
const policy={windowDays:6,bucketHours:24,minimumPriorCount:3,minimumDistinctDays:3,maximumGapHours:72,minimumCoverageRatio:0.5,maxAgeHours:48,e3Enabled:true};
const queries=[{},...['price','popularity','signal'].map(sort=>({sort})),{category:'tools'},{category:'none'},
 {search:'Produto 1'},{marketplace:'shopee'},{marketplace:'aliexpress'}, {minPriceCents:9100},{maxPriceCents:9050},
 {minRating:4.5},{minDiscount:10},{lowestOnly:true},{hasHistory:true},{freshnessDays:1},{freshnessDays:7},
 {sort:'price',offset:3,limit:2},{limit:24},{offset:1000},{lowestOnly:true,marketplace:'shopee'}];
const core=(page:any)=>({deals:page.deals,total:page.total,selectionVersion:page.selectionVersion,selectionStateKey:page.selectionStateKey});
const normalizeStats=(value:any)=>({...value,categoryStats:[...value.categoryStats].sort((a,b)=>a.category.localeCompare(b.category))});
const publicQuery=(sql:any,query:string,values:any[]=[])=>sql.begin(async(tx:any)=>{await tx`set local role garimpa_public_runtime`;return tx.unsafe(query,values);});
const timings:any={};
async function measure(sql:any,label:string,query:string,values:any[]=[]){
 const samples:number[]=[];
 for(let i=0;i<30;i++) {const start=performance.now();await sql.unsafe(query,values);samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);timings[label]={p50Ms:+samples[14].toFixed(2),p95Ms:+samples[28].toFixed(2)};
}
try {
 const {units}=await replacementRollout();
 for(const unit of units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
 // The recorded baseline reconstructs tables and grants, but omits these
 // legacy indexes. Replay the installed indexes needed for writer races and
 // representative product/history lookups without altering sealed artifacts.
 await fx.admin`create unique index short_link_slug_idx on garimpa.short_link(tenant_id,slug)`;
 await fx.admin`create index price_observation_product_idx on garimpa.price_observation(product_id,observed_at)`;
 await fx.admin`create index price_observation_tenant_idx on garimpa.price_observation(tenant_id,product_id,observed_at desc)`;
 await fx.admin`create index publication_tenant_idx on garimpa.publication(tenant_id,product_id)`;
 await fx.admin.begin(async(tx:any)=>{
  await tx`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status) values
   ('aff_a','a','a','A','active'),('aff_b','b','b','B','active'),('aff_c','c','c','C','suspended')`;
  await tx`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a'),('user_b','b','auth_b')`;
  await tx`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner'),('aff_b','user_b','owner')`;
  await tx`insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado'),('user_b','afiliado')`;
  await tx`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status)
   values('aff_a','mercadolivre','tag_a','tool_a','active'),('aff_b','mercadolivre','tag_b','tool_b','active')`;
  await tx`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at,category,image_url)
   select 'p_'||i,case when i<=60 then 'a' when i<=100 then 'b' else 'c' end,
    case when i%3=0 then 'mercadolivre' when i%3=1 then 'shopee' else 'aliexpress' end,
    i::text,'Produto '||i,'https://produto.mercadolivre.com.br/MLB-'||i,9000+i,
    now()-case when i%17=0 then interval '9 days' else interval '2 hours' end,
    case when i%2=0 then 'tools' else 'home' end,'https://example.test/image.png'
   from generate_series(1,105) i`;
  await tx`insert into garimpa.product_curation(tenant_id,product_id,status)
   select tenant_id,id,case when substring(id from 3)::int%19=0 then 'pending' else 'approved' end from garimpa.product
   on conflict(tenant_id,product_id) do update set status=excluded.status`;
  await tx`insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
   select 'pub_'||id,tenant_id,'aff_'||tenant_id,id,'web','slug_'||id,
    case when substring(id from 3)::int%23=0 then 'expired' else 'active' end,
    case when marketplace='shopee' then 'https://shope.ee/test' else 'https://aliexpress.com/test' end from garimpa.product`;
  await tx`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,rating_star,sales_count,claimed_discount_rate,offer_evidence)
   select 'o_'||p.id||'_'||d,p.tenant_id,p.id,
    case when p.id='p_29' and d=0 then 0 when d=0 then 9000+substring(p.id from 3)::int else 11000 end,
    now()-d*interval '1 day',4.7,100+substring(p.id from 3)::int,0.20,
    case when p.id='p_31' then ${tx.json({...evidence,variantIdentity:{state:'inferred',key:'unit'}})}::jsonb
     when p.id='p_32' and d>0 then ${tx.json({...evidence,currency:'USD'})}::jsonb
     else ${tx.json(evidence)}::jsonb end
   from garimpa.product p cross join generate_series(0,10) d`;
  const [calibration]=await tx`insert into garimpa.price_calibration_run(tenant_id,policy_version,observation_ids,results,source_ref,synthetic,reviewed_by,policy_snapshot,policy_digest)
   values('a','v1','["fixture"]','{"experiment":"EXP-02","reviewed":true,"pass":true}','synthetic-test',false,'user_a',${tx.json(policy)},${calculateContentDigest(policy)}) returning id`;
  await tx`insert into garimpa.price_evidence_policy_version(id,tenant_id,version,config,status,approved_by,approved_at,calibration_run_id)
   values('policy_a','a','v1',${tx.json(policy)},'approved','user_a',now(),${calibration.id})`;
  const snapshots:any={};
  for(const tenant of ['a','b','c','missing']) {
   snapshots[tenant]={pages:await Promise.all(queries.map(async q=>(await tx`select garimpa.public_catalog(${tenant},${tx.json(q)}) value`)[0].value)),
    stats:await Promise.all([1,7,30].map(async days=>(await tx`select garimpa.public_catalog_stats(${tenant},${days}) value`)[0].value))};
  }
  const slugs=['slug_p_1','slug_p_3','slug_p_29','slug_p_31','slug_p_32','slug_p_34','slug_p_61','slug_p_101','missing'];
  const details=await Promise.all(slugs.map(async slug=>(await tx`select garimpa.public_deal_detail(${slug}) value`)[0].value));
  const oldRows=(await tx`select * from garimpa.public_offer_rows(null) order by id`).map((r:any)=>({...r}));
  assert.ok(oldRows.some((r:any)=>r.lowest_verified===true),'fixture must exercise verified price evidence');
  await measure(tx,'beforeDetail','select garimpa.public_deal_detail($1)',['slug_p_3']);
  await measure(tx,'beforeStats',"select garimpa.public_catalog_stats('a',7)");
  await tx.unsafe(migration);
  assert.deepEqual((await tx`select * from garimpa.public_offer_rows(null) order by id`).map((r:any)=>({...r})),oldRows);
  for(const tenant of Object.keys(snapshots)) {
   for(let i=0;i<queries.length;i++) {
    const [after]=await tx`select garimpa.public_catalog(${tenant},${tx.json(queries[i])}) value`;
    assert.deepEqual(core(after.value),core(snapshots[tenant].pages[i]),`${tenant} ${JSON.stringify(queries[i])}`);
    const days=Math.min(7,Math.max(1,(queries[i] as any).freshnessDays??7));
    const [facets]=await tx`select garimpa.public_catalog_stats(${tenant},${days}) value`;
    assert.deepEqual(after.value.categories,facets.value.categories);
    assert.deepEqual(after.value.marketplaceCounts,facets.value.marketplaces);
   }
   for(const [i,days] of [1,7,30].entries()) {
    const [after]=await tx`select garimpa.public_catalog_stats(${tenant},${days}) value`;
    assert.deepEqual(normalizeStats(after.value),normalizeStats(snapshots[tenant].stats[i]));
   }
  }
  for(let i=0;i<slugs.length;i++)assert.deepEqual((await tx`select garimpa.public_deal_detail(${slugs[i]}) value`)[0].value,details[i]);
  await measure(tx,'afterDetail','select garimpa.public_deal_detail($1)',['slug_p_3']);
  await measure(tx,'afterStats',"select garimpa.public_catalog_stats('a',7)");
 });
 console.log('PASS equivalent catalogue filters, ordering, facets, tenants, detail and canonical evidence');
 assert.equal(await publicProjectionReady(fx.factoryA),true);
 await withPublicDb(async(tx:any)=>{
  const rows=await tx`select * from garimpa.public_mint_short_links('a',array['slug_p_1','slug_p_3','slug_p_61','missing'],array['abcd','abce','abcf','abcg'])`;
  assert.deepEqual(rows.map((r:any)=>r.slug).sort(),['slug_p_1','slug_p_3']);
  assert.equal((await tx`select garimpa.public_mint_short_link('slug_p_1','a','abch') value`)[0].value,'abcd');
  assert.equal((await tx`select garimpa.public_short_link('abcd','b') value`)[0].value,null);
  assert.equal((await tx`select garimpa.public_short_link('abcd','a') value`)[0].value,'slug_p_1');
  assert.equal((await tx`select garimpa.public_mint_short_link('slug_p_2','a','abcd') value`)[0].value,null);
  assert.equal((await tx`select garimpa.public_mint_short_link('slug_p_2','a','abcd!') value`)[0].value,null);
  assert.match((await tx`select * from garimpa.public_monetized_target('slug_p_3')`)[0].url,/tag_a/);
  assert.equal((await tx`select garimpa.record_public_click('slug_p_3',null,'test',null,'test') recorded`)[0].recorded,true);
 },fx.factoryA);
 console.log('PASS batch links, existing codes, tenant mismatch and collisions');
 for(const mutation of ["update garimpa.affiliate_account set status='suspended' where tenant_id='a'",
  "update garimpa.publication set status='expired' where slug='slug_p_1'",
  "update garimpa.product_curation set status='rejected' where product_id='p_1'",
  "update garimpa.product set last_seen_at=now()-interval '8 days' where id='p_1'",
  "update garimpa.price_observation set price_cents=0 where id='o_p_1_0'"]) {
  const rollback=new Error('rollback_fixture');
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
   await tx.unsafe(mutation);
   assert.equal((await tx`select garimpa.public_mint_short_link('slug_p_1','a','abch') value`)[0].value,null);
   assert.equal((await tx`select garimpa.public_short_link('abcd','a') value`)[0].value,null);
   assert.equal((await tx`select garimpa.public_deal_detail('slug_p_1') value`)[0].value,null);
   assert.equal((await tx`select count(*)::int n from garimpa.public_monetized_target('slug_p_1')`)[0].n,0);
   assert.equal((await tx`select garimpa.record_public_click('slug_p_1',null,'test',null,'test') recorded`)[0].recorded,false);
   throw rollback;
  }),error=>error===rollback);
 }
 console.log('PASS existing links stop resolving after suspension, expiry, curation removal, stale data or invalid price');
 for(const factory of [fx.factoryA,fx.factoryB])await assert.rejects(
  ()=>withPublicDb((tx:any)=>tx`select * from garimpa.product`,factory),(e:any)=>e.code==='42501');
 const [acl]=await fx.admin`select has_function_privilege('anon','garimpa.public_mint_short_links(text,text[],text[])','execute') anon,
  has_function_privilege('authenticated','garimpa.public_mint_short_links(text,text[],text[])','execute') authenticated,
  has_function_privilege('garimpa_public_runtime','garimpa.public_offer_candidates(text,text)','execute') helper,
  garimpa.commercial_rollout_ready() ready`;
 assert.deepEqual({...acl},{anon:false,authenticated:false,helper:false,ready:true});
 console.log('PASS restricted public runtime and rollout gate preserved');
 const races=await Promise.all([fx.clientA,fx.clientB].map((client,i)=>publicQuery(client,"select garimpa.public_mint_short_link('slug_p_2','a',$1) code",[i?'abcm':'abck'])));
 assert.equal(races[0][0].code,races[1][0].code);
 const batchRaces=await Promise.all([fx.clientA,fx.clientB].map((client,i)=>publicQuery(client,
  "select * from garimpa.public_mint_short_links('a',array['slug_p_4'],array[$1])",[i?'abcp':'abcn'])));
 for(const [i,rows] of batchRaces.entries())if(!rows.length)batchRaces[i]=await publicQuery(fx.clientA,
  "select * from garimpa.public_mint_short_links('a',array['slug_p_4'],array['abcq'])");
 assert.equal(batchRaces[0][0].code,batchRaces[1][0].code);
 console.log('PASS concurrent minting returns one stable code');
 await withMonitoringDb(fx.clientA,'a',async tx=>{
  const all=await loadMonitoringCandidates(tx,'a');
  for(const marketplace of ['shopee','aliexpress'] as const) {
   const filtered=await loadMonitoringCandidates(tx,'a',marketplace);
   assert.deepEqual(filtered.map(x=>x.productId).sort(),all.filter(x=>x.marketplace===marketplace).map(x=>x.productId).sort());
   const now=new Date(),suppressed=await suppressedMonitoringIds(tx,'a',marketplace,filtered,now);
   assert.deepEqual(monitoringQueue(filtered.filter(x=>!suppressed.has(x.productId)),marketplace,20,now),
    monitoringQueue(all.filter(x=>!suppressed.has(x.productId)),marketplace,20,now));
  }
 });
 console.log('PASS marketplace filtering preserves monitoring priority, eligibility and budget');
 console.log(JSON.stringify({target:'disposable-localhost',engine:fx.version,productionWrites:0,timings},null,2));
} finally {await fx.close();}
