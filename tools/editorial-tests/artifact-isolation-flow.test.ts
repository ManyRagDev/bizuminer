import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {savePrivateArtifact,downloadPrivateArtifact}=require('../../packages/web/lib/private-artifact-db.ts');
const {artifactAccessFailure}=require('../../packages/web/lib/artifact-http.ts');
const {generateKitArtifact}=require('../../packages/web/lib/kit-artifact-db.ts');
const {pg,factory}=await commercialFixture();
const c=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'artifact-test'});
try {
 await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values ('aff_a','a','artifact-a','A'),('aff_b','b','artifact-b','B');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values ('u_a','a','auth_a'),('u_b','b','auth_b');
 insert into garimpa.app_user_role(app_user_id,role) values ('u_a','afiliado'),('u_b','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_a','owner'),('aff_b','u_b','owner');`);
 const bytes=new TextEncoder().encode('synthetic private evidence'),objects=new Map<string,Uint8Array>();let gets=0;
 const store={put:async(p:string,b:Uint8Array)=>{objects.set(p,b);},get:async(p:string)=>{gets++;const b=objects.get(p);if(!b)throw new Error('missing');return b;}};
 const a=await savePrivateArtifact(c('a'),{kind:'account_evidence',name:'private-evidence',mime:'application/pdf',bytes},factory,store);
 await assert.rejects(()=>downloadPrivateArtifact(c('b'),a.id,factory,store),/artifact_not_found/);assert.equal(gets,0);
 const own=await downloadPrivateArtifact(c('a'),a.id,factory,store);assert.deepEqual(own.bytes,bytes);assert.equal(gets,1);
 assert.equal(artifactAccessFailure('no_session').status,401);assert.equal(artifactAccessFailure('forbidden').status,403);
 const w=require('../../packages/web/lib/commercial-workflow.ts');
 const sharp=createRequire(new URL('../../packages/web/package.json',import.meta.url))('sharp');
 const evidence={version:2,currency:'BRL',priceType:'exact',variantIdentity:{state:'source_verified',key:'unit',attributes:{}},packageQuantity:1,fieldStates:{sellerId:'not_applicable',packageContents:'not_applicable',dimensions:'not_applicable',payment:'not_applicable',coupon:'not_applicable',region:'not_applicable'}};
 await pg.exec(`insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values('a','aff_a','fixture','active','2026-01-01','{"maxActiveCampaigns":10,"maxDailyKits":10,"allowedMarketplaces":["shopee"]}','fixture');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('product','a','shopee','101','Cafeteira de teste','https://shopee.com.br/p',10000);
 insert into garimpa.product_curation(tenant_id,product_id,status) values('a','product','approved');
 insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values('web','a','aff_a','product','web','artifact-a--shp-101','active','https://s.shopee.com.br/fixture');`);
 await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values('obs','a','product',10000,$1)`,[JSON.stringify(evidence)]);
 const campaign=await w.createCampaignForAccount(c('a'),{name:'Fixture',objective:'Fixture',audience:'Fixture',requestId:'campaign'},factory);
 const kit=await w.createKitForAccount(c('a'),{campaignId:campaign.campaignId,productId:'product',channel:'instagram_feed',reason:'Fixture',requestId:'kit'},factory);
 const validation=await w.validateKitForAccount(c('a'),{kitId:kit.kitId,expectedVersion:kit.kitVersion,requestId:'validate'},factory);
 const approved=await w.approveKitForAccount(c('a'),{kitId:kit.kitId,expectedVersion:validation.kitVersion,requestId:'approve'},factory);
 for(const [format,width,height] of [[undefined,1080,1080],['banner',1200,628]]) {
  const artifact=await generateKitArtifact(c('a'),{kitId:kit.kitId,expectedVersion:approved.kitVersion,origin:'https://fixture.invalid',...(format?{format}:{})},factory,store);
  const downloaded=await downloadPrivateArtifact(c('a'),artifact.id,factory,store);
  const dimensions=await sharp(downloaded.bytes).metadata();assert.equal(dimensions.width,width);assert.equal(dimensions.height,height);
  assert.equal(downloaded.metadata.rights.format,format??'feed');
 }
 console.log('PASS BUG-011: approved kit service infers feed or accepts explicit banner and stores format/template metadata with private artifact');
 console.log('PASS R-01/AC-17.2: foreign artifact is invisible under RLS and never reaches object store; own bytes hash verified; HTTP auth mapping 401/403');
}finally{await pg.close();}
