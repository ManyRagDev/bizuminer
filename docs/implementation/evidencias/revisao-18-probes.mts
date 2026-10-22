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
async function probe(name:string,fn:()=>Promise<any>){try{const observed=await fn();results.push({name,status:'behavior_confirmed',observed});console.log('CONFIRMED '+name);}catch(e:any){results.push({name,status:'probe_error',error:String(e.message),code:e.code});console.log('PROBE_ERROR '+name+' '+e.message);}}
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
// Corpo de diagnóstico; montado com a fixture/seed sintética da revisão 16.
await probe('positive_no_context_invites_entitlements_denied',async()=>{
 const r=await factory().begin(async(tx:any)=>({invites:await tx`select id from garimpa.account_invitation`,plans:await tx`select id from garimpa.account_entitlement`,updates:await tx`update garimpa.account_entitlement set terms_ref='forbidden' returning id`}));
 assert.equal(r.invites.length,0);assert.equal(r.plans.length,0);assert.equal(r.updates.length,0);return {read:0,updated:0};
});
const assessment={schemaVersion:2,quality:{level:'strong',reason:'Synthetic'},value:{level:'adequate',reason:'Synthetic'},audience:{level:'adequate',reason:'Synthetic'},evidenceConfidence:{level:'adequate',reason:'Synthetic'},factsUsed:['synthetic'],inferences:[],unknowns:[],safetyFlags:[],policyVersion:'audit-v1',evidenceDigest:'audit-digest',createdAt:'2026-10-14T00:00:00Z'};
await probe('human_v2_persisted_but_legacy_consumer_rejects',async()=>{
 const saved=await asTenant('a',(tx:any)=>rubric.recordHumanRubricReview(tx,{tenantId:'a',productId:'p_a',humanAssessment:assessment,reviewedByAppUserId:'u_a'}));
 const rows:any=await pg.query(`select assessment from garimpa.editorial_assessment where id='${saved.editorialAssessmentId}'`);
 const {validateEditorialAssessment}=require('../../../packages/web/lib/editorial-selection.ts');
 const {getEditorialSelectionDesk}=require('../../../packages/web/lib/editorial-selection-db.ts');
 const desk=await getEditorialSelectionDesk('a',factory);
 assert.ok(desk.candidates[0]?.selectionBlockers.includes('Avaliação incompleta ou inválida.'));
 const validation=validateEditorialAssessment(rows.rows[0].assessment,true);
 assert.equal(saved.saved,true);assert.equal(rows.rows[0].assessment.schemaVersion,2);assert.equal(validation.ok,false);
 return {saved,legacyConsumerValidation:validation,actualDeskBlockers:desk.candidates[0].selectionBlockers};
});
await probe('rubric_thirty_replays_still_ratify',async()=>{
 await asTenant('a',(tx:any)=>rubric.saveAnalysisAssessment(tx,{tenantId:'a',productId:'p_a',rubricVersion:'audit-v1',inputDigest:'audit-digest',result:assessment,modelVersion:'test',promptVersion:'test',mode:'shadow'}));
 for(let i=0;i<30;i++)await asTenant('a',(tx:any)=>rubric.recordHumanRubricReview(tx,{tenantId:'a',productId:'p_a',humanAssessment:assessment,reviewedByAppUserId:'u_a'}));
 const metrics=await asTenant('a',(tx:any)=>rubric.getRubricPromotionMetrics(tx,'a'));
 const products:any=await pg.query(`select count(distinct product_id)::int as n from garimpa.comparison_review where tenant_id='a'`);
 assert.equal(metrics.status,'ratified');assert.equal(products.rows[0].n,1);return {metrics,distinctProducts:1};
});
await probe('invitation_accepts_client_claimed_recipient_email',async()=>{
 const invitation=await onboard.createAccountInvitation(ctx('a'),{invitedEmail:'victim@example.invalid',role:'operator'},factory);
 const accepted=await onboard.acceptAccountInvitation({...ctx('a'),actorAppUserId:'u_new',authenticatedAuthUserId:'auth_new'}, {rawToken:invitation.rawToken,invitedEmail:'victim@example.invalid'},factory);
 assert.equal(accepted.accepted,true);return {accepted,sessionEmailNeverProvidedOrVerified:true,scope:'service + RPC; HTTP Auth action inspected statically'};
});
await probe('invitation_rejects_existing_other_account_context',async()=>{
 const invitation=await onboard.createAccountInvitation(ctx('a'),{invitedEmail:'member-b@example.invalid',role:'operator'},factory);
 await assert.rejects(()=>onboard.acceptAccountInvitation(ctx('b'),{rawToken:invitation.rawToken,invitedEmail:'member-b@example.invalid'},factory),/cross_tenant/);
 return {authenticatedMemberOfBUnableToJoinA:true};
});
const header='externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState';
const csv=(lines:string[])=>header+'\n'+lines.join('\n');
async function importFile(lines:string[],selectedRowIds?:string[]){const batch=await fin.createOrGetImportBatchPreview(ctx('a'),{marketplace:'shopee',csvContent:csv(lines)},factory);const committed=await fin.commitImportBatch(ctx('a'),{batchId:batch.batchId,expectedDigest:batch.preview.fileDigest,...(selectedRowIds===undefined?{}:{selectedRowIds})},factory);return {batch,committed};}
await probe('third_commission_change_same_state_disappears',async()=>{
 const commits=[];for(const amount of [100,150,175,200])commits.push((await importFile([`audit-order,audit-item,2026-10-14T10:00:00Z,10000,${amount},BRL,shopee,,confirmed,confirmed`])).committed);
 const ledger:any=await pg.query(`select amount_cents::int,state,source_key,predecessor_id from garimpa.commission_entry where source_key like 'report:shopee:audit-order:audit-item%' order by created_at,id`);
 assert.equal(ledger.rows.length,2);assert.ok(!ledger.rows.some((r:any)=>r.amount_cents===175||r.amount_cents===200));return {commits,ledger:ledger.rows};
});
await probe('explicit_empty_selection_imports_all_eligible_rows',async()=>{
 const r=await importFile(['empty-selection,item,2026-10-14T10:00:00Z,10000,100,BRL,shopee,,confirmed,confirmed'],[]);
 assert.equal(r.committed.committedRowsCount,1);return r.committed;
});
await probe('experiment_one_empty_candidate_evaluation_promotes',async()=>{
 const p=await asTenant('a',(tx:any)=>opp.createAudiencePolicy(tx,'a',{name:'Audit policy'}));
 for(const version of ['base','candidate'])await asTenant('a',(tx:any)=>opp.createAudiencePolicyVersion(tx,'a',{policyId:p.id,version,config:{}}));
 const experiment=await exp.createPolicyExperiment(ctx('a'),{baselineVersion:'base',candidateVersion:'candidate',hypothesis:'Synthetic',primaryMetric:'score',minSample:1,audiencePolicyId:p.id},factory);
 let unitId='';for(let i=0;i<20;i++){const id='probe-'+i;const assigned=await exp.assignExperimentUnit(ctx('a'),{experimentId:experiment.experimentId,unitId:id},factory);if(assigned.assignment.variant==='candidate'){unitId=id;break;}}
 assert.ok(unitId);await exp.recordExperimentEvaluation(ctx('a'),{experimentId:experiment.experimentId,unitId,variant:'candidate',output:{}},factory);
 await exp.reviewPolicyExperiment(ctx('a'),{experimentId:experiment.experimentId,reviewNotes:'Synthetic review'},factory);
 const report=await exp.getExperimentReport(ctx('a'),experiment.experimentId,factory);
 const result=await exp.promotePolicyExperiment(ctx('a'),{experimentId:experiment.experimentId,policyId:p.id,promotionRationale:'Synthetic noncausal sample'},factory);
 assert.equal(result.promoted,true);assert.equal(report.baselineMetric.sampleSize,0);return {result,report};
});
await pg.exec(`
 insert into garimpa.audience_policy(id,tenant_id,name) values('dp','a','Dispatch policy');
 insert into garimpa.audience_policy_version(id,policy_id,tenant_id,version,config) values('dpv','dp','a','v1','{}');
 insert into garimpa.opportunity(id,tenant_id,product_id,policy_version_id,audience_key,channel,state,class,price_evidence_snapshot,valid_until) values('dopp','a','p_a','dpv','test','telegram_channel','prioritized','unclassified','{}','2027-01-01');
 insert into garimpa.campaign(id,tenant_id,name,objective,created_by) values('dc','a','Dispatch test','Audit','u_a');
 insert into garimpa.destination(id,tenant_id,channel,label,external_target_ref,automation_mode) values('dd','a','telegram_channel','Audit','authorized-test','assisted');
 insert into garimpa.commercial_kit(id,tenant_id,campaign_id,opportunity_id,status) values('dk','a','dc','dopp','approved');
 insert into garimpa.commercial_kit_revision(id,tenant_id,kit_id,revision,snapshot,claims,materials,created_by,content_digest) values('dkr','a','dk',1,'{"productId":"p_a","priceCents":10000,"validUntil":"2027-01-01"}','[]','[{"shortCopy":"Synthetic audit only"}]','u_a','digest');
 insert into garimpa.campaign_publication(id,tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,status,created_by) values('dpub','a','dc','dk','dkr','dd','telegram_channel','ready','u_a');
 insert into garimpa.campaign_link(id,tenant_id,publication_id,code,monetization_status) values('dl','a','dpub','audit_code18','valid');
 update garimpa.account_entitlement set ends_at='2026-01-02' where tenant_id='a';
`);
await probe('dispatch_assisted_expired_plan_link_and_uncommitted_io',async()=>{
 const job=await asTenant('a',(tx:any)=>scheduleDispatchJob(tx,{tenantId:'a',campaignPublicationId:'dpub',kitRevisionId:'dkr',destinationId:'dd',scheduledAt:new Date(Date.now()-1000).toISOString(),idempotencyKey:'audit-18-dispatch'}));
 let payload:any;let insideTransaction=false;const adapter={sendApprovedRevision:async(input:any)=>{payload=input;insideTransaction=true;return {kind:'sent',providerMessageId:'synthetic-only',confirmedAt:new Date().toISOString()};}};
 let output:any;try{await asTenant('a',async(tx:any)=>{output=await executeDispatchCycle(tx,ctx('a'),adapter,{workerToken:'audit-worker'});assert.equal(output.status,'succeeded');throw new Error('audit_rollback_after_synthetic_io');});}catch(e:any){assert.equal(e.message,'audit_rollback_after_synthetic_io');}
 const state:any=await pg.query(`select status,io_started_at from garimpa.dispatch_job where id='${job.id}'`);
 assert.ok(payload);assert.equal(state.rows[0].io_started_at,null);
 return {output,payload,insideTransaction,afterRollback:state.rows[0],destinationMode:'assisted',planExpired:true,adapterWasSynthetic:true};
});

await probe('onboarding_finishes_with_unresolved_evidence_reference',async()=>{
 const steps=['account_created','marketplace_credentials_configured','test_link_verified','audience_policy_configured','first_campaign_created','first_kit_approved','first_publication_confirmed'];
 for(const step of steps)await onboard.recordOnboardingProgress(ctx('a'),{step,status:'completed',evidenceRef:'nonexistent-evidence'},factory);
 const progress=await onboard.getOnboardingProgress(ctx('a'),factory);
 const factual:any=await pg.query(`select (select count(*)::int from garimpa.affiliate_marketplace_config where affiliate_id='aff_a') as credentials,(select count(*)::int from garimpa.campaign_publication where tenant_id='a' and status='published_confirmed') as confirmed_publications`);
 assert.equal(progress.currentStep,'finished');assert.equal(factual.rows[0].credentials,0);assert.equal(factual.rows[0].confirmed_publications,0);return {progress,facts:factual.rows[0]};
});
await probe('positive_cancel_reaches_marker_and_aborts_adapter',async()=>{
 const j:any=await pg.query(`select id from garimpa.dispatch_job where idempotency_key='audit-18-dispatch'`);
 let called=0,cancelled=false;const adapter={sendApprovedRevision:async()=>{called++;return {kind:'sent',providerMessageId:'never'};}};
 const output=await asTenant('a',async(tx:any)=>{const intercept:any=async(parts:TemplateStringsArray,...values:any[])=>{if(parts.join('?').includes('set io_started_at = now()')&&!cancelled){cancelled=(await cancelDispatchJob(tx,'a',j.rows[0].id)).cancelled;}return tx(parts,...values);};Object.assign(intercept,tx);return executeDispatchCycle(intercept,ctx('a'),adapter,{workerToken:'audit-cancel'});});
 assert.equal(cancelled,true);assert.equal(called,0);return {output,cancelled,adapterCalls:called};
});

await probe('legacy_curation_reads_house_without_authorized_account',async()=>{
 const {curationQueue}=require('../../../packages/web/lib/curation-db.ts');
 const rows=await curationQueue(20,'local','awaiting',factory);
 assert.ok(rows.some((r:any)=>r.id==='p_house'));return {rows:rows.map((r:any)=>r.id),authorizedAccountNotProvided:true};
});
await probe('reactivation_rejects_valid_platform_admin_without_actor_GUC',async()=>{
 await pg.exec(`insert into garimpa.app_user_role(app_user_id,role) values('u_a','platform_admin') on conflict do nothing`);
 await onboard.suspendAccountByPlatformAdmin(ctx('a'),{targetTenantId:'b',reason:'Synthetic'},factory);
 await assert.rejects(()=>onboard.reactivateAccountByPlatformAdmin(ctx('a'),{targetTenantId:'b',reason:'Synthetic'},factory),/platform_admin_required/);
 const row:any=await pg.query(`select status from garimpa.affiliate_account where tenant_id='b'`);
 assert.equal(row.rows[0].status,'suspended');return {validPlatformAdmin:'u_a',reactivationRejected:true,after:row.rows[0]};
});
await probe('e3_approval_accepts_nonexistent_calibration_reference',async()=>{
 const price=require('../../../packages/web/lib/price-evidence.ts');
 await withAccountDb(ctx('a'),(tx:any)=>price.savePriceEvidencePolicyDraft(tx,'a',{version:'audit-e3',config:{...price.DEFAULT_PRICE_EVIDENCE_POLICY,e3Enabled:true}}),factory);
 const approved=await withAccountDb(ctx('a'),(tx:any)=>price.approvePriceEvidencePolicy(tx,'a',{version:'audit-e3',approvedBy:'u_a',calibrationReportRef:'nonexistent-calibration'}),factory);
 const row:any=await pg.query(`select status,approved_by,config->>'e3Enabled' as e3_enabled from garimpa.price_evidence_policy_version where id='${approved.id}'`);
 assert.equal(row.rows[0].status,'approved');return {row:row.rows[0],calibrationRef:'nonexistent-calibration',scope:'approval DAL; no E3 activated remotely'};
});
await pg.close();
await writeFile(new URL('./revisao-18-contraexemplos.json',import.meta.url),JSON.stringify({purpose:'Controles positivos e contraexemplos isolados; confirmed significa comportamento esperado pelo diagnóstico, não aceite do produto.',appliedMigrations:applied,results},null,2)+'\n');
console.log(JSON.stringify(results.map(x=>({name:x.name,status:x.status,error:x.error})),null,2));

if(results.some(x=>x.status==="probe_error"))process.exitCode=1;
