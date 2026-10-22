import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
import {runCompatibilityAudit} from '../../packages/persistence/bin/verify-remote-compatibility.ts';
const require=createRequire(import.meta.url);
const w=require('../../packages/web/lib/commercial-workflow.ts');
const f=require('../../packages/web/lib/commercial-financial-db.ts');
const {calculateCommissionSummary}=require('../../packages/web/lib/commercial-financial-contract.ts');
const {publicGo}=require('../../packages/web/lib/public-go.ts');
const {publicLinkPage}=require('../../packages/web/lib/public-link-page.ts');
const {publicDealDetail,publicCampaignLink}=require('../../packages/web/lib/public-offer-db.ts');
const {campaignExitPath}=require('../../packages/web/lib/campaign-exit.ts');
const {pg,applied,factory,adminFactory}=await commercialFixture();
let passed=0;
async function check(label:string,run:()=>Promise<void>){await run();passed++;console.log(`PASS ${label}`);}
const ctx=(t:string)=>({tenantId:t,affiliateId:`aff_${t}`,actor:'human',actorAppUserId:`user_${t}`,authenticatedAuthUserId:`auth_${t}`,membershipRole:'owner',requestId:`request_${t}`});
const qualified={version:2,currency:'BRL',priceType:'exact',variantIdentity:{state:'source_verified',key:'unit',attributes:{}},packageQuantity:1,
 fieldStates:{sellerId:'not_applicable',packageContents:'not_applicable',dimensions:'not_applicable',payment:'not_applicable',coupon:'not_applicable',region:'not_applicable'}};
await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','alpha','Alpha'),('aff_b','b','beta','Beta'),('aff_local','local','bizuminer','Casa');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a'),('user_b','b','auth_b'),('user_local','local','auth_local');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner'),('aff_b','user_b','owner'),('aff_local','user_local','owner');
 insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado'),('user_b','afiliado'),('user_local','afiliado');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('product_a','a','mercadolivre','111','Produto A','https://produto.mercadolivre.com.br/MLB-111/item?variant=1',10000),('product_b','b','shopee','222','Produto B','https://shopee.com.br/222',20000);
 insert into garimpa.product_curation(tenant_id,product_id,status) values('a','product_a','approved'),('b','product_b','approved');
 insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values('web_a','a','aff_a','product_a','web','alpha--ml-111','active',null),('web_b','b','aff_b','product_b','web','beta--shp-222','active','https://s.shopee.com.br/fixture-b');
 insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status) values('aff_a','mercadolivre','tag_alpha','tool_alpha','active');
 insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values
  ('local','aff_local','enterprise-internal','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":1000,"maxDailyKits":10000,"allowedMarketplaces":["mercadolivre","shopee"]}'::jsonb,'terms_internal_v1'),
  ('a','aff_a','pilot-v1','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":5,"maxDailyKits":10,"allowedMarketplaces":["mercadolivre"]}'::jsonb,'terms_pilot_v1'),
  ('b','aff_b','pilot-v1','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":5,"maxDailyKits":10,"allowedMarketplaces":["shopee"]}'::jsonb,'terms_pilot_v1');`);
await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values('obs_a','a','product_a',10000,$1),('obs_b','b','product_b',20000,$1)`,[JSON.stringify(qualified)]);
try {
 await check('ordered migrations apply to the observed baseline',async()=>assert.equal(applied.length,6));
 await check('RLS denies rows without context and no permissive baseline policy survives',async()=>{
  assert.equal((await factory()`select * from garimpa.product`).length,0);
  const r=await pg.query(`select tablename,policyname from pg_policies where schemaname='garimpa' and (qual='true' or with_check='true') and ('garimpa_app'=any(roles) or 'public'=any(roles))`);assert.equal(r.rows.length,0,JSON.stringify(r.rows));
 });
 await check('forged context fails actual membership resolution',async()=>{await assert.rejects(()=>w.getCommercialDesk({...ctx('a'),tenantId:'b'},factory),/forbidden/);});
 const input={name:'Campanha A',objective:'Divulgação manual',audience:'Público A',requestId:'campaign_a'};
 const campaign=await w.createCampaignForAccount(ctx('a'),input,factory);
 await check('creation is idempotent and a changed replay conflicts',async()=>{
  assert.deepEqual(await w.createCampaignForAccount(ctx('a'),input,factory),campaign);
  await assert.rejects(()=>w.createCampaignForAccount(ctx('a'),{...input,name:'Alterada'},factory),/idempotency_conflict/);
 });
 await check('another account cannot read or attach the campaign',async()=>{
  assert.equal((await w.getCommercialDesk(ctx('b'),factory)).campaigns.length,0);
  await assert.rejects(()=>w.createKitForAccount(ctx('b'),{campaignId:campaign.campaignId,productId:'product_b',channel:'telegram_channel',reason:'Motivo B',requestId:'wrong'},factory),/campaign_policy_required/);
 });
 const kit=await w.createKitForAccount(ctx('a'),{campaignId:campaign.campaignId,productId:'product_a',channel:'whatsapp_channel',reason:'Revisão humana da oferta',requestId:'kit_a'},factory);
 await check('draft uses server facts and has no phantom approval',async()=>{
  const desk=await w.getCommercialDesk(ctx('a'),factory);assert.equal(desk.publications[0].snapshot.priceCents,10000);assert.equal(desk.publications[0].status,'planned');
  assert.equal((await pg.query(`select count(*)::int as n from garimpa.kit_approval`)).rows[0].n,0);
 });
 const validated=await w.validateKitForAccount(ctx('a'),{kitId:kit.kitId,expectedVersion:kit.kitVersion,requestId:'validate_a'},factory);
 await check('validation evaluates persisted facts/evidence/link',async()=>assert.equal(validated.valid,true,validated.blockers.join(',')));
 const approved=await w.approveKitForAccount(ctx('a'),{kitId:kit.kitId,expectedVersion:validated.kitVersion,requestId:'approve_a'},factory);
 let pub=(await w.getCommercialDesk(ctx('a'),factory)).publications[0];
 const prepared=await w.preparePublicationExport(ctx('a'),{publicationId:pub.id,expectedVersion:pub.version},factory);
 await check('export preparation leaves publication ready',async()=>{assert.ok(prepared.text.includes(`/p/${kit.code}`));assert.equal(pub.status,'ready');});
 await w.markPublicationExported(ctx('a'),{publicationId:pub.id,expectedVersion:pub.version,requestId:'export_a'},factory);
 pub=(await w.getCommercialDesk(ctx('a'),factory)).publications[0];
 await check('successful export is not a posting',async()=>assert.equal(pub.status,'exported'));
 await w.confirmPublication(ctx('a'),{publicationId:pub.id,expectedVersion:pub.version,requestId:'confirm_a'},factory);
 await check('explicit confirmation persists one manual posting',async()=>{const r=await pg.query(`select status,confirmation_source from garimpa.campaign_publication where id=$1`,[pub.id]);assert.equal(r.rows[0].status,'published_confirmed');assert.equal(r.rows[0].confirmation_source,'manual');});
 await check('public detail exposes eligible offer facts, no credentials',async()=>{
  const d=await publicDealDetail('alpha--ml-111',factory);assert.equal(d.deal.price_cents,10000);assert.ok(!JSON.stringify(d).includes('tag_alpha'));
  await pg.exec(`update garimpa.product_curation set status='held' where product_id='product_b'`);assert.equal(await publicDealDetail('beta--shp-222',factory),null);
  await pg.exec(`update garimpa.product_curation set status='approved' where product_id='product_b'`);
 });
 await check('code resolves publication slug and rejects another product',async()=>{
  assert.equal((await publicCampaignLink(kit.code,'alpha--ml-111',factory)).slug,'alpha--ml-111');assert.equal(await publicCampaignLink(kit.code,'beta--shp-222',factory),null);
 });
 await check('short campaign HTTP handler keeps identity through exit and attributed SQL click',async()=>{
  const page=await publicLinkPage(kit.code,factory);assert.equal(page.status,302);
  const pageUrl=new URL(page.headers.get('location'),'https://fixture.test');assert.equal(pageUrl.pathname,'/bizu/alpha--ml-111');assert.equal(pageUrl.searchParams.get('c'),kit.code);
  const response=await publicGo(new Request(`https://fixture.test${campaignExitPath('alpha--ml-111',kit.code)}`,{headers:{'user-agent':'human-browser'}}),'alpha--ml-111',kit.code,factory);
  assert.equal(response.status,302);assert.ok(response.headers.get('location').includes('tag_alpha'));
  const r=await pg.query(`select campaign_publication_id,tenant_id from garimpa.click_event`);assert.equal(r.rows.length,1);assert.equal(r.rows[0].campaign_publication_id,kit.publicationId);assert.equal(r.rows[0].tenant_id,'a');
 });
 await check('preview skips telemetry and an invalid token cannot switch owner',async()=>{
  assert.equal((await publicGo(new Request('https://fixture.test/go/alpha--ml-111',{headers:{'user-agent':'facebookexternalhit'}}),'alpha--ml-111',kit.code,factory)).status,302);
  assert.equal((await publicGo(new Request('https://fixture.test/go/beta--shp-222'),'beta--shp-222',kit.code,factory)).status,404);
  assert.equal((await pg.query(`select count(*)::int as n from garimpa.click_event`)).rows[0].n,1);
 });
 await check('legacy exit stays monetized without attribution',async()=>{
  const r=await publicGo(new Request('https://fixture.test/go/beta--shp-222'),'beta--shp-222',null,factory);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://s.shopee.com.br/fixture-b');
  assert.equal((await pg.query(`select campaign_link_id from garimpa.click_event where tenant_id='b'`)).rows[0].campaign_link_id,null);
 });
 const saleInput={marketplace:'mercadolivre',occurredAt:new Date().toISOString(),currency:'BRL',orderValueCents:10000,requestId:'sale_a'};
 const sale=await f.recordManualConversion(ctx('a'),saleInput,factory);
 await check('positive sale persists event/unknown attribution and rejects conflicting replay',async()=>{
  assert.ok(sale.conversionId);assert.deepEqual(await f.recordManualConversion(ctx('a'),saleInput,factory),{...sale,alreadyExisted:true});
  await assert.rejects(()=>f.recordManualConversion(ctx('a'),{...saleInput,orderValueCents:20000},factory),/idempotency_conflict/);
  assert.equal((await f.getCommercialResults(ctx('b'),factory)).conversions.length,0);
  assert.equal((await pg.query(`select method from garimpa.conversion_attribution where conversion_id=$1`,[sale.conversionId])).rows[0].method,'unknown');
 });
 await check('unpriced human time persists without a fabricated monetary zero',async()=>{
  const input={kind:'human_time',durationSeconds:900,source:'manual measurement',periodStart:new Date().toISOString(),periodEnd:new Date().toISOString(),requestId:'cost_a'};
  const cost=await f.recordOperationalCost(ctx('a'),input,factory);assert.ok(cost.costId);
  assert.equal((await f.getCommercialResults(ctx('a'),factory)).costs[0].amount_cents,null);
  assert.equal((await f.getCommercialResults(ctx('b'),factory)).costs.length,0);
  assert.equal((await f.recordOperationalCost(ctx('a'),input,factory)).alreadyExisted,true);
 });
 let parent:string|undefined;
 for(const state of ['pending','confirmed','received','reversed']){
  parent=(await f.recordCommissionEntry(ctx('a'),{conversionId:sale.conversionId,sourceKey:`commission_${state}`,amountCents:state==='reversed'?100:1000,currency:'BRL',state,occurredAt:new Date().toISOString(),sourceRef:'synthetic fixture report',predecessorId:parent},factory)).entryId;
 }
 await check('ledger projects states once and refunds reduce cash',async()=>{
  const entries=(await f.getCommercialResults(ctx('a'),factory)).commissions.map((e:any)=>({id:e.id,tenantId:'a',conversionId:e.conversion_id,sourceKey:e.source_key,amountCents:Number(e.amount_cents),currency:e.currency,state:e.state,occurredAt:e.occurred_at,sourceRef:e.source_ref,predecessorId:e.predecessor_id,createdAt:e.created_at}));
  const s=calculateCommissionSummary(entries,'BRL');assert.equal(s.pendingCents,0);assert.equal(s.confirmedCents,0);assert.equal(s.receivedCashCents,900);assert.equal(s.reversedCents,100);
 });
 await check('new revision preserves published history and does not reuse approval',async()=>{
  const revised=await w.reviseKitForAccount(ctx('a'),{kitId:kit.kitId,expectedVersion:approved.kitVersion,copy:'Texto revisado.',requestId:'revise_a'},factory);
  assert.equal((await pg.query(`select status from garimpa.campaign_publication where id=$1`,[kit.publicationId])).rows[0].status,'published_confirmed');
  await assert.rejects(()=>w.preparePublicationExport(ctx('a'),{publicationId:revised.publicationId,expectedVersion:1},factory),/publication_not_ready/);
 });
 await check('canonical TS and SQL agree on E3 approval, coverage, gaps and unknown conditions',async()=>{
  const {calculatePriceEvidence,DEFAULT_PRICE_EVIDENCE_POLICY,buildConfigurationKey}=require('../../packages/web/lib/price-evidence.ts');
  const now=new Date();const policy={...DEFAULT_PRICE_EVIDENCE_POLICY,windowDays:10,e3Enabled:true,minimumCoverageRatio:0.7,maximumGapHours:48};
  await pg.query(`insert into garimpa.price_evidence_policy_version(id,tenant_id,version,config,status,approved_by,approved_at) values('test_policy','a','fixture-approved',$1,'approved','user_a',now())`,[JSON.stringify(policy)]);
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('e3_current','a','product_a',9000,$1,$2)`,[now.toISOString(),JSON.stringify(qualified)]);
  for(let day=1;day<=10;day++) await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values($1,'a','product_a',12000,$2,$3)`,[`prior_${day}`,new Date(now.getTime()-day*86400000).toISOString(),JSON.stringify(qualified)]);
  async function compare(expected:boolean){
   const rows=(await pg.query(`select id,price_cents,observed_at,offer_evidence from garimpa.price_observation where product_id='product_a'`)).rows;
   const ts=calculatePriceEvidence({tenantId:'a',productId:'product_a',currentObservationId:'e3_current',observations:rows.map((o:any)=>({id:o.id,priceCents:o.price_cents,observedAt:o.observed_at,offerEvidence:o.offer_evidence})),policy,policyStatus:'approved',now});
   const sql=(await pg.query(`select lowest_verified from garimpa.curation_queue_facts where id='product_a'`)).rows[0];assert.equal(sql.lowest_verified,expected);assert.equal(ts.state==='E3',expected);
  }
  assert.equal((await pg.query(`select lowest_verified from garimpa.curation_queue_facts where id='product_a'`)).rows[0].lowest_verified,false,'A legacy approval alone must not enable E3');
  const run=(await pg.query(`insert into garimpa.price_calibration_run(tenant_id,policy_version,observation_ids,results,policy_snapshot,policy_digest,source_ref,synthetic,reviewed_by) values('a','fixture-approved','["e3_current"]','{"experiment":"EXP-02","reviewed":true,"pass":true}',$1,$2,'synthetic-test-authorized-calibration-fixture',false,'user_a') returning id`,[JSON.stringify(policy),require('../../packages/web/lib/commerce-contract.ts').calculateContentDigest(policy)])).rows[0];
  // Approved policy immutability requires its calibration reference at creation; recreate only this isolated fixture row.
  await pg.exec(`delete from garimpa.price_evidence_policy_version where id='test_policy'`);
  await pg.query(`insert into garimpa.price_evidence_policy_version(id,tenant_id,version,config,status,approved_by,approved_at,calibration_run_id) values('test_policy','a','fixture-approved',$1,'approved','user_a',now(),$2)`,[JSON.stringify(policy),run.id]);
  await compare(true);
  await assert.rejects(()=>pg.exec(`update garimpa.price_evidence_policy_version set config='{}' where id='test_policy'`),/approved_policy_immutable/);
  await pg.exec(`delete from garimpa.price_observation where id in ('prior_5','prior_6','prior_7','prior_8','prior_9')`);await compare(false);
  const unknown={...qualified,fieldStates:{...qualified.fieldStates,sellerId:'absent'}};
  assert.equal(buildConfigurationKey(unknown),null);
  assert.equal((await pg.query(`select garimpa.offer_configuration_key($1) as key`,[JSON.stringify(unknown)])).rows[0].key,null);
  const rows=(await pg.query(`select id,price_cents,observed_at,offer_evidence from garimpa.price_observation where product_id='product_a'`)).rows;
  const input={tenantId:'a',productId:'product_a',currentObservationId:'e3_current',observations:rows.map((o:any)=>({id:o.id,priceCents:o.price_cents,observedAt:o.observed_at,offerEvidence:o.offer_evidence})),policy,now};
  assert.notEqual(calculatePriceEvidence({...input,policyStatus:'draft'}).state,'E3');
 });
 await check('legacy short links resolve under the restricted public role and keep their code',async()=>{
  const {withPublicDb,publicShortLink,publicCatalogStats}=require('../../packages/web/lib/public-offer-db.ts');
  const minted=await withPublicDb(async(tx:any)=>(await tx`select garimpa.public_mint_short_link('alpha--ml-111','a','abcd') code`)[0].code,factory);
  assert.equal((await publicLinkPage('abcd',factory)).headers.get('location'),'/bizu/alpha--ml-111');
  assert.equal(minted,'abcd');assert.equal(await publicShortLink('abcd','a',factory),'alpha--ml-111');assert.equal(await publicShortLink('abcd','b',factory),null);
  assert.equal((await publicCatalogStats('a',7,factory)).marketplaces.mercadolivre,1);
 });
 await check('private SQL denies ownership mutations and immutable ledger edits',async()=>{
  const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
  await assert.rejects(()=>withAccountDb(ctx('a'),(tx:any)=>tx`update garimpa.product set tenant_id='b' where id='product_a'`,factory),/tenant_immutable/);
  await assert.rejects(()=>withAccountDb(ctx('a'),(tx:any)=>tx`update garimpa.commission_entry set amount_cents=999 where tenant_id='a'`,factory),/permission denied/);
  const other=await f.recordManualConversion(ctx('b'),{...saleInput,requestId:'sale_b'},factory);
  await assert.rejects(()=>withAccountDb(ctx('a'),(tx:any)=>tx`insert into garimpa.conversion_attribution(conversion_id,tenant_id,method,confidence) values(${other.conversionId},'a','unknown','unknown')`,factory),(error:any)=>error.code==='23503');
 });
 await check('one person can switch authorized accounts without gaining owner privileges',async()=>{
  const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
  await pg.exec(`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_b','user_a','operator')`);
  const operator={...ctx('a'),tenantId:'b',affiliateId:'aff_b',membershipRole:'operator'};
  assert.equal((await w.getCommercialDesk(operator,factory)).products[0].id,'product_b');
  await assert.rejects(()=>w.createCampaignForAccount(operator,{name:'No',objective:'No',audience:'No',requestId:'operator_campaign'},factory),/owner_required/);
  const secrets=require('../../packages/web/lib/affiliate-secret.ts');
  assert.equal(await withAccountDb(operator,(tx:any)=>secrets.resolveAffiliateSecret('a','shopee','fixture',tx),factory),null);
  assert.equal((await w.getCommercialDesk(ctx('a'),factory)).products[0].id,'product_a');
 });
 await check('link code collision retries without aborting the transaction',async()=>{
  const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');const {reserveCampaignLink}=require('../../packages/web/lib/commerce-db.ts');
  await withAccountDb(ctx('a'),async(tx:any)=>{
   const [copy]=await tx`insert into garimpa.campaign_publication(tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,created_by)
    select tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,created_by from garimpa.campaign_publication where id=${kit.publicationId} returning id`;
   let calls=0;
   const link=await reserveCampaignLink(tx,{tenantId:'a',publicationId:copy.id,webPublicationId:'web_a'},()=>calls++===0?kit.code:'ZZZZZZZZZZZZ');
   assert.equal(link.code,'ZZZZZZZZZZZZ');assert.equal(calls,2);
   assert.equal((await tx`select count(*)::int n from garimpa.campaign_link where code='ZZZZZZZZZZZZ'`)[0].n,1);
  },factory);
 });
 await check('ciphertext, rotation and revocation run under account scope',async()=>{
  const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');const secrets=require('../../packages/web/lib/affiliate-secret.ts');
  const old=process.env.AFFILIATE_SECRETS_MASTER_KEY;process.env.AFFILIATE_SECRETS_MASTER_KEY='11'.repeat(32);
  try {
   await withAccountDb(ctx('a'),(tx:any)=>secrets.storeAffiliateSecret({tenantId:'a',marketplace:'shopee',secretId:'fixture',secretValue:'synthetic-a'},tx),factory);
   assert.equal(await withAccountDb(ctx('a'),(tx:any)=>secrets.resolveAffiliateSecret('a','shopee','fixture',tx),factory),'synthetic-a');
   assert.equal(await withAccountDb(ctx('b'),(tx:any)=>secrets.resolveAffiliateSecret('a','shopee','fixture',tx),factory),null);
   const raw=(await pg.query(`select ciphertext from garimpa.affiliate_secret`)).rows[0].ciphertext;assert.ok(!raw.includes('synthetic-a'));
   await withAccountDb(ctx('a'),(tx:any)=>secrets.storeAffiliateSecret({tenantId:'a',marketplace:'shopee',secretId:'fixture',secretValue:'synthetic-rotated'},tx),factory);
   assert.equal(await withAccountDb(ctx('a'),(tx:any)=>secrets.resolveAffiliateSecret('a','shopee','fixture',tx),factory),'synthetic-rotated');
   await withAccountDb(ctx('a'),(tx:any)=>secrets.revokeAffiliateSecret('a','shopee','fixture',tx),factory);
   assert.equal(await withAccountDb(ctx('a'),(tx:any)=>secrets.resolveAffiliateSecret('a','shopee','fixture',tx),factory),null);
  } finally {if(old===undefined) delete process.env.AFFILIATE_SECRETS_MASTER_KEY;else process.env.AFFILIATE_SECRETS_MASTER_KEY=old;}
 });
 await check('audit fails without target and checks the isolated schema as runtime role',async()=>{
  assert.equal((await runCompatibilityAudit()).passed,false);
  const report=await runCompatibilityAudit('postgresql://localhost/fixture',adminFactory);assert.equal(report.passed,true,JSON.stringify(report.checks));
 });
 await check('transaction rollback leaves no partial kit and tenant scope is cleared',async()=>{
  const before=(await pg.query(`select count(*)::int n from garimpa.commercial_kit`)).rows[0].n;
  await assert.rejects(()=>w.createKitForAccount(ctx('a'),{campaignId:campaign.campaignId,productId:'product_a',channel:'whatsapp_channel',reason:'Motivo',copy:' ',requestId:'rollback'},factory),/invalid_input/);
  assert.equal((await pg.query(`select count(*)::int n from garimpa.commercial_kit`)).rows[0].n,before);
  assert.equal((await factory()`select * from garimpa.campaign`).length,0);
 });
 await check('price change invalidates approval before export and persists the invalidation',async()=>{
  const draft=await w.createKitForAccount(ctx('a'),{campaignId:campaign.campaignId,productId:'product_a',channel:'telegram_channel',reason:'Motivo',requestId:'stale'},factory);
  const v=await w.validateKitForAccount(ctx('a'),{kitId:draft.kitId,expectedVersion:draft.kitVersion,requestId:'stale_v'},factory);
  await w.approveKitForAccount(ctx('a'),{kitId:draft.kitId,expectedVersion:v.kitVersion,requestId:'stale_approval'},factory);
  const pub=(await w.getCommercialDesk(ctx('a'),factory)).publications.find((p:any)=>p.id===draft.publicationId);
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('new_a','a','product_a',11000,clock_timestamp(),$1)`,[JSON.stringify(qualified)]);
  const r=await w.markPublicationExported(ctx('a'),{publicationId:pub.id,expectedVersion:pub.version,requestId:'stale_export'},factory);assert.equal(r.exported,false);
  assert.equal((await pg.query(`select status from garimpa.commercial_kit where id=$1`,[draft.kitId])).rows[0].status,'invalidated');
 });
 await check('suspension denies private access and public redirection',async()=>{
  await pg.exec(`update garimpa.affiliate_account set status='suspended' where tenant_id='b'`);
  await assert.rejects(()=>w.getCommercialDesk(ctx('b'),factory),/forbidden/);
  assert.equal((await publicGo(new Request('https://fixture.test/go/beta--shp-222'),'beta--shp-222',null,factory)).status,404);
  await pg.exec(`update garimpa.affiliate_account set status='active' where tenant_id='b'`);
 });
 await check('revoked membership cannot execute the next command',async()=>{
  await pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='user_a'`);await assert.rejects(()=>w.getCommercialDesk(ctx('a'),factory),/forbidden/);
 });
 await check('audit fails for a genuinely missing required object',async()=>{
  await pg.exec(`drop table garimpa.dispatch_job cascade`);
  const report=await runCompatibilityAudit('postgresql://localhost/fixture',adminFactory);assert.equal(report.passed,false);
  assert.equal(report.checks.find(c=>c.name==='required_tables')?.status,'FAIL');
 });
 console.log(`${passed} commercial SQL/handler scenarios passed. PostgreSQL WASM: no independent sessions/pooler, Supabase Auth or Storage claim.`);
}finally{await pg.close();}
