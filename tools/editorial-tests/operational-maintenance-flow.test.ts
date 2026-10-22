import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
import { backfillFamilies } from '../../packages/persistence/src/catalog-maintenance.ts';
import { bootstrapHouse,seedHouseConfig } from '../../packages/persistence/src/house-maintenance.ts';
import { administrativeMaintenanceDb } from '../../packages/persistence/src/maintenance-cli.ts';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { dispatchCaptureBatch } = require('../../packages/web/lib/capture-dispatch.ts');
const { BrowserCaptureStore } = require('../../packages/web/lib/browser-capture-db.ts');
const { createPairingCode,exchangePairingCode,persistExtensionCapture,authenticateDevice } = require('../../packages/web/lib/extension-db.ts');
const { listDevices,renameDevice,revokeDevice,affiliateMetrics } = require('../../packages/web/lib/extension-admin.ts');
const { inAccountScope } = require('../../packages/web/lib/account-scope.ts');
const { withUserDb,withTenantDb } = require('../../packages/web/lib/tenant-db.ts');
const { persistManualCapture } = require('../../packages/web/lib/manual-capture.ts');
const { hashToken } = require('../../packages/web/lib/extension-token.ts');
import { withMonitoringDb } from '../../packages/persistence/src/monitoring-db.ts';
const fx=await nativePostgresFixture(),{units}=await replacementRollout(),results:any[]=[];
const run=async(name:string,work:()=>Promise<void>)=>{await work();results.push({name,result:'PASS'});console.log('PASS '+name);};
const apply=async(unit:any)=>fx.admin.begin(async(tx:any)=>{await tx.unsafe(unit.sql);});
const root=new URL('../../',import.meta.url);
let error:any;
try {
 const source=await readFile(new URL('packages/persistence/supabase/migrations/20260901025640_garimpa_curation.sql',root),'utf8');
 const trigger=source.match(/create trigger product_seed_curation[\s\S]*?;/)?.[0];assert.ok(trigger);
 await fx.admin.unsafe(trigger);
 for(const u of units.filter(x=>x.phase==='installedSubset'))await apply(u);
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_local','local','house','House'),('aff_b','b','beta','Beta')`;
 await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id,email) values('owner','b','auth-owner','owner@example.test')`;
 await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('owner','afiliado')`;
 await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
 ('p_local','local','mercadolivre','111','Fone Bluetooth','https://example.test/local',1000),
 ('p_b','b','mercadolivre','222','Fone Bluetooth','https://example.test/b',2000)`;
 await run('legacy seed trigger creates pending curation without explicit application seed',async()=>{
  const rows=await fx.admin`select product_id,status from garimpa.product_curation order by product_id`;
  assert.equal(rows.length,2);assert.ok(rows.every((r:any)=>r.status==='pending'));
 });
 const stages=[{phase:'S0'},...units.filter(x=>x.phase!=='installedSubset')];
 for(const stage of stages){
  if(stage.phase!=='S0')await apply(stage);
  await run(stage.phase+': backfill preview/apply is tenant-scoped, idempotent and does not approve curation',async()=>{
   await fx.admin`update garimpa.product set family_key=null,family_label=null,family_method=null,family_version=null`;
   const preview=await backfillFamilies(fx.clientA,'local');assert.equal(preview.scanned,1);assert.equal(preview.applied,0);assert.equal(preview.wouldClassify,1);
   assert.equal((await fx.admin`select family_key from garimpa.product where id='p_local'`)[0].family_key,null);
   const changed=await backfillFamilies(fx.clientA,'local',true);assert.equal(changed.applied,1);
   assert.equal((await fx.admin`select family_key from garimpa.product where id='p_b'`)[0].family_key,null);
   assert.equal((await backfillFamilies(fx.clientA,'local',true)).applied,0);
   assert.equal((await fx.admin`select status from garimpa.product_curation where product_id='p_local'`)[0].status,'pending');
   await assert.rejects(()=>backfillFamilies(fx.clientA,'missing',true),/maintenance_account_unavailable/);
  });
  await run(stage.phase+': house commands refuse runtime; administrator preview does not mutate',async()=>{
   await assert.rejects(()=>bootstrapHouse(fx.clientA,'owner@example.test',true),/dedicated_administrative_connection_required/);
   await assert.rejects(()=>seedHouseConfig(fx.clientA,'synthetic-tag','synthetic-tool',true),/dedicated_administrative_connection_required/);
   const beforeMembership=await fx.admin`select * from garimpa.affiliate_membership`;
   const beforeConfig=await fx.admin`select * from garimpa.affiliate_marketplace_config`;
   assert.equal((await bootstrapHouse(fx.admin,'owner@example.test')).mode,'dry-run');
   assert.equal((await seedHouseConfig(fx.admin,'synthetic-tag','synthetic-tool')).mode,'dry-run');
   assert.deepEqual(await fx.admin`select * from garimpa.affiliate_membership`,beforeMembership);
   assert.deepEqual(await fx.admin`select * from garimpa.affiliate_marketplace_config`,beforeConfig);
  });
 }
 await run('bootstrap preserves global home, requires authenticated affiliate and rejects conflicting memberships',async()=>{
  assert.equal((await bootstrapHouse(fx.admin,'owner@example.test',true)).membership,'created_owner');
  assert.equal((await bootstrapHouse(fx.admin,' OWNER@example.test ',true)).membership,'existing_owner');
  assert.equal((await fx.admin`select tenant_id from garimpa.app_user where id='owner'`)[0].tenant_id,'b');
  await fx.admin`update garimpa.affiliate_membership set role='operator' where app_user_id='owner'`;
  await assert.rejects(()=>bootstrapHouse(fx.admin,'owner@example.test',true),/existing_membership_requires_explicit_review/);
  await fx.admin`update garimpa.affiliate_membership set role='owner',revoked_at=now() where app_user_id='owner'`;
  await assert.rejects(()=>bootstrapHouse(fx.admin,'owner@example.test',true),/existing_membership_requires_explicit_review/);
  await fx.admin`update garimpa.affiliate_membership set revoked_at=null where app_user_id='owner'`;
  await fx.admin`update garimpa.app_user_role set revoked_at=now() where app_user_id='owner'`;
  await assert.rejects(()=>bootstrapHouse(fx.admin,'owner@example.test',true),/active_affiliate_role_required/);
  await fx.admin`update garimpa.app_user_role set revoked_at=null where app_user_id='owner'`;
  await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id,email) values('duplicate','b','auth-duplicate','OWNER@example.test')`;
  await assert.rejects(()=>bootstrapHouse(fx.admin,'owner@example.test',true),/unique_authenticated_admin_required/);
  await fx.admin`delete from garimpa.app_user where id='duplicate'`;
  await fx.admin`update garimpa.app_user set auth_user_id=null where id='owner'`;
  await assert.rejects(()=>bootstrapHouse(fx.admin,'owner@example.test',true),/unique_authenticated_admin_required/);
  await fx.admin`update garimpa.app_user set auth_user_id='auth-owner' where id='owner'`;
  await assert.rejects(()=>bootstrapHouse(fx.admin,'',true),/explicit_admin_email_required/);
 });
 await run('house config writes only house, resets validation and never returns tracking/tool',async()=>{
  await fx.admin`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status) values('aff_b','mercadolivre','other-tag','other-tool','active')`;
  const result=await seedHouseConfig(fx.admin,'synthetic-tag','synthetic-tool',true);
  assert.equal(result.validatedAt,null);assert.ok(!JSON.stringify(result).includes('synthetic-tag'));assert.ok(!JSON.stringify(result).includes('synthetic-tool'));
  await fx.admin`update garimpa.affiliate_marketplace_config set validated_at=now() where affiliate_id='aff_local'`;
  await seedHouseConfig(fx.admin,'changed-tag','changed-tool',true);
  assert.equal((await fx.admin`select validated_at from garimpa.affiliate_marketplace_config where affiliate_id='aff_local'`)[0].validated_at,null);
  assert.equal((await fx.admin`select tracking_id from garimpa.affiliate_marketplace_config where affiliate_id='aff_b'`)[0].tracking_id,'other-tag');
 });
 await run('suspended account denies scoped backfill and all house maintenance',async()=>{
  await fx.admin`update garimpa.affiliate_account set status='suspended' where id='aff_local'`;
  await assert.rejects(()=>backfillFamilies(fx.clientA,'local',true),/maintenance_account_unavailable/);
  await assert.rejects(()=>bootstrapHouse(fx.admin,'owner@example.test',true),/house_account_unavailable/);
  await assert.rejects(()=>seedHouseConfig(fx.admin,'tag','tool',true),/house_account_unavailable/);
  await fx.admin`update garimpa.affiliate_account set status='active' where id='aff_local'`;
 });
 await run('real worker capture still seeds pending curation with legacy trigger after cutover',async()=>{
  await fx.clientA`select set_config('garimpa.platform_role','platform_admin',false),set_config('garimpa.actor_app_user_id','inherited-other-user',false),set_config('garimpa.membership_role','owner',false)`;
  try {
   const snapshot=(tx:any)=>tx`select current_setting('garimpa.platform_role',true) platform,current_setting('garimpa.actor_app_user_id',true) actor,current_setting('garimpa.membership_role',true) membership`;
   for(const values of [await withUserDb('local','',snapshot,fx.factoryA),await withTenantDb('local',snapshot,fx.factoryA)])
    assert.deepEqual({...values[0]},{platform:'',actor:'',membership:''});
  }finally{await fx.clientA`select set_config('garimpa.platform_role','',false),set_config('garimpa.actor_app_user_id','',false),set_config('garimpa.membership_role','',false)`;}

  await withMonitoringDb(fx.clientA,'b',tx=>tx`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents)
   values('p_after','b','mercadolivre','333','Item novo','https://example.test/after',3000)`);
  assert.equal((await fx.admin`select status from garimpa.product_curation where product_id='p_after'`)[0].status,'pending');
  assert.equal((await fx.clientA`select * from garimpa.product`).length,0);
 });
 const ownerContext={tenantId:'local',affiliateId:'aff_local',actor:'human',actorAppUserId:'owner',authenticatedAuthUserId:'auth-owner',membershipRole:'owner',requestId:'operational-native'};
 const access={tenantId:'local',appUserId:'owner'};
 const browser=new BrowserCaptureStore(fx.factoryA);
 const browserPayload={version:1,requestId:'123e4567-e89b-42d3-a456-426614174001',marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:'https://www.mercadolivre.com.br/ofertas'},products:[{externalId:'MLB1234567890',title:'Fone Bluetooth',productUrl:'https://produto.mercadolivre.com.br/MLB-1234567890-fone-_JM',priceCents:8990}]};
 await run('browser pending/import/retry works as real runtime and keeps capture pending under legacy trigger',async()=>{
  const id=await browser.pending(access);assert.ok(id);
  assert.equal(await browser.pending(access),id);
  const result=await browser.complete(access,id,browserPayload);assert.equal(result.importedCount,1);
  assert.equal((await browser.complete(access,id,browserPayload)).duplicate,true);
  const [product]=await fx.admin`select id from garimpa.product where external_id='MLB1234567890' and tenant_id='local'`;
  assert.equal((await fx.admin`select status from garimpa.product_curation where product_id=${product.id}`)[0].status,'pending');
  assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.price_observation where product_id=${product.id}`)[0].n),1);
  await fx.admin`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='owner'`;
  await assert.rejects(()=>browser.complete(access,id,browserPayload),/browser_capture_forbidden/);
  await assert.rejects(()=>browser.pending(access),/browser_capture_forbidden/);
  await fx.admin`update garimpa.affiliate_membership set revoked_at=null where app_user_id='owner'`;
  await assert.rejects(()=>browser.pending({...access,tenantId:'b'}),/browser_capture_forbidden/);
 });
 await run('manual capture uses authenticated selected account and denies a revoked membership',async()=>{
  const payload={v:1,m:'mercadolivre',u:'https://www.mercadolivre.com.br/p/MLB1234567891',i:'MLB1234567891',t:'Item manual',p:5000,c:Date.now()};
  const result=await inAccountScope(ownerContext,()=>persistManualCapture(payload,'owner','local',fx.factoryA));assert.ok(result.productId);
  await fx.admin`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='owner'`;
  await assert.rejects(()=>inAccountScope(ownerContext,()=>persistManualCapture(payload,'owner','local',fx.factoryA)),/forbidden/);
  await fx.admin`update garimpa.affiliate_membership set revoked_at=null where app_user_id='owner'`;
 });
 let paired:any;
 await run('owner pairing creation scopes to chosen account; concurrent code exchange issues exactly one token',async()=>{
  const code=await inAccountScope(ownerContext,()=>createPairingCode({appUserId:'owner',deviceName:'Synthetic'},fx.factoryA));
  const [one,two]=await Promise.all([exchangePairingCode(code.pairingCode,fx.factoryA),exchangePairingCode(code.pairingCode,fx.factoryB)]);
  assert.equal([one,two].filter(Boolean).length,1);paired=one||two;
  assert.equal((await fx.admin`select affiliate_id from garimpa.extension_device where id=${paired.deviceId}`)[0].affiliate_id,'aff_local');
  assert.equal(await exchangePairingCode(code.pairingCode,fx.factoryA),null);
  assert.equal((await authenticateDevice(hashToken(paired.deviceToken),fx.factoryA)).kind,'ok');
 });
 await run('paired device captures idempotently and touches only its own use without owner identity',async()=>{
  const auth=await authenticateDevice(hashToken(paired.deviceToken),fx.factoryA);assert.equal(auth.kind,'ok');
  const payload={version:1,requestId:'123e4567-e89b-42d3-a456-426614174002',clientCapturedAt:new Date().toISOString(),page:{url:'https://www.mercadolivre.com.br/p/MLB1234567892'},product:{externalId:'MLB1234567892',title:'Item extensão',productUrl:'https://www.mercadolivre.com.br/p/MLB1234567892',priceCents:5000}};
  assert.equal((await persistExtensionCapture(auth.device,payload,fx.factoryA)).duplicate,false);
  assert.equal((await persistExtensionCapture(auth.device,payload,fx.factoryA)).duplicate,true);
  assert.ok((await fx.admin`select last_used_at from garimpa.extension_device where id=${paired.deviceId}`)[0].last_used_at);
  await assert.rejects(()=>browser.pending({...access,deviceId:'unrelated-device'}),/browser_capture_forbidden/);
  await browser.pending({...access,deviceId:paired.deviceId});
  const devices=await inAccountScope(ownerContext,()=>listDevices('owner',fx.factoryA));assert.ok(devices.some((d:any)=>d.id===paired.deviceId));assert.ok(!JSON.stringify(devices).includes(paired.deviceToken));
  assert.equal(await inAccountScope(ownerContext,()=>renameDevice(paired.deviceId,'Renamed','owner',fx.factoryA)),true);
  assert.equal((await inAccountScope(ownerContext,()=>affiliateMetrics(fx.factoryA))).length,1);
  const operator={...ownerContext,membershipRole:'operator'};
  await assert.rejects(()=>inAccountScope(operator,()=>renameDevice(paired.deviceId,'Denied','owner',fx.factoryA)),/affiliate_owner_required/);
  assert.equal(await inAccountScope(ownerContext,()=>revokeDevice(paired.deviceId,'owner',fx.factoryA)),true);
  assert.equal((await authenticateDevice(hashToken(paired.deviceToken),fx.factoryA)).kind,'unknown');
  await assert.rejects(()=>browser.pending({...access,deviceId:paired.deviceId}),/browser_capture_forbidden/);
  await assert.rejects(()=>persistExtensionCapture(auth.device,{...payload,requestId:'123e4567-e89b-42d3-a456-426614174003'},fx.factoryA),/affiliate_access_required/);
 });
 await run('pairing rejects expired/revoked/operator/role-revoked authority and malformed hashes',async()=>{
  for(const mode of ['expired','device_revoked','operator','membership_revoked','role_revoked','account_suspended']){
   const code=await inAccountScope(ownerContext,()=>createPairingCode({appUserId:'owner',deviceName:'Negative'},fx.factoryA));
   if(mode==='expired')await fx.admin`update garimpa.extension_device set pairing_expires_at=now()-interval '1 minute' where id=${code.deviceId}`;
   if(mode==='device_revoked')await fx.admin`update garimpa.extension_device set revoked_at=now() where id=${code.deviceId}`;
   if(mode==='operator')await fx.admin`update garimpa.affiliate_membership set role='operator' where app_user_id='owner'`;
   if(mode==='membership_revoked')await fx.admin`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='owner'`;
   if(mode==='role_revoked')await fx.admin`update garimpa.app_user_role set revoked_at=now() where app_user_id='owner'`;
   if(mode==='account_suspended')await fx.admin`update garimpa.affiliate_account set status='suspended' where id='aff_local'`;
   assert.equal(await exchangePairingCode(code.pairingCode,fx.factoryA),null,mode);
   await fx.admin`update garimpa.affiliate_account set status='active' where id='aff_local'`;
   await fx.admin`update garimpa.affiliate_membership set role='owner',revoked_at=null where app_user_id='owner'`;
   await fx.admin`update garimpa.app_user_role set revoked_at=null where app_user_id='owner'`;
  }
  assert.equal((await fx.clientA`select * from garimpa.exchange_extension_pairing('bad','bad','bad')`).length,0);
 });
 await run('administrative CLI has no DATABASE_URL fallback; retired commands stop before any connection',async()=>{
  const old=process.env.BIZUMINER_MAINTENANCE_DATABASE_URL;delete process.env.BIZUMINER_MAINTENANCE_DATABASE_URL;
  try{assert.throws(()=>administrativeMaintenanceDb(),/BIZUMINER_MAINTENANCE_DATABASE_URL_required/);}finally{if(old!==undefined)process.env.BIZUMINER_MAINTENANCE_DATABASE_URL=old;}
  const env={...process.env};for(const k of Object.keys(env))if(/DATABASE_URL|SUPABASE|GEMINI|GOOGLE_API|ML_|SHOPEE|ALIEXPRESS/.test(k))delete env[k];
  env.DATABASE_URL='postgresql://never:never@localhost:1/unreachable';
  for(const name of ['curate-initial-catalog','purge-catalog','cleanup-lifecycle','verify-tenant-isolation']){
   await assert.rejects(()=>promisify(execFile)(process.execPath,['--experimental-strip-types',fileURLToPath(new URL(`packages/persistence/bin/${name}.ts`,root))],{env,timeout:10000}),
    (e:any)=>e.code===1 && /legacy_maintenance_retired/.test(e.stderr) && !/ECONNREFUSED/.test(e.stderr));
  }
 });
 await run('malformed CLI database URLs do not disclose supplied credentials',async()=>{
  const env={...process.env,DATABASE_URL:'postgresql://user:synthetic-secret@localhost:abc/db',BIZUMINER_MAINTENANCE_DATABASE_URL:'postgresql://user:synthetic-secret@localhost:abc/db',ADMIN_EMAIL:'owner@example.test',ML_TRACKING_ID:'synthetic-tag',ML_TOOL_ID:'synthetic-tool'};
  for(const name of ['backfill-family','seed-house-marketplace-config','bootstrap-affiliate-house'])
   await assert.rejects(()=>promisify(execFile)(process.execPath,['--experimental-strip-types',fileURLToPath(new URL(`packages/persistence/bin/${name}.ts`,root))],{env,timeout:10000}),
    (e:any)=>e.code===1 && !/synthetic-secret/.test(e.stderr) && !/ECONNREFUSED/.test(e.stderr));
 });
 await run('automatic capture refuses another account before dispatching or reading house credentials',async()=>{
  await assert.rejects(()=>dispatchCaptureBatch('synthetic','b'),/capture_account_credentials_required/);
 });
}catch(e:any){error={name:e.name,message:e.message};throw e;}
finally{await fx.close();await writeFile(new URL('docs/implementation/evidencias/execucao-31-operational-native.json',root),JSON.stringify({at:new Date().toISOString(),engine:fx.version,environment:'synthetic localhost; reconstructed baseline plus exact legacy seed trigger; no Supabase/deployment proof',productionWrites:0,productionApproved:false,units:units.filter(x=>x.phase!=='installedSubset').map(x=>({file:x.file,sha256:x.sha256})),results,...(error?{error}:{})},null,2)+'\n');}
