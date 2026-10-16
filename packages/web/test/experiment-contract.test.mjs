import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMetricResult,
  validatePolicyPromotion,
} from "../lib/experiment-contract.ts";

test("buildMetricResult computes valid percent and ratios", () => {
  const result = buildMetricResult({
    key: "click_to_conversion_ratio",
    numerator: 5,
    denominator: 100,
    unit: "percent",
    source: "click_event_to_conversion_cohort",
    windowStart: "2026-10-01T00:00:00Z",
    windowEnd: "2026-10-14T00:00:00Z",
    cohortDefinition: "campaign_october_cohort",
    sampleSize: 100,
    attributionMethod: "provider_subid",
  });

  assert.equal(result.value, 5.0);
  assert.equal(result.unit, "percent");
  assert.equal(result.limitations.length, 0);
});

test("buildMetricResult returns null value when denominator is 0 or absent (no fake ratios)", () => {
  const divByZero = buildMetricResult({
    key: "ctr",
    numerator: 10,
    denominator: 0,
    unit: "percent",
    source: "impressions_to_clicks",
    windowStart: "2026-10-01T00:00:00Z",
    windowEnd: "2026-10-14T00:00:00Z",
    cohortDefinition: "all_cards",
    sampleSize: 0,
    attributionMethod: "none",
  });

  assert.equal(divByZero.value, null, "divisão por zero deve resultar em null");
  assert.ok(divByZero.limitations[0].includes("Denominador ausente ou zero"));

  const noDenominator = buildMetricResult({
    key: "conversion_rate",
    numerator: 10,
    denominator: null,
    unit: "percent",
    source: "purchases_to_views",
    windowStart: "2026-10-01T00:00:00Z",
    windowEnd: "2026-10-14T00:00:00Z",
    cohortDefinition: "unknown_views",
    sampleSize: 10,
    attributionMethod: "declared",
  });

  assert.equal(noDenominator.value, null);
  assert.ok(noDenominator.limitations[0].includes("Denominador ausente ou zero"));
});

test("validatePolicyPromotion enforces minimum sample size and human reviewer (G-EXPERIMENT)", () => {
  const experiment = {
    id: "exp-1",
    tenantId: "local",
    baselineVersion: "v1.0",
    candidateVersion: "v1.1",
    hypothesis: "Políticas mais conservadoras de preço aumentam retenção",
    cohortSpec: {},
    primaryMetric: "retention_30d",
    minSample: 50,
    startedAt: "2026-10-01T00:00:00Z",
    status: "reviewed",
    createdAt: "2026-10-01T00:00:00Z",
  };

  // 1. Amostra insuficiente (20 < 50): bloqueado
  const lowSample = validatePolicyPromotion({
    experiment,
    currentSampleSize: 20,
    promotedBy: "curator_admin",
    promotionRationale: "Resultados parecem promissores",
  });
  assert.equal(lowSample.canPromote, false);
  assert.ok(lowSample.blockerReason.includes("inferior ao mínimo exigido"));

  // 2. Sem responsável humano ou justificativa: bloqueado
  const noReviewer = validatePolicyPromotion({
    experiment,
    currentSampleSize: 60,
    promotedBy: "",
    promotionRationale: "",
  });
  assert.equal(noReviewer.canPromote, false);
  assert.ok(noReviewer.blockerReason.includes("Aprovação humana exige identificação"));

  // 3. Critérios satisfeitos: aprovado
  const approved = validatePolicyPromotion({
    experiment,
    currentSampleSize: 60,
    promotedBy: "curator_admin",
    promotionRationale: "Amostra atingiu poder estatístico com redução comprovada de reversões.",
  });
  assert.equal(approved.canPromote, true);
});
