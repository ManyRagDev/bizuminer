import assert from "node:assert/strict";
import test from "node:test";
import {
  EDITORIAL_DIMENSIONS, EDITORIAL_MAX_PRODUCTS, EDITORIAL_POLICY_VERSION,
  CATALOG_EVIDENCE_POLICY_VERSION,
  editorialEvidenceFingerprint, editorialSelectionBlockers,
  publishedEditorialStateKey,
  validateEditorialAssessment, validateEditorialSelection,
} from "../lib/editorial-selection.ts";

const now = new Date("2026-10-05T15:00:00.000Z");
const hour = 3_600_000;
const day = 24 * hour;
const identity = {
  title: "Organizador de cobertores — unidade de 60 litros",
  imageUrl: "https://example.com/organizador.jpg",
  category: "casa", productUrl: "https://example.com/organizador",
  offerEvidence: { variantKey: "60l", packageQuantity: 1, packageContents: ["Um saco organizador; cobertores não incluídos"] },
};
const fingerprint = editorialEvidenceFingerprint(identity);
const candidate = {
  curationStatus: "approved", evidenceFingerprint: fingerprint,
  evidenceObservedAt: now.toISOString(), lastSeenAt: now.toISOString(),
  imageUrl: identity.imageUrl, priceCents: 2029,
};
function assessment(changes = {}) {
  return {
    id: "assessment_1", productId: "product_1", evidenceFingerprint: fingerprint,
    dimensions: Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, { level: "adequate", reason: "Conferido com as informações disponíveis no anúncio." }])),
    audience: "Pessoas que precisam organizar roupas de cama.",
    benefit: "Reúne os cobertores em um recipiente acessível.",
    purchaseContents: "Um saco organizador de 60 litros; cobertores não incluídos.",
    publicRationale: "Uma solução acessível para guardar roupas de cama, vendida por unidade.",
    criticalDoubts: [], maxPriceCents: 2500,
    createdAt: now.toISOString(), policyVersion: EDITORIAL_POLICY_VERSION,
    ...changes,
  };
}
function selection(changes = {}) {
  return {
    expectedVersion: null, validUntil: new Date(now.getTime() + day).toISOString(),
    items: [{ productId: "product_1", assessmentId: "assessment_1", destinations: ["home", "pauta"] }],
    ...changes,
  };
}

test("uma indicação completa e uma redução de preço permanecem elegíveis", () => {
  assert.equal(validateEditorialAssessment(assessment()).ok, true);
  assert.deepEqual(editorialSelectionBlockers(candidate, assessment(), now), []);
  assert.deepEqual(editorialSelectionBlockers({ ...candidate, priceCents: 1500 }, assessment(), now), []);
  assert.deepEqual(editorialSelectionBlockers({ ...candidate, priceCents: 2500 }, assessment(), now), []);
  assert.ok(editorialSelectionBlockers({ ...candidate, priceCents: 2501 }, assessment(), now).some((b) => b.includes("limite avaliado")));
});

test("cada dimensão fraca ou desconhecida bloqueia destaque mesmo com todas as demais fortes", () => {
  for (const { id, label } of EDITORIAL_DIMENSIONS) {
    for (const level of ["weak", "unknown"]) {
      const dimensions = Object.fromEntries(EDITORIAL_DIMENSIONS.map((d) => [d.id, { level: d.id === id ? level : "strong", reason: "Há evidência ou dúvida registrada para este critério." }]));
      const value = assessment({ dimensions });
      assert.equal(validateEditorialAssessment(value).ok, true, "uma avaliação negativa pode ser registrada");
      assert.ok(editorialSelectionBlockers(candidate, value, now).includes(`${label} precisa de revisão.`));
    }
  }
  assert.ok(editorialSelectionBlockers(candidate, assessment({ criticalDoubts: ["A bomba está incluída no pacote?"] }), now).some((b) => b.includes("dúvidas essenciais")));
});

test("aprovação, preço fresco, presença, imagem e preço válido são barreiras independentes", () => {
  for (const status of ["pending", "held", "rejected", "legacy_visible", ""]) {
    assert.ok(editorialSelectionBlockers({ ...candidate, curationStatus: status }, assessment(), now).some((b) => b.includes("sem aprovação")));
  }
  assert.deepEqual(editorialSelectionBlockers({ ...candidate, evidenceObservedAt: new Date(now.getTime() - 48 * hour), lastSeenAt: new Date(now.getTime() - 7 * day) }, assessment(), now), []);
  for (const observed of [null, "bad-date", new Date(now.getTime() - 48 * hour - 1), new Date(now.getTime() + 60_001)]) {
    assert.ok(editorialSelectionBlockers({ ...candidate, evidenceObservedAt: observed }, assessment(), now).some((b) => b.includes("observação válida")));
  }
  for (const seen of ["bad-date", new Date(now.getTime() - 7 * day - 1), new Date(now.getTime() + 60_001)]) {
    assert.ok(editorialSelectionBlockers({ ...candidate, lastSeenAt: seen }, assessment(), now).some((b) => b.includes("presença")));
  }
  assert.ok(editorialSelectionBlockers({ ...candidate, imageUrl: null }, assessment(), now).some((b) => b.includes("sem imagem")));
  for (const price of [0, -1, NaN, Infinity, 2029.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(editorialSelectionBlockers({ ...candidate, priceCents: price }, assessment(), now).some((b) => b.includes("Preço inválido")));
  }
  assert.ok(editorialSelectionBlockers(candidate, null, now).some((b) => b.includes("ainda não registrada")));
  assert.ok(editorialSelectionBlockers(candidate, assessment({ policyVersion: "old-policy" }), now).some((b) => b.includes("política editorial anterior")));
});

test("alterações materiais invalidam a avaliação do anúncio", () => {
  const variations = [
    { ...identity, title: "Kit com três organizadores" },
    { ...identity, imageUrl: "https://example.com/outra-configuracao.jpg" },
    { ...identity, category: "tecnologia" },
    { ...identity, ratingStar: 2.5 },
    { ...identity, offerEvidence: { ...identity.offerEvidence, positiveReviewRate: 70 } },
    { ...identity, productUrl: "https://example.com/outro-anuncio" },
    { ...identity, offerEvidence: { ...identity.offerEvidence, variantKey: "120l" } },
    { ...identity, offerEvidence: { ...identity.offerEvidence, packageQuantity: 3 } },
    { ...identity, offerEvidence: { ...identity.offerEvidence, packageContents: ["Cobertores", "saco"] } },
    { ...identity, offerEvidence: { ...identity.offerEvidence, dimensions: "20 × 30 cm" } },
    { ...identity, offerEvidence: { ...identity.offerEvidence, priceMinCents: 1000, priceMaxCents: 4000 } },
  ];
  for (const changed of variations) {
    const currentFingerprint = editorialEvidenceFingerprint(changed);
    assert.notEqual(currentFingerprint, fingerprint);
    assert.ok(editorialSelectionBlockers({ ...candidate, evidenceFingerprint: currentFingerprint }, assessment(), now).some((b) => b.includes("anúncio mudou")));
  }
});

test("origem temporal e contadores não alteram configuração; ordem das chaves é irrelevante", () => {
  const updated = {
    ...identity,
    offerEvidence: { packageContents: identity.offerEvidence.packageContents, packageQuantity: 1, variantKey: "60l", source: { marketplace: "shopee", method: "affiliate_api", url: identity.productUrl, capturedAt: "2026-10-06T15:00:00Z" }, salesCount: 5000, reviewCount: 300, ratingStar: 4.9 },
  };
  assert.equal(editorialEvidenceFingerprint(updated), fingerprint);
  const before = { ...identity, offerEvidence: { ...identity.offerEvidence, priceMinCents: 2029, priceMaxCents: 2029 } };
  const after = { ...identity, offerEvidence: { ...identity.offerEvidence, priceMinCents: 1500, priceMaxCents: 1500 } };
  assert.equal(editorialEvidenceFingerprint(before), editorialEvidenceFingerprint(after));
});

test("campos desconhecidos ficam ausentes e não são inferidos do título ou da imagem", () => {
  const ambiguous = { ...identity, title: "Kit organizador com bomba e cobertores", offerEvidence: undefined };
  const facts = JSON.parse(editorialEvidenceFingerprint(ambiguous));
  assert.deepEqual(facts.facts, {});
  assert.equal(editorialEvidenceFingerprint(ambiguous), editorialEvidenceFingerprint({ ...ambiguous, offerEvidence: {} }));
  assert.notEqual(editorialEvidenceFingerprint(ambiguous), editorialEvidenceFingerprint({ ...ambiguous, offerEvidence: { packageContents: ["Somente um saco organizador"] } }));
});

test("faixa de preços sem configuração exata bloqueia destaque mesmo com avaliação manual forte", () => {
  const strong = assessment({ dimensions: Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, { level: "strong", reason: "Editor conferiu a utilidade, mas a fonte ainda informa uma faixa." }])) });
  const ranged = { ...candidate, offerEvidence: { priceMinCents: 1000, priceMaxCents: 5000 } };
  assert.ok(editorialSelectionBlockers(ranged, strong, now).length > 0);
  assert.deepEqual(editorialSelectionBlockers({ ...candidate, offerEvidence: { priceMinCents: 2029, priceMaxCents: 2029 } }, assessment(), now), []);
});

test("explicações, dimensões e preço máximo não aceitam dados incompletos", () => {
  for (const input of [null, false, 3, "bad", [], { ...assessment(), productId: 123 }, { ...assessment(), dimensions: {} }, { ...assessment(), dimensions: { ...assessment().dimensions, clarity: { level: "made-up", reason: "Anúncio" } } }, { ...assessment(), audience: " " }, { ...assessment(), benefit: " " }, { ...assessment(), purchaseContents: " " }, { ...assessment(), publicRationale: "curto" }, { ...assessment(), criticalDoubts: "none" }, { ...assessment(), criticalDoubts: [""] }, { ...assessment(), maxPriceCents: 0 }, { ...assessment(), maxPriceCents: 2029.5 }]) {
    assert.equal(validateEditorialAssessment(input).ok, false);
  }
});

test("destinos diferentes exigem contexto; destinos comuns compartilham a mesma seleção", () => {
  assert.equal(validateEditorialSelection(selection(), now).ok, true);
  for (const destination of ["home", "pauta"]) {
    const item = { ...selection().items[0], destinations: [destination] };
    assert.equal(validateEditorialSelection(selection({ items: [item] }), now).error, "destination_context_required");
    const result = validateEditorialSelection(selection({ items: [{ ...item, context: "Coleção específica para quem viaja." }] }), now);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.items[0].destinations, [destination]);
  }
  for (const destinations of [[], ["home", "home"], ["email"], "home"]) {
    assert.equal(validateEditorialSelection(selection({ items: [{ ...selection().items[0], destinations }] }), now).ok, false);
  }
});

test("retirar todos os destaques cria uma versão vazia válida", () => {
  const result = validateEditorialSelection(selection({ expectedVersion: 7, items: [] }), now);
  assert.equal(result.ok, true);
  assert.equal(result.value.expectedVersion, 7);
  assert.deepEqual(result.value.items, []);
});

test("versão otimista e vigência precisam de valores explícitos válidos", () => {
  for (const expectedVersion of [undefined, 0, -1, 1.5, "1", NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateEditorialSelection(selection({ expectedVersion }), now).error, "invalid_expected_version");
  }
  for (const validUntil of [null, "bad-date", now.toISOString(), new Date(now.getTime() - 1).toISOString(), new Date(now.getTime() + 7 * day + 1).toISOString()]) {
    assert.equal(validateEditorialSelection(selection({ validUntil }), now).error, "invalid_selection_validity");
  }
  assert.equal(validateEditorialSelection(selection({ expectedVersion: 1, validUntil: new Date(now.getTime() + 7 * day).toISOString() }), now).ok, true);
});

test("seleção rejeita requisições malformadas, duplicados e ids primitivos sem coerção", () => {
  for (const input of [null, false, 3, "bad", [], {}, selection({ items: "bad" }), selection({ items: Array.from({ length: 25 }, (_, n) => ({ ...selection().items[0], productId: `p_${n}` })) }), selection({ items: [selection().items[0], selection().items[0]] }), selection({ items: [null] })]) {
    assert.equal(validateEditorialSelection(input, now).ok, false);
  }
  for (const key of ["productId", "assessmentId"]) {
    for (const value of [undefined, null, true, 123, [], {}, Symbol("id"), "", "bad/id", "a".repeat(121)]) {
      let result;
      assert.doesNotThrow(() => { result = validateEditorialSelection(selection({ items: [{ ...selection().items[0], [key]: value }] }), now); });
      assert.equal(result.ok, false, `${key} must reject ${String(value)}`);
    }
  }
});

test("a seleção compartilhada comporta 24 produtos sem herdar o limite da hero", () => {
  assert.equal(EDITORIAL_MAX_PRODUCTS,24);
  const items=Array.from({length:24},(_,n)=>({...selection().items[0],productId:`p_${n}`,assessmentId:`a_${n}`}));
  assert.equal(validateEditorialSelection(selection({items}),now).ok,true);
  assert.equal(validateEditorialSelection(selection({items:[...items,{...items[0],productId:"p_24"}]}),now).error,"selection_limit");
});

test("AC-028.5: alegação de superioridade exige base comparativa estruturada e recente", () => {
  // 1. Falha sem comparativeBasis
  const claimWithoutBasis = assessment({
    publicRationale: "A melhor cafeteira do mercado para café da manhã.",
  });
  const res1 = validateEditorialAssessment(claimWithoutBasis);
  assert.equal(res1.ok, false);
  assert.equal(res1.error, "superiority_claim_requires_comparative_basis");

  // 2. Sucesso com comparativeBasis válida (BUG-020)
  const claimWithBasis = assessment({
    publicRationale: "A melhor cafeteira do mercado para café da manhã.",
    comparativeBasis: {
      candidateProductId: "product_1",
      alternativeProductIds: ["product_alt_1", "product_alt_2"],
      checkedAt: now.toISOString(),
      usageScope: "cafeteiras elétricas com jarra de inox",
      criteria: ["consumo elétrico", "durabilidade da jarra"],
      rationale: "Menor consumo elétrico e maior durabilidade que as alternativas testadas.",
      evidenceReferences: {
        product_1: { observedAt: now.toISOString(), priceCents: 2029 },
        product_alt_1: { observedAt: now.toISOString(), priceCents: 2500 },
        product_alt_2: { observedAt: now.toISOString(), priceCents: 2700 },
      },
    },
  });
  const res2 = validateEditorialAssessment(claimWithBasis);
  assert.equal(res2.ok, true);
  if (res2.ok) {
    assert.ok(res2.value.comparativeBasis);
    assert.equal(res2.value.comparativeBasis.alternativeProductIds.length, 2);
  }

  // 3. Bloqueio em editorialSelectionBlockers se comparativeBasis estiver ausente
  assert.ok(
    editorialSelectionBlockers(candidate, { ...claimWithoutBasis, comparativeBasis: null }, now)
      .some((b) => b.includes("superioridade sem base comparativa"))
  );

  // 4. Bloqueio se checagem tiver mais de 48h
  const staleBasis = {
    ...claimWithBasis,
    comparativeBasis: {
      ...claimWithBasis.comparativeBasis,
      checkedAt: new Date(now.getTime() - 49 * hour).toISOString(),
    },
  };
  assert.ok(
    editorialSelectionBlockers(candidate, staleBasis, now)
      .some((b) => b.includes("expirada"))
  );

  // 5. Sem bloqueio se comparativeBasis for recente e válida
  assert.deepEqual(editorialSelectionBlockers(candidate, claimWithBasis, now), []);

  // 6. Texto descritivo legítimo não exige comparativeBasis
  const descriptive = assessment({
    publicRationale: "Cafeteira elétrica prática com filtro permanente e capacidade para 15 cafezinhos.",
  });
  assert.equal(validateEditorialAssessment(descriptive).ok, true);
  assert.deepEqual(editorialSelectionBlockers(candidate, descriptive, now), []);

  // 7. BUG-020: Justificativa editorial idêntica à alegação pública falha no servidor
  const duplicatedRationale = assessment({
    publicRationale: "A melhor cafeteira do mercado para café da manhã.",
    comparativeBasis: {
      ...claimWithBasis.comparativeBasis,
      rationale: "a melhor cafeteira do mercado para café da manhã.",
    },
  });
  const resDup = validateEditorialAssessment(duplicatedRationale);
  assert.equal(resDup.ok, false);
  assert.equal(resDup.error, "comparative_basis_rationale_must_be_distinct");
});

test("BUG-018: CATALOG_EVIDENCE_POLICY_VERSION é explícita, distinta de HERO_POLICY_VERSION e incluída na chave pública", () => {
  assert.equal(typeof CATALOG_EVIDENCE_POLICY_VERSION, "string");
  assert.ok(CATALOG_EVIDENCE_POLICY_VERSION.length > 0);
  assert.notEqual(CATALOG_EVIDENCE_POLICY_VERSION, "hero-v2");

  const pubSelection = {
    mode: "catalog",
    schemaReady: true,
    id: null,
    version: null,
    validUntil: now.toISOString(),
    products: [],
    heroProductIds: [],
    heroValidUntil: null,
  };
  const key = publishedEditorialStateKey(pubSelection);
  assert.ok(key.includes(CATALOG_EVIDENCE_POLICY_VERSION), "Chave pública de estado deve incluir a versão da política de catálogo");
});

