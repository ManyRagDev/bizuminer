import assert from "node:assert/strict";
import test from "node:test";
import {
  compareReviewEvidence,
  explainEvidenceComparison,
  hasSuperiorityClaim,
  ratingConfidenceScore,
  resolveVariantEvidence,
  validateComparativeBasis,
  isMateriallyEquivalent,
} from "../lib/comparison-evidence.ts";

test("resolveVariantEvidence identifica variante sustentada pela fonte e marca ausente ou sem fonte como não confirmada", () => {
  // Com variante e com fonte verificada (BUG-017)
  const confirmed = resolveVariantEvidence({
    variantKey: "110v_inox",
    variantLabel: "110V Inox Escovado",
    source: { marketplace: "mercadolivre", method: "api", capturedAt: "2026-10-19T10:00:00Z" },
  });
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.variantKey, "110v_inox");
  assert.equal(confirmed.variantLabel, "110V Inox Escovado");
  assert.equal(confirmed.description, "110V Inox Escovado");

  // Apenas com variantKey e fonte válida
  const keyOnly = resolveVariantEvidence({
    variantKey: "preto_220v",
    source: { url: "https://example.com/p1", capturedAt: "2026-10-19T10:00:00Z" },
  });
  assert.equal(keyOnly.confirmed, true);
  assert.equal(keyOnly.variantKey, "preto_220v");
  assert.equal(keyOnly.variantLabel, null);
  assert.equal(keyOnly.description, "preto_220v");

  // BUG-017: com variante mas SEM fonte auditável -> não confirmada (campos nulos)
  const noSource = resolveVariantEvidence({ variantKey: "110v_inox", variantLabel: "110V Inox Escovado" });
  assert.equal(noSource.confirmed, false);
  assert.equal(noSource.variantKey, null);
  assert.equal(noSource.variantLabel, null);
  assert.equal(noSource.description, "não confirmada");

  // Sem variante ou com valores vazios/inválidos -> não confirmada
  for (const empty of [null, undefined, {}, { variantKey: "" }, { variantLabel: "   " }, { otherField: 123 }]) {
    const unconfirmed = resolveVariantEvidence(empty);
    assert.equal(unconfirmed.confirmed, false);
    assert.equal(unconfirmed.variantKey, null);
    assert.equal(unconfirmed.variantLabel, null);
    assert.equal(unconfirmed.description, "não confirmada");
  }
});

test("AC-028.2 / BUG-022: ratingConfidenceScore retorna null para amostra nula, negativa ou fracionária", () => {
  assert.equal(ratingConfidenceScore(4.5, null), null);
  assert.equal(ratingConfidenceScore(4.5, -3), null);
  assert.equal(ratingConfidenceScore(4.5, 2.8), null);
  assert.equal(ratingConfidenceScore(null, 100), null);

  // Amostra inteira não-negativa válida produz score numérico
  const score = ratingConfidenceScore(4.6, 1500);
  assert.ok(typeof score === "number" && score > 4.0);
});

test("AC-028.2: 4,9★/8 avaliações vs 4,6★/1.500 avaliações no mesmo marketplace prioriza a segunda para exame sem alegação de 'melhor'", () => {
  const itemA = {
    id: "item_small_sample",
    marketplace: "mercadolivre",
    ratingStar: 4.9,
    reviewCount: 8,
    salesCount: 15,
    observedAt: "2026-10-19T10:00:00Z",
  };

  const itemB = {
    id: "item_robust_sample",
    marketplace: "mercadolivre",
    ratingStar: 4.6,
    reviewCount: 1500,
    salesCount: 4500,
    observedAt: "2026-10-19T10:00:00Z",
  };

  const scoreA = ratingConfidenceScore(itemA.ratingStar, itemA.reviewCount);
  const scoreB = ratingConfidenceScore(itemB.ratingStar, itemB.reviewCount);
  assert.ok(scoreB > scoreA, `Score B (${scoreB}) deve ser maior que Score A (${scoreA}) devido à robustez da amostra`);

  const order = compareReviewEvidence(itemA, itemB);
  assert.ok(order > 0, "Item B (amostra robusta) deve vir antes do Item A na priorização de exame");

  const explanation = explainEvidenceComparison(itemA, itemB);
  assert.equal(explanation.prioritizedId, "item_robust_sample");
  assert.equal(explanation.isClaimOfBest, false, "Jamais deve produzir alegação de 'melhor'");
  assert.ok(
    explanation.reasons.some((r) => r.includes("amostra robusta")),
    "Deve registrar razão sobre a confiança estatística da amostra robusta"
  );
});

test("AC-028.2: ausência de reviewCount, vendas aproximadas, nota abaixo do piso e lojas distintas produzem razões conservadoras", () => {
  // 1. Lojas distintas não comparam vendas
  const crossMarketplace = explainEvidenceComparison(
    { id: "ml_1", marketplace: "mercadolivre", ratingStar: 4.5, reviewCount: 100, salesCount: 50 },
    { id: "shopee_1", marketplace: "shopee", ratingStar: 4.5, reviewCount: 100, salesCount: 500 }
  );
  assert.ok(crossMarketplace.reasons.some((r) => r.includes("denominador comparável")));

  // 2. Ausência de reviewCount
  const missingReviews = explainEvidenceComparison(
    { id: "a", marketplace: "mercadolivre", ratingStar: 4.8, reviewCount: null, salesCount: 100 },
    { id: "b", marketplace: "mercadolivre", ratingStar: 4.7, reviewCount: 50, salesCount: 100 }
  );
  assert.ok(missingReviews.reasons.some((r) => r.includes("amostra de avaliações desconhecida")));

  // 3. Vendas aproximadas (salesLabel sem salesCount seguro)
  const approxSales = explainEvidenceComparison(
    { id: "a", marketplace: "mercadolivre", ratingStar: 4.5, reviewCount: 50, salesCount: null, salesLabel: "+1 mil vendidos" },
    { id: "b", marketplace: "mercadolivre", ratingStar: 4.5, reviewCount: 50, salesCount: 100 }
  );
  assert.ok(approxSales.reasons.some((r) => r.includes("vendas aproximadas")));

  // 4. Nota abaixo do piso (< 4.0)
  const lowRating = explainEvidenceComparison(
    { id: "a", marketplace: "mercadolivre", ratingStar: 3.8, reviewCount: 200, salesCount: 100 },
    { id: "b", marketplace: "mercadolivre", ratingStar: 4.5, reviewCount: 50, salesCount: 100 }
  );
  assert.ok(lowRating.reasons.some((r) => r.includes("abaixo do piso mínimo de 4,0")));
});

test("hasSuperiorityClaim detecta linguagem pública de superioridade inequívoca inclusive superlativos de preço (BUG-023)", () => {
  // Superioridade inequívoca
  assert.equal(hasSuperiorityClaim("A melhor cafeteira para sua cozinha"), true);
  assert.equal(hasSuperiorityClaim("O melhor custo-benefício"), true);
  assert.equal(hasSuperiorityClaim("Opção superior às concorrentes"), true);
  assert.equal(hasSuperiorityClaim("Cafeteira imbatível no preço"), true);
  assert.equal(hasSuperiorityClaim("Campeã de vendas do ano"), true);
  assert.equal(hasSuperiorityClaim("Líder absoluto em café espresso"), true);
  assert.equal(hasSuperiorityClaim("A número 1 da categoria"), true);

  // BUG-023: Superlativos de preço
  assert.equal(hasSuperiorityClaim("A mais barata entre as cafeteiras"), true);
  assert.equal(hasSuperiorityClaim("A opção mais barata da loja"), true);
  assert.equal(hasSuperiorityClaim("O produto mais barato da categoria"), true);
  assert.equal(hasSuperiorityClaim("Menor preço garantido"), true);
  assert.equal(hasSuperiorityClaim("Com os menores preços"), true);
  assert.equal(hasSuperiorityClaim("A escolha mais em conta"), true);

  // Texto descritivo / legítimo (não é alegação de superioridade)
  assert.equal(hasSuperiorityClaim("Cafeteira elétrica 15 xícaras com jarra de inox"), false);
  assert.equal(hasSuperiorityClaim("Boa opção prática com filtro permanente"), false);
  assert.equal(hasSuperiorityClaim("Indicamos pela facilidade de limpeza e aquecimento rápido"), false);
  assert.equal(hasSuperiorityClaim("Preço justo e entrega rápida"), false);
  assert.equal(hasSuperiorityClaim(""), false);
  assert.equal(hasSuperiorityClaim(null), false);
});

test("validateComparativeBasis valida estrutura, recorte de uso, alternativas, critérios, justificativa e referências (BUG-020)", () => {
  // Sucesso com recorte de uso, faixa de preço, critérios e referências canônicas para candidato e alternativas
  const valid = validateComparativeBasis({
    version: "v1",
    usageScope: "café espresso doméstico diário",
    priceRange: { minCents: 50000, maxCents: 120000 },
    alternativeProductIds: ["prod_alt_1", "prod_alt_2"],
    criteria: ["pressão 15 bar", "bico vaporizador de leite"],
    rationale: "Melhor controle térmico e acabamento em aço inox frente às alternativas de plástico.",
    evidenceReferences: {
      prod_main: { observedAt: "2026-10-19T10:00:00Z", priceCents: 79000 },
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000 },
      prod_alt_2: { observedAt: "2026-10-19T10:00:00Z", priceCents: 95000 },
    },
  }, "prod_main");
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.alternativeProductIds.length, 2);
    assert.equal(valid.value.usageScope, "café espresso doméstico diário");
    assert.deepEqual(valid.value.priceRange, { minCents: 50000, maxCents: 120000 });
    assert.equal(valid.value.criteria.length, 2);
  }

  // Falha: sem alternativas
  const noAlt = validateComparativeBasis({
    usageScope: "café expresso",
    alternativeProductIds: [],
    rationale: "Justificativa válida",
  });
  assert.equal(noAlt.ok, false);
  assert.equal(noAlt.error, "comparative_basis_alternatives_required");

  // Falha: alternativa aponta para si mesmo
  const selfAlt = validateComparativeBasis({
    usageScope: "café expresso",
    alternativeProductIds: ["prod_main"],
    rationale: "Justificativa válida",
  }, "prod_main");
  assert.equal(selfAlt.ok, false);
  assert.equal(selfAlt.error, "alternative_cannot_be_self");

  // Falha: sem recorte de uso e sem faixa de preço
  const noScope = validateComparativeBasis({
    alternativeProductIds: ["prod_alt_1"],
    criteria: ["pressão 15 bar"],
    rationale: "Justificativa válida",
    evidenceReferences: {
      prod_main: { observedAt: "2026-10-19T10:00:00Z", priceCents: 79000 },
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000 },
    },
  }, "prod_main");
  assert.equal(noScope.ok, false);
  assert.equal(noScope.error, "comparative_basis_scope_or_price_required");

  // Falha: sem critérios explícitos (BUG-020)
  const noCriteria = validateComparativeBasis({
    usageScope: "café expresso",
    alternativeProductIds: ["prod_alt_1"],
    criteria: [],
    rationale: "Justificativa válida",
    evidenceReferences: {
      prod_main: { observedAt: "2026-10-19T10:00:00Z", priceCents: 79000 },
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000 },
    },
  }, "prod_main");
  assert.equal(noCriteria.ok, false);
  assert.equal(noCriteria.error, "comparative_basis_criteria_required");

  // Falha: sem justificativa humana
  const noRationale = validateComparativeBasis({
    usageScope: "café expresso",
    alternativeProductIds: ["prod_alt_1"],
    criteria: ["pressão 15 bar"],
    rationale: "   ",
    evidenceReferences: {
      prod_main: { observedAt: "2026-10-19T10:00:00Z", priceCents: 79000 },
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000 },
    },
  }, "prod_main");
  assert.equal(noRationale.ok, false);
  assert.equal(noRationale.error, "comparative_basis_rationale_required");

  // Falha: sem evidências canônicas para o candidato ou alternativas (BUG-020)
  const missingEvidence = validateComparativeBasis({
    usageScope: "café expresso",
    alternativeProductIds: ["prod_alt_1"],
    criteria: ["pressão 15 bar"],
    rationale: "Justificativa válida",
    evidenceReferences: {
      // Falta prod_main
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000 },
    },
  }, "prod_main");
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.error, "comparative_basis_references_required");

  // Falha: justificativa comparativa igual à alegação pública (BUG-020 / AC-036.4)
  const duplicatedRationale = validateComparativeBasis({
    usageScope: "café expresso",
    alternativeProductIds: ["prod_alt_1"],
    criteria: ["pressão 15 bar"],
    rationale: "A melhor cafeteira do mercado nacional.",
    evidenceReferences: {
      prod_main: { observedAt: "2026-10-19T10:00:00Z", priceCents: 79000 },
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000 },
    },
  }, "prod_main", "A melhor cafeteira do mercado nacional.");
  assert.equal(duplicatedRationale.ok, false);
  assert.equal(duplicatedRationale.error, "comparative_basis_rationale_must_be_distinct");

  // Sucesso com justificativa distinta e versão v3 com referências canônicas e cortes duráveis
  const distinctValid = validateComparativeBasis({
    version: "v3",
    usageScope: "café expresso",
    alternativeProductIds: ["prod_alt_1"],
    criteria: ["pressão 15 bar"],
    rationale: "Comparada com a Philco pelo critério de pressão de bomba superior.",
    evidenceReferences: {
      prod_main: { observedAt: "2026-10-19T10:00:00Z", priceCents: 79000, observationId: "obs_1", latestCurationEventId: "10", latestEvidenceEventId: "42" },
      prod_alt_1: { observedAt: "2026-10-19T10:00:00Z", priceCents: 89000, observationId: "obs_2", latestCurationEventId: "12", latestEvidenceEventId: "43" },
    },
  }, "prod_main", "A melhor cafeteira do mercado nacional.");
  assert.equal(distinctValid.ok, true);
  if (distinctValid.ok) {
    assert.equal(distinctValid.value.version, "v3");
    assert.equal(distinctValid.value.evidenceReferences?.prod_main.observationId, "obs_1");
    assert.equal(distinctValid.value.evidenceReferences?.prod_main.latestEvidenceEventId, "42");
  }
});

test("AC-037.3: isMateriallyEquivalent discrimina alterações materiais e tolera recapturas equivalentes", () => {
  const ref = {
    observedAt: "2026-10-19T10:00:00Z",
    priceCents: 49900,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/123",
    sourceUrl: "http://alternative",
    sourceMarketplace: "mercadolivre",
    variantKey: "110v",
    variantLabel: "110V",
    variantConfirmed: true,
  };

  // Recaptura equivalente: mesmo preço, variante confirmada, lojas e URLs
  assert.equal(isMateriallyEquivalent(ref, {
    priceCents: 49900,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/123",
    sourceUrl: "http://alternative",
    sourceMarketplace: "mercadolivre",
    variantKey: "110v",
    variantConfirmed: true,
  }), true);

  // Alteração de preço
  assert.equal(isMateriallyEquivalent(ref, {
    priceCents: 90000,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/123",
    sourceUrl: "http://alternative",
    variantKey: "110v",
    variantConfirmed: true,
  }), false);

  // Alteração de URL de origem (sourceUrl)
  assert.equal(isMateriallyEquivalent(ref, {
    priceCents: 49900,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/123",
    sourceUrl: "http://different-seller",
    variantKey: "110v",
    variantConfirmed: true,
  }), false);

  // Alteração de productUrl
  assert.equal(isMateriallyEquivalent(ref, {
    priceCents: 49900,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/999",
    sourceUrl: "http://alternative",
    variantKey: "110v",
    variantConfirmed: true,
  }), false);

  // Variante confirmada muda
  assert.equal(isMateriallyEquivalent(ref, {
    priceCents: 49900,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/123",
    sourceUrl: "http://alternative",
    variantKey: "220v",
    variantConfirmed: true,
  }), false);

  // Variante confirmada deixa de ser confirmada
  assert.equal(isMateriallyEquivalent(ref, {
    priceCents: 49900,
    marketplace: "mercadolivre",
    externalId: "MLB123",
    productUrl: "https://example.test/p/123",
    sourceUrl: "http://alternative",
    variantKey: null,
    variantConfirmed: false,
  }), false);

  // Operação delete
  assert.equal(isMateriallyEquivalent(ref, {
    deleted: true,
    priceCents: 49900,
  }), false);
});


