import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  calculatePriceEvidence,
  buildConfigurationKey,
  projectCanonicalToLegacy,
  runCalibrationEXP02,
  BENCHMARK_CALIBRATION_CASES_EXP02,
  DEFAULT_PRICE_EVIDENCE_POLICY,
  savePriceEvidencePolicyDraft,
  approvePriceEvidencePolicy,
  getActivePriceEvidencePolicy,
} = require("../../packages/web/lib/price-evidence.ts");

const { pg, applied, factory, adminFactory } = await commercialFixture();

const baseEvidence = {
  version: 2,
  currency: "BRL",
  priceType: "exact",
  variantIdentity: { state: "source_verified", key: "unit", attributes: {} },
  packageQuantity: 1,
  fieldStates: {
    sellerId: "not_applicable",
    packageContents: "not_applicable",
    dimensions: "not_applicable",
    payment: "not_applicable",
    coupon: "not_applicable",
    region: "not_applicable",
  },
};

console.log("--- D05 CANONICAL PRICE EVIDENCE INTEGRATION TESTS ---");

// Test 1: EXP-02 Benchmark Suite (10 cases)
console.log("Testing 1: EXP-02 Calibration Suite (10 benchmark cases)...");
const report = runCalibrationEXP02(BENCHMARK_CALIBRATION_CASES_EXP02);
assert.equal(report.totalCases, 10);
assert.equal(report.passedCases, 10);
assert.equal(report.pass, true, JSON.stringify(report.results.filter((r) => !r.matches)));
console.log("PASS 1: EXP-02 Calibration Suite passed 10/10 cases");

// Test 2: TS and SQL agreement on configuration key extraction
console.log("Testing 2: TS and SQL agreement on offer configuration key...");
// 2.1 Valid complete evidence
const keyTs = buildConfigurationKey(baseEvidence);
const [rowKeySql] = (
  await pg.query(`select garimpa.offer_configuration_key($1) as key`, [
    JSON.stringify(baseEvidence),
  ])
).rows;
assert.ok(keyTs);
assert.ok(rowKeySql.key);
assert.equal(rowKeySql.key.variantKey, "unit");

// 2.2 Inferred variant identity -> null in both TS and SQL
const inferredEvidence = {
  ...baseEvidence,
  variantIdentity: { state: "inferred", key: "unit" },
};
assert.equal(buildConfigurationKey(inferredEvidence), null);
const [rowInferredSql] = (
  await pg.query(`select garimpa.offer_configuration_key($1) as key`, [
    JSON.stringify(inferredEvidence),
  ])
).rows;
assert.equal(rowInferredSql.key, null);

// 2.3 Price range with priceMinCents != priceMaxCents -> null in both
const rangeEvidence = {
  ...baseEvidence,
  priceMinCents: 1000,
  priceMaxCents: 2000,
};
assert.equal(buildConfigurationKey(rangeEvidence), null);
const [rowRangeSql] = (
  await pg.query(`select garimpa.offer_configuration_key($1) as key`, [
    JSON.stringify(rangeEvidence),
  ])
).rows;
assert.equal(rowRangeSql.key, null);

// 2.4 Missing sellerId without not_applicable -> null in both
const missingSellerEvidence = {
  ...baseEvidence,
  fieldStates: { ...baseEvidence.fieldStates, sellerId: "absent" },
};
assert.equal(buildConfigurationKey(missingSellerEvidence), null);
const [rowMissingSellerSql] = (
  await pg.query(`select garimpa.offer_configuration_key($1) as key`, [
    JSON.stringify(missingSellerEvidence),
  ])
).rows;
assert.equal(rowMissingSellerSql.key, null);
console.log("PASS 2: TS and SQL agree on configuration key extraction");

// Setup isolated tenant for SQL vs TS comparison
await pg.exec(`
  insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
    ('aff_p5','p5','p5','Price 5 Tenant');
  insert into garimpa.app_user(id,tenant_id,auth_user_id) values
    ('user_p5','p5','auth_p5');
  insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values
    ('aff_p5','user_p5','owner');
  insert into garimpa.app_user_role(app_user_id,role) values
    ('user_p5','afiliado');
  insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
    ('prod_p5','p5','mercadolivre','P501','Produto P5','https://produto.mercadolivre.com.br/MLB-P501',8000);
  insert into garimpa.product_curation(tenant_id,product_id,status) values
    ('p5','prod_p5','approved');
`);

const now = new Date();
const approvedE3Policy = {
  windowDays: 6,
  bucketHours: 24,
  minimumPriorCount: 3,
  minimumDistinctDays: 3,
  maximumGapHours: 72,
  minimumCoverageRatio: 0.5,
  maxAgeHours: 48,
  scope: "listing_price_excluding_shipping",
  e3Enabled: true,
};

// Test 3: Currency mismatch in SQL vs TS
console.log("Testing 3: Currency mismatch excludes observation in both SQL and TS...");
const digestPolicy=require('../../packages/web/lib/commerce-contract.ts').calculateContentDigest;
const signedRun=(await pg.query(`insert into garimpa.price_calibration_run(tenant_id,policy_version,observation_ids,results,source_ref,synthetic,reviewed_by,policy_snapshot,policy_digest) values('p5','v-e3','["fixture-prior"]','{"experiment":"EXP-02","reviewed":true,"pass":true}','explicit-approved-fixture',false,'user_p5',$1,$2) returning id`,[JSON.stringify(approvedE3Policy),digestPolicy(approvedE3Policy)])).rows[0] as any;
await pg.query(
  `insert into garimpa.price_evidence_policy_version(id,tenant_id,version,config,status,approved_by,approved_at,calibration_run_id) values
    ('pol_p5','p5','v-e3',$1,'approved','user_p5',now(),$2)`,
  [JSON.stringify(approvedE3Policy),signedRun.id]
);

// Current observation in BRL (8000 cents)
await pg.query(
  `insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values
    ('obs_curr','p5','prod_p5',8000,$1,$2)`,
  [now.toISOString(), JSON.stringify(baseEvidence)]
);

// 3 prior observations in USD -> must be excluded
for (let d = 1; d <= 5; d++) {
  const t = new Date(now.getTime() - d * 86400000).toISOString();
  await pg.query(
    `insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values
      ($1,'p5','prod_p5',12000,$2,$3)`,
    [
      `obs_usd_${d}`,
      t,
      JSON.stringify({ ...baseEvidence, currency: "USD" }),
    ]
  );
}

// Check SQL
const [sqlFactsCurrencyMismatch] = (
  await pg.query(
    `select previous_min_price_cents, lowest_verified from garimpa.curation_queue_facts where id = 'prod_p5'`
  )
).rows;
assert.equal(sqlFactsCurrencyMismatch.previous_min_price_cents, null);
assert.equal(sqlFactsCurrencyMismatch.lowest_verified, false);

// Check TS
const allObsCurrency = (
  await pg.query(
    `select id, price_cents, observed_at, offer_evidence from garimpa.price_observation where product_id = 'prod_p5'`
  )
).rows;
const tsEvidenceCurrency = calculatePriceEvidence({
  tenantId: "p5",
  productId: "prod_p5",
  currentObservationId: "obs_curr",
  observations: allObsCurrency.map((o: any) => ({
    id: o.id,
    priceCents: o.price_cents,
    observedAt: o.observed_at,
    offerEvidence: o.offer_evidence,
    currency: o.offer_evidence?.currency,
  })),
  policy: approvedE3Policy,
  policyStatus: "approved",
  now,
});
assert.equal(tsEvidenceCurrency.state, "E1");
assert.equal(tsEvidenceCurrency.priorMinCents, null);
console.log("PASS 3: Currency mismatch excluded in both SQL and TS");

// Test 4: Prior observations matching in BRL satisfy E3 criteria in both SQL and TS
console.log("Testing 4: Full comparable series satisfies E3 in both SQL and TS...");
// Delete USD observations and insert 5 prior BRL observations
await pg.exec(`delete from garimpa.price_observation where id like 'obs_usd_%'`);
for (let d = 1; d <= 5; d++) {
  const t = new Date(now.getTime() - d * 86400000).toISOString();
  await pg.query(
    `insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values
      ($1,'p5','prod_p5',10000,$2,$3)`,
    [`obs_brl_${d}`, t, JSON.stringify(baseEvidence)]
  );
}

const [sqlFactsE3] = (
  await pg.query(
    `select previous_min_price_cents, lowest_verified from garimpa.curation_queue_facts where id = 'prod_p5'`
  )
).rows;
assert.equal(sqlFactsE3.previous_min_price_cents, 10000);
assert.equal(sqlFactsE3.lowest_verified, true);

const allObsE3 = (
  await pg.query(
    `select id, price_cents, observed_at, offer_evidence from garimpa.price_observation where product_id = 'prod_p5'`
  )
).rows;
const tsEvidenceE3 = calculatePriceEvidence({
  tenantId: "p5",
  productId: "prod_p5",
  currentObservationId: "obs_curr",
  observations: allObsE3.map((o: any) => ({
    id: o.id,
    priceCents: o.price_cents,
    observedAt: o.observed_at,
    offerEvidence: o.offer_evidence,
    currency: o.offer_evidence?.currency,
  })),
  policy: approvedE3Policy,
  policyStatus: "approved",
  now,
});
assert.equal(tsEvidenceE3.state, "E3");
assert.equal(tsEvidenceE3.priorMinCents, 10000);
const legacyProjE3 = projectCanonicalToLegacy(tsEvidenceE3);
assert.equal(legacyProjE3.lowestVerified, true);
assert.equal(legacyProjE3.previousMinPriceCents, 10000);
console.log("PASS 4: E3 agreement between SQL view and TS projection confirmed");

// Test 5: Policy Version Management DAL
console.log("Testing 5: Policy Version Management DAL (draft -> approval -> immutability)...");
const p5Sql = factory();
async function asOwner<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return p5Sql.begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('garimpa.membership_role', 'owner', true)`;
    await tx`select set_config('garimpa.actor_app_user_id','user_p5',true)`;
    return fn(tx);
  });
}

// 5.1 Save draft
const draftRes = await asOwner("p5", (tx) =>
  savePriceEvidencePolicyDraft(tx, "p5", {
    version: "2.0.0-draft",
    config: { ...DEFAULT_PRICE_EVIDENCE_POLICY, windowDays: 45 },
  })
);
assert.ok(draftRes.id);

await asOwner("p5", (tx) =>
  savePriceEvidencePolicyDraft(tx, "p5", {
    version: "2.1.0-e3-uncalibrated",
    config: { ...DEFAULT_PRICE_EVIDENCE_POLICY, e3Enabled: true },
  })
);

// 5.2 Attempt to approve E3 policy without calibration report fails
await assert.rejects(
  () =>
    asOwner("p5", (tx) =>
      approvePriceEvidencePolicy(tx, "p5", {
        version: "2.1.0-e3-uncalibrated",
        approvedBy: "user_p5",
      })
    ),
  /approved_calibration_required_for_e3/
);

// 5.3 Approve E3 policy with calibration report reference succeeds
await assert.rejects(()=>asOwner("p5",tx=>approvePriceEvidencePolicy(tx,"p5",{version:"2.1.0-e3-uncalibrated",approvedBy:"user_p5",calibrationReportRef:"EXP-02-REPORT-20261014"})),/approved_calibration_required/);
const calibration=(await pg.query(`insert into garimpa.price_calibration_run(tenant_id,policy_version,observation_ids,results,source_ref,synthetic,reviewed_by,policy_snapshot,policy_digest) values('p5','2.1.0-e3-uncalibrated','["obs_curr"]','{"experiment":"EXP-02","reviewed":true,"pass":true}','fixture-exp02-reviewed',false,'user_p5',$2,$1) returning id`,[require('../../packages/web/lib/commerce-contract.ts').calculateContentDigest({...DEFAULT_PRICE_EVIDENCE_POLICY,e3Enabled:true}),JSON.stringify({...DEFAULT_PRICE_EVIDENCE_POLICY,e3Enabled:true})])).rows[0] as any;
const approvedRes = await asOwner("p5", (tx) =>
  approvePriceEvidencePolicy(tx, "p5", {
    version: "2.1.0-e3-uncalibrated",
    approvedBy: "user_p5",
    calibrationReportRef: calibration.id,
  })
);
assert.ok(approvedRes.id);

// 5.4 Immutability of approved policy in SQL
await assert.rejects(
  () =>
    pg.exec(
      `update garimpa.price_evidence_policy_version set config = '{"windowDays": 99}' where version = '2.1.0-e3-uncalibrated'`
    ),
  /approved_policy_immutable/
);
console.log("PASS 5: Policy version DAL and immutability verified");

console.log("ALL D05 CANONICAL PRICE EVIDENCE TESTS PASSED!");
await pg.close();
