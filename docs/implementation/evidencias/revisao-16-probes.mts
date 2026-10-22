/** Diagnóstico da revisão 16: SQL real isolado; assertions comprovam defeitos, não aceite. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { commercialFixture } from '../../../tools/editorial-tests/commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {withAccountDb}=require('../../../packages/web/lib/tenant-db.ts');
const {curationSummary}=require('../../../packages/web/lib/curation-db.ts');
const opp=require('../../../packages/web/lib/opportunity-db.ts');
const rubric=require('../../../packages/web/lib/rubric-db.ts');
const fin=require('../../../packages/web/lib/commercial-financial-db.ts');
const exp=require('../../../packages/web/lib/experiment-db.ts');
const onboard=require('../../../packages/web/lib/saas-onboarding-db.ts');
const {executeDispatchCycle}=require('../../../packages/web/lib/dispatch-worker.ts');
const {scheduleDispatchJob}=require('../../../packages/web/lib/dispatch-db.ts');
const {cancelDispatchJob}=require('../../../packages/web/lib/dispatch-db.ts');
const {pg,factory,applied}=await commercialFixture();
const ctx=(t:string)=>({tenantId:t,affiliateId:'aff_'+t,actor:'human',actorAppUserId:'u_'+t,authenticatedAuthUserId:'auth_'+t,membershipRole:'owner',requestId:'audit_'+t});
const asTenant=(t:string,fn:any)=>factory().begin(async(tx:any)=>{await tx`select set_config('garimpa.tenant_id',${t},true)`;return fn(tx);});
const results:any[]=[];
async function probe(name:string,fn:()=>Promise<any>){try{const observed=await fn();results.push({name,status:'defect_confirmed',observed});console.log('CONFIRMED '+name);}catch(e:any){results.push({name,status:'probe_error',error:String(e.message),code:e.code});console.log('PROBE_ERROR '+name+' '+e.message);}}
await pg.exec(`
 insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
 ('aff_a','a','audit-a','Audit A'),('aff_b','b','audit-b','Audit B'),('aff_local','local','audit-house','Audit House');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values ('u_a','a','auth_a'),('u_b','b','auth_b'),('u_new','a','auth_new');
 insert into garimpa.app_user_role(app_user_id,role) values ('u_a','afiliado'),('u_b','afiliado'),('u_new','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_a','owner'),('aff_b','u_b','owner');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
 ('p_a','a','mercadolivre','101','Audit product A','https://mercadolivre.com.br/a',10000),
 ('p_b','b','mercadolivre','102','Audit product B','https://mercadolivre.com.br/b',10000),
 ('p_house','local','mercadolivre','103','Audit house product','https://mercadolivre.com.br/house',10000);
 insert into garimpa.product_curation(tenant_id,product_id,status) values ('a','p_a','approved'),('b','p_b','pending'),('local','p_house','pending');
 insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values ('o_a','a','p_a',10000,'{}'),('o_b','b','p_b',10000,'{}'),('o_house','local','p_house',10000,'{}');
 insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,ends_at,limits,terms_ref) values
 ('a','aff_a','test','active','2026-01-01','2027-01-01','{"maxActiveCampaigns":10,"maxDailyKits":10}','test-only'),
 ('b','aff_b','test','active','2026-01-01','2027-01-01','{"maxActiveCampaigns":10,"maxDailyKits":10}','test-only');
 insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by) values
 ('a','aff_a','hash-a','synthetic-a@example.invalid','operator','2027-01-01','u_a'),
 ('b','aff_b','hash-b','synthetic-b@example.invalid','operator','2027-01-01','u_b');
`);
await probe('RLS_without_context_reads_invites_and_plans',async()=>{
 const observed=await factory().begin(async(tx:any)=>({
  context:await tx`select current_setting('garimpa.tenant_id',true) as tenant,current_setting('garimpa.membership_role',true) as membership`,
  invitations:await tx`select tenant_id,token_hash from garimpa.account_invitation order by tenant_id`,
  plans:await tx`select tenant_id,plan_version from garimpa.account_entitlement order by tenant_id`,
  updated:await tx`update garimpa.account_entitlement set terms_ref='audit_modified_without_context' returning tenant_id`
 }));
 assert.equal(observed.context[0].tenant,null);assert.equal(observed.invitations.length,2);assert.equal(observed.plans.length,2);assert.equal(observed.updated.length,2);return observed;
});
await probe('private_legacy_and_policy_mutation_without_membership',async()=>{
 await assert.rejects(()=>withAccountDb({...ctx('a'),tenantId:'b',affiliateId:'aff_b'},async()=>true,factory),/forbidden/);
 const policy=await asTenant('b',(tx:any)=>opp.createAudiencePolicy(tx,'b',{name:'Cross-account policy',status:'active'}));
 const house=await curationSummary('local',factory);
 assert.ok(policy.id);assert.equal(house.awaiting,1);
 return {authorizedAccountContextRefusesForgedB:true,policyInB:policy.id,houseSummaryWithoutActor:house};
});
await probe('legitimate_device_bootstraps_but_capture_guard_loses_actor_context',async()=>{
 await pg.exec(`insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values ('auditdev','aff_a','u_a','Synthetic device','audit-token-hash')`);
 const before=await factory()`select role_active from garimpa.authenticate_extension_device('audit-token-hash')`;
 const query=(tx:any)=>tx`select exists(select 1 from garimpa.extension_device d join garimpa.affiliate_account a on a.id=d.affiliate_id and a.status='active' join garimpa.affiliate_membership am on am.affiliate_id=d.affiliate_id and am.app_user_id=d.created_by_app_user_id join garimpa.app_user_role aur on aur.app_user_id=d.created_by_app_user_id and aur.role='afiliado'::garimpa.app_role and aur.revoked_at is null and am.revoked_at is null where d.id='auditdev' and d.revoked_at is null and d.affiliate_id='aff_a') as allowed`;
 const tenantOnly=await asTenant('a',query);
 const fullContext=await withAccountDb(ctx('a'),query,factory);
 assert.equal(before[0].role_active,true);assert.equal(tenantOnly[0].allowed,false);assert.equal(fullContext[0].allowed,true);
 return {bootstrapAllowed:true,captureGuardWithCurrentTenantOnlyWrapper:tenantOnly[0].allowed,positiveControlWithAuthorizedActor:fullContext[0].allowed,scope:'SQL exato da revalidacao; persistExtensionCapture HTTP nao chamado'};
});
const assessment={schemaVersion:2,quality:{level:'strong',reason:'Synthetic'},value:{level:'adequate',reason:'Synthetic'},audience:{level:'adequate',reason:'Synthetic'},evidenceConfidence:{level:'adequate',reason:'Synthetic'},factsUsed:['synthetic'],inferences:[],unknowns:[],safetyFlags:[],policyVersion:'audit-v1',evidenceDigest:'audit-digest',createdAt:'2026-10-14T00:00:00Z'};
await probe('human_review_without_AI_returns_success_without_saving',async()=>{
 const before:any=await pg.query(`select (select count(*)::int from garimpa.editorial_assessment) as human,(select count(*)::int from garimpa.comparison_review) as comparisons`);
 const response=await asTenant('a',(tx:any)=>rubric.recordHumanRubricReview(tx,{tenantId:'a',productId:'p_a',humanAssessment:assessment,reviewedByAppUserId:'u_a'}));
 const after:any=await pg.query(`select (select count(*)::int from garimpa.editorial_assessment) as human,(select count(*)::int from garimpa.comparison_review) as comparisons`);
 assert.equal(response.hasShadow,false);assert.deepEqual(before.rows,after.rows);return {response,before:before.rows,after:after.rows};
});
await asTenant('a',(tx:any)=>rubric.saveAnalysisAssessment(tx,{tenantId:'a',productId:'p_a',rubricVersion:'audit-v1',inputDigest:'audit-digest',result:assessment,modelVersion:'test',promptVersion:'test',mode:'shadow'}));
await probe('rubric_ratifies_thirty_replays_of_one_product_without_approval',async()=>{
 for(let i=0;i<30;i++) await asTenant('a',(tx:any)=>rubric.recordHumanRubricReview(tx,{tenantId:'a',productId:'p_a',humanAssessment:assessment,reviewedByAppUserId:'u_a'}));
 const metrics=await asTenant('a',(tx:any)=>rubric.getRubricPromotionMetrics(tx,'a'));
 const count=await pg.query(`select count(distinct product_id)::int as distinct_products from garimpa.comparison_review where tenant_id='a'`);
 assert.equal(metrics.status,'ratified');assert.equal(count.rows[0].distinct_products,1);return {metrics,distinctProducts:count.rows[0].distinct_products};
});
await probe('multi_membership_reviewer_rejected_by_home_tenant_FK',async()=>{
 await pg.exec(`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_b','operator')`);
 let failure:any;try{await asTenant('a',(tx:any)=>rubric.recordHumanRubricReview(tx,{tenantId:'a',productId:'p_a',humanAssessment:assessment,reviewedByAppUserId:'u_b'}));}catch(e:any){failure={code:e.code,constraint:e.constraint_name,message:e.message};}
 assert.equal(failure?.code,'23503');return failure;
});
const header='externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState';
const csv=(lines:string[])=>header+'\n'+lines.join('\n');
async function importFile(lines:string[]){const batch=await fin.createOrGetImportBatchPreview(ctx('a'),{marketplace:'shopee',csvContent:csv(lines)},factory);const committed=await fin.commitImportBatch(ctx('a'),{batchId:batch.batchId,expectedDigest:batch.preview.fileDigest},factory);return {batch,committed};}
await probe('import_suppresses_commission_adjustment',async()=>{
 const first=await importFile(['order-1,item-1,2026-10-14T10:00:00Z,10000,100,BRL,shopee,,confirmed,confirmed']);
 const correction=await importFile(['order-1,item-1,2026-10-14T10:00:00Z,10000,150,BRL,shopee,,confirmed,received']);
 const ledger:any=await pg.query(`select amount_cents::int,state,predecessor_id from garimpa.commission_entry where source_key='report:shopee:order-1:item-1'`);
 assert.equal(correction.committed.committedRowsCount,0);assert.equal(ledger.rows[0].amount_cents,100);assert.equal(ledger.rows[0].state,'confirmed');return {first:first.committed,correction:correction.committed,preview:correction.batch.preview.rowDecisions,ledger:ledger.rows};
});
await probe('ledger_key_still_collides_despite_fixed_digest',async()=>{
 const first=await importFile(['colon:a,b,2026-10-14T10:00:00Z,10000,100,BRL,shopee,,confirmed,confirmed']);
 const second=await importFile(['colon,a:b,2026-10-14T10:00:00Z,10000,250,BRL,shopee,,confirmed,confirmed']);
 assert.notEqual(first.batch.preview.canonicalDigest,second.batch.preview.canonicalDigest);assert.equal(second.committed.committedRowsCount,0);return {distinctDigests:true,first:first.committed,second:second.committed,decisions:second.batch.preview.rowDecisions};
});
await probe('overlapping_previews_duplicate_conversion_not_commission',async()=>{
 const line='overlap-order,overlap-item,2026-10-14T10:00:00Z,10000,100,BRL,shopee,,confirmed,confirmed';
 const p1=await fin.createOrGetImportBatchPreview(ctx('a'),{marketplace:'shopee',csvContent:csv([line])},factory);
 const p2=await fin.createOrGetImportBatchPreview(ctx('a'),{marketplace:'shopee',csvContent:csv([line,'other-order,other-item,2026-10-14T10:00:00Z,20000,200,BRL,shopee,,confirmed,confirmed'])},factory);
 await fin.commitImportBatch(ctx('a'),{batchId:p1.batchId,expectedDigest:p1.preview.fileDigest},factory);
 await fin.commitImportBatch(ctx('a'),{batchId:p2.batchId,expectedDigest:p2.preview.fileDigest},factory);
 const counts:any=await pg.query(`select (select count(*)::int from garimpa.conversion where external_order_id='overlap-order') as conversions,(select count(*)::int from garimpa.commission_entry where source_key='report:shopee:overlap-order:overlap-item') as commissions`);
 assert.equal(counts.rows[0].conversions,2);assert.equal(counts.rows[0].commissions,1);return counts.rows[0];
});
await probe('experiment_promotes_shadow_unpaired_sample_with_forged_approver',async()=>{
 const p=await asTenant('a',(tx:any)=>opp.createAudiencePolicy(tx,'a',{name:'Audit policy'}));
 await asTenant('a',(tx:any)=>opp.createAudiencePolicyVersion(tx,'a',{policyId:p.id,version:'base',config:{}}));
 const experiment=await exp.createPolicyExperiment(ctx('a'),{baselineVersion:'base',candidateVersion:'missing-candidate',hypothesis:'Audit',primaryMetric:'score',minSample:1,audiencePolicyId:p.id},factory);
 await exp.recordExperimentEvaluation(ctx('a'),{experimentId:experiment.experimentId,unitId:'unassigned',variant:'candidate',output:{}},factory);
 const before=await exp.getExperimentReport(ctx('a'),experiment.experimentId,factory);
 const promoted=await exp.promotePolicyExperiment(ctx('a'),{experimentId:experiment.experimentId,policyId:p.id,promotedBy:'invented-approver',promotionRationale:'No actual review'},factory);
 const after=await pg.query(`select current_version,(select count(*)::int from garimpa.audience_policy_version v where v.policy_id=garimpa.audience_policy.id and v.version='missing-candidate') as candidate_versions from garimpa.audience_policy where id='${p.id}'`);
 assert.equal(before.experiment.status,'shadow');assert.equal(promoted.promoted,true);assert.equal(after.rows[0].candidate_versions,0);return {beforeStatus:before.experiment.status,sample:before.totalSampleSize,missingScoreMetric:before.candidateMetric.value,promoted,currentPolicy:after.rows[0]};
});
await probe('onboarding_invitation_accepts_unverified_email_and_missing_identity',async()=>{
 const invitation=await onboard.createAccountInvitation(ctx('a'),{invitedEmail:'victim@example.invalid',role:'operator'},factory);
 const forgedContext={...ctx('a'),actorAppUserId:'u_new',authenticatedAuthUserId:null,membershipRole:null};
 const accepted=await onboard.acceptAccountInvitation(forgedContext,{rawToken:invitation.rawToken,invitedEmail:'victim@example.invalid'},factory);
 assert.equal(accepted.accepted,true);return {accepted,authenticatedAuthUserId:null,actorHasNoVerifiedRecipientEmail:true};
});
await probe('invite_acceptance_breaks_when_baseline_grant_is_faithful',async()=>{
 await pg.exec(`revoke insert,update,delete on garimpa.app_user_role from garimpa_app;`);
 const invitation=await onboard.createAccountInvitation(ctx('a'),{invitedEmail:'new@example.invalid',role:'operator'},factory);
 let failure:any;try{await onboard.acceptAccountInvitation({...ctx('a'),actorAppUserId:'u_new'}, {rawToken:invitation.rawToken,invitedEmail:'new@example.invalid'},factory);}catch(e:any){failure={code:e.code,message:e.message};}
 assert.equal(failure?.code,'42501');return {baselineSelectOnlyFromExistingMigration:true,fixtureHadBroaderGrant:true,failure};
});
await probe('onboarding_marks_credentials_complete_without_evidence',async()=>{
 await onboard.recordOnboardingProgress(ctx('a'),{step:'account_created',status:'completed'},factory);
 await onboard.recordOnboardingProgress(ctx('a'),{step:'marketplace_credentials_configured',status:'completed'},factory);
 const progress=await onboard.getOnboardingProgress(ctx('a'),factory);
 const count:any=await pg.query(`select count(*)::int as credentials from garimpa.affiliate_marketplace_config where affiliate_id='aff_a'`);
 assert.ok(progress.completedSteps.includes('marketplace_credentials_configured'));assert.equal(count.rows[0].credentials,0);return {progress,credentials:0};
});
await probe('suspension_does_not_revoke_private_reads_or_mark_account_suspended',async()=>{
 await pg.exec(`insert into garimpa.app_user_role(app_user_id,role) values ('u_a','platform_admin');`);
 await onboard.suspendAccountByPlatformAdmin(ctx('a'),{targetTenantId:'a',reason:'Synthetic suspension'},factory);
 const output=await withAccountDb(ctx('a'),async(tx:any)=>({
  accounts:await tx`select status from garimpa.affiliate_account where tenant_id='a'`,
  opportunities:await tx`select count(*)::int as count from garimpa.audience_policy where tenant_id='a'`,
  plans:await tx`select status from garimpa.account_entitlement where tenant_id='a'`
 }),factory);
 assert.equal(output.accounts[0].status,'active');assert.equal(output.plans[0].status,'suspended');assert.ok(output.opportunities[0].count>=1);
 await pg.exec(`update garimpa.account_entitlement set status='active' where tenant_id='a'`);
 return output;
});
await pg.exec(`
 insert into garimpa.audience_policy(id,tenant_id,name) values('dp','a','Dispatch policy');
 insert into garimpa.audience_policy_version(id,policy_id,tenant_id,version,config) values('dpv','dp','a','v1','{}');
 insert into garimpa.opportunity(id,tenant_id,product_id,policy_version_id,audience_key,channel,state,class,price_evidence_snapshot,valid_until) values('dopp','a','p_a','dpv','test','telegram_channel','prioritized','unclassified','{}','2027-01-01');
 insert into garimpa.campaign(id,tenant_id,name,objective,created_by) values('dc','a','Dispatch test','Audit','u_a');
 insert into garimpa.destination(id,tenant_id,channel,label,external_target_ref,automation_mode) values('dd','a','telegram_channel','Audit','authorized-test','assisted');
 insert into garimpa.commercial_kit(id,tenant_id,campaign_id,opportunity_id,status) values('dk','a','dc','dopp','approved');
 insert into garimpa.commercial_kit_revision(id,tenant_id,kit_id,revision,snapshot,claims,materials,created_by,content_digest) values('dkr','a','dk',1,'{}','[]','[]','u_a','digest');
 insert into garimpa.campaign_publication(id,tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,status,created_by) values('dpub','a','dc','dk','dkr','dd','telegram_channel','planned','u_a');
`);
await probe('dispatch_sends_synthetic_facts_and_hardcoded_link',async()=>{
 const job=await asTenant('a',(tx:any)=>scheduleDispatchJob(tx,{tenantId:'a',campaignPublicationId:'dpub',kitRevisionId:'dkr',destinationId:'dd',scheduledAt:new Date(Date.now()-1000).toISOString(),idempotencyKey:'audit-dispatch'}));
 let payload:any;
 const adapter={sendApprovedRevision:async(input:any)=>{payload=input;return {kind:'sent',providerMessageId:'synthetic-only',confirmedAt:new Date().toISOString()};}};
 const output=await asTenant('a',(tx:any)=>executeDispatchCycle(tx,ctx('a'),adapter,{workerToken:'audit-worker'}));
 assert.equal(output.status,'succeeded');assert.equal(payload.link,'https://garimpa.app/p/test');assert.equal(payload.text,'Oferta Especial');
 return {jobId:job.id,output,payload,missingSnapshotAndCampaignLink:true,adapterWasCalledInsideFixtureTransaction:true};
});
await probe('dispatch_ignores_lost_marker_after_controlled_cancel',async()=>{
 await pg.exec(`insert into garimpa.campaign_publication(id,tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,status,created_by) values('dpub2','a','dc','dk','dkr','dd','telegram_channel','planned','u_a')`);
 const job=await asTenant('a',(tx:any)=>scheduleDispatchJob(tx,{tenantId:'a',campaignPublicationId:'dpub2',kitRevisionId:'dkr',destinationId:'dd',scheduledAt:new Date(Date.now()-1000).toISOString(),idempotencyKey:'audit-dispatch-cancel'}));
 let called=0;let cancelled=false;
 const adapter={sendApprovedRevision:async()=>{called++;return {kind:'sent',providerMessageId:'synthetic-after-cancel'};}};
 const output=await asTenant('a',async(tx:any)=>{
  const intercept:any=async(parts:TemplateStringsArray,...values:any[])=>{
   if(parts.join('?').includes('set io_started_at = now()')&&!cancelled){
    cancelled=(await cancelDispatchJob(tx,'a',job.id)).cancelled;
   }
   return tx(parts,...values);
  };
  Object.assign(intercept,tx);
  return executeDispatchCycle(intercept,ctx('a'),adapter,{workerToken:'audit-cancel-worker'});
 });
 assert.equal(cancelled,true);assert.equal(called,1);return {cancelled,adapterCallsAfterCancellation:called,output,method:'Interleaving controlado com SQL real na mesma sessao; nao certifica concorrencia multi-sessao'};
});
await pg.close();
await writeFile(new URL('./revisao-16-contraexemplos.json',import.meta.url),JSON.stringify({date:'2026-10-14',environment:'PGlite SQL real isolado; nenhuma escrita remota',appliedMigrations:applied,results},null,2)+'\n');
if(results.some(r=>r.status==='probe_error')) process.exitCode=1;
