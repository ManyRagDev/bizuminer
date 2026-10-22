/** Diagnostic counterexamples only. Executes local PostgreSQL WASM; no remote DB. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from '../../../tools/editorial-tests/commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {upsertMarketplaceConfig}=require('../../../packages/web/lib/affiliate-db.ts');
const {getEditorialSelectionDesk}=require('../../../packages/web/lib/editorial-selection-db.ts');
const {CaptureBatchStore}=require('../../../packages/web/lib/capture-batch-db.ts');
const {curationSummary}=require('../../../packages/web/lib/curation-db.ts');
const {withAccountDb}=require('../../../packages/web/lib/tenant-db.ts');
const {parseCanonicalCommissionCsv,calculateCanonicalReportDigest}=require('../../../packages/web/lib/commission-import-contract.ts');
const {validatePreDispatch}=require('../../../packages/web/lib/dispatch-contract.ts');
const {validateAccountInvitation,validateEntitlementQuota}=require('../../../packages/web/lib/saas-onboarding-contract.ts');
const {pg,factory,applied}=await commercialFixture();
const findings:any[]=[];
const context={tenantId:'a',affiliateId:'aff_a',actor:'human',actorAppUserId:'user_a',authenticatedAuthUserId:'auth_a',membershipRole:'owner',requestId:'diagnostic'};
const previousUrl=process.env.DATABASE_URL;
process.env.DATABASE_URL='postgresql://localhost/diagnostic_never_connected';
try {
 // Baseline writer constraint, declared in the existing affiliates migration.
 await pg.exec('alter table garimpa.affiliate_marketplace_config add unique(affiliate_id,marketplace)');
 // The baseline grants SELECT on this pre-existing view; fixture creates it after table grants.
 await pg.exec('grant select on garimpa.curation_queue_facts to garimpa_app');
 await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','alpha','Diagnostic');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner');
 insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('prod_a','a','mercadolivre','111','Diagnostic','https://mercadolivre.com.br/111',10000);
 insert into garimpa.product_curation(tenant_id,product_id,status) values('a','prod_a','approved');
 insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values('obs_a','a','prod_a',10000,'{}');
 insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('dev_a','aff_a','user_a','Diagnostic','synthetic_hash');
 insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,started_at) values('00000000-0000-4000-8000-000000000014','a',array['mercadolivre'],1,now()-interval '3 hours');`);
 await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_local','local','house','House fixture');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('house_private','local','mercadolivre','999','Private house fixture','https://mercadolivre.com.br/999',10000);
 insert into garimpa.product_curation(tenant_id,product_id,status) values('local','house_private','pending');`);
 const identity=await factory()`select * from garimpa.resolve_actor_identity('auth_a')`;assert.ok(identity[0].roles.includes('afiliado'));
 await assert.rejects(()=>withAccountDb({...context,tenantId:'local',affiliateId:'aff_local'},async()=>1,factory),/forbidden/);
 const houseSummary=await curationSummary('local',factory);assert.equal(houseSummary.awaiting,1);
 findings.push({probe:'legacy_house_membership_boundary',actorOnlyMemberOf:'a',correctAccountContext:'house access forbidden',legacyServiceHouseAwaiting:houseSummary.awaiting,note:'Service SQL reproduced; HTTP/layout reachability established statically, no browser session tested'});
 let denied:any=null;
 try {await upsertMarketplaceConfig({appUserId:'user_a',affiliateId:'aff_a',marketplace:'mercadolivre',trackingId:'synthetic',toolId:'synthetic'},'a',factory);}
 catch(error:any){denied={code:error.code,message:error.message};}
 assert.equal(denied?.code,'42501');
 const positive=await withAccountDb(context,async(tx:any)=>tx`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status) values('aff_a','mercadolivre','synthetic','synthetic','active') returning marketplace`,factory);
 assert.equal(positive.length,1);
 findings.push({probe:'legitimate_owner_config',observed:'public service rejected legitimate owner; same insert succeeds with authorized account context',sqlCode:denied.code});
 const desk=await getEditorialSelectionDesk('a',factory);
 assert.equal(desk.schemaReady,true);assert.equal(desk.candidates.length,0);
 const visible=await withAccountDb(context,async(tx:any)=>tx`select id from garimpa.curation_queue_facts where id='prod_a'`,factory);assert.equal(visible.length,1);
 findings.push({probe:'editorial_desk',observedCandidates:desk.candidates.length,authorizedFactRows:visible.length});
 const expired=await new CaptureBatchStore(factory).expire('a');assert.equal(expired.length,0);
 const overdue=await withAccountDb(context,async(tx:any)=>tx`select id from garimpa.capture_batch where tenant_id='a' and status='running' and started_at<now()-interval '2 hours'`,factory);assert.equal(overdue.length,1);
 findings.push({probe:'capture_batch_expire',expiredByService:expired.length,authorizedOverdueRows:overdue.length});
 const before=await factory()`select * from garimpa.authenticate_extension_device('synthetic_hash')`;assert.equal(before[0].role_active,true);
 await pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where affiliate_id='aff_a' and app_user_id='user_a'`);
 const after=await factory()`select * from garimpa.authenticate_extension_device('synthetic_hash')`;assert.equal(after[0].role_active,true);
 await assert.rejects(()=>withAccountDb(context,async()=>1,factory),/forbidden/);
 findings.push({probe:'extension_bootstrap_revoked_membership',roleActiveAfterRevocation:after[0].role_active,accountCommand:'correctly denied'});
 const csv=parseCanonicalCommissionCsv('ord-a,,2026-10-14T10:00:00Z,100x,12abc,BRL,shopee,,nonsense,nonsense');
 assert.equal(csv.validRowsCount,1);assert.equal(csv.validRows[0].commissionCents,12);assert.equal(csv.validRows[0].status,'nonsense');
 const missing=parseCanonicalCommissionCsv('ord-b,,2026-10-14T10:00:00Z,,25');assert.equal(missing.validRowsCount,1);assert.equal(missing.validRows[0].currency,'BRL');assert.equal(missing.validRows[0].commissionState,'confirmed');
 const negative=parseCanonicalCommissionCsv('ord-c,,2026-10-14T10:00:00Z,100,-5,BRL,shopee,,confirmed,confirmed');assert.equal(negative.validRowsCount,1);
 const first={...csv.validRows[0],externalOrderId:'a:b',externalItemId:'c'};
 const second={...first,externalOrderId:'a',externalItemId:'b:c'};
 assert.equal(calculateCanonicalReportDigest([first]),calculateCanonicalReportDigest([second]));
 findings.push({probe:'canonical_csv_strictness',malformedAccepted:csv.validRows[0],missingFieldsDefaulted:missing.validRows[0],negativeCommissionAccepted:negative.validRows[0].commissionCents,distinctOrderIdsShareDigest:true});
 const guard=validatePreDispatch({accountStatus:'active',destinationStatus:'active',killSwitchActive:false,kitStatus:'approved',kitRevisionId:'r',targetKitRevisionId:'r',priceObservedCents:100,snapshotPriceCents:100,validUntil:'invalid',linkMonetizationStatus:'valid'});assert.equal(guard.canDispatch,true);
 const invite=validateAccountInvitation({requestingTenantId:'a',invitation:{id:'i',tenantId:'a',invitedEmail:'fixture@example.test',role:'operator',expiresAt:'invalid',usedAt:null}});assert.equal(invite.valid,true);
 const quota=validateEntitlementQuota({entitlement:{id:'e',tenantId:'a',affiliateId:'aff_a',planVersion:'synthetic',status:'active',startsAt:'2020-01-01T00:00:00Z',endsAt:'2020-01-02T00:00:00Z',limits:{maxActiveCampaigns:1},termsRef:'fixture'},operation:'create_campaign',currentActiveCampaigns:0});assert.equal(quota.allowed,true);
 findings.push({probe:'validity_guards',invalidDispatchTtl:guard,invalidInvitationExpiry:invite,expiredEntitlement:quota});
 console.log(JSON.stringify({type:'confirmed_counterexamples_not_acceptance_tests',isolatedMigrations:applied.length,remoteWrites:0,findings},null,2));
}finally{if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;await pg.close();}
