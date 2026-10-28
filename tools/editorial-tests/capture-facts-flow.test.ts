import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {commercialFixture} from './commercial-fixture.ts';
import {PostgresStore} from '../../packages/persistence/src/pg-store.ts';
import {mapProductNode} from '../../packages/capture/src/adapters/shopee/mapper.ts';
import {mapProductNodes} from '../../packages/capture/src/adapters/aliexpress/mapper.ts';
const require=createRequire(import.meta.url);
const {persistExtensionCapture}=require('../../packages/web/lib/extension-db.ts');
const {persistManualCapture,parseManualPayload}=require('../../packages/web/lib/manual-capture.ts');
const {validateExtensionCapturePayload}=require('../../packages/web/lib/extension-contract.ts');
const {validateBrowserCapture}=require('../../packages/web/lib/browser-capture-contract.ts');
const {BrowserCaptureStore}=require('../../packages/web/lib/browser-capture-db.ts');
const {inAccountScope}=require('../../packages/web/lib/account-scope.ts');
const fx=await commercialFixture();
// Execute the complete production store statements with SQL/RLS, substituting
// only the network driver with an isolated PostgreSQL executor.
function identifiers(base:any):any {
 const sql:any=(parts:any,...values:any[])=>typeof parts==='string'?{rawFragment:'"'+parts.replaceAll('"','""')+'"'}:base(parts,...values);
 sql.json=base.json;sql.begin=(work:any)=>base.begin((tx:any)=>work(identifiers(tx)));sql.end=base.end;return sql;
}
const store:PostgresStore=Object.assign(Object.create(PostgresStore.prototype),{sql:identifiers(fx.factory()),s:'garimpa'});
const ctx=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'facts-'+t});
const rows=async(q:string,values:any[]=[]) => (await fx.pg.query(q,values)).rows as any[];
try {
 await fx.pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/20261027030237_compose_homepage_editions.sql',import.meta.url),'utf8'));
 await fx.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','facts-a','A'),('aff_b','b','facts-b','B');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values('u_a','a','auth_a'),('u_b','b','auth_b');
 insert into garimpa.app_user_role(app_user_id,role) values('u_a','afiliado'),('u_b','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','u_a','owner'),('aff_b','u_b','owner');
 insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('dev_a','aff_a','u_a','A','facts-device-a');`);
 const at=new Date('2026-10-28T12:00:00Z');let clock=0;
 async function capture(over:any={}) {
  const date=new Date(at.getTime()+clock++*60_000);const run=await store.startCaptureRun({tenantId:'a',marketplace:'aliexpress',startedAt:date,collectorRunId:'facts-'+clock,parameters:{}});
  const offer=mapProductNodes([{product_id:'ali-facts',product_title:' Fone &amp; áudio  USB-C '+ 'modelo '.repeat(45),product_detail_url:'https://aliexpress.com/item/1.html',target_sale_price:'10',target_sale_price_currency:'BRL',target_original_price:'20',target_original_price_currency:'BRL'}],date,'BRL').offers[0]!;
  return store.upsertProductWithObservation({captureRunId:run,tenantId:'a',marketplace:offer.marketplace,externalId:offer.externalId,title:offer.title,productUrl:offer.productUrl,priceCents:offer.priceCents,originalPriceCents:offer.originalPriceCents,offerEvidence:offer.offerEvidence,observedAt:date,...over});
 }
 const first=await capture();await capture();
 const count=async()=>(await rows('select count(*)::int as n from garimpa.price_observation where product_id=$1',[first.product.id]))[0].n;
 assert.equal(await count(),1);
 const latest=(await rows('select offer_evidence from garimpa.price_observation where product_id=$1',[first.product.id]))[0].offer_evidence;
 for(const patch of [{currency:'USD'},{priceType:'from'},{variantIdentity:{state:'source_verified',key:'kit-two'}},{packageContents:['2 unidades']},{conditions:{shipping:'incluso'}},{originalPriceKind:'derived_from_claim'}]) {await capture({offerEvidence:{...latest,...patch}});await capture();}
 assert.equal(await count(),13);
 const sourceTitle=(await rows('select title from garimpa.product where id=$1',[first.product.id]))[0].title;
 assert.ok(sourceTitle.length>250);assert.ok(sourceTitle.includes('& áudio USB-C'));
 await capture({observedAt:new Date(at.getTime()+21*3600_000)});assert.equal(await count(),14);
 const shopee=mapProductNode({itemId:'shopee-facts',productName:'Kit 2 peças',productLink:'https://shopee.com/item',priceMin:'10',priceMax:'20',priceDiscountRate:50},at)!;
 const shopeeRun=await store.startCaptureRun({tenantId:'a',marketplace:'shopee',startedAt:at,collectorRunId:'facts-shopee',parameters:{}});
 const shopeeResult=await store.upsertProductWithObservation({...shopee,tenantId:'a',captureRunId:shopeeRun,observedAt:at});
 const e=(await rows('select offer_evidence from garimpa.price_observation where product_id=$1',[shopeeResult.product.id]))[0].offer_evidence;
 assert.equal(e.version,2);assert.equal(e.priceType,'range');assert.equal(e.priceMaxCents,2000);assert.equal(e.originalPriceKind,'derived_from_claim');assert.equal(e.currency,undefined);
 console.log('PASS official mappers → PostgresStore → SQL/RLS: complete title, v2 facts, stable20h and same-price A→B→A');
 const device={deviceId:'dev_a',tenantId:'a',affiliateId:'aff_a',appUserId:'u_a',affiliatePublicSlug:'facts-a'};
 const base={version:1,marketplace:'mercadolivre',requestId:'123e4567-e89b-42d3-a456-426614174000',clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:'https://www.mercadolivre.com.br/ofertas'},product:{externalId:'MLB1234567890',title:'Transmissor '.repeat(35)+'USB-C 2 unidades',productUrl:'https://produto.mercadolivre.com.br/MLB-1234567890-teste',priceCents:1000,originalPriceCents:2000,currency:'BRL',priceType:'from'}};
 const payload=validateExtensionCapturePayload(base);const ext=await persistExtensionCapture(device,payload,fx.factory);
 const retry=await persistExtensionCapture(device,{...payload,product:{...payload.product,title:'Changed retry',priceCents:9999}},fx.factory);
 assert.equal(retry.duplicate,true);assert.equal(retry.observationId,ext.observationId);
 assert.equal((await rows('select last_price_cents from garimpa.product where id=$1',[ext.productId]))[0].last_price_cents,1000);
 const extRow=(await rows('select title_snapshot,offer_evidence from garimpa.price_observation where id=$1',[ext.observationId]))[0];
 assert.equal(extRow.title_snapshot,payload.product.title);assert.equal(extRow.offer_evidence.currency,'BRL');assert.equal(extRow.offer_evidence.priceType,'from');
 await assert.rejects(()=>persistExtensionCapture({...device,tenantId:'b'},payload,fx.factory),/affiliate_access_required|forbidden/);
 console.log('PASS extension complete title/evidence, immutable retry and foreign account denial');
 // A capture must invalidate the cached edition before any best-effort
 // refresh. Exercise the actual public guard with a same-price fact change.
 await fx.pg.query("insert into garimpa.product_curation(tenant_id,product_id,status) values('a',$1,'approved') on conflict(tenant_id,product_id) do update set status='approved'",[ext.productId]);
 const editionProduct={id:ext.productId,title:payload.product.title,imageUrl:null,category:null,slug:ext.publication.slug};
 const guard={productId:ext.productId,productUrl:payload.product.productUrl,observationId:ext.observationId,assessmentId:null,destinations:['home'],validUntil:new Date(Date.now()+3600_000).toISOString()};
 await fx.pg.query(`insert into garimpa.homepage_edition(tenant_id,id,policy_version,renewed_at,renew_after,selection,inputs,dependencies)
 values('a','123e4567-e89b-42d3-a456-426614174099','capture-facts',now(),now()+interval '1 hour',$1::jsonb,$2::jsonb,'[]')`,[JSON.stringify({products:[editionProduct],heroProductIds:[]}),JSON.stringify([guard])]);
 assert.equal((await rows("select garimpa.read_homepage_edition('a','home') as h"))[0].h.products.length,1);
 await persistExtensionCapture(device,{...payload,requestId:'123e4567-e89b-42d3-a456-426614174010',product:{...payload.product,priceType:'exact'}},fx.factory);
 assert.equal((await rows("select garimpa.read_homepage_edition('a','home') as h"))[0].h.products.length,0);
 console.log('PASS same-price changed evidence invalidates public edition synchronously, without refresh');
 const manual=parseManualPayload({v:1,m:'mercadolivre',u:'https://produto.mercadolivre.com.br/MLB-2345678901-teste',i:'MLB2345678901',t:'Manual '.repeat(45)+'USB-C',p:1000,op:2000,c:Date.now(),currency:'BRL',priceType:'exact'});
 const manualResult=await inAccountScope(ctx('a'),()=>persistManualCapture(manual,'u_a','a',fx.factory));
 await inAccountScope(ctx('a'),()=>persistManualCapture(manual,'u_a','a',fx.factory));
 const manualRows=await rows('select title_snapshot,offer_evidence from garimpa.price_observation where product_id=$1',[manualResult.productId]);
 assert.equal(manualRows.length,1);assert.equal(manualRows[0].title_snapshot,manual.t);assert.equal(manualRows[0].offer_evidence.currency,'BRL');
 await inAccountScope(ctx('a'),()=>persistManualCapture({...manual,c:manual.c+1,p:1200},'u_a','a',fx.factory));
 await inAccountScope(ctx('a'),()=>persistManualCapture(manual,'u_a','a',fx.factory));
 assert.equal((await rows('select last_price_cents from garimpa.product where id=$1',[manualResult.productId]))[0].last_price_cents,1200);
 await assert.rejects(()=>inAccountScope(ctx('b'),()=>persistManualCapture(manual,'u_a','a',fx.factory)),/affiliate_access_required/);
 console.log('PASS BM1 complete title, SQL v2 evidence, deterministic retry and foreign account denial');
 const browser=new BrowserCaptureStore(fx.factory);const access={appUserId:'u_a',tenantId:'a'};const batchId=await browser.pending(access);assert.ok(batchId);
 const batch=validateBrowserCapture({...base,requestId:'123e4567-e89b-42d3-a456-426614174001',products:[{...base.product,externalId:'MLB3456789012',productUrl:'https://produto.mercadolivre.com.br/MLB-3456789012-teste'}]});
 assert.equal((await browser.complete(access,batchId,batch)).importedCount,1);assert.equal((await browser.complete(access,batchId,batch)).duplicate,true);
 const browserRow=(await rows("select o.* from garimpa.price_observation o join garimpa.product p on p.id=o.product_id where p.external_id='MLB3456789012'"))[0];
 assert.equal(browserRow.title_snapshot,base.product.title);assert.equal(browserRow.offer_evidence.currency,'BRL');assert.equal(browserRow.offer_evidence.priceType,'from');
 await assert.rejects(()=>browser.complete({appUserId:'u_b',tenantId:'b'},batchId,batch),/browser_capture_forbidden/);
 console.log('PASS browser transactional v2 evidence, retry idempotency and foreign account denial');
}finally {await fx.pg.close();}
