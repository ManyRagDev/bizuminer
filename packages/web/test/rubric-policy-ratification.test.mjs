import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePriceEvidence,
  projectCanonicalToLegacy,
  DEFAULT_PRICE_EVIDENCE_POLICY,
} from "../lib/price-evidence.ts";
import {
  ratifyRubricPolicy,
  recordHumanRubricReview,
} from "../lib/rubric-db.ts";

test("AC-16.4: E3 degrades safely to E2 when calibration is unratified without breaking rendering", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const baseOffer = {
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

  const observations = [
    {
      id: "obs_curr",
      priceCents: 8000,
      observedAt: now,
      offerEvidence: baseOffer,
      currency: "BRL",
    },
    {
      id: "obs_p1",
      priceCents: 10000,
      observedAt: new Date(now.getTime() - 1 * 86400000),
      offerEvidence: baseOffer,
      currency: "BRL",
    },
    {
      id: "obs_p2",
      priceCents: 11000,
      observedAt: new Date(now.getTime() - 2 * 86400000),
      offerEvidence: baseOffer,
      currency: "BRL",
    },
    {
      id: "obs_p3",
      priceCents: 12000,
      observedAt: new Date(now.getTime() - 3 * 86400000),
      offerEvidence: baseOffer,
      currency: "BRL",
    },
  ];

  const policyWithE3 = {
    ...DEFAULT_PRICE_EVIDENCE_POLICY,
    e3Enabled: true,
    windowDays: 3,
    minimumPriorCount: 3,
    minimumDistinctDays: 3,
    maximumGapHours: 72,
    minimumCoverageRatio: 0.5,
  };

  // Case 1: Policy approved AND calibration verified -> E3
  const e3Evidence = calculatePriceEvidence({
    tenantId: "t1",
    productId: "prod_1",
    currentObservationId: "obs_curr",
    observations,
    policy: policyWithE3,
    policyStatus: "approved",
    calibrationVerified: true,
    now,
  });
  assert.equal(e3Evidence.state, "E3");
  const legacyE3 = projectCanonicalToLegacy(e3Evidence);
  assert.equal(legacyE3.lowestVerified, true);
  assert.equal(legacyE3.previousMinPriceCents, 10000);

  // Case 2: Policy e3Enabled but calibration unratified -> degrades safely to E2
  const uncalibratedEvidence = calculatePriceEvidence({
    tenantId: "t1",
    productId: "prod_1",
    currentObservationId: "obs_curr",
    observations,
    policy: policyWithE3,
    policyStatus: "approved",
    calibrationVerified: false,
    now,
  });
  assert.equal(uncalibratedEvidence.state, "E2");
  assert.ok(uncalibratedEvidence.unknowns.includes("e3_calibration_unratified"));
  const legacyDegraded = projectCanonicalToLegacy(uncalibratedEvidence);
  // Must NOT claim verified all-time lowest record
  assert.equal(legacyDegraded.lowestVerified, false);
  // But maintains truthful priorMin comparison without broken rendering
  assert.equal(legacyDegraded.previousMinPriceCents, 10000);
  assert.equal(legacyDegraded.minPriceCents, 8000);
  // Allowed claim must be observed_drop, not historical_observed_minimum
  assert.ok(uncalibratedEvidence.allowedClaims.some((c) => c.type === "observed_drop"));
  assert.ok(!uncalibratedEvidence.allowedClaims.some((c) => c.type === "historical_observed_minimum"));
});

test("AC-16.1 & AC-16.2: Human review succeeds solo and records shadow comparison when available", async () => {
  const insertedAssessments = [];
  const insertedEvents = [];
  const insertedComparisons = [];

  const mockSql = Object.assign(
    async (strings, ...values) => {
      const q = strings.join(" ");

      // assertCommercialRolloutReady
      if (q.includes("to_regprocedure") || q.includes("commercial_rollout_ready")) {
        return [{ ready: true }];
      }

      // Membership check
      if (q.includes("garimpa.affiliate_membership")) {
        return [{ app_user_id: "user_curator" }];
      }

      // Advisory lock
      if (q.includes("pg_advisory_xact_lock")) {
        return [];
      }

      // Prior check
      if (q.includes("select id,review_digest from garimpa.editorial_assessment")) {
        return [];
      }

      // Insert editorial assessment
      if (q.includes("insert into garimpa.editorial_assessment")) {
        const id = `ea_${insertedAssessments.length + 1}`;
        insertedAssessments.push({ id, values });
        return [{ id }];
      }

      // Domain event
      if (q.includes("insert into garimpa.domain_event")) {
        insertedEvents.push({ values });
        return [];
      }

      // Insert analysis assessment
      if (q.includes("insert into garimpa.analysis_assessment")) {
        return [{ id: "mock_analysis_1" }];
      }

      // getLatestAnalysisAssessment
      if (q.includes("select") && q.includes("from garimpa.analysis_assessment")) {
        return [];
      }

      // Insert comparison review
      if (q.includes("insert into garimpa.comparison_review")) {
        const id = `comp_${insertedComparisons.length + 1}`;
        insertedComparisons.push({ id, values });
        return [{ id }];
      }

      return [];
    },
    {
      json: (v) => v,
    }
  );

  const humanAssessment = {
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Boa construção em metal" },
    value: { level: "strong", reason: "Preço competitivo" },
    audience: { level: "adequate", reason: "Doméstico" },
    evidenceConfidence: { level: "strong", reason: "Dados verificados" },
    factsUsed: ["Potência 500W"],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "rubric-v2",
    evidenceDigest: "evidence-digest-123",
  };

  // 1. Solo review without shadow AI
  const soloResult = await recordHumanRubricReview(mockSql, {
    tenantId: "tenant_alpha",
    productId: "prod_solo",
    humanAssessment,
    reviewedByAppUserId: "user_curator",
    notes: "Avaliação manual sem IA",
  });

  assert.equal(soloResult.saved, true);
  assert.equal(soloResult.hasShadow, false);
  assert.equal(soloResult.comparisonReviewId, null);
  assert.equal(insertedAssessments.length, 1);
  assert.equal(insertedEvents.length, 1);

  // 2. Review with shadow AI present
  const shadowAssessment = {
    schemaVersion: 2,
    quality: { level: "adequate", reason: "IA: Boa construção" },
    value: { level: "adequate", reason: "IA: Preço razoável" }, // Disagreement with human "strong"
    audience: { level: "adequate", reason: "IA: Doméstico" },
    evidenceConfidence: { level: "strong", reason: "IA: Confiante" },
    factsUsed: ["Potência 500W"],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "rubric-v2",
    modelVersion: "gemini-2.5-flash",
    promptVersion: "rubric-v2-shadow",
    evidenceDigest: "evidence-digest-123",
  };

  const shadowResult = await recordHumanRubricReview(mockSql, {
    tenantId: "tenant_alpha",
    productId: "prod_shadow",
    humanAssessment,
    reviewedByAppUserId: "user_curator",
    shadowResult: shadowAssessment,
  });

  assert.equal(shadowResult.saved, true);
  assert.equal(shadowResult.hasShadow, true);
  assert.equal(shadowResult.agreement, false); // Human: strong vs AI: adequate
  assert.equal(shadowResult.disagreements.length, 1);
  assert.equal(shadowResult.disagreements[0].dimension, "value");
});

test("AC-16.3: ratifyRubricPolicy enforces owner role, distinct sample, agreement rate and emits audit event", async () => {
  let governanceDecisions = [];
  let auditEvents = [];

  const mockSql = Object.assign(
    async (strings, ...values) => {
      const q = strings.join(" ");

      if (q.includes("to_regprocedure") || q.includes("commercial_rollout_ready")) {
        return [{ ready: true }];
      }

      // Membership query
      if (q.includes("garimpa.affiliate_membership")) {
        const userId = values[1];
        if (userId === "user_owner") {
          return [{ app_user_id: "user_owner", role: "owner" }];
        }
        return [];
      }

      // Comparison review sample query
      if (q.includes("from garimpa.comparison_review")) {
        return Array.from({length:30},(_,i)=>({id:`rev_${i+1}`,product_id:`prod_${i+1}`,agreement:i<23,disagreements:i<23?[]:[{dimension:"value"}]}));
      }

      // Insert governance decision
      if (q.includes("insert into garimpa.governance_decision")) {
        const id = `dec_${governanceDecisions.length + 1}`;
        governanceDecisions.push({ id, values });
        return [{ id }];
      }

      // Insert domain event
      if (q.includes("insert into garimpa.domain_event")) {
        auditEvents.push({ values });
        return [];
      }

      return [];
    },
    {
      json: (v) => v,
    }
  );

  // 1. Non-owner rejection
  await assert.rejects(
    () =>
      ratifyRubricPolicy(mockSql, {
        tenantId: "tenant_a",
        rubricVersion: "rubric-v2",
        reviewIds: Array.from({length:30},(_,i)=>`rev_${i+1}`),
        approvedByAppUserId: "user_operator",
        rationale: "Tentativa de aprovação sem ser owner",
      }),
    /owner_membership_required/
  );

  // 2. Agreement rate below threshold rejection
  await assert.rejects(
    () =>
      ratifyRubricPolicy(mockSql, {
        tenantId: "tenant_a",
        rubricVersion: "rubric-v2",
        reviewIds: Array.from({length:30},(_,i)=>`rev_${i+1}`),
        approvedByAppUserId: "user_owner",
        rationale: "Tentativa exigindo 90% de concordância",
        minAgreementRate: 0.9, // 3/4 = 75% < 90%
      }),
    /sample_agreement_rate_below_threshold/
  );

  // 3. Successful ratification by owner with valid sample
  const result = await ratifyRubricPolicy(mockSql, {
    tenantId: "tenant_a",
    rubricVersion: "rubric-v2",
    reviewIds: Array.from({length:30},(_,i)=>`rev_${i+1}`),
    approvedByAppUserId: "user_owner",
    rationale: "Política rubric-v2 calibrada com 75% de concordância em 4 ofertas distintas",
    minUnits: 30,
    minAgreementRate: 0.7,
  });

  assert.equal(result.status, "ratified");
  assert.equal(result.rubricVersion, "rubric-v2");
  assert.equal(result.sampleCount, 30);
  assert.equal(result.agreementRate, 0.7667);
  assert.equal(governanceDecisions.length, 1);
  assert.equal(auditEvents.length, 1);
});
