import assert from "node:assert/strict";
import test from "node:test";
import {
  EDITORIAL_DIMENSIONS, EDITORIAL_POLICY_VERSION,
  editorialOfferBlockers, editorialSelectionBlockers, publishedEditorialStateKey, validateEditorialAssessment,
} from "../lib/editorial-selection.ts";
import { catalogHeroPresentation, classifyHeroCandidate, rankHeroCandidates } from "../lib/hero-ranking.ts";
import {
  HERO_LEVEL_POINTS, HERO_MAX_PRODUCTS, HERO_POLICY_VERSION,
  HERO_RUBRIC, HERO_WEIGHTS,
} from "../lib/hero-policy.ts";

const now = new Date("2026-10-06T15:00:00.000Z");
const hour = 3_600_000;
const day = 24 * hour;

function assessment(levels = {}, changes = {}) {
  return {
    id: "assessment_1", productId: "product_1", evidenceFingerprint: "reviewed-facts",
    dimensions: Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, {
      level: levels[id] ?? "strong", reason: `Fonte identificada e evidência para ${id}.`,
    }])),
    audience: "Público de achadinhos que precisa organizar a casa.",
    benefit: "Organização simples para uma necessidade recorrente.",
    purchaseContents: "Um organizador de 60 litros; cobertores não incluídos.",
    publicRationale: "Uma opção prática para organizar roupas de cama com a compra esclarecida.",
    criticalDoubts: [], maxPriceCents: 3500, priceCentsAtAssessment: 2500,
    createdAt: now.toISOString(), policyVersion: EDITORIAL_POLICY_VERSION,
    heroPolicyVersion: HERO_POLICY_VERSION,
    ...changes,
  };
}

function candidate(id = "product_1", levels = {}, changes = {}) {
  return {
    id, curationStatus: "approved", evidenceFingerprint: "reviewed-facts",
    evidenceObservedAt: now.toISOString(), lastSeenAt: now.toISOString(),
    imageUrl: "https://example.com/organizador.jpg", priceCents: 2500,
    offerEvidence: { variantKey: "60l", packageQuantity: 1 },
    assessment: assessment(levels, { productId: id, id: `assessment_${id}` }),
    ...changes,
  };
}

const exceptional = Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, "exceptional"]));
const adequate = Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, "adequate"]));

function catalogCandidate(id = "catalog_1", changes = {}) {
  return candidate(id, {}, { assessment: null, offerEvidence: {}, ...changes });
}

test("hero v2 tem rubrica explícita e pesos completos para ordenar até três produtos", () => {
  assert.equal(HERO_POLICY_VERSION, "hero-v2");
  assert.equal(HERO_MAX_PRODUCTS, 3);
  assert.equal(Object.values(HERO_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
  assert.deepEqual(HERO_WEIGHTS, { audience: 30, utility: 25, value: 25, confidence: 10, clarity: 10 });
  assert.deepEqual(HERO_LEVEL_POINTS, { unknown: null, weak: 20, adequate: 60, strong: 80, exceptional: 100 });
  for (const { id } of EDITORIAL_DIMENSIONS) {
    for (const level of ["adequate", "strong", "exceptional"]) {
      assert.ok(HERO_RUBRIC[id][level].length > 30, `${id}/${level} deve orientar a revisão`);
    }
    assert.notEqual(HERO_RUBRIC[id].strong, HERO_RUBRIC[id].exceptional);
  }
});

test("todas as dimensões adequadas ou fortes participam sem corte mínimo de nota", () => {
  for (const [levels, score] of [[adequate, 60], [{}, 80]]) {
    const product = candidate(`score_${score}`, levels);
    assert.deepEqual(editorialSelectionBlockers(product, product.assessment, now), []);
    const result = classifyHeroCandidate(product, now);
    assert.equal(result.status, "hero");
    assert.equal(result.basis, "editorial");
    assert.equal(result.score, score);
    assert.deepEqual(result.reasons, []);
    assert.equal(rankHeroCandidates([product], now)[0].selectedForHero, true);
  }
});

test("a contribuição de cada dimensão explica a nota editorial", () => {
  const result = classifyHeroCandidate(candidate("p90", { utility: "exceptional", value: "exceptional" }), now);
  assert.equal(result.status, "hero");
  assert.equal(result.score, 90);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.breakdown, [
    { id: "audience", weight: 30, points: 80, contribution: 24 },
    { id: "utility", weight: 25, points: 100, contribution: 25 },
    { id: "value", weight: 25, points: 100, contribution: 25 },
    { id: "confidence", weight: 10, points: 80, contribution: 8 },
    { id: "clarity", weight: 10, points: 80, contribution: 8 },
  ]);
  assert.equal(result.breakdown.reduce((sum, dimension) => sum + dimension.contribution, 0), result.score);
});

test("dimensão adequada reduz posição relativa e não impede disputar hero", () => {
  for (const { id } of EDITORIAL_DIMENSIONS) {
    const product = candidate(`adequate_${id}`, { ...exceptional, [id]: "adequate" });
    assert.deepEqual(editorialSelectionBlockers(product, product.assessment, now), []);
    const result = classifyHeroCandidate(product, now);
    assert.equal(result.status, "hero");
    assert.ok(result.score < 100);
    assert.deepEqual(result.reasons, []);
    assert.equal(rankHeroCandidates([product], now)[0].selectedForHero, true);
    if (id === "confidence" || id === "clarity") assert.equal(result.score, 96);
  }
});

test("notas excelentes não compensam nenhuma dimensão fraca ou desconhecida", () => {
  for (const { id } of EDITORIAL_DIMENSIONS) {
    for (const level of ["weak", "unknown"]) {
      const result = classifyHeroCandidate(candidate(`${level}_${id}`, { ...exceptional, [id]: level }), now);
      assert.equal(result.status, "blocked");
      assert.equal(result.basis, "editorial");
      assert.deepEqual(result.catalogSignals, []);
      assert.ok(result.reasons.length > 0);
      if (level === "unknown") {
        assert.equal(result.score, null, "desconhecido não vira zero nem nota inferida");
        assert.equal(result.breakdown.find((dimension) => dimension.id === id).contribution, null);
      }
    }
  }
});

test("avaliações hero v1 ou sem versão continuam comparáveis sem exigir outra revisão", () => {
  for (const heroPolicyVersion of [undefined, "hero-v1", HERO_POLICY_VERSION]) {
    const previous = assessment(adequate, { heroPolicyVersion });
    assert.equal(validateEditorialAssessment(previous, true).ok, true);
    const result = classifyHeroCandidate(candidate("legacy", adequate, { assessment: previous }), now);
    assert.equal(result.status, "hero");
    assert.equal(result.basis, "editorial");
    assert.equal(result.score, 60);
    assert.deepEqual(result.reasons, []);
  }
});

test("rubrica de outra versão permanece válida na seleção histórica, mas não aceita nova gravação nem hero", () => {
  const historical = assessment(exceptional, { heroPolicyVersion: "hero-v3" });
  assert.equal(validateEditorialAssessment(historical).ok, false, "entrada nova só aceita a rubrica atual");
  const validated = validateEditorialAssessment(historical, true);
  assert.equal(validated.ok, true);
  assert.equal(validated.value.heroPolicyVersion, "hero-v3", "a revisão histórica não é reetiquetada como atual");
  const product = candidate("historical_policy", exceptional, { assessment: historical });
  assert.deepEqual(editorialSelectionBlockers(product, historical, now), []);
  const classification = classifyHeroCandidate(product, now);
  assert.equal(classification.status, "selection");
  assert.equal(classification.score, null);
  assert.ok(classification.reasons.some((reason) => reason.includes("rubrica compatível")));
  for (const heroPolicyVersion of ["hero-v0", "hero-v-1", "hero-v1oops", "", null, 1, {}]) {
    assert.equal(validateEditorialAssessment({ ...historical, heroPolicyVersion }, true).ok, false, "versão histórica deve manter formato reconhecido");
  }
});

test("avaliação malformada não é apagada para produzir fallback", () => {
  for (const review of [assessment(exceptional, { heroPolicyVersion: "unrecognized" }), assessment(exceptional, { dimensions: {} })]) {
    const result = classifyHeroCandidate(candidate("invalid", exceptional, { assessment: review }), now);
    assert.equal(result.status, "blocked");
    assert.equal(result.basis, "editorial");
    assert.deepEqual(result.catalogSignals, []);
    assert.equal(result.score, null);
  }
});

test("snapshot do preço vem do servidor e não é aceito como campo do formulário", () => {
  const validated = validateEditorialAssessment(assessment(exceptional, { priceCentsAtAssessment: 1 }));
  assert.equal(validated.ok, true);
  assert.equal("priceCentsAtAssessment" in validated.value, false);
  assert.equal(validated.value.heroPolicyVersion, HERO_POLICY_VERSION);
});

test("preço dentro do teto humano não exige snapshot nem nova revisão exclusiva para hero", () => {
  const review = assessment(exceptional);
  for (const snapshot of [undefined, null, 0, -1, NaN, Infinity, 2500.5, Number.MAX_SAFE_INTEGER + 1]) {
    const result = classifyHeroCandidate(candidate("missing_price", exceptional, { assessment: { ...review, priceCentsAtAssessment: snapshot } }), now);
    assert.equal(result.status, "hero");
    assert.deepEqual(result.reasons, []);
  }
  const raised = candidate("raised", exceptional, { priceCents: 2501, assessment: review });
  assert.deepEqual(editorialSelectionBlockers(raised, review, now), []);
  assert.equal(classifyHeroCandidate(raised, now).status, "hero");
  for (const priceCents of [2500, 1000, 3500]) {
    assert.equal(classifyHeroCandidate(candidate("valid_price", exceptional, { priceCents, assessment: review }), now).status, "hero");
  }
});

test("nota máxima continua subordinada a aprovação, frescura, identidade, dúvida e configuração", () => {
  const variations = [
    { curationStatus: "pending" }, { imageUrl: null }, { priceCents: 0 },
    { evidenceObservedAt: new Date(now.getTime() - 48 * hour - 1).toISOString() },
    { evidenceObservedAt: new Date(now.getTime() + 60_001).toISOString() },
    { lastSeenAt: new Date(now.getTime() - 7 * day - 1).toISOString() },
    { evidenceFingerprint: "announcement-changed" },
    { priceCents: 3501 },
    { offerEvidence: { priceMinCents: 1000, priceMaxCents: 5000 } },
    { assessment: assessment(exceptional, { policyVersion: "old-editorial-policy" }) },
    { assessment: assessment(exceptional, { criticalDoubts: ["A configuração anunciada inclui o acessório?"] }) },
  ];
  for (const changes of variations) {
    const result = classifyHeroCandidate(candidate("blocked", exceptional, changes), now);
    assert.equal(result.status, "blocked", JSON.stringify(changes));
    assert.ok(result.reasons.length > 0);
    assert.equal(rankHeroCandidates([candidate("blocked", exceptional, changes)], now)[0].selectedForHero, false);
  }
});

test("hero pega até três melhores; empate usa posição editorial e depois ID, não a ordem de entrada", () => {
  const pool = [
    candidate("p90", { utility: "exceptional", value: "exceptional" }),
    candidate("z100", exceptional), candidate("a100", exceptional),
    candidate("p96", { ...exceptional, confidence: "strong", clarity: "strong" }),
    candidate("selection80"),
    candidate("blocked100", exceptional, { curationStatus: "held" }),
  ];
  const positions = new Map([["z100", 1], ["a100", 2], ["p96", 0], ["p90", 3]]);
  const ranked = rankHeroCandidates(pool, now, positions);
  assert.deepEqual(ranked.filter((entry) => entry.selectedForHero).map((entry) => entry.candidate.id), ["z100", "a100", "p96"]);
  assert.deepEqual(ranked.filter((entry) => entry.heroRank !== null).map((entry) => entry.heroRank), [1, 2, 3, 4, 5]);
  assert.deepEqual(rankHeroCandidates([...pool].reverse(), now, positions).map((entry) => entry.candidate.id), ranked.map((entry) => entry.candidate.id));
  assert.deepEqual(rankHeroCandidates([candidate("z", exceptional), candidate("a", exceptional)], now).map((entry) => entry.candidate.id), ["a", "z"]);
});

test("poucos produtos válidos ocupam lugares disponíveis sem completar com itens bloqueados", () => {
  assert.deepEqual(rankHeroCandidates([], now), []);
  assert.equal(rankHeroCandidates([candidate("strong"), candidate("blocked", exceptional, { imageUrl: null })], now).filter((entry) => entry.selectedForHero).length, 1);
  const ranked = rankHeroCandidates([candidate("adequate", adequate), candidate("strong"), candidate("excellent", exceptional)], now);
  assert.deepEqual(ranked.filter((entry) => entry.selectedForHero).map((entry) => entry.candidate.id), ["excellent", "strong", "adequate"]);
});

test("estrelas, vendas, desconto anunciado, marketplace e categoria não aumentam a nota", () => {
  const baseline = classifyHeroCandidate(candidate("neutral", exceptional), now);
  const promoted = classifyHeroCandidate(candidate("neutral", exceptional, {
    ratingStar: 5, salesCount: 999999, salesLabel: "Milhões de vendas", discountPercent: 99,
    originalPriceCents: 999999, lowestVerified: true, marketplace: "shopee", category: "popular",
  }), now);
  assert.deepEqual(promoted, baseline);
  const stillStrong = classifyHeroCandidate(candidate("not_exceptional", {}, { ratingStar: 5, salesCount: 999999, discountPercent: 99, lowestVerified: true }), now);
  assert.equal(stillStrong.status, "hero");
  assert.equal(stillStrong.score, 80);
});

test("classificação não altera candidatos, avaliações ou posições editoriais", () => {
  const pool = [candidate("z", exceptional), candidate("a")];
  const before = structuredClone(pool);
  const positions = new Map([["z", 0], ["a", 1]]);
  rankHeroCandidates(pool, now, positions);
  assert.deepEqual(pool, before);
  assert.deepEqual([...positions], [["z", 0], ["a", 1]]);
});

test("assinatura pública muda quando hero ou elegibilidade muda sem nova versão editorial", () => {
  const selection = {
    mode: "catalog", schemaReady: true, id: null, version: null,
    validUntil: new Date(now.getTime() + day).toISOString(),
    products: [{ id: "product_1", priceCents: 2500, evidenceObservedAt: now.toISOString() }],
    heroProductIds: ["product_1"], heroValidUntil: new Date(now.getTime() + day).toISOString(),
  };
  const baseline = publishedEditorialStateKey(selection);
  assert.equal(publishedEditorialStateKey(structuredClone(selection)), baseline);
  for (const changes of [
    { mode: "editorial" },
    { heroProductIds: [] }, { heroValidUntil: null }, { products: [] },
    { products: [{ ...selection.products[0], priceCents: 2501 }] },
    { products: [{ ...selection.products[0], evidenceObservedAt: new Date(now.getTime() + hour).toISOString() }] },
  ]) {
    assert.notEqual(publishedEditorialStateKey({ ...selection, ...changes }), baseline);
  }
});

test("sem avaliação há ranking factual, sem inventar notas humanas nem impor corte", () => {
  const product = catalogCandidate("no_signals");
  assert.deepEqual(editorialOfferBlockers(product, now), []);
  assert.ok(editorialSelectionBlockers(product, null, now).length > 0);
  const result = classifyHeroCandidate(product, now);
  assert.equal(result.status, "hero");
  assert.equal(result.basis, "catalog");
  assert.equal(result.score, 0);
  assert.deepEqual(result.breakdown, []);
  assert.deepEqual(result.catalogSignals, []);
  assert.deepEqual(result.reasons, []);
  assert.equal(rankHeroCandidates([product], now)[0].selectedForHero, true);
  assert.equal(product.assessment, null);
});

test("ofertas sem avaliação também respeitam aprovação, frescura, preço e configuração", () => {
  for (const changes of [
    { curationStatus: "pending" }, { curationStatus: "rejected" }, { curationStatus: "held" }, { imageUrl: null },
    { priceCents: -1 }, { priceCents: 2500.5 },
    { evidenceObservedAt: null }, { evidenceObservedAt: new Date(now.getTime() - 48 * hour - 1) },
    { lastSeenAt: new Date(now.getTime() - 7 * day - 1) },
    { offerEvidence: { priceMinCents: 1000, priceMaxCents: 3000 } },
  ]) assert.equal(rankHeroCandidates([catalogCandidate("invalid", changes)], now)[0].selectedForHero, false);
});

test("avaliação humana válida tem prioridade sem comparar escalas de notas diferentes", () => {
  const completeCatalog = catalogCandidate("catalog100", {
    priceCents: 2500, previousMinPriceCents: 5000, lowestVerified: true,
    observationCount: 3, historyDays: 7, ratingStar: 5, salesCount: 999999,
    offerEvidence: { reviewCount: 20, packageContents: ["Um organizador"], packageQuantity: 1, variantKey: "60l" },
  });
  assert.equal(classifyHeroCandidate(completeCatalog, now).score, 100);
  const reviewed = candidate("reviewed60", adequate);
  const ranked = rankHeroCandidates([completeCatalog, reviewed], now);
  assert.deepEqual(ranked.map((entry) => entry.candidate.id), ["reviewed60", "catalog100"]);
  assert.deepEqual(ranked.map((entry) => entry.heroRank), [1, 2]);
});

test("revisão negativa ou desatualizada não vira fallback mesmo com sinais cataloguais máximos", () => {
  for (const changes of [
    { evidenceFingerprint: "announcement-changed" },
    { assessment: assessment(exceptional, { criticalDoubts: ["O acessório indicado não foi confirmado."] }) },
    { assessment: assessment({ ...exceptional, confidence: "weak" }) },
    { assessment: assessment(exceptional, { maxPriceCents: 2000 }) },
  ]) {
    const product = candidate("negative", exceptional, {
      ratingStar: 5, salesCount: 999999, previousMinPriceCents: 5000, lowestVerified: true,
      observationCount: 3, historyDays: 7,
      offerEvidence: { reviewCount: 20, packageContents: ["Um organizador"], packageQuantity: 1, variantKey: "60l" },
      ...changes,
    });
    const result = classifyHeroCandidate(product, now);
    assert.equal(result.status, "blocked");
    assert.equal(result.basis, "editorial");
    assert.deepEqual(result.catalogSignals, []);
    assert.equal(rankHeroCandidates([product], now)[0].selectedForHero, false);
  }
});

test("preço riscado, desconto anunciado, ticket e categoria não dão pontos ao ranking factual", () => {
  const base = catalogCandidate("same", { priceCents: 2000 });
  const baseline = classifyHeroCandidate(base, now);
  for (const changes of [
    { originalPriceCents: 999999, discountPercent: 99 },
    { category: "eletronicos", marketplace: "shopee" },
    { priceCents: 1000000 }, { priceCents: 100 },
    { salesLabel: "Milhões de vendas, sem número capturado" },
  ]) assert.deepEqual(classifyHeroCandidate({ ...base, ...changes }, now), baseline);
});

test("histórico sem mínimo comparável não gera bônus nem alegações de menor preço", () => {
  for (const previousMinPriceCents of [undefined, null, 0, -1, NaN, Infinity, 2500.5]) {
    const result = classifyHeroCandidate(catalogCandidate("unverified", {
      previousMinPriceCents, lowestVerified: true, observationCount: 500, historyDays: 365,
    }), now);
    assert.equal(result.score, 0);
    assert.deepEqual(result.catalogSignals, []);
  }
  const product = catalogCandidate("comparable", {
    priceCents: 2500, previousMinPriceCents: 5000, lowestVerified: true, observationCount: 3, historyDays: 7,
  });
  const result = classifyHeroCandidate(product, now);
  assert.equal(result.score, 45);
  assert.ok(result.catalogSignals.some((signal) => signal.label.includes("mesma configuração")));
  assert.ok(result.catalogSignals.some((signal) => signal.label.includes("Histórico comparável")));
  assert.equal(classifyHeroCandidate({ ...product, lowestVerified: false }, now).score, 25);
});

test("amostra de avaliações controla o peso das estrelas sem presumir confiança plena", () => {
  const scores = [0, 1, 10, 20, 100].map((reviewCount) => classifyHeroCandidate(catalogCandidate(`reviews_${reviewCount}`, {
    ratingStar: 5, offerEvidence: { reviewCount },
  }), now).score);
  assert.deepEqual(scores, [0, 1.25, 12.5, 25, 25]);
  assert.equal(classifyHeroCandidate(catalogCandidate("unknown_sample", { ratingStar: 5 }), now).score, 12.5);
  for (const reviewCount of [-1, 0.5, "100", NaN, Infinity]) {
    assert.equal(classifyHeroCandidate(catalogCandidate("invalid_sample", { ratingStar: 5, offerEvidence: { reviewCount } }), now).score, 12.5);
  }
});

test("percentual de avaliações positivas não vira estrelas nem acumula bônus duplicado", () => {
  const percent = catalogCandidate("percentage", { offerEvidence: { positiveReviewRate: 0.9, reviewCount: 20 } });
  const classification = classifyHeroCandidate(percent, now);
  assert.equal(classification.score, 22.5);
  assert.deepEqual(classification.breakdown, []);
  const presentation = catalogHeroPresentation(percent, classification);
  assert.match(presentation.editorialRationale, /90% de avaliações positivas/);
  assert.doesNotMatch(presentation.editorialRationale, /\/5|★|estrelas/);
  const both = classifyHeroCandidate({ ...percent, ratingStar: 5 }, now);
  assert.equal(both.score, 25);
  assert.equal(both.catalogSignals.length, 1);
  for (const positiveReviewRate of [-1, 90, 1.1, "0.9", NaN, Infinity]) {
    assert.equal(classifyHeroCandidate(catalogCandidate("invalid_percentage", { offerEvidence: { positiveReviewRate } }), now).score, 0);
  }
});

test("estrelas inválidas e vendas sem número seguro não dão pontos", () => {
  for (const ratingStar of [0, -1, 6, "5", NaN, Infinity]) {
    assert.equal(classifyHeroCandidate(catalogCandidate("invalid_stars", { ratingStar }), now).score, 0);
  }
  for (const salesCount of [-1, 0, 1.5, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(classifyHeroCandidate(catalogCandidate("invalid_sales", { salesCount }), now).score, 0);
  }
  assert.equal(classifyHeroCandidate(catalogCandidate("sold", { salesCount: 999999 }), now).score, 5);
});

test("conteúdo público vem somente dos campos da fonte, nunca de título ou imagem", () => {
  const unknown = catalogCandidate("ambiguous", { title: "Kit com cobertores, bomba e organizador", imageUrl: "https://example.com/kit-completo.jpg" });
  const unknownPresentation = catalogHeroPresentation(unknown, classifyHeroCandidate(unknown, now));
  assert.equal(unknownPresentation.editorialPurchaseContents, "");
  assert.doesNotMatch(unknownPresentation.editorialRationale, /cobertores|bomba|kit/i);
  const declared = catalogCandidate("declared", {
    offerEvidence: { packageContents: [" Um saco organizador ", "Cobertores não incluídos", null, 5, ""], packageQuantity: 1, variantKey: "60l" },
  });
  const declaredPresentation = catalogHeroPresentation(declared, classifyHeroCandidate(declared, now));
  assert.equal(declaredPresentation.editorialPurchaseContents, "Informado pelo anúncio: Um saco organizador; Cobertores não incluídos");
  assert.equal(classifyHeroCandidate(declared, now).score, 25);
  assert.equal("assessment" in declaredPresentation, false);
});

test("classificação factual e apresentação não alteram dados nem fabricam avaliação humana", () => {
  const product = catalogCandidate("catalog", { offerEvidence: { packageContents: ["Um organizador"] } });
  const before = structuredClone(product);
  const [{ classification }] = rankHeroCandidates([product], now);
  catalogHeroPresentation(product, classification);
  assert.deepEqual(product, before);
  assert.equal(product.assessment, null);
});
