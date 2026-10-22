import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
import {withMonitoringDb} from '../../packages/persistence/src/monitoring-db.ts';
import {monitoringScheduleDecision,recordMonitoringSkip} from '../../packages/persistence/src/monitoring-schedule.ts';
import {loadMonitoringCandidates} from '../../packages/persistence/src/monitoring-candidates.ts';
const require=createRequire(import.meta.url);
const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
const {withCommercialDb}=require('../../packages/web/lib/commercial-rollout.ts');
const {createCampaignForAccount}=require('../../packages/web/lib/commercial-workflow.ts');
const {publicProjectionReady,publicDealDetail,publicMonetizedTarget}=require('../../packages/web/lib/public-offer-db.ts');
const {recordHumanRubricReview}=require('../../packages/web/lib/rubric-db.ts');
const fx=await nativePostgresFixture();
const {manifest,units}=await replacementRollout();
const context=(tenant='a')=>({tenantId:tenant,affiliateId:`aff_${tenant}`,actor:'human',actorAppUserId:`user_${tenant}`,authenticatedAuthUserId:`auth_${tenant}`,membershipRole:'owner',requestId:'replacement-test'});
const results:any[]=[];
const run=async(name:string,fn:()=>Promise<void>)=>{await fn();results.push({name,result:'PASS'});console.log('PASS '+name);};
const apply=async(unit:any)=>{const started=performance.now();await fx.admin.begin(async(tx:any)=>{await tx.unsafe(unit.sql);});results.push({name:'apply '+unit.phase,result:'PASS',file:unit.file,sha256:unit.sha256,milliseconds:Math.round(performance.now()-started)});};
const policies=async()=>await fx.admin`select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='garimpa' order by tablename,policyname`;
const legacyRead=async()=>Number((await fx.clientA`select count(*)::int n from garimpa.product`)[0].n);
// Independent expectations from the original explicit GRANT statements. The
// observed schema default arwd is deliberately not an authority for new tables.
const mutableTables=['account_entitlement','account_invitation','audience_policy','campaign','campaign_link','campaign_publication','commercial_kit','conversion','conversion_attribution','destination','dispatch_attempt','dispatch_control','dispatch_job','dispatch_reservation','import_batch','import_row','onboarding_progress','opportunity','policy_experiment','price_evidence_policy_version'];
const appendOnlyTables=['account_lifecycle_event','analysis_assessment','audience_policy_version','commercial_kit_revision','commission_entry','comparison_review','domain_event','experiment_assignment','experiment_evaluation','governance_decision','kit_approval','kit_validation','operational_cost','price_calibration_run','private_artifact','saas_revenue_entry','usage_event'];
const defaultAcls=async()=>await fx.admin`select d.defaclrole::regrole::text owner,coalesce(n.nspname,'<global>') as schema,d.defaclobjtype::text kind,d.defaclacl::text acl
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname='garimpa'
 order by owner,schema,kind`;
const legacySecurity=async()=>await fx.admin`select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole::text owner,c.relacl::text acl
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and c.relkind in('r','p','v') order by c.relname`;
const assertNewPrivileges=async()=>{
 assert.deepEqual([...mutableTables,...appendOnlyTables].sort(),[...manifest.newCommercialTables].sort());
 const rows=await fx.admin`select c.relname name,p.privilege,has_table_privilege('garimpa_app',c.oid,p.privilege) allowed
  from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(privilege)
  where n.nspname='garimpa' and c.relname=any(${manifest.newCommercialTables}::text[]) order by c.relname,p.privilege`;
 assert.equal(rows.length,37*8);
 for(const row of rows)assert.equal(row.allowed,['SELECT','INSERT'].includes(row.privilege)||(row.privilege==='UPDATE'&&mutableTables.includes(row.name)),row.name+':'+row.privilege);
 const viewRights=await fx.admin`select p.privilege,has_table_privilege('garimpa_app','garimpa.effective_price_evidence_policy',p.privilege) allowed
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(privilege) order by p.privilege`;
 for(const row of viewRights)assert.equal(row.allowed,row.privilege==='SELECT','effective_price_evidence_policy:'+row.privilege);
 const columns=await fx.admin`select has_column_privilege('garimpa_app','garimpa.audience_policy_version','approved_by','UPDATE') approved_by,
  has_column_privilege('garimpa_app','garimpa.audience_policy_version','approved_at','UPDATE') approved_at,
  has_column_privilege('garimpa_app','garimpa.audience_policy_version','config','UPDATE') policy_body,
  has_column_privilege('garimpa_app','garimpa.private_artifact','status','UPDATE') artifact_status,
  has_column_privilege('garimpa_app','garimpa.private_artifact','sha256','UPDATE') artifact_digest,
  has_column_privilege('garimpa_app','garimpa.private_artifact','object_path','UPDATE') artifact_path`;
 assert.deepEqual({...columns[0]},{approved_by:true,approved_at:true,policy_body:false,artifact_status:true,artifact_digest:false,artifact_path:false});
};
let error:any;
try {
 for(const unit of units.filter(x=>x.phase==='installedSubset'))await apply(unit);
 const baselineDefaults=await defaultAcls(),baselineSecurity=await legacySecurity();
 await run('S0: observed arwd schema default, FORCE RLS and legacy service grants are faithfully reconstructed',async()=>{
  const rights=await fx.admin`select x.privilege_type from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
   cross join lateral aclexplode(d.defaclacl) x where n.nspname='garimpa' and d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and x.grantee='garimpa_app'::regrole order by x.privilege_type`;
  assert.deepEqual(rights.map((r:any)=>r.privilege_type),['DELETE','INSERT','SELECT','UPDATE']);
  assert.equal(baselineSecurity.find((r:any)=>r.relname==='app_user_role')?.relforcerowsecurity,true);
  for(const table of ['capture_batch','triage_run'])assert.match(baselineSecurity.find((r:any)=>r.relname===table)?.acl??'',/service_role=arw\/postgres/);
 });
 await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','alpha','Alpha'),('aff_b','b','beta','Beta')`;
 await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a'),('user_b','b','auth_b'),('invite_user','b','auth_invite')`;
 await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner'),('aff_b','user_b','owner')`;
 await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado'),('user_b','afiliado')`;
 await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('p_a','a','mercadolivre','111','A','https://produto.mercadolivre.com.br/MLB-111/item',1000),('p_b','b','mercadolivre','222','B','https://example.test/b',2000)`;
 await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status) values('a','p_a','approved'),('b','p_b','approved')`;
 await fx.admin`insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status) values('pub_a','a','aff_a','p_a','web','alpha--ml-111','active')`;
 await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents) values('obs_a','a','p_a',1000)`;
 await fx.admin`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status) values('aff_a','mercadolivre','tag_alpha','tool_alpha','active')`;
 await fx.admin`insert into garimpa.favorite(tenant_id,user_id,product_id) values('a','user_a','p_a'),('b','user_b','p_b')`;
 await fx.admin`insert into garimpa.price_watch(tenant_id,user_id,product_id,baseline_price_cents,target_price_cents) values('a','user_a','p_a',1000,900)`;
 await fx.admin`insert into garimpa.affiliate_monitoring_policy(affiliate_id,marketplace,enabled) values('aff_a','shopee',true),('aff_b','shopee',true)`;
 await run('S0: legacy reads work; new backend denies an uninstalled rollout',async()=>{
  assert.equal(await legacyRead(),2);
  await assert.rejects(()=>withCommercialDb(context(),async()=>true,fx.factoryA),/commercial_rollout_not_ready/);
 });
 const foundation=units.find(x=>x.phase==='foundation')!,expansion=units.find(x=>x.phase==='expansion')!,cutover=units.find(x=>x.phase==='scoped_cutover')!;
 const beforeA=await policies();
 await run('A: unexpected schema default privileges abort before foundation and preserve the observed default',async()=>{
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
   await tx`alter default privileges for role postgres in schema garimpa grant truncate on tables to garimpa_app`;
   await tx.unsafe(foundation.sql);
  }),/rollout_default_privilege_inventory_mismatch/);
  assert.deepEqual(await defaultAcls(),baselineDefaults);
  assert.equal((await fx.admin`select exists(select 1 from pg_roles where rolname='garimpa_public_runtime') installed`)[0].installed,false);
 });
 await apply(foundation);
 await run('A: all pre-existing policies and legacy reads preserved, public surface remains unready',async()=>{
  const after=await policies();for(const p of beforeA)assert.deepEqual(after.find((q:any)=>p.tablename===q.tablename&&p.policyname===q.policyname),p);
  assert.equal(await legacyRead(),2);assert.equal(await publicProjectionReady(fx.factoryA),false);
  assert.equal((await fx.clientA`select garimpa.commercial_rollout_ready() ready`)[0].ready,false);
 });
 await run('A: runtime cannot enable the persisted switch by DML',async()=>{
  await assert.rejects(()=>fx.clientA`update garimpa.rollout_control set enabled=true`,(e:any)=>e.code==='42501');
 });
 await run('B: injected end failure rolls back all expansion DDL; exact candidate can resume',async()=>{
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{await tx.unsafe(expansion.sql);await tx`select 1/0`;}),(e:any)=>e.code==='22012');
  assert.equal((await fx.admin`select to_regclass('garimpa.campaign') is null missing`)[0].missing,true);
  assert.equal(await legacyRead(),2);
 });
 await run('B: missing original pairing hash uniqueness aborts atomically',async()=>{
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
   await tx`alter table garimpa.extension_device drop constraint extension_device_pairing_code_hash_key`;
   await tx.unsafe(expansion.sql);
  }),/extension_unique_hash_required/);
  assert.equal((await fx.admin`select to_regclass('garimpa.campaign') is null missing`)[0].missing,true);
 });
 await apply(expansion);
 const beforeC=await policies();
 await run('B: explicit new-table grants remove inherited arwd without changing legacy grants or defaults',async()=>{
  await assertNewPrivileges();assert.deepEqual(await defaultAcls(),baselineDefaults);
  const after=await legacySecurity();for(const row of baselineSecurity)assert.deepEqual(after.find((r:any)=>r.relname===row.relname),row);
 });
 await run('B: private helper EXECUTE grants remain isolated from public and API roles',async()=>{
  for(const signature of ['garimpa.monitoring_interest_counts(text)','garimpa.monitoring_account_state(text,text)','garimpa.monitoring_record_skip(text,text,text,text)','garimpa.exchange_extension_pairing(text,text,text)','garimpa.touch_extension_device(text)']){
   const [acl]=await fx.admin`select has_function_privilege('garimpa_app',${signature},'EXECUTE') app,
    has_function_privilege('garimpa_public_runtime',${signature},'EXECUTE') public_runtime,
    has_function_privilege('anon',${signature},'EXECUTE') anon,
    has_function_privilege('authenticated',${signature},'EXECUTE') authenticated`;
   assert.deepEqual({...acl},{app:true,public_runtime:false,anon:false,authenticated:false},signature);
  }
 });
 await run('B: legacy catalogue remains visible; complete public functions execute with monetization',async()=>{
  assert.equal(await legacyRead(),2);assert.equal(await publicProjectionReady(fx.factoryA),true);
  assert.ok(await publicDealDetail('alpha--ml-111',fx.factoryA));
  const target=await publicMonetizedTarget('alpha--ml-111',fx.factoryA);assert.ok(target);assert.match(target.url,/tag_alpha/);
 });
 await run('B: monitoring preserves its own aggregate interests while new commerce is disabled',async()=>{
  const result=await withMonitoringDb(fx.clientA,'a',async tx=>({decision:await monitoringScheduleDecision(tx,'a','shopee','schedule'),items:await loadMonitoringCandidates(tx,'a')}));
  assert.equal(result.decision.allowed,true);assert.equal(result.items.length,1);assert.equal(result.items[0].productId,'p_a');assert.equal(result.items[0].activeWatches,2);
 });
 await run('B: new backend, human review, raw SQL, invitation definer and enabling switch are blocked',async()=>{
  await assert.rejects(()=>createCampaignForAccount(context(),{name:'Denied',objective:'Synthetic',audience:'Synthetic',requestId:'denied'},fx.factoryA),/commercial_rollout_not_ready/);
  await assert.rejects(()=>withAccountDb(context(),(tx:any)=>recordHumanRubricReview(tx,{}),fx.factoryA),/commercial_rollout_not_ready/);
  await assert.rejects(()=>withAccountDb(context(),(tx:any)=>tx`insert into garimpa.campaign(tenant_id,name,objective,created_by) values('a','Denied','Synthetic','user_a')`,fx.factoryA),(e:any)=>e.code==='42501');
  await assert.rejects(()=>fx.clientA`select * from garimpa.accept_account_invitation('x','invite_user','auth_invite','synthetic@example.test')`,(e:any)=>e.code==='42501');
  await assert.rejects(()=>fx.admin`select * from garimpa.accept_account_invitation('x','invite_user','auth_invite','synthetic@example.test')`,/commercial_rollout_not_ready/);
  await assert.rejects(()=>fx.clientA`update garimpa.rollout_control set enabled=true`,(e:any)=>e.code==='42501');
 });
 await run('C: unexpected policy aborts before legacy removal and leaves gate closed',async()=>{
  await fx.admin`create policy synthetic_drift on garimpa.product for select to garimpa_app using(false)`;
  await assert.rejects(()=>apply(cutover),/rollout_policy_inventory_mismatch/);
  assert.equal(await legacyRead(),2);assert.equal((await fx.clientA`select garimpa.commercial_rollout_ready() ready`)[0].ready,false);
  await fx.admin`drop policy synthetic_drift on garimpa.product`;
 });
 await run('C: unexpected role privilege aborts, without erasing any policy',async()=>{
  await fx.admin`grant select on garimpa.product to garimpa_public_runtime`;
  assert.equal(await publicProjectionReady(fx.factoryA),false);
  await assert.rejects(()=>apply(cutover),/public_runtime_private_privilege/);
  assert.deepEqual(await policies(),beforeC);
  await fx.admin`revoke select on garimpa.product from garimpa_public_runtime`;
  assert.equal(await publicProjectionReady(fx.factoryA),true);
 });
 await run('C: column-only grant cannot bypass gate protection or public data isolation',async()=>{
  await fx.admin`grant update(enabled) on garimpa.rollout_control to garimpa_app`;
  await assert.rejects(()=>apply(cutover),/runtime_can_enable_rollout/);
  await fx.admin`revoke update(enabled) on garimpa.rollout_control from garimpa_app`;
  await fx.admin`grant select(title) on garimpa.product to garimpa_public_runtime`;
  assert.equal(await publicProjectionReady(fx.factoryA),false);
  await assert.rejects(()=>apply(cutover),/public_runtime_private_privilege/);
  await fx.admin`revoke select(title) on garimpa.product from garimpa_public_runtime`;
  assert.deepEqual(await policies(),beforeC);
 });
 await run('C: unexpected private column UPDATE aborts before cutover and preserves the closed gate',async()=>{
  const sentinel=new Error('restore_synthetic_column_grant');
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
   await tx`grant update(sha256) on garimpa.private_artifact to garimpa_app`;
   await assert.rejects(()=>tx.savepoint(async(sp:any)=>{await sp.unsafe(cutover.sql);}),/rollout_column_privilege_inventory_mismatch/);
   assert.equal((await tx`select garimpa.commercial_rollout_ready() ready`)[0].ready,false);
   throw sentinel;
  }),(e:any)=>e===sentinel);
  assert.deepEqual(await policies(),beforeC);
 });
 await run('C: private view grants and canonical view definition/options drift abort before cutover',async()=>{
  await fx.admin`create view garimpa.synthetic_private_leak as select id from garimpa.product`;
  await fx.admin`grant select on garimpa.synthetic_private_leak to garimpa_public_runtime`;
  assert.equal(await publicProjectionReady(fx.factoryA),false);
  await assert.rejects(()=>apply(cutover),/public_runtime_private_privilege/);
  await fx.admin`drop view garimpa.synthetic_private_leak`;
  const [view]=await fx.admin`select pg_get_viewdef('garimpa.curation_queue_facts'::regclass,true) definition`;
  await fx.admin`alter view garimpa.curation_queue_facts set(security_invoker=false)`;
  await assert.rejects(()=>apply(cutover),/rollout_view_mismatch/);
  await fx.admin`alter view garimpa.curation_queue_facts set(security_invoker=true)`;
  await fx.admin.unsafe('create or replace view garimpa.curation_queue_facts with(security_invoker=true) as select * from ('+view.definition.trim().replace(/;$/,'')+') original where false');
  await assert.rejects(()=>apply(cutover),/rollout_view_mismatch/);
  await fx.admin.unsafe('create or replace view garimpa.curation_queue_facts with(security_invoker=true) as '+view.definition);
  assert.deepEqual(await policies(),beforeC);
 });
 await run('C: complete function definition and overload inventory are sealed',async()=>{
  assert.ok(await publicDealDetail('alpha--ml-111',fx.factoryA));
  await fx.admin`alter function garimpa.public_offer_rows(text) strict`;
  assert.equal(await publicDealDetail('alpha--ml-111',fx.factoryA),null);
  await assert.rejects(()=>apply(cutover),/rollout_function_mismatch/);
  await fx.admin`alter function garimpa.public_offer_rows(text) called on null input`;
  assert.ok(await publicDealDetail('alpha--ml-111',fx.factoryA));
  await fx.admin.unsafe("create function garimpa.public_offer_rows(integer) returns text language sql immutable as $$select 'synthetic'::text$$");
  await assert.rejects(()=>apply(cutover),/rollout_function_inventory_mismatch/);
  await fx.admin`drop function garimpa.public_offer_rows(integer)`;
 });
 await run('C: public runtime requires effective SET ROLE and schema USAGE, not just membership',async()=>{
  await fx.admin`grant garimpa_public_runtime to garimpa_app with set false`;
  assert.equal(await publicProjectionReady(fx.factoryA),false);
  await assert.rejects(()=>fx.clientA.begin(async(tx:any)=>{await tx`set local role garimpa_public_runtime`;}),(e:any)=>e.code==='42501');
  await assert.rejects(()=>apply(cutover),/missing_public_role_set/);
  await fx.admin`grant garimpa_public_runtime to garimpa_app with set true`;
  await fx.admin`revoke usage on schema garimpa from garimpa_public_runtime`;
  assert.equal(await publicProjectionReady(fx.factoryA),false);
  await assert.rejects(()=>apply(cutover),/missing_public_schema_usage/);
  await fx.admin`grant usage on schema garimpa to garimpa_public_runtime`;
  assert.equal(await publicProjectionReady(fx.factoryA),true);
 });
 await run('C: inherited privileged role cannot bypass the private runtime boundary',async()=>{
  await fx.admin`grant postgres to garimpa_app`;
  await assert.rejects(()=>apply(cutover),/unexpected_runtime_role_membership|runtime_can_enable_rollout/);
  await fx.admin`revoke postgres from garimpa_app`;
  assert.deepEqual(await policies(),beforeC);
 });
 await run('C: missing administrative singleton, RLS flags, FK and trigger drift abort before mutation',async()=>{
  await fx.admin`delete from garimpa.rollout_control where id='bizuminer-v2'`;
  await assert.rejects(()=>apply(cutover),/rollout_gate_must_be_closed/);
  await fx.admin`insert into garimpa.rollout_control(id,enabled) values('bizuminer-v2',false)`;
  await fx.admin`alter table garimpa.product disable row level security`;
  await assert.rejects(()=>apply(cutover),/rollout_table_security_mismatch/);
  await fx.admin`alter table garimpa.product enable row level security`;
  await fx.admin`alter table garimpa.product disable trigger trg_prevent_tenant_mutation`;
  await assert.rejects(()=>apply(cutover),/rollout_trigger_mismatch/);
  await fx.admin`alter table garimpa.product enable trigger trg_prevent_tenant_mutation`;
  const sentinel=new Error('restore_synthetic_fk_drift');
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
   await tx`alter table garimpa.dispatch_attempt drop constraint dispatch_attempt_job_tenant_fkey`;
   await assert.rejects(()=>tx.savepoint(async(sp:any)=>{await sp.unsafe(cutover.sql);}),/rollout_constraint_mismatch|rollout_foreign_key_inventory_mismatch/);
   throw sentinel;
  }),(e:any)=>e===sentinel);
  assert.deepEqual(await policies(),beforeC);
 });
 await run('C: original token uniqueness cannot be dropped between expansion and cutover',async()=>{
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
   await tx`alter table garimpa.extension_device drop constraint extension_device_token_hash_key`;
   await tx.unsafe(cutover.sql);
  }),/extension_unique_hash_required/);
  assert.deepEqual(await policies(),beforeC);
 });
 await apply(cutover);
 await run('C: normalized privileges survive activation while real legacy grants and defaults remain intact',async()=>{
  await assertNewPrivileges();assert.deepEqual(await defaultAcls(),baselineDefaults);
  const after=await legacySecurity();for(const row of baselineSecurity)assert.deepEqual(after.find((r:any)=>r.relname===row.relname),row);
 });
 await run('C: event ledgers and frozen policy/artifact content cannot be rewritten or deleted through inherited privileges',async()=>{
  await withAccountDb(context(),async(tx:any)=>{
   await tx`insert into garimpa.domain_event(id,tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload)
    values('acl-event','a','acl','acl',1,'AclCounterproof','user_a','acl-event','acl-event','{}')`;
   await tx`insert into garimpa.usage_event(tenant_id,operation,idempotency_key,quantity) values('a','acl-counterproof','acl-usage',1)`;
   await tx`insert into garimpa.audience_policy(id,tenant_id,name) values('acl-policy','a','Synthetic ACL policy')`;
   await tx`insert into garimpa.audience_policy_version(id,policy_id,tenant_id,version,config) values('acl-version','acl-policy','a','synthetic','{}')`;
  },fx.factoryA);
  const denied=(work:any)=>assert.rejects(()=>withAccountDb(context(),work,fx.factoryA),(e:any)=>e.code==='42501');
  await denied((tx:any)=>tx`update garimpa.domain_event set payload='{"rewritten":true}' where id='acl-event'`);
  await denied((tx:any)=>tx`delete from garimpa.domain_event where id='acl-event'`);
  await denied((tx:any)=>tx`update garimpa.usage_event set quantity=999 where idempotency_key='acl-usage'`);
  await denied((tx:any)=>tx`delete from garimpa.usage_event where idempotency_key='acl-usage'`);
  await denied((tx:any)=>tx`update garimpa.audience_policy_version set config='{"rewritten":true}' where id='acl-version'`);
  await denied((tx:any)=>tx`delete from garimpa.audience_policy_version where id='acl-version'`);
  await denied((tx:any)=>tx`update garimpa.private_artifact set sha256=repeat('a',64) where tenant_id='a'`);
  await denied((tx:any)=>tx`update garimpa.private_artifact set object_path='forged' where tenant_id='a'`);
  const approved=await withAccountDb(context(),(tx:any)=>tx`update garimpa.audience_policy_version set approved_by='user_a',approved_at=now() where id='acl-version' returning id`,fx.factoryA);
  assert.equal(approved.length,1);
  assert.deepEqual((await fx.admin`select payload from garimpa.domain_event where id='acl-event'`)[0].payload,{});
  assert.equal((await fx.admin`select quantity from garimpa.usage_event where idempotency_key='acl-usage'`)[0].quantity,1);
 });
 await run('C: only frozen legacy policies replaced; all specialized policies retained byte-for-value',async()=>{
  const after=await policies();for(const p of beforeC){
   if(manifest.legacyPoliciesReplaced.some((q:any)=>q.tablename===p.tablename&&q.policyname===p.policyname))continue;
   assert.deepEqual(after.find((q:any)=>q.tablename===p.tablename&&q.policyname===p.policyname),p);
  }
  assert.equal(await legacyRead(),0);assert.equal((await fx.clientA`select garimpa.commercial_rollout_ready() ready`)[0].ready,true);
  assert.ok(await publicDealDetail('alpha--ml-111',fx.factoryA));
 });
 await run('C: two real runtime sessions isolate A/B/A and leave no context after commit/rollback',async()=>{
  const [a]=await fx.clientA`select pg_backend_pid() pid,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
  const [b]=await fx.clientB`select pg_backend_pid() pid,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
  assert.notEqual(a.pid,b.pid);assert.equal(a.rolsuper,false);assert.equal(b.rolsuper,false);assert.equal(a.rolbypassrls,false);assert.equal(b.rolbypassrls,false);
  const rows=await Promise.all([withCommercialDb(context('a'),(tx:any)=>tx`select id from garimpa.product`,fx.factoryA),withCommercialDb(context('b'),(tx:any)=>tx`select id from garimpa.product`,fx.factoryB)]);
  assert.deepEqual(rows.map((r:any)=>r.map((x:any)=>x.id)),[['p_a'],['p_b']]);
  assert.deepEqual((await withCommercialDb(context('a'),(tx:any)=>tx`select id from garimpa.product`,fx.factoryA)).map((r:any)=>r.id),['p_a']);
  await assert.rejects(()=>withCommercialDb(context(),async()=>{throw new Error('rollback');},fx.factoryA),/rollback/);assert.equal(await legacyRead(),0);
 });
 await run('C: account transactions clear inherited platform authority',async()=>{
  await fx.clientA`select set_config('garimpa.platform_role','platform_admin',false)`;
  try {
   await withAccountDb(context(),async(tx:any)=>{
    assert.equal((await tx`select current_setting('garimpa.platform_role',true) value`)[0].value,'');
    assert.equal((await tx`select * from garimpa.affiliate_account where tenant_id='b'`).length,0);
   },fx.factoryA);
  }finally{await fx.clientA`select set_config('garimpa.platform_role','',false)`;}
 });
 await run('C: operator still cannot approve governance and platform can reactivate suspended account',async()=>{
  await assert.rejects(()=>fx.clientA.begin(async(tx:any)=>{
   await tx`select set_config('garimpa.tenant_id','a',true),set_config('garimpa.membership_role','operator',true)`;
   await tx`insert into garimpa.governance_decision(tenant_id,kind,subject_version,method,evidence_ids,approved_by,rationale) values('a','rubric','synthetic','{}','[]','user_a','Native security test')`;
  }),(e:any)=>e.code==='42501');
  await fx.admin`update garimpa.affiliate_account set status='suspended' where id='aff_a'`;
  await assert.rejects(()=>withCommercialDb(context(),async()=>true,fx.factoryA),/forbidden/);
  const rows=await fx.clientA.begin(async(tx:any)=>{await tx`select set_config('garimpa.platform_role','platform_admin',true)`;return tx`update garimpa.affiliate_account set status='active' where id='aff_a' returning id`;});
  assert.equal(rows.length,1);assert.equal((await fx.admin`select status from garimpa.affiliate_account where id='aff_a'`)[0].status,'active');
 });
 await run('C: real monitoring workers keep own counts without owner identity or raw buyer access',async()=>{
  await withMonitoringDb(fx.clientA,'a',async tx=>{
   const [actor]=await tx`select current_setting('garimpa.actor_type') actor,current_setting('garimpa.membership_role') member,current_setting('garimpa.actor_app_user_id') buyer`;
   assert.equal(actor.actor,'worker');assert.equal(actor.member,'');assert.equal(actor.buyer,'');
   assert.equal((await tx`select * from garimpa.favorite`).length,0);
   const decision=await monitoringScheduleDecision(tx,'a','shopee','schedule');assert.equal(decision.allowed,true);
   const items=await loadMonitoringCandidates(tx,'a');assert.equal(items.length,1);assert.equal(items[0].productId,'p_a');assert.equal(items[0].activeWatches,2);
  });
  await assert.rejects(()=>withMonitoringDb(fx.clientA,'a',tx=>tx`select * from garimpa.monitoring_interest_counts('b')`),/monitoring_worker_scope_required/);
  await assert.rejects(()=>withAccountDb(context(),(tx:any)=>tx`select * from garimpa.monitoring_interest_counts('a')`,fx.factoryA),/monitoring_worker_scope_required/);
  assert.equal(await legacyRead(),0);
 });
 await run('C: monitoring skips use checked reasons, account scope and idempotent writes, including suspension',async()=>{
  await assert.rejects(()=>withMonitoringDb(fx.clientA,'a',tx=>recordMonitoringSkip(tx,'aff_a','shopee','invalid-enabled','policy_disabled')),/monitoring_skip_reason_mismatch/);
  await assert.rejects(()=>withMonitoringDb(fx.clientA,'a',tx=>recordMonitoringSkip(tx,'aff_b','shopee','invalid-cross','policy_disabled')),/monitoring_affiliate_scope_mismatch/);
  await fx.admin`update garimpa.affiliate_monitoring_policy set enabled=false where affiliate_id='aff_a' and marketplace='shopee'`;
  await withMonitoringDb(fx.clientA,'a',async tx=>{
   const decision=await monitoringScheduleDecision(tx,'a','shopee','schedule');assert.equal(decision.reason,'policy_disabled');assert.equal(decision.affiliateId,'aff_a');
   await recordMonitoringSkip(tx,'aff_a','shopee','disabled-run','policy_disabled');await recordMonitoringSkip(tx,'aff_a','shopee','disabled-run','policy_disabled');
  });
  await fx.admin`update garimpa.affiliate_account set status='suspended' where id='aff_a'`;
  await withMonitoringDb(fx.clientA,'a',async tx=>{
   const decision=await monitoringScheduleDecision(tx,'a','shopee','schedule');assert.equal(decision.reason,'account_suspended');assert.equal(decision.affiliateId,'aff_a');
   await recordMonitoringSkip(tx,'aff_a','shopee','suspended-run','account_suspended');
  });
  assert.deepEqual(await withMonitoringDb(fx.clientA,'a',tx=>loadMonitoringCandidates(tx,'a')),[]);
  await assert.rejects(()=>withMonitoringDb(fx.clientA,'a',tx=>tx`select * from garimpa.monitoring_interest_counts('a')`),/monitoring_account_unavailable/);
  assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.affiliate_monitoring_skip where affiliate_id='aff_a'`)[0].n),2);
  await fx.admin`update garimpa.affiliate_account set status='active' where id='aff_a'`;
  await fx.admin`update garimpa.affiliate_monitoring_policy set enabled=true where affiliate_id='aff_a' and marketplace='shopee'`;
 });
 await fx.admin`insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values('a','aff_a','synthetic','pilot',now()-interval '1 day','{"maxActiveCampaigns":1,"maxDailyKits":2,"allowedMarketplaces":["mercadolivre"]}','synthetic')`;
 await run('C: concurrent campaign creation admits exactly one last quota',async()=>{
  const r=await Promise.allSettled([createCampaignForAccount(context(),{name:'A1',objective:'Synthetic',audience:'Synthetic',requestId:'q1'},fx.factoryA),createCampaignForAccount(context(),{name:'A2',objective:'Synthetic',audience:'Synthetic',requestId:'q2'},fx.factoryB)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.match((r.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.message,/quota_exceeded/);
 });
 await fx.admin`insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by) values('a','aff_a','synthetic-invite','synthetic@example.test','operator',now()+interval '1 day','user_a')`;
 await run('C: one invitation accepts exactly once across independent sessions',async()=>{
  const claim=(sql:any)=>sql`select * from garimpa.accept_account_invitation('synthetic-invite','invite_user','auth_invite','synthetic@example.test')`;
  const r=await Promise.allSettled([claim(fx.clientA),claim(fx.clientB)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  assert.match((r.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.message,/invitation_already_used_or_disputed/);
 });
 await run('recovery disables new capabilities without reopening private data or breaking public offers',async()=>{
  await fx.admin`update garimpa.rollout_control set enabled=false where id='bizuminer-v2'`;
  await assert.rejects(()=>withCommercialDb(context(),async()=>true,fx.factoryA),/commercial_rollout_not_ready/);
  assert.equal(await legacyRead(),0);assert.ok(await publicDealDetail('alpha--ml-111',fx.factoryA));
 });
}catch(e:any){error={name:e.name,message:e.message};throw e;}
finally{await fx.close();await writeFile(new URL('../../docs/implementation/evidencias/execucao-31-replacement-native.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),engine:fx.version,environment:'disposable localhost PostgreSQL; synthetic data with observed defaults/grants/FORCE RLS; no Auth/Storage/Supavisor or published runtime proof',productionWrites:0,productionApproved:false,results,...(error?{error}:{})},null,2)+'\n');}
