import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const r=require('../../packages/web/lib/rubric-db.ts');
const g=require('../../packages/web/lib/governance-db.ts');
const {withCommercialDb}=require('../../packages/web/lib/commercial-rollout.ts');
const {calculateContentDigest}=require('../../packages/web/lib/commerce-contract.ts');
const {pg,factory}=await commercialFixture();
const context={tenantId:'a',affiliateId:'aff_a',actor:'human',actorAppUserId:'u_a',authenticatedAuthUserId:'auth_a',membershipRole:'owner',requestId:'ratify-test'};
const assessment={schemaVersion:2,quality:{level:'adequate',reason:'Synthetic'},value:{level:'adequate',reason:'Synthetic'},audience:{level:'adequate',reason:'Synthetic'},evidenceConfidence:{level:'strong',reason:'Synthetic'},factsUsed:[],inferences:[],unknowns:[],safetyFlags:[],policyVersion:'rubric-v2',evidenceDigest:'synthetic'};
try {
 await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values ('aff_a','a','rubric-a','A');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values ('u_a','a','auth_a'),('operator','a','auth_op');
 insert into garimpa.app_user_role(app_user_id,role) values ('u_a','afiliado'),('operator','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_a','owner'),('aff_a','operator','operator');`);
 const ids:string[]=[];
 for(let i=0;i<30;i++) {
  await pg.query(`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values($1,'a','shopee',$1,'Synthetic','https://example.invalid/p',10000)`,['p_'+i]);
  const result=await withCommercialDb(context,(tx:any)=>r.recordHumanRubricReview(tx,{tenantId:'a',productId:'p_'+i,humanAssessment:assessment,shadowResult:assessment,reviewedByAppUserId:'u_a'}),factory);
  ids.push(result.comparisonReviewId);
 }
 const input={tenantId:'a',rubricVersion:'rubric-v2',reviewIds:ids,approvedByAppUserId:'u_a',rationale:'Synthetic verification only',cohort:'synthetic',minUnits:30,minAgreementRate:0.9};
 const ratify=(value:any)=>withCommercialDb(context,(tx:any)=>r.ratifyRubricPolicy(tx,value),factory);
 for(const n of [1,29]) {
  await assert.rejects(()=>ratify({...input,reviewIds:ids.slice(0,n)}),/eligible_distinct_sample_required/);
  await assert.rejects(()=>g.ratifyRubric(context,{version:'rubric-v2',reviewIds:ids.slice(0,n),method:{cohort:input.cohort,minUnits:30,minAgreementRate:0.9,rationale:input.rationale}},factory),/eligible_distinct_sample_required/);
 }
 for(const minUnits of [1,29,51]) await assert.rejects(()=>ratify({...input,minUnits}),/approved_method_required/);
 await assert.rejects(()=>ratify({...input,reviewIds:[...ids,ids[0]]}),/eligible_distinct_sample_required/);
 await assert.rejects(()=>ratify({...input,approvedByAppUserId:'operator'}),/owner_membership_required/);
 await assert.rejects(()=>ratify({...input,tenantId:'other'}),/owner_membership_required/);
 const first=await ratify(input), second=await ratify({...input,reviewIds:[...ids].reverse()});
 const old=await g.ratifyRubric(context,{version:'rubric-v2',reviewIds:ids,method:{cohort:input.cohort,minUnits:30,minAgreementRate:0.9,rationale:input.rationale}},factory);
 assert.ok(old.id);assert.equal(first.sampleCount,30);assert.equal(second.status,'ratified');
 const decisions=(await pg.query(`select method,approved_by,subject_version from garimpa.governance_decision order by approved_at,id`)).rows as any[];
 assert.equal(decisions.length,3);
 assert.ok(decisions.every(d=>d.approved_by==='u_a' && d.subject_version==='rubric-v2' && d.method.criteriaDigest===calculateContentDigest(d.method.criteria)));
 assert.equal(new Set(decisions.map(d=>d.method.sampleDigest)).size,1);assert.equal(new Set(decisions.map(d=>d.method.criteriaDigest)).size,1);
 const events=(await pg.query("select count(*)::int as n from garimpa.domain_event where event_type='RubricPolicyRatified'")).rows[0] as any;assert.equal(events.n,3);
 await assert.rejects(()=>factory().begin(async(tx:any)=>{await tx`select set_config('garimpa.tenant_id','a',true)`;await tx`update garimpa.governance_decision set rationale='changed'`;}));
 console.log('PASS BUG-009: both entrypoints reject insufficient/duplicate/foreign samples and non-owner; 30 distinct reviews ratify with immutable criteria/sample digests and atomic events');
}finally{await pg.close();}
