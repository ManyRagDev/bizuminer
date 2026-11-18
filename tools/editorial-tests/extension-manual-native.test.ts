import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realGarimpaBaselineFixture } from './real-garimpa-baseline-fixture.ts';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { commercialFixture } from './commercial-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const { persistExtensionCapture, persistManualExtensionBatch, manualExtensionItemRequestId }=require('../../packages/web/lib/extension-db.ts');
const { extensionCaptureMode }=require('../../packages/web/lib/flags.ts');
const { readExtensionJson, extensionIdempotencyMatches }=require('../../packages/web/lib/extension-request.ts');
const { validateBrowserCapture }=require('../../packages/web/lib/browser-capture-contract.ts');
const native=Boolean(process.env.BIZUMINER_TEST_PG_BIN);
const memory=native ? null : await commercialFixture();
const realSchema=process.env.GARIMPA_BASELINE_SCHEMA;
if(realSchema && !process.env.GARIMPA_BASELINE_GRANTS)throw new Error('GARIMPA_BASELINE_GRANTS is required with the real schema');
const fx:any=realSchema ? await realGarimpaBaselineFixture(realSchema,process.env.GARIMPA_BASELINE_GRANTS!) : native ? await nativePostgresFixture() : {admin:memory!.adminFactory(),factoryA:memory!.factory,factoryB:memory!.factory,close:()=>memory!.pg.close()};
const device={deviceId:'dev_manual',tenantId:'manual_a',affiliateId:'aff_manual_a',appUserId:'u_manual_a',affiliatePublicSlug:'manual-a',affiliateDisplayName:'Manual A'};
const requestId='123e4567-e89b-42d3-a456-426614174000';
const item=(id:string,price=1000)=>({externalId:id,title:'Produto manual '+id,priceCents:price,productUrl:'https://produto.mercadolivre.com.br/MLB-'+id.slice(3)+'-teste'});
const batch=(ids=['MLB1234567890','MLB1234567891'],request=requestId)=>validateBrowserCapture({version:1,requestId:request,marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:'https://www.mercadolivre.com.br/ofertas'},products:ids.map(id=>({...item(id),ratingStar:4.5,salesCount:23,salesLabel:'23 vendidos'}))});
const counts=async()=> (await fx.admin`select (select count(*)::int from garimpa.product) products,
 (select count(*)::int from garimpa.price_observation) observations,(select count(*)::int from garimpa.publication) publications,
 (select count(*)::int from garimpa.capture_run) runs,(select count(*)::int from garimpa.capture_batch) batches,
 (select count(*)::int from garimpa.editorial_assessment) assessments`)[0];
try {
 if(native && !realSchema) for(const unit of (await replacementRollout()).units) await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_manual_a','manual_a','manual-a','A'),('aff_manual_b','manual_b','manual-b','B')`;
 await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('u_manual_a','manual_a','auth_manual_a')`;
 await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('u_manual_a','afiliado')`;
 await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_manual_a','u_manual_a','owner')`;
 await fx.admin`insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('dev_manual','aff_manual_a','u_manual_a','Manual','manual-test-token')`;
 assert.equal(extensionCaptureMode({}),'manual');assert.equal(extensionCaptureMode({EXTENSION_CAPTURE_MODE:'durable'}),'durable');
 for(const value of ['', 'automatic','true','MANUAL'])assert.equal(extensionCaptureMode({EXTENSION_CAPTURE_MODE:value}),null);
 if(realSchema) {
  // Inspect actual policy behavior without committing the mutation probe.
  let ownUpdate=0,foreignUpdate=0,sharedRows=0;
  await assert.rejects(()=>fx.clientA.begin(async(tx:any)=>{
   await tx`select set_config('garimpa.tenant_id','manual_a',true),set_config('garimpa.actor_type','device',true),
    set_config('garimpa.actor_app_user_id','u_manual_a',true),set_config('garimpa.membership_role','operator',true),set_config('garimpa.platform_role','',true)`;
   sharedRows=(await tx`select id from garimpa.affiliate_account where tenant_id='manual_a' and status='active' for share`).length;
   ownUpdate=(await tx`update garimpa.affiliate_account set display_name='ROLLBACK PROBE' where id='aff_manual_a' returning id`).length;
   foreignUpdate=(await tx`update garimpa.affiliate_account set display_name='ROLLBACK PROBE' where id='aff_manual_b' returning id`).length;
   throw new Error('rollback_acl_probe');
  }),/rollback_acl_probe/);
  assert.equal(sharedRows,1);assert.equal(foreignUpdate,0);
  console.log(JSON.stringify({realAclDeviceProbe:{sharedRows,ownAccountUpdateRows:ownUpdate,foreignAccountUpdateRows:foreignUpdate,rolledBack:true}}));
 }
 const payload=batch();
 const first=await persistManualExtensionBatch(device,payload,fx.factoryA);
 assert.equal(first.importedCount,2);assert.equal(first.mode,'manual');assert.equal(first.duplicate,false);
 assert.deepEqual({...await counts()},{products:2,observations:2,publications:0,runs:0,batches:0,assessments:0});
 assert.equal((await fx.admin`select count(*)::int n from garimpa.product_curation where status='pending'`)[0].n,2);
 const replay=await persistManualExtensionBatch(device,{...payload,products:payload.products.map((p:any)=>({...p,title:'Alterado',priceCents:9999})).reverse()},fx.factoryB);
 assert.equal(replay.importedCount,0);assert.equal(replay.duplicate,true);
 assert.equal((await fx.admin`select min(last_price_cents) p,max(last_price_cents) q from garimpa.product`)[0].q,1000);
 assert.equal((await counts()).observations,2);
 assert.equal((await fx.admin`select min(rating_star) rating,min(sales_count) sales from garimpa.price_observation`)[0].rating,4.5);
 assert.equal(manualExtensionItemRequestId(device.deviceId,requestId,'mercadolivre','MLB1234567890'),manualExtensionItemRequestId(device.deviceId,requestId.toUpperCase(),'mercadolivre','MLB1234567890'));
 console.log('PASS manual bulk atomic evidence only, pending curation and immutable replay');
 const single=await persistExtensionCapture(device,{version:1,requestId:'223e4567-e89b-42d3-a456-426614174001',marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),page:payload.page,product:item('MLB1234567892')},fx.factoryA,'manual');
 assert.equal(single.publication,null);assert.equal(single.mode,'manual');
 await fx.admin`update garimpa.product_curation set status='approved' where product_id=${single.productId}`;
 await persistExtensionCapture(device,{version:1,requestId:'223e4567-e89b-42d3-a456-426614174002',marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),page:payload.page,product:item('MLB1234567892',1500)},fx.factoryA,'manual');
 assert.equal((await fx.admin`select status from garimpa.product_curation where product_id=${single.productId}`)[0].status,'approved');
 assert.equal((await counts()).publications,0);
 await assert.rejects(()=>persistManualExtensionBatch({...device,tenantId:'manual_b',affiliateId:'aff_manual_b'},batch(),fx.factoryA),/affiliate_access_required|forbidden/);
 // Force failure after the first item in the same transaction; all evidence rolls back.
 await fx.admin.unsafe(`create function garimpa.test_manual_failure() returns trigger language plpgsql as $$ begin if new.external_id='MLB3333333331' then raise exception 'test_item_failure'; end if; return new; end $$;`);
 await fx.admin.unsafe(`create trigger test_manual_failure before insert on garimpa.product for each row execute function garimpa.test_manual_failure();`);
 const before=await counts();
 await assert.rejects(()=>persistManualExtensionBatch(device,batch(['MLB3333333330','MLB3333333331'],'333e4567-e89b-42d3-a456-426614174000'),fx.factoryA),/test_item_failure/);
 assert.deepEqual({...await counts()},{...before});
 console.log('PASS single manual, human curation preserved, foreign tenant denied and full-batch rollback');
 for(const [disable,enable] of [
  ["update garimpa.extension_device set revoked_at=now() where id='dev_manual'","update garimpa.extension_device set revoked_at=null where id='dev_manual'"],
  ["update garimpa.affiliate_membership set revoked_at=now() where affiliate_id='aff_manual_a'","update garimpa.affiliate_membership set revoked_at=null where affiliate_id='aff_manual_a'"],
  ["update garimpa.app_user_role set revoked_at=now() where app_user_id='u_manual_a'","update garimpa.app_user_role set revoked_at=null where app_user_id='u_manual_a'"],
  ["update garimpa.affiliate_account set status='suspended' where id='aff_manual_a'","update garimpa.affiliate_account set status='active' where id='aff_manual_a'"],
 ]) {
  await fx.admin.unsafe(disable);
  await assert.rejects(()=>persistManualExtensionBatch(device,batch(),fx.factoryA),/affiliate_access_required/);
  await fx.admin.unsafe(enable);
 }
 assert.deepEqual({...await counts()},{...before});
 console.log('PASS device, membership, role and account revalidated even for a duplicate import');
 if(native) {
 const concurrentPayload=batch(['MLB5555555550','MLB5555555551'],'553e4567-e89b-42d3-a456-426614174000');
 const concurrent=await Promise.all([
  persistManualExtensionBatch(device,concurrentPayload,fx.factoryA),
  persistManualExtensionBatch(device,concurrentPayload,fx.factoryB),
 ]);
 assert.equal(concurrent.reduce((n:number,r:any)=>n+r.importedCount,0),2);
 assert.equal(concurrent.filter((r:any)=>r.duplicate).length,1);
 assert.equal((await counts()).observations,before.observations+2);
 console.log('PASS concurrent first import/replay commits exactly one observation per item');
 const beforeSuspension=await counts();
 // Hold a suspension uncommitted. Import must wait for it, then reject the now inactive account.
 let release!:()=>void;let locked!:()=>void;
 const lockReady=new Promise<void>(r=>locked=r),unlock=new Promise<void>(r=>release=r);
 const suspension=fx.admin.begin(async(tx:any)=>{await tx`update garimpa.affiliate_account set status='suspended' where id='aff_manual_a'`;locked();await unlock;});
 await lockReady;
 const denied=assert.rejects(()=>persistManualExtensionBatch(device,batch(['MLB4444444440'],'443e4567-e89b-42d3-a456-426614174000'),fx.factoryA),/affiliate_access_required/);
 await new Promise(r=>setTimeout(r,50));release();await suspension;await denied;
 assert.equal((await counts()).products,beforeSuspension.products);
 console.log('PASS concurrent account suspension blocks manual import');
 } else console.log('SKIP independent-session concurrency: set BIZUMINER_TEST_PG_BIN to installed PostgreSQL binaries');
 assert.deepEqual(await readExtensionJson(new Request('http://local',{method:'POST',body:'{"a":1}'}),20),{a:1});
 await assert.rejects(()=>readExtensionJson(new Request('http://local',{method:'POST',body:'{"a":"'+ 'x'.repeat(40)+'"}'}),20),/body_too_large/);
 assert.equal(extensionIdempotencyMatches(new Request('http://local',{headers:{'Idempotency-Key':requestId}}),requestId),true);
 assert.equal(extensionIdempotencyMatches(new Request('http://local',{headers:{'Idempotency-Key':'wrong'}}),requestId),false);
 console.log('PASS fail-closed modes, bounded request and matching idempotency key');
} finally { await fx.close(); }
