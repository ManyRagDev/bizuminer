import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOpportunity,
  rankOpportunities,
} from "../lib/opportunity-contract.ts";

const baseRubric = {
  schemaVersion: 2,
  quality: { level: "adequate", reason: "Boa construção" },
  value: { level: "weak", reason: "Preço alto para o que entrega" },
  audience: { level: "adequate", reason: "Cozinha prática" },
  evidenceConfidence: { level: "adequate", reason: "Dados razoáveis" },
  factsUsed: ["Preço R$ 100"],
  inferences: [],
  unknowns: [],
  safetyFlags: [],
  policyVersion: "1.0.0",
  evidenceDigest: "dig-1",
  createdAt: "2026-10-14T10:00:00Z",
};

const basePriceEvidence = {
  schemaVersion: 2,
  tenantId: "tenant-1",
  productId: "prod-1",
  currentObservationId: "obs-1",
  configurationKey: "config-1",
  comparisonScope: "listing_price_excluding_shipping",
  state: "E1",
  observedAt: "2026-10-14T10:00:00Z",
  validUntil: "2026-10-16T10:00:00Z",
  currency: "BRL",
  priceCents: 10000,
  priorMinCents: null,
  medianCents: null,
  priorCount: 0,
  distinctDays: 0,
  windowStart: "2026-09-14T10:00:00Z",
  windowEnd: "2026-10-14T10:00:00Z",
  coverageRatio: 0,
  maxGapHours: 0,
  excludedCount: 0,
  unknowns: [],
  policyVersion: "1.0.0",
  evidenceDigest: "dig-p1",
  allowedClaims: [],
};

test("classifyOpportunity: qualidade adequada sem valor excepcional gera recommendable", () => {
  const result = classifyOpportunity(baseRubric, basePriceEvidence);
  assert.equal(result.opportunityClass, "recommendable");
  assert.equal(result.state, "candidate");
});

test("classifyOpportunity: valor adequado soma good_buy", () => {
  const rubric = {
    ...baseRubric,
    value: { level: "adequate", reason: "Preço justo para o segmento" },
  };
  const result = classifyOpportunity(rubric, basePriceEvidence);
  assert.equal(result.opportunityClass, "good_buy");
  assert.equal(result.state, "candidate");
});

test("classifyOpportunity: queda de preço comprovada em E2 gera special e estado prioritized", () => {
  const rubric = {
    ...baseRubric,
    value: { level: "adequate", reason: "Preço justo" },
  };
  const priceEvidence = {
    ...basePriceEvidence,
    state: "E2",
    priceCents: 7500,
    priorMinCents: 9000,
  };
  const result = classifyOpportunity(rubric, priceEvidence);
  assert.equal(result.opportunityClass, "special");
  assert.equal(result.state, "prioritized");
});

test("classifyOpportunity: qualidade forte + valor forte + confiança forte gera gold", () => {
  const rubric = {
    ...baseRubric,
    quality: { level: "strong", reason: "Qualidade premium" },
    value: { level: "strong", reason: "Metade do preço de concorrentes" },
    evidenceConfidence: { level: "strong", reason: "Centenas de avaliações verificadas" },
  };
  const result = classifyOpportunity(rubric, basePriceEvidence);
  assert.equal(result.opportunityClass, "gold");
  assert.equal(result.state, "prioritized");
});

test("classifyOpportunity: sinalizador de risco segura como held e unclassified", () => {
  const rubric = {
    ...baseRubric,
    safetyFlags: ["possivel_falsificacao"],
  };
  const result = classifyOpportunity(rubric, basePriceEvidence);
  assert.equal(result.opportunityClass, "unclassified");
  assert.equal(result.state, "held");
});

test("rankOpportunities: ordenação lexicográfica respeita estado e classe", () => {
  const oppCandidate = {
    id: "opp-1",
    state: "candidate",
    class: "good_buy",
    updatedAt: "2026-10-14T10:00:00Z",
  };
  const oppPrioritized = {
    id: "opp-2",
    state: "prioritized",
    class: "special",
    updatedAt: "2026-10-14T09:00:00Z",
  };
  const oppGold = {
    id: "opp-3",
    state: "prioritized",
    class: "gold",
    updatedAt: "2026-10-14T08:00:00Z",
  };

  const ranked = rankOpportunities([oppCandidate, oppPrioritized, oppGold]);
  assert.equal(ranked[0].id, "opp-3"); // Prioritized + Gold
  assert.equal(ranked[1].id, "opp-2"); // Prioritized + Special
  assert.equal(ranked[2].id, "opp-1"); // Candidate
});
