import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const {recommendationDesk,refreshRecommendationEditions,readRecommendationEdition,configureRecommendationChannel,confirmRecommendationExposure}=require('../../packages/web/lib/recommendation-db.ts');
const {getEditorialSelectionDesk,saveEditorialAssessment,getPublishedEditorialSelection}=require('../../packages/web/lib/editorial-selection-db.ts');
const {catalogPage}=require('../../packages/web/lib/db.ts');
const {homepageEngagementReport,refreshHomepageEdition}=require('../../packages/web/lib/homepage-db.ts');
const {confirmedOfferDetail}=require('../../packages/web/lib/confirmed-offer-db.ts');
const {confirmOfferOption}=require('../../packages/web/lib/offer-option-db.ts');
const {inAccountScope}=require('../../packages/web/lib/account-scope.ts');
const {PostgresStore}=require('../../packages/persistence/src/pg-store.ts');
const {saveDiscoveryPolicy,discoveryPolicies}=require('../../packages/web/lib/discovery-policy-db.ts');
const {defaultChannelPolicy}=require('../../packages/web/lib/recommendation-policy.ts');
const {loadMonitoringCandidates}=require('../../packages/persistence/src/monitoring-candidates.ts');
const {monitoringDecision}=require('../../packages/persistence/src/monitoring-policy.ts');
const fx=await nativePostgresFixture();
process.env.DATABASE_URL='postgresql://isolated-fixture-unused';
let passed=0;let firstWhatsApp:any;
const scenario=async(name:string,fn:()=>Promise<void>)=>{await fn();passed++;console.log('PASS '+name);};
const account={tenantId:'a',affiliateId:'aff_a',actor:'human',actorAppUserId:'user_a',authenticatedAuthUserId:'auth_a',membershipRole:'owner',requestId:'test'};
const human=<T>(fn:()=>Promise<T>)=>inAccountScope(account,fn);
try{
 const {units}=await replacementRollout();
 for(const unit of units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
 for(const file of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql','20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql','20261101193221_improve_editorial_recommendations.sql'])
  {
   if(file==='20261101193221_improve_editorial_recommendations.sql')await scenario('updated writer remains compatible before the new migration',async()=>{
    await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_legacy','legacy','legacy','Legacy fixture')`;
    const store=new PostgresStore({connectionString:`postgres://garimpa_app@localhost:${fx.clientA.options.port[0]}/postgres`,maxConnections:1});
    try{const run=await store.startCaptureRun({tenantId:'legacy',marketplace:'shopee',startedAt:new Date(),collectorRunId:'legacy',parameters:{}});
      const result=await store.upsertProductWithObservation({tenantId:'legacy',captureRunId:run,marketplace:'shopee',externalId:'legacy',title:'Legacy',productUrl:'https://shopee.com.br/legacy',priceCents:1234,observedAt:new Date()});
      assert.equal(result.isNew,true);assert.equal((await fx.admin`select price_cents from garimpa.price_observation where tenant_id='legacy'`)[0].price_cents,1234);
    }finally{await store.close();}
    await fx.admin`delete from garimpa.price_observation where tenant_id='legacy'`;await fx.admin`delete from garimpa.product_curation where tenant_id='legacy'`;await fx.admin`delete from garimpa.product where tenant_id='legacy'`;await fx.admin`delete from garimpa.capture_run where tenant_id='legacy'`;await fx.admin`delete from garimpa.affiliate_account where tenant_id='legacy'`;
   });
   await fx.admin.begin(async(tx:any)=>tx.unsafe(await readFile(new URL('../../packages/persistence/supabase/migrations/'+file,import.meta.url),'utf8')));
  }
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status) values('aff_a','a','a','A','active'),('aff_b','b','b','B','active')`;
 await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a')`;
 await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner')`;
 await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado')`;
 await fx.admin`insert into garimpa.homepage_renewal(tenant_id,enabled) values('a',true)`;
 await scenario('old renewal opt-in cannot activate the new policy',async()=>{
  assert.equal((await refreshRecommendationEditions('a',fx.factoryA)).configured,false);
  assert.equal((await refreshHomepageEdition('a',fx.factoryA,new Date(),false,false)).blocked,'policy_activation_required');
  assert.equal(await readRecommendationEdition('whatsapp','a',fx.factoryA),null);
  assert.equal((await getPublishedEditorialSelection('whatsapp','a',fx.factoryA)).products.length,0);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_edition`)[0].n,0);
 });
 await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,image_url,last_price_cents,last_seen_at)
  values('p1','a','shopee','101','Organizador resistente','https://shopee.com.br/product/1/101','https://example.test/a.jpg',2500,now()),
  ('p2','a','shopee','102','Luminária para leitura','https://shopee.com.br/product/1/102','https://example.test/b.jpg',3500,now()),
  ('p3','a','shopee','103','Fone de ouvido','https://shopee.com.br/product/1/103','https://example.test/c.jpg',4500,now())`;
 await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status) select tenant_id,id,'approved' from garimpa.product on conflict(tenant_id,product_id) do update set status='approved'`;
 await fx.admin`insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
  select 'pub_'||id,'a','aff_a',id,'web','shp-'||external_id,'active','https://s.shopee.com.br/test' from garimpa.product`;
 const range={version:2,priceType:'range',priceMinCents:2000,priceMaxCents:5000,variantIdentity:{state:'unknown'}};
 await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
  select 'initial_'||id,'a',id,2500,now()-interval '1 hour',${fx.admin.json(range)} from garimpa.product`;
 const base={expectedTenantId:'a',variantKey:'blue',variantLabel:'Azul, uma unidade',priceCents:2500,quantity:1,contents:'Um organizador azul',dimensions:'20 x 10 cm',sellerId:'loja-1',payment:'NA',coupon:'NA',region:'Brasil',shipping:'Calculado no checkout',confirmation:'Conferido o preço em reais e a opção azul na página da loja'};
 await scenario('confirmation is factual, scoped, versioned and does not auto approve',async()=>{
  assert.equal((await confirmOfferOption({...base,productId:'p1',expectedObservationId:'initial_p1'},fx.factoryA)).error,'forbidden');
  assert.equal((await human(()=>confirmOfferOption({...base,productId:'p1',expectedObservationId:'stale'},fx.factoryA))).error,'evidence_changed');
  assert.equal((await human(()=>confirmOfferOption({...base,productId:'p1',expectedObservationId:'initial_p1'},fx.factoryA))).ok,true);
  const [option]=await fx.admin`select * from garimpa.editorial_offer_choice where product_id='p1'`;
  assert.match(option.option_key,/^[a-f0-9]{32}$/);
  const detail=await confirmedOfferDetail('shp-101',option.option_key,fx.factoryA);
  assert.equal(detail.product.priceCents,2500);assert.equal(detail.product.currency,'BRL');assert.equal(detail.priceHistory.length,1);
  assert.match(detail.product.purchaseContents,/1 un\. · Um organizador azul/);assert.ok(!detail.product.offerConditions.includes('NA'));
 });
 for(const id of ['p2','p3'])await human(()=>confirmOfferOption({...base,productId:id,expectedObservationId:'initial_'+id,variantKey:'unit',variantLabel:'Uma unidade'},fx.factoryA));
 async function assess(id:string,level:string){
  const desk=await getEditorialSelectionDesk('a',fx.factoryA),c=desk.candidates.find((c:any)=>c.id===id);
  assert.ok(c?.offerOptionKey,JSON.stringify(c));
  return human(()=>saveEditorialAssessment({productId:id,evidenceFingerprint:c.evidenceFingerprint,expectedAssessmentId:c.assessment?.id ?? null,
   dimensions:Object.fromEntries(['audience','utility','value','confidence','clarity'].map(k=>[k,{level,reason:'Evidência conferida para este público'}])),
   audience:'Público geral de achadinhos',benefit:'Organiza itens de uso cotidiano',purchaseContents:'Uma unidade da opção conferida',
   publicRationale:'Uma opção útil para organizar os itens do dia a dia.',criticalDoubts:[],maxPriceCents:5000},'user_a','a',fx.factoryA));
 }
 assert.equal((await assess('p1','strong')).ok,true);assert.equal((await assess('p2','adequate')).ok,true);assert.equal((await assess('p3','exceptional')).ok,true);
 for(const channel of ['home','whatsapp','stories'])assert.equal((await human(()=>configureRecommendationChannel({expectedTenantId:'a',channel,expectedVersion:null,enabled:true,policy:defaultChannelPolicy(channel),manualOrder:channel==='stories'?['p1']:null,validUntil:null},fx.factoryA))).ok,true);
 await scenario('home is broader, direct channels are stronger, stories have independent order and set',async()=>{
  const dry=await refreshRecommendationEditions('a',fx.factoryA,true);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_edition`)[0].n,0);
  assert.equal(dry.channels.find((c:any)=>c.channel==='whatsapp').count,2);
  const results=await Promise.all([fx.factoryA,fx.factoryB].map(factory=>refreshRecommendationEditions('a',factory)));
  assert.equal(results.filter(r=>r.channels.some((c:any)=>c.changed)).length,1);
  const home=await readRecommendationEdition('home','a',fx.factoryA),wa=await readRecommendationEdition('whatsapp','a',fx.factoryA),stories=await readRecommendationEdition('stories','a',fx.factoryA);
  firstWhatsApp=wa;
  const diagnostic=await recommendationDesk('a',fx.factoryA);
  assert.deepEqual(Object.fromEntries(diagnostic.coverage.map((c:any)=>[c.channel,c.shown])),{home:3,whatsapp:2,stories:1});
  assert.equal(home.products.length,3);assert.deepEqual(wa.products.map((p:any)=>p.id),['p3','p1']);assert.deepEqual(stories.products.map((p:any)=>p.id),['p1']);
  assert.ok(!JSON.stringify(wa).match(/criticalDoubts|evidenceFingerprint|productUrl|dimensions/));
  const publicOption=await confirmedOfferDetail('shp-101',wa.products.find((p:any)=>p.id==='p1').offerOptionKey,fx.factoryA);
  assert.equal(wa.products.find((p:any)=>p.id==='p1').purchaseContents,publicOption.product.purchaseContents);
  assert.equal((await getPublishedEditorialSelection('pauta','a',fx.factoryA)).homepageEditionId,wa.homepageEditionId);
  assert.equal(await readRecommendationEdition('home','b',fx.factoryA),null);
 });
 await scenario('home grid preserves offer identity and scoped engagement still records real denominators',async()=>{
  const home=await readRecommendationEdition('home','a',fx.factoryA);
  const page=await catalogPage({},'a',fx.factoryA,home);
  assert.equal(page.page.deals.length,3);assert.ok(page.page.deals.every((p:any)=>p.offerOptionKey&&p.currency==='BRL'));
  const p=home.products[0],events=[{productId:p.id,surface:'grid',position:0,event:'impression'},{productId:p.id,surface:'grid',position:0,event:'outbound'}];
  await fx.clientA.begin(async(tx:any)=>{await tx`set local role garimpa_public_runtime`;await tx`select garimpa.record_homepage_engagement('a',${home.homepageEditionId},'00000000-0000-4000-8000-000000000001',${tx.json(events)})`;});
  const report=await homepageEngagementReport('a',fx.factoryA);assert.equal(report[0].impressions,1);assert.equal(report[0].outbound,1);
 });
 await scenario('unchanged merit does not force daily rotation or invent a new edition',async()=>{
  const before=await readRecommendationEdition('whatsapp','a',fx.factoryA);
  assert.ok((await refreshRecommendationEditions('a',fx.factoryA)).channels.every((c:any)=>!c.changed));
  assert.equal((await readRecommendationEdition('whatsapp','a',fx.factoryA)).homepageEditionId,before.homepageEditionId);
 });
 await scenario('aggregate API response never refreshes or overwrites the confirmed option',async()=>{
  const c=(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((p:any)=>p.id==='p1');
  const before=await confirmedOfferDetail('shp-101',c.offerOptionKey,fx.factoryA);
  await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('range_again','a','p1',1000,now()+interval '1 second',${fx.admin.json(range)})`;
  const after=await confirmedOfferDetail('shp-101',c.offerOptionKey,fx.factoryA);
  assert.equal(after.product.evidenceObservedAt,before.product.evidenceObservedAt);assert.equal(after.product.priceCents,2500);
  assert.equal((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.find((p:any)=>p.id==='p1').priceCents,2500);
 });
 await scenario('stable observations on distinct days form a truthful comparable series',async()=>{
  const [o]=await fx.admin`select * from garimpa.price_observation where product_id='p1' and option_key<>'listing' order by observed_at desc limit 1`;
  for(const days of [1,2])await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,title_snapshot,product_url_snapshot,image_url_snapshot,offer_evidence)
    values(${`stable_${days}`},'a','p1',2500,now()-(${days}*interval '1 day'),${o.title_snapshot},${o.product_url_snapshot},${o.image_url_snapshot},${fx.admin.json(o.offer_evidence)})`;
  const detail=await confirmedOfferDetail('shp-101',o.option_key,fx.factoryA);
  assert.equal(detail.priceHistory.length,3);assert.ok(detail.priceHistory.every((p:any)=>p.price_cents===2500));
  const desk=await recommendationDesk('a',fx.factoryA);assert.ok(desk.coverage.find((c:any)=>c.channel==='whatsapp').with_series>=1);
 });
 await scenario('a partial exact option cannot claim to be a fully confirmed public offer',async()=>{
  const partial={version:2,priceType:'exact',currency:'BRL',variantKey:'partial',variantLabel:'Opção sem composição conhecida',variantIdentity:{state:'human_verified',key:'partial'}};
  const [row]=await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,title_snapshot,product_url_snapshot,image_url_snapshot,offer_evidence)
    select 'partial_option',tenant_id,id,2500,now(),title,product_url,image_url,${fx.admin.json(partial)} from garimpa.product where id='p1' returning option_key`;
  assert.match(row.option_key,/^[a-f0-9]{32}$/);
  assert.equal(await confirmedOfferDetail('shp-101',row.option_key,fx.factoryA),null);
 });
 await scenario('reconfirmation preserves material review and stores its own dated proof',async()=>{
  const before=(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((c:any)=>c.id==='p1');
  const result=await human(()=>confirmOfferOption({...base,productId:'p1',expectedObservationId:before.latestObservationId,
    confirmation:'Nova conferência simulada da mesma opção e condições, em outro instante'},fx.factoryA));
  assert.equal(result.ok,true,JSON.stringify(result));
  const after=(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((c:any)=>c.id==='p1');
  assert.notEqual(after.evidenceObservationId,before.evidenceObservationId);
  assert.equal(after.offerOptionKey,before.offerOptionKey);assert.equal(after.evidenceFingerprint,before.evidenceFingerprint);
  assert.equal(after.assessment.id,before.assessment.id);
  const [proof]=await fx.admin`select offer_evidence from garimpa.price_observation where id=${after.evidenceObservationId}`;
  assert.match(proof.offer_evidence.verification.note,/Nova conferência/);
  assert.equal(proof.offer_evidence.variantIdentity.sourceRefs.length,1);
  await refreshRecommendationEditions('a',fx.factoryA);
  assert.ok((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.some((p:any)=>p.id==='p1'));
 });
 await scenario('two variants in a capture preserve identity, retries are idempotent',async()=>{
  const [o]=await fx.admin`select * from garimpa.price_observation where product_id='p1' and option_key<>'listing' order by observed_at desc limit 1`;
  await fx.admin`insert into garimpa.capture_run(id,tenant_id,marketplace,collector_run_id,status,started_at) values('same_run','a','shopee','fixture','running',now())`;
  const store=new PostgresStore({connectionString:`postgres://garimpa_app@localhost:${fx.clientA.options.port[0]}/postgres`,maxConnections:1});
  try{for(const variant of ['red','green','red'])await store.upsertProductWithObservation({captureRunId:'same_run',tenantId:'a',marketplace:'shopee',externalId:'101',
    title:'Organizador resistente',productUrl:'https://shopee.com.br/product/1/101',imageUrl:'https://example.test/a.jpg',priceCents:3000,observedAt:new Date(),
    offerEvidence:{...o.offer_evidence,variantIdentity:{...o.offer_evidence.variantIdentity,key:variant},variantKey:variant}});
  }finally{await store.close();}
  assert.equal((await fx.admin`select count(*)::int n from garimpa.price_observation where capture_run_id='same_run'`)[0].n,2);
 });
 await scenario('off shelf, held for formation or price remains monitored; rejection stays rejected',async()=>{
  await fx.admin`update garimpa.product_curation set status='held',reason_code='insufficient_evidence' where product_id='p1'`;
  const candidates=await fx.clientA.begin(async(tx:any)=>{await tx`select set_config('garimpa.tenant_id','a',true),set_config('garimpa.actor_type','worker',true)`;return loadMonitoringCandidates(tx,'a','shopee');});
  const p=candidates.find((p:any)=>p.productId==='p1');
  assert.equal(p.hasEditorialMerit,true);assert.equal(monitoringDecision({...p,inCurrentEdition:false,lastObservedAt:new Date(Date.now()-80*3600000)}).tier,'formation');
  assert.ok((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.every((p:any)=>p.id!=='p1'));
  await refreshRecommendationEditions('a',fx.factoryA);assert.equal((await fx.admin`select status from garimpa.product_curation where product_id='p1'`)[0].status,'held');
  await fx.admin`update garimpa.product_curation set status='approved',reason_code=null where product_id='p1'`;
 });
 await scenario('explicit empty channel never backfills from home and withdrawal is immediate',async()=>{
  const [config]=await fx.admin`select version from garimpa.recommendation_channel where tenant_id='a' and channel='stories'`;
  await human(()=>configureRecommendationChannel({expectedTenantId:'a',channel:'stories',expectedVersion:config.version,enabled:true,policy:defaultChannelPolicy('stories'),manualOrder:[],validUntil:null},fx.factoryA));
  assert.equal((await readRecommendationEdition('stories','a',fx.factoryA)).products.length,0);
  await refreshRecommendationEditions('a',fx.factoryA);assert.equal((await getPublishedEditorialSelection('stories','a',fx.factoryA)).products.length,0);
  await fx.admin`update garimpa.product_curation set status='rejected',reason_code='low_quality' where product_id='p3'`;
  assert.ok((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.every((p:any)=>p.id!=='p3'));
 });
 await scenario('confirmed exposure, not copy or click, governs reuse separately by channel',async()=>{
  await refreshRecommendationEditions('a',fx.factoryA);
  const wa=await readRecommendationEdition('whatsapp','a',fx.factoryA);assert.ok(wa.products.length);
  const p=wa.products[0];assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_exposure`)[0].n,0);
  assert.notEqual(firstWhatsApp.homepageEditionId,wa.homepageEditionId);
  assert.equal((await human(()=>confirmRecommendationExposure('whatsapp',firstWhatsApp.homepageEditionId,p.id,fx.factoryA))).ok,true);
  assert.equal((await human(()=>confirmRecommendationExposure('whatsapp',firstWhatsApp.homepageEditionId,p.id,fx.factoryA))).ok,true);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_exposure`)[0].n,1);
  assert.ok((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.every((x:any)=>x.id!==p.id),'exposure is withdrawn before preparation');
  await refreshRecommendationEditions('a',fx.factoryA);
  assert.ok((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.every((x:any)=>x.id!==p.id));
  assert.ok((await readRecommendationEdition('home','a',fx.factoryA)).products.some((x:any)=>x.id===p.id));
  const current=(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((c:any)=>c.id===p.id);
  assert.equal((await human(()=>confirmOfferOption({...base,productId:p.id,expectedObservationId:current.latestObservationId,priceCents:2300},fx.factoryA))).ok,true);
  await refreshRecommendationEditions('a',fx.factoryA);
  assert.ok((await readRecommendationEdition('whatsapp','a',fx.factoryA)).products.some((x:any)=>x.id===p.id),'independent comparable improvement permits return');
 });
 await scenario('material change withdraws old option and preview inputs even before a worker runs',async()=>{
  const [o]=await fx.admin`select * from garimpa.price_observation where product_id='p1' and option_key=(select option_key from garimpa.editorial_offer_choice where product_id='p1') order by observed_at desc,id desc limit 1`;
  await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,title_snapshot,product_url_snapshot,image_url_snapshot,offer_evidence)
   values('material_change','a','p1',2500,now()+interval '2 seconds',${o.title_snapshot},${o.product_url_snapshot},${o.image_url_snapshot},${fx.admin.json({...o.offer_evidence,dimensions:'50 x 30 cm'})})`;
  assert.equal(await confirmedOfferDetail('shp-101',o.option_key,fx.factoryA),null);
  assert.ok((await readRecommendationEdition('home','a',fx.factoryA)).products.every((p:any)=>p.id!=='p1'));
  assert.ok((await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((p:any)=>p.id==='p1').offerMaterialInvalid);
  await fx.admin`delete from garimpa.price_observation where id='material_change'`;
 });
 await scenario('a failed multi-channel preparation rolls back every channel atomically',async()=>{
  const before=await fx.admin`select channel,id,selection from garimpa.recommendation_edition order by channel`;
  const archived=await fx.admin`select id from garimpa.recommendation_edition_archive order by id`;
  await fx.admin`update garimpa.recommendation_channel set version=version+1 where tenant_id='a'`;
  await fx.admin.unsafe(`create function garimpa.fixture_refuse_channel() returns trigger language plpgsql as $$begin raise exception 'fixture_channel_failure'; end$$;
   create trigger fixture_refuse_channel before update on garimpa.recommendation_edition for each row execute function garimpa.fixture_refuse_channel()`);
  await assert.rejects(refreshRecommendationEditions('a',fx.factoryA),/fixture_channel_failure/);
  assert.deepEqual(await fx.admin`select channel,id,selection from garimpa.recommendation_edition order by channel`,before);
  assert.deepEqual(await fx.admin`select id from garimpa.recommendation_edition_archive order by id`,archived);
  assert.equal((await readRecommendationEdition('home','a',fx.factoryA)).products.length,0,'config changes invalidate failed old snapshot');
  await fx.admin.unsafe('drop trigger fixture_refuse_channel on garimpa.recommendation_edition;drop function garimpa.fixture_refuse_channel()');
  await refreshRecommendationEditions('a',fx.factoryA);
 });
 await scenario('discovery policy is account-scoped, versioned, opt-in and limited to supported sources',async()=>{
  assert.equal((await human(()=>saveDiscoveryPolicy({expectedTenantId:'b',marketplace:'shopee',expectedVersion:null,enabled:true,itemsPerRun:3,keywords:['organização']},fx.factoryA))).error,'forbidden');
  assert.equal((await human(()=>saveDiscoveryPolicy({expectedTenantId:'a',marketplace:'mercadolivre',expectedVersion:null,enabled:true,itemsPerRun:3,keywords:['organização']},fx.factoryA))).error,'invalid_discovery_policy');
  assert.equal((await human(()=>saveDiscoveryPolicy({expectedTenantId:'a',marketplace:'shopee',expectedVersion:null,enabled:true,itemsPerRun:3,keywords:['organização']},fx.factoryA))).ok,true);
  assert.equal((await discoveryPolicies('a',fx.factoryA)).length,1);assert.equal((await discoveryPolicies('b',fx.factoryA)).length,0);
  assert.equal((await human(()=>saveDiscoveryPolicy({expectedTenantId:'a',marketplace:'shopee',expectedVersion:null,enabled:false,itemsPerRun:3,keywords:['organização']},fx.factoryA))).error,'policy_conflict');
 });
 await scenario('expired exact options disappear despite fresh aggregate observations',async()=>{
  const [choice]=await fx.admin`select option_key from garimpa.editorial_offer_choice where product_id='p1'`;
  await fx.admin`update garimpa.price_observation set observed_at=now()-interval '49 hours' where product_id='p1' and option_key=${choice.option_key}`;
  assert.equal(await confirmedOfferDetail('shp-101',choice.option_key,fx.factoryA),null);
  assert.ok((await readRecommendationEdition('home','a',fx.factoryA)).products.every((p:any)=>p.id!=='p1'));
 });
 await scenario('changing an observed shipping condition requires new editorial review',async()=>{
  await fx.admin`update garimpa.price_observation set observed_at=now()-interval '5 minutes' where id='material_change'`;
  const before=(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((c:any)=>c.id==='p1');
  assert.equal((await human(()=>confirmOfferOption({...base,productId:'p1',expectedObservationId:before.latestObservationId,
    shipping:'Frete de R$ 20 para a região conferida'},fx.factoryA))).ok,true);
  const after=(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.find((c:any)=>c.id==='p1');
  assert.notEqual(after.evidenceFingerprint,before.evidenceFingerprint);
  assert.deepEqual(after.offerEvidence.fieldStates,before.offerEvidence.fieldStates);
  assert.ok(after.selectionBlockers.some((reason:string)=>reason.includes('anúncio mudou')),JSON.stringify(after.selectionBlockers));
  assert.equal(after.assessment.id,before.assessment.id);
 });
 await scenario('an explicit scoped review can reopen an off-window product without approving or refreshing its facts',async()=>{
  await fx.admin`update garimpa.product set last_seen_at=now()-interval '8 days' where id='p2'`;
  assert.ok(!(await getEditorialSelectionDesk('a',fx.factoryA)).candidates.some((c:any)=>c.id==='p2'));
  const focused=await getEditorialSelectionDesk('a',fx.factoryA,'p2');
  assert.ok(focused.candidates.some((c:any)=>c.id==='p2'));
  assert.ok(!(await getEditorialSelectionDesk('b',fx.factoryA,'p2')).candidates.some((c:any)=>c.id==='p2'));
  const [row]=await fx.admin`select last_seen_at from garimpa.product where id='p2'`;
  assert.ok(Date.now()-new Date(row.last_seen_at).getTime()>7*86400000);
 });
 await scenario('RLS blocks other accounts and public table access, operator cannot change channel policy',async()=>{
  await fx.clientA.begin(async(tx:any)=>{await tx`select set_config('garimpa.tenant_id','b',true)`;assert.equal((await tx`select * from garimpa.recommendation_edition`).length,0);assert.equal((await tx`select * from garimpa.editorial_offer_choice`).length,0);assert.equal((await tx`select * from garimpa.recommendation_edition_archive`).length,0);});
  for(const role of ['anon','authenticated','garimpa_public_runtime'])assert.equal((await fx.admin`select has_table_privilege(${role},'garimpa.recommendation_channel','select') as allowed`)[0].allowed,false);
  await fx.clientA.begin(async(tx:any)=>{await tx`select set_config('garimpa.tenant_id','a',true),set_config('garimpa.actor_type','human',true),set_config('garimpa.membership_role','operator',true)`;assert.equal((await tx`update garimpa.recommendation_channel set enabled=false returning channel`).length,0);});
  assert.ok((await fx.admin`select enabled from garimpa.recommendation_channel where tenant_id='a'`).every((c:any)=>c.enabled));
 });
 console.log(JSON.stringify({passed,engine:fx.version,remoteWrites:0}));
}finally{await fx.close();}
