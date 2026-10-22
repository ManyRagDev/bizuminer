import assert from 'node:assert/strict';
import {commercialFixture} from './commercial-fixture.ts';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {getEditorialSelectionDesk,saveEditorialAssessment,replaceEditorialSelection}=require('../../packages/web/lib/editorial-selection-db.ts');
const {EDITORIAL_DIMENSIONS}=require('../../packages/web/lib/editorial-selection.ts');
process.env.DATABASE_URL='postgresql://localhost:1/isolated-unused';

const {pg,factory}=await commercialFixture();
const scope=async(tx:any,tenant='a',platform='')=>{
  await tx`select set_config('garimpa.tenant_id',${tenant},true),
    set_config('garimpa.membership_role','owner',true),
    set_config('garimpa.platform_role',${platform},true)`;
};
const fkError=(error:any)=>error.code==='23503';
try {
  await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
    ('aff_a','a','alpha','A'),('aff_b','b','bravo','B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a'),('cross_home','b','auth_cross');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','cross_home','operator');
    insert into garimpa.app_user_role(app_user_id,role) values('cross_home','afiliado');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
    ('p_a','a','mercadolivre','1','A','https://example.test/a',1000);
    insert into garimpa.product_curation(tenant_id,product_id,status) values('a','p_a','pending');`);

  const malformed=[
    `insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by)
      values('a','aff_b','forged','test@example.test','owner',now()+interval '1 day','user_a')`,
    `insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,terms_ref)
      values('a','aff_b','synthetic','pilot',now(),'synthetic')`,
    `insert into garimpa.onboarding_progress(tenant_id,affiliate_id,step,status) values('a','aff_b','test','pending')`,
    `insert into garimpa.account_lifecycle_event(tenant_id,affiliate_id,event_type,actor_app_user_id)
      values('a','aff_b','synthetic','user_a')`
  ];
  for(const query of malformed){
    await assert.rejects(()=>factory().begin(async(tx:any)=>{await scope(tx,'a','platform_admin');await tx.unsafe(query);}),fkError);
  }
  assert.equal((await pg.query(`select count(*)::int n from garimpa.affiliate_membership where affiliate_id='aff_b' and app_user_id='user_a'`)).rows[0].n,0);
  console.log('PASS four SaaS child tables reject mismatched account/tenant, even for platform writer');

  await factory().begin(async(tx:any)=>{
    await scope(tx);
    await tx`insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by)
      values('a','aff_a','valid','test@example.test','operator',now()+interval '1 day','user_a')`;
    await tx`insert into garimpa.onboarding_progress(tenant_id,affiliate_id,step,status) values('a','aff_a','test','pending')`;
  });
  await pg.exec(`update garimpa.affiliate_account set status='suspended' where id='aff_a'`);
  await assert.rejects(()=>factory()`select * from garimpa.accept_account_invitation('valid','user_a','auth_a','test@example.test')`,/invitation_account_unavailable/);
  assert.equal((await pg.query(`select used_at from garimpa.account_invitation where token_hash='valid'`)).rows[0].used_at,null);
  assert.equal((await pg.query(`select count(*)::int n from garimpa.affiliate_membership where app_user_id='user_a'`)).rows[0].n,0);
  await pg.exec(`update garimpa.affiliate_account set status='active' where id='aff_a'`);
  console.log('PASS suspended account invitation fails atomically without consuming token or granting membership');

  await factory().begin(async(tx:any)=>{
    await scope(tx);
    await tx`select set_config('garimpa.actor_app_user_id','cross_home',true)`;
    const rows=await tx`select * from garimpa.resolve_actor_accounts('auth_cross') where affiliate_id='aff_a'`;
    assert.equal(rows.length,1);
    await tx`update garimpa.product_curation set reviewed_by_app_user_id='cross_home',reviewed_at=now(),status='approved'
      where tenant_id='a' and product_id='p_a'`;
  });
  assert.equal((await pg.query(`select reviewed_by_app_user_id from garimpa.product_curation where product_id='p_a'`)).rows[0].reviewed_by_app_user_id,'cross_home');
  await assert.rejects(()=>pg.exec(`update garimpa.product_curation set reviewed_by_app_user_id='nonexistent' where product_id='p_a'`),fkError);
  console.log('PASS cross-home membership can review; nonexistent reviewer still rejected');

  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence)
    values('o_a','a','p_a',1000,$1)`,[JSON.stringify({version:1,variantKey:'unit',packageQuantity:1})]);
  const desk=await getEditorialSelectionDesk('a',factory);
  const assessmentInput={productId:'p_a',evidenceFingerprint:desk.candidates[0].evidenceFingerprint,
    dimensions:Object.fromEntries(EDITORIAL_DIMENSIONS.map(({id}:any)=>[id,{level:'adequate',reason:'Conferido manualmente no anúncio.'}])),
    audience:'Pessoas procurando organização.',benefit:'Organizar a casa com praticidade.',purchaseContents:'Uma unidade do produto.',
    publicRationale:'Uma opção para organizar a casa.',criticalDoubts:[],maxPriceCents:1500};
  const assessment=await saveEditorialAssessment(assessmentInput,'cross_home','a',factory);
  assert.equal(assessment.ok,true,JSON.stringify(assessment));
  const editionInput={expectedVersion:null,validUntil:new Date(Date.now()+86400000).toISOString(),items:[]};
  const edition=await replaceEditorialSelection(editionInput,'cross_home','a',factory);
  assert.equal(edition.ok,true,JSON.stringify(edition));
  await pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='cross_home'`);
  assert.equal((await saveEditorialAssessment(assessmentInput,'cross_home','a',factory)).error,'forbidden');
  assert.equal((await replaceEditorialSelection({...editionInput,expectedVersion:1},'cross_home','a',factory)).error,'forbidden');
  console.log('PASS actual editorial assessment/edition services accept cross-home member and reject revoked membership');

  // Use catalogue constraints to avoid inventing a kit revision payload here;
  // the dispatch worker suite exercises positive job/attempt persistence.
  const fks=(await pg.query(`select pg_get_constraintdef(oid) definition from pg_constraint
    where conrelid='garimpa.dispatch_attempt'::regclass and conname='dispatch_attempt_job_tenant_fkey'`)).rows;
  assert.match(fks[0].definition,/FOREIGN KEY \(job_id, tenant_id\).*\(id, tenant_id\)/);
  console.log('PASS dispatch attempt carries composite job/tenant foreign key');
  await pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/20261015040727_garimpa_curation_membership_author.sql',import.meta.url),'utf8'));
  assert.equal((await pg.query(`select count(*)::int n from pg_constraint where conrelid in
    ('garimpa.product_curation'::regclass,'garimpa.editorial_selection'::regclass)
    and conname in ('product_curation_reviewer_user_fkey','editorial_selection_actor_user_fkey') and convalidated`)).rows[0].n,2);
  console.log('PASS supplemental author migration can be retried without removing validated author constraints');
} finally {await pg.close();}
