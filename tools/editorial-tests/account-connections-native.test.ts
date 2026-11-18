/** Disposable native PostgreSQL only; adapters are synthetic and network is forbidden. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const {accountConnections,saveAccountConnection,testAccountConnection}=require('../../packages/web/lib/account-connections.ts');
const fx=await nativePostgresFixture();
process.env.DATABASE_URL='postgresql://isolated-fixture-unused';
process.env.NODE_ENV='production';
delete process.env.AFFILIATE_SECRETS_KEY_V1;
process.env.AFFILIATE_SECRETS_MASTER_KEY='11'.repeat(32); // deterministic fixture key, never provisioned
const realFetch=globalThis.fetch;
globalThis.fetch=(()=>{throw new Error('unexpected_network');}) as typeof fetch;
const owner={tenantId:'a',affiliateId:'aff_a',actor:'human',actorAppUserId:'owner_a',authenticatedAuthUserId:'auth_a',membershipRole:'owner',requestId:'connection-test'};
const other={...owner,tenantId:'b',affiliateId:'aff_b',actorAppUserId:'owner_b',authenticatedAuthUserId:'auth_b'};
const operator={...owner,actorAppUserId:'operator_a',authenticatedAuthUserId:'auth_operator',membershipRole:'operator'};
const shopee={marketplace:'shopee',fields:{appId:'fixture-app',appSecret:'fixture-secret'}};
const aliexpress={marketplace:'aliexpress',fields:{appKey:'fixture-ali',appSecret:'fixture-ali-secret',trackingId:'fixture-tracking'}};
const ml={marketplace:'mercadolivre',fields:{trackingId:'fixture-ml',toolId:'fixture-tool'}};
let calls=0;
const validate=(answer:unknown,c=owner,marketplace='shopee',during?:()=>Promise<void>)=>testAccountConnection(c,marketplace,fx.factoryA,{[marketplace]:{validateCredential:async(credential:any,context:any)=>{
 calls++;assert.ok(context.signal instanceof AbortSignal);assert.equal(typeof context.log,'function');
 assert.equal(credential.secret.appSecret,marketplace==='shopee'?'fixture-secret':'fixture-ali-secret');
 if(during)await during();if(answer instanceof Error)throw answer;return answer;
}}});
const view=async(c=owner,marketplace='shopee')=>(await accountConnections(c,fx.factoryA)).connections.find((v:any)=>v.marketplace===marketplace);
const snapshot=async()=>({config:Array.from(await fx.admin`select to_jsonb(c) row from garimpa.affiliate_marketplace_config c order by affiliate_id,marketplace`),secrets:Array.from(await fx.admin`select to_jsonb(s) row from garimpa.affiliate_secret s order by tenant_id,marketplace,secret_id`)});
try{
 for(const unit of (await replacementRollout()).units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
 for(const file of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql','20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql','20261101193221_improve_editorial_recommendations.sql','20261102131234_optimize_price_observation_scope.sql','20261102203423_affiliate_workspace.sql','20261103001149_restrict_workspace_runtime_privileges.sql'])await fx.migrate(file);
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status) values('aff_a','a','a','A','active'),('aff_b','b','b','B','active')`;
 await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('owner_a','a','auth_a'),('operator_a','a','auth_operator'),('owner_b','b','auth_b')`;
 await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('owner_a','afiliado'),('operator_a','afiliado'),('owner_b','afiliado')`;
 await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','owner_a','owner'),('aff_a','operator_a','operator'),('aff_b','owner_b','owner')`;
 await fx.admin`update garimpa.rollout_control set enabled=false`;
 const commercialBefore=Array.from(await fx.admin`select to_jsonb(r) row from garimpa.rollout_control r order by to_jsonb(r)::text`);
 const sideEffects=async()=>(await fx.admin`select
  (select count(*)::int from garimpa.account_entitlement) entitlement,(select count(*)::int from garimpa.account_invitation) invitation,
  (select count(*)::int from garimpa.capture_batch) batch,(select count(*)::int from garimpa.capture_run) capture,
  (select count(*)::int from garimpa.triage_run) triage,(select count(*)::int from garimpa.affiliate_monitoring_policy) monitoring,
  (select count(*)::int from garimpa.app_user_role) roles,(select count(*)::int from garimpa.affiliate_membership) memberships,
  (select count(*)::int from garimpa.workspace_rollout where enabled) workspace`)[0];
 const beforeEffects={...await sideEffects()};
 for(const key of ['entitlement','invitation','batch','capture','triage','monitoring','workspace'])assert.equal(beforeEffects[key],0);
 await saveAccountConnection(owner,shopee,fx.factoryA);assert.equal((await view()).status,'configured');
 // Discriminator: truthy {ok:false} cannot become verified.
 const rejected=await validate({ok:false,checkedAt:new Date(),message:'synthetic rejection'});
 assert.equal(rejected.ok,false,'adapter {ok:false} must be interpreted by its ok field');
 assert.equal((await view()).status,'failed');assert.ok((await view()).checkedAt);
 for(const malformed of [true,false,{},null,{ok:'true'},{ok:1}]){assert.equal((await validate(malformed)).ok,false);assert.equal((await view()).status,'failed');}
 assert.equal((await validate({ok:true,checkedAt:new Date()})).ok,true);assert.equal((await view()).status,'verified');
 const verifiedBeforeNetwork=await snapshot();
 await assert.rejects(()=>validate(new Error('synthetic network detail must not escape')),/^Error: connection_test_unavailable$/);
 assert.equal((await view()).status,'verified');assert.deepEqual(await snapshot(),verifiedBeforeNetwork);
 await saveAccountConnection(owner,shopee,fx.factoryA);assert.equal((await view()).status,'configured');assert.equal((await view()).checkedAt,null);
 const configuredBeforeNetwork=await snapshot();
 await assert.rejects(()=>validate(new Error('synthetic network timeout')),/^Error: connection_test_unavailable$/);
 assert.equal((await view()).status,'configured');assert.equal((await view()).checkedAt,null);assert.deepEqual(await snapshot(),configuredBeforeNetwork);
 await saveAccountConnection(owner,aliexpress,fx.factoryA);
 assert.equal((await validate({ok:false,checkedAt:new Date()},owner,'aliexpress')).ok,false);assert.equal((await view(owner,'aliexpress')).status,'failed');
 assert.equal((await validate({ok:true,checkedAt:new Date()},owner,'aliexpress')).ok,true);assert.equal((await view(owner,'aliexpress')).status,'verified');
 console.log('PASS strict ValidationResult, malformed/boolean/network rejection for stores and save resets verification');
 const read=await accountConnections(owner,fx.factoryA);assert.equal(read.secretStorageReady,true);assert.equal(read.schemaReady,true);
 assert.ok(!JSON.stringify(read).includes('fixture-secret'));assert.ok(!JSON.stringify(read).includes('ciphertext'));
 assert.equal((await view(other)).configured,false);
 // Existing RLS hides affiliate_secret from operators; no secret state is broadened here.
 assert.ok(!JSON.stringify(await accountConnections(operator,fx.factoryA)).includes('fixture-secret'));
 const sealed=await snapshot(),priorCalls=calls;
 for(const c of [operator,{...owner,actor:'worker'},{...owner,tenantId:'b',affiliateId:'aff_b'},{...owner,affiliateId:'aff_b'},{...owner,actorAppUserId:'owner_b'}]){
  await assert.rejects(()=>saveAccountConnection(c,shopee,fx.factoryA),/owner_required|forbidden/);
  await assert.rejects(()=>validate({ok:true,checkedAt:new Date()},c),/owner_required|forbidden/);
 }
 await assert.rejects(()=>accountConnections({...owner,tenantId:'b',affiliateId:'aff_b'},fx.factoryA),/forbidden/);
 assert.equal(calls,priorCalls);assert.deepEqual(await snapshot(),sealed);
 console.log('PASS owner-only writes, scoped reads and forged account context blocked before adapter');
 for(const badKey of [undefined,'invalid-test-key']){
  if(badKey===undefined)delete process.env.AFFILIATE_SECRETS_MASTER_KEY;else process.env.AFFILIATE_SECRETS_MASTER_KEY=badKey;
  assert.equal((await accountConnections(owner,fx.factoryA)).secretStorageReady,false);
  const before=await snapshot();
  for(const input of [shopee,aliexpress])await assert.rejects(()=>saveAccountConnection(owner,input,fx.factoryA),/^Error: connection_storage_unavailable$/);
  const beforeCalls=calls;
  await assert.rejects(()=>validate({ok:true,checkedAt:new Date()}),(error:any)=>error.code==='credential_tampered'&&error.message==='credential_integrity_failed');
  assert.equal(calls,beforeCalls);
  assert.deepEqual(await snapshot(),before,'missing/invalid key cannot write config or secrets');
  await saveAccountConnection(owner,ml,fx.factoryA);assert.equal((await view(owner,'mercadolivre')).status,'configured');
 }
 process.env.AFFILIATE_SECRETS_MASTER_KEY='11'.repeat(32);
 assert.equal((await accountConnections(owner,fx.factoryA)).secretStorageReady,true);
 console.log('PASS missing/invalid key blocks secret writes safely; ML is independent');
 // A usable historical key can validate existing credentials even when new v1 storage is unavailable.
 const {encryptSecret}=require('../../packages/persistence/src/affiliate-secret-crypto.ts');
 const envelope=encryptSecret(JSON.stringify(shopee.fields),'a','shopee','credentials_json','v2','22'.repeat(32));
 await fx.admin`update garimpa.affiliate_secret set key_version=${envelope.keyVersion},ciphertext=${envelope.ciphertext},nonce=${envelope.nonce},tag=${envelope.tag} where tenant_id='a' and marketplace='shopee' and secret_id='credentials_json'`;
 delete process.env.AFFILIATE_SECRETS_MASTER_KEY;process.env.AFFILIATE_SECRETS_KEY_V2='22'.repeat(32);
 assert.equal((await accountConnections(owner,fx.factoryA)).secretStorageReady,false);
 assert.equal((await validate({ok:true,checkedAt:new Date()})).ok,true);
 assert.equal((await view()).status,'verified');
 delete process.env.AFFILIATE_SECRETS_KEY_V2;process.env.AFFILIATE_SECRETS_MASTER_KEY='11'.repeat(32);
 console.log('PASS existing versioned key can validate saved credentials without enabling new-secret storage');
 await saveAccountConnection(owner,shopee,fx.factoryA);
 await assert.rejects(()=>validate({ok:true,checkedAt:new Date()},owner,'shopee',async()=>{await saveAccountConnection(owner,{marketplace:'shopee',fields:{appId:'rotated',appSecret:'rotated'}},fx.factoryB);}),/connection_conflict/);
 assert.equal((await view()).status,'configured');await saveAccountConnection(owner,shopee,fx.factoryA);
 await assert.rejects(()=>validate({ok:true,checkedAt:new Date()},owner,'shopee',async()=>{await fx.admin`update garimpa.affiliate_membership set revoked_at=now() where affiliate_id='aff_a' and app_user_id='owner_a'`;}),/forbidden/);
 assert.equal((await fx.admin`select connection_status from garimpa.affiliate_marketplace_config where affiliate_id='aff_a' and marketplace='shopee'`)[0].connection_status,'configured');
 const revokedCalls=calls;
 await assert.rejects(()=>accountConnections(owner,fx.factoryA),/forbidden/);await assert.rejects(()=>saveAccountConnection(owner,shopee,fx.factoryA),/forbidden/);await assert.rejects(()=>validate({ok:true,checkedAt:new Date()}),/forbidden/);assert.equal(calls,revokedCalls);
 await fx.admin`update garimpa.affiliate_membership set revoked_at=null where affiliate_id='aff_a' and app_user_id='owner_a'`;
 await fx.admin`update garimpa.affiliate_account set status='suspended' where id='aff_a'`;
 await assert.rejects(()=>accountConnections(owner,fx.factoryA),/forbidden/);await assert.rejects(()=>validate({ok:true,checkedAt:new Date()}),/forbidden/);
 await fx.admin`update garimpa.affiliate_account set status='active' where id='aff_a'`;
 await fx.admin`update garimpa.app_user_role set revoked_at=now() where app_user_id='owner_a' and role='afiliado'`;
 await assert.rejects(()=>accountConnections(owner,fx.factoryA),/forbidden/);await assert.rejects(()=>validate({ok:true,checkedAt:new Date()}),/forbidden/);
 console.log('PASS credential rotation conflict, mid-call membership revocation, suspension and role revocation cannot verify');
 assert.deepEqual({...await sideEffects()},beforeEffects);
 assert.deepEqual(Array.from(await fx.admin`select to_jsonb(r) row from garimpa.rollout_control r order by to_jsonb(r)::text`),commercialBefore);
 console.log('PASS rollout OFF unchanged; no entitlement/invitation/capture/automation/AI/role/membership granted');
}finally{globalThis.fetch=realFetch;await fx.close();}
