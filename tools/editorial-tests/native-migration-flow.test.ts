import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
const require=createRequire(import.meta.url);
const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
const {createCampaign}=require('../../packages/web/lib/commerce-db.ts');
const {reserveOperationQuota}=require('../../packages/web/lib/saas-entitlement-db.ts');
// Historical-chain diagnostic: exercise transactional DAL below the new rollout guard.
// The replacement suite separately exercises the guarded public service.
const createCampaignWithQuota=(context:any,input:any,factory:any)=>withAccountDb(context,async(tx:any)=>{
 await reserveOperationQuota(tx,context,'create_campaign',input.requestId);
 return createCampaign(tx,{tenantId:context.tenantId,name:input.name,objective:input.objective,createdBy:context.actorAppUserId});
},factory);
const fx=await nativePostgresFixture();
const evidence:any={at:new Date().toISOString(),engine:fx.version,target:'disposable-localhost',productionWrites:0,
  scope:'Original SQL chain only. Does not authorize production rollout or certify Supabase services.',checks:[],migrations:[]};
const context=(tenant:string)=>({tenantId:tenant,affiliateId:`aff_${tenant}`,actor:'human',actorAppUserId:`user_${tenant}`,
  authenticatedAuthUserId:`auth_${tenant}`,membershipRole:'owner',requestId:`native_${tenant}`});
const count=async(client:any)=>Number((await client`select count(*)::int n from garimpa.product`)[0].n);
async function check(name:string,fn:()=>Promise<void>){await fn();evidence.checks.push({name,result:'PASS'});console.log(`PASS ${name}`);}
try {
  assert.match(fx.version,/PostgreSQL\) 17\.6\b/);
  // Same installed subset as production, before the rejected isolation migration.
  const base=[fx.files[0],...fx.files.filter(f=>f.includes('affiliate_secret_bootstrap')||f.includes('curation_membership_author'))];
  const apply=async(file:string)=>{await fx.migrate(file);evidence.migrations.push({file,sha256:createHash('sha256').update(await readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`,import.meta.url))).digest('hex')});};
  for(const file of base)await apply(file);
  await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
    ('aff_a','a','alpha','Alpha'),('aff_b','b','beta','Beta')`;
  await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
    ('p_a','a','mercadolivre','a','A','https://example.test/a',1000),('p_b','b','mercadolivre','b','B','https://example.test/b',2000)`;
  await check('baseline preserves legacy no-context reads',async()=>assert.equal(await count(fx.clientA),2));
  const m2=fx.files.find(f=>f.includes('tenant_rls_scoped'))!;
  await apply(m2);
  await check('reproduced: M2-first empties legacy reads before public projections exist',async()=>{
    assert.equal(await count(fx.clientA),0);
    assert.equal((await fx.admin`select to_regprocedure('garimpa.public_catalog(text,jsonb)') is null missing`)[0].missing,true);
  });
  for(const file of fx.files.filter(f=>!base.includes(f)&&f!==m2))await apply(file);
  await check('full original chain executes on PostgreSQL 17.6',async()=>assert.equal(evidence.migrations.length,14));
  await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values
    ('user_a','a','auth_a'),('user_b','b','auth_b'),('invite_user','b','auth_invite')`;
  await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values
    ('aff_a','user_a','owner'),('aff_b','user_b','owner')`;
  await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado'),('user_b','afiliado')`;
  await check('two independent runtime sessions have no bypass privileges',async()=>{
    const [a]=await fx.clientA`select pg_backend_pid() pid,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    const [b]=await fx.clientB`select pg_backend_pid() pid,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    assert.notEqual(a.pid,b.pid);assert.equal(a.rolsuper,false);assert.equal(a.rolbypassrls,false);
    assert.equal(b.rolsuper,false);assert.equal(b.rolbypassrls,false);
  });
  await check('real account transactions isolate A/B/A and clear transaction-local context',async()=>{
    const rows=await Promise.all([
      withAccountDb(context('a'),(tx:any)=>tx`select id from garimpa.product`,fx.factoryA),
      withAccountDb(context('b'),(tx:any)=>tx`select id from garimpa.product`,fx.factoryB)]);
    assert.deepEqual(rows.map((r:any)=>r.map((p:any)=>p.id)),[['p_a'],['p_b']]);
    const again=await withAccountDb(context('a'),(tx:any)=>tx`select id from garimpa.product`,fx.factoryA);
    assert.deepEqual(again.map((p:any)=>p.id),['p_a']);assert.equal(await count(fx.clientA),0);assert.equal(await count(fx.clientB),0);
    await assert.rejects(()=>withAccountDb(context('a'),async()=>{throw new Error('synthetic_rollback');},fx.factoryA),/synthetic_rollback/);
    assert.equal(await count(fx.clientA),0);
  });
  await fx.admin`insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref)
    values('a','aff_a','native-test','pilot',now()-interval '1 day','{"maxActiveCampaigns":1,"maxDailyKits":2,"allowedMarketplaces":["mercadolivre"]}','synthetic-test')`;
  await check('concurrent campaign DAL admits only the last available quota',async()=>{
    const results=await Promise.allSettled([
      createCampaignWithQuota(context('a'),{name:'A1',objective:'Synthetic',audience:'Synthetic',requestId:'native-1'},fx.factoryA),
      createCampaignWithQuota(context('a'),{name:'A2',objective:'Synthetic',audience:'Synthetic',requestId:'native-2'},fx.factoryB)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
    assert.match(failure.reason.message,/quota_exceeded/);
    assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.campaign where tenant_id='a'`)[0].n),1);
    assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.usage_event where tenant_id='a' and operation='create_campaign'`)[0].n),1);
  });
  await fx.admin`insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by)
    values('a','aff_a','native-invite','synthetic@example.test','operator',now()+interval '1 day','user_a')`;
  await check('simultaneous invitation claims consume token once and grant one membership/event',async()=>{
    const claim=(sql:any)=>sql`select * from garimpa.accept_account_invitation('native-invite','invite_user','auth_invite','synthetic@example.test')`;
    const result=await Promise.allSettled([claim(fx.clientA),claim(fx.clientB)]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.match((result.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message,/invitation_already_used_or_disputed/);
    assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.affiliate_membership where affiliate_id='aff_a' and app_user_id='invite_user'`)[0].n),1);
    assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.account_lifecycle_event where event_type='invitation_accepted'`)[0].n),1);
  });
  await check('lock timeout rolls back the whole transaction and leaves no inserted row/context',async()=>{
    const blocker=await fx.admin.reserve();
    try {
      await blocker`begin`;await blocker`select pg_advisory_xact_lock(260015)`;
      await assert.rejects(()=>fx.clientB.begin(async(tx:any)=>{
        await tx`set local lock_timeout='100ms'`;
        await tx`select set_config('garimpa.tenant_id','a',true)`;
        await tx`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents)
          values('rollback_row','a','mercadolivre','rollback','Synthetic','https://example.test/rollback',1000)`;
        await tx`select pg_advisory_xact_lock(260015)`;
      }), (error:any)=>error.code==='55P03');
    } finally {await blocker`rollback`;blocker.release();}
    assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.product where id='rollback_row'`)[0].n),0);
    assert.equal(await count(fx.clientB),0);
  });
  const governanceInsert=`insert into garimpa.governance_decision(tenant_id,kind,subject_version,method,evidence_ids,approved_by,rationale)
    values('a','rubric','synthetic','{}','[]','user_a','Native security test')`;
  await check('operator cannot insert owner-only governance with the original final policies',async()=>{
    await assert.rejects(()=>fx.clientA.begin(async(tx:any)=>{
      await tx`select set_config('garimpa.tenant_id','a',true),set_config('garimpa.membership_role','operator',true)`;
      await tx.unsafe(governanceInsert);
    }),(error:any)=>error.code==='42501');
  });
  await check('reproduced: late M2 removes owner protection and blocks platform reactivation; rollback restores policies',async()=>{
    const before=await fx.admin`select tablename,policyname,permissive,cmd,roles,qual,with_check from pg_policies where schemaname='garimpa' order by tablename,policyname`;
    const content=await readFile(new URL(`../../packages/persistence/supabase/migrations/${m2}`,import.meta.url),'utf8');
    const sentinel=new Error('rollback_rejected_candidate');
    await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
      await tx.unsafe(content);
      assert.equal((await tx`select count(*)::int n from pg_policies where schemaname='garimpa' and tablename='governance_decision' and policyname='owner_write'`)[0].n,0);
      await tx`set local role garimpa_app`;
      await tx`select set_config('garimpa.tenant_id','a',true),set_config('garimpa.membership_role','operator',true)`;
      await tx.unsafe(governanceInsert); // Incorrectly allowed after late M2; synthetic transaction is rolled back.
      await tx`reset role`;
      await tx`update garimpa.affiliate_account set status='suspended' where id='aff_a'`;
      await tx`set local role garimpa_app`;
      await tx`select set_config('garimpa.platform_role','platform_admin',true)`;
      const rows=await tx`update garimpa.affiliate_account set status='active' where id='aff_a' returning id`;
      assert.equal(rows.length,0);
      throw sentinel;
    }),(error:any)=>error===sentinel);
    const after=await fx.admin`select tablename,policyname,permissive,cmd,roles,qual,with_check from pg_policies where schemaname='garimpa' order by tablename,policyname`;
    assert.deepEqual(after,before);
    assert.equal(Number((await fx.admin`select count(*)::int n from garimpa.governance_decision`)[0].n),0);
    assert.equal((await fx.admin`select status from garimpa.affiliate_account where id='aff_a'`)[0].status,'active');
  });

} catch(error:any) {
  evidence.error={name:error.name,message:error.message};throw error;
} finally {
  await fx.close();
  await writeFile(new URL('../../docs/implementation/evidencias/execucao-27-legacy-native.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
}
