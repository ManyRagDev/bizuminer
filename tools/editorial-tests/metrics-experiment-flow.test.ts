import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  createPolicyExperiment, approveExperimentMethod, approveExperimentCandidate,
  assignExperimentUnit,
  recordExperimentEvaluation,
  getExperimentReport,
  promotePolicyExperiment,
  reviewPolicyExperiment,
  rollbackPolicyExperiment,
  exportExperimentMethodologyCsv,
} = require("../../packages/web/lib/experiment-db.ts");

const {
  buildMetricResult,
  validatePolicyPromotion,
} = require("../../packages/web/lib/experiment-contract.ts");

const {
  createAudiencePolicy,
  createAudiencePolicyVersion,
  getActiveAudiencePolicy,
} = require("../../packages/web/lib/opportunity-db.ts");

const { pg, factory } = await commercialFixture();

console.log("--- D10 METRICS, COHORTS & POLICY EXPERIMENTS TESTS ---");

const ctx = (t: string, user = `user_${t}`, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: user,
  authenticatedAuthUserId: `auth_${user}`,
  membershipRole: role,
  requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});

// Seed accounts and users
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_exp_a', 'exp_a', 'exp-a', 'Conta Experimento A'),
    ('aff_exp_b', 'exp_b', 'exp-b', 'Conta Experimento B')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('user_exp_a', 'exp_a', 'auth_user_exp_a'),
    ('user_exp_b', 'exp_b', 'auth_user_exp_b')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role) values
    ('user_exp_a', 'afiliado'),
    ('user_exp_b', 'afiliado')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_exp_a', 'user_exp_a', 'owner'),
    ('aff_exp_b', 'user_exp_b', 'owner')
  on conflict do nothing;
`);

const contextA = ctx("exp_a");
const contextB = ctx("exp_b");

const baseSql = factory();
async function asTenant<T>(tenantId: string, role = "owner", fn: (tx: any) => Promise<T>): Promise<T> {
  return baseSql.begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('garimpa.membership_role', ${role}, true)`;
    return fn(tx);
  });
}

// ============================================================================
// 1. Métricas Construtoras: Sem impressões não há CTR; Numerador nulo não gera NaN
// ============================================================================
console.log("1. Testando construtor de métricas (ausência de dados e divisão por zero)...");

const ctrSemImpressoes = buildMetricResult({
  key: "ctr",
  numerator: 10,
  denominator: 0,
  unit: "percent",
  source: "impressions_to_clicks",
  windowStart: "2026-10-01T00:00:00Z",
  windowEnd: "2026-10-14T00:00:00Z",
  cohortDefinition: "banner_clicks",
  sampleSize: 0,
  attributionMethod: "none",
});
assert.equal(ctrSemImpressoes.value, null, "Sem impressões reais (denominador 0) CTR deve ser null");
assert.ok(ctrSemImpressoes.limitations.length > 0);

const metricSemNumerador = buildMetricResult({
  key: "margin",
  numerator: null,
  denominator: 1000,
  unit: "currency_cents",
  source: "revenue_to_cost",
  windowStart: "2026-10-01T00:00:00Z",
  windowEnd: "2026-10-14T00:00:00Z",
  cohortDefinition: "orders",
  sampleSize: 10,
  attributionMethod: "none",
});
assert.equal(metricSemNumerador.value, null, "Numerador nulo deve resultar em value null sem gerar NaN");
assert.ok(metricSemNumerador.limitations[0].includes("Numerador ausente ou inválido"));

console.log("✔ Construtor de métricas auditáveis validado.");

// ============================================================================
// 2–7. Authorized paired protocol and lifecycle; no arbitrary threshold is a business approval.
await pg.exec(`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('exp-product','exp_a','shopee','exp-1','Produto sintético','https://shopee.com.br/test',10000);insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values('exp-observation','exp_a','exp-product',10000,'{"currency":"BRL"}');`);
const policy=await asTenant('exp_a','owner',tx=>createAudiencePolicy(tx,'exp_a',{name:'Política sintética'}));
for(const version of ['base','candidate'])await asTenant('exp_a','owner',tx=>createAudiencePolicyVersion(tx,'exp_a',{policyId:policy.id,version,config:{},approvedBy:version==='base'?'user_exp_a':undefined}));
const created=await createPolicyExperiment(contextA,{audiencePolicyId:policy.id,baselineVersion:'base',candidateVersion:'candidate',hypothesis:'Comparação sintética pareada',primaryMetric:'score'},factory);
await assert.rejects(()=>assignExperimentUnit(contextA,{experimentId:created.experimentId,unitId:'exp-product'},factory),/approved_method/);
await assert.rejects(()=>getExperimentReport(contextB,created.experimentId,factory),/experiment_not_found/);
await approveExperimentMethod(contextA,{experimentId:created.experimentId,method:{design:'paired',cohort:'Produto sintético, janela registrada',windowStart:new Date(Date.now()-60000).toISOString(),windowEnd:new Date(Date.now()+3600000).toISOString(),minPairs:1,minimumDelta:1,rationale:'Método de teste, não homologação comercial'}},factory);
const {assignment}=await assignExperimentUnit(contextA,{experimentId:created.experimentId,unitId:'exp-product'},factory);
assert.equal(assignment.variant,'paired');
await assert.rejects(()=>recordExperimentEvaluation(contextA,{experimentId:created.experimentId,unitId:'exp-product',variant:'candidate',output:{},inputDigest:assignment.inputDigest},factory),/observed_metric/);
await recordExperimentEvaluation(contextA,{experimentId:created.experimentId,unitId:'exp-product',variant:'baseline',output:{score:1},inputDigest:assignment.inputDigest},factory);
assert.equal((await getExperimentReport(contextA,created.experimentId,factory)).totalSampleSize,0);
await assert.rejects(()=>reviewPolicyExperiment(contextA,{experimentId:created.experimentId,reviewNotes:'Insuficiente'},factory),/insufficient/);
await recordExperimentEvaluation(contextA,{experimentId:created.experimentId,unitId:'exp-product',variant:'candidate',output:{score:2},inputDigest:assignment.inputDigest},factory);
const replay=await recordExperimentEvaluation(contextA,{experimentId:created.experimentId,unitId:'exp-product',variant:'candidate',output:{score:2},inputDigest:assignment.inputDigest},factory);assert.equal(replay.alreadyExisted,true);
await assert.rejects(()=>recordExperimentEvaluation(contextA,{experimentId:created.experimentId,unitId:'exp-product',variant:'candidate',output:{score:3},inputDigest:assignment.inputDigest},factory),/immutable/);
const report=await getExperimentReport(contextA,created.experimentId,factory);assert.equal(report.totalSampleSize,1);assert.equal(report.baselineMetric.value,1);assert.equal(report.candidateMetric.value,2);
await assert.rejects(()=>promotePolicyExperiment(contextA,{experimentId:created.experimentId,promotionRationale:'Sem revisão'},factory),/promotion_denied/);
await reviewPolicyExperiment(contextA,{experimentId:created.experimentId,reviewNotes:'Par revisado na fixture'},factory);
await assert.rejects(()=>promotePolicyExperiment(contextA,{experimentId:created.experimentId,promotionRationale:'Candidata não aprovada'},factory),/candidate_approval/);
await approveExperimentCandidate(contextA,{experimentId:created.experimentId,rationale:'Revisão humana da versão congelada na fixture'},factory);
assert.equal((await asTenant('exp_a','owner',tx=>getActiveAudiencePolicy(tx,'exp_a',policy.id))).version.version,'base');
const promoted=await promotePolicyExperiment(contextA,{experimentId:created.experimentId,promotionRationale:'Critério sintético satisfeito',promotedBy:'forged'},factory);assert.equal(promoted.promoted,true);
const [authored]=(await pg.query(`select promoted_by from garimpa.policy_experiment where id='${created.experimentId}'`)).rows as any[];assert.equal(authored.promoted_by,'user_exp_a');
assert.ok(exportExperimentMethodologyCsv(report).includes('paired'));
const rollback=await rollbackPolicyExperiment(contextA,{experimentId:created.experimentId,rollbackRationale:'Teste de reversão'},factory);assert.equal(rollback.restoredVersion,'base');
console.log('PASS paired protocol: draft, approval, frozen facts, missing metric, unilateral sample, replay/conflict, review, promote, actor, rollback and tenant isolation');
await pg.close();
