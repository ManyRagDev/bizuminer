import assert from "node:assert/strict";
import test from "node:test";
import { processIngestionPipeline } from "../lib/curation-pipeline.ts";

const product = {
  id: "flash-sale", marketplace: "shopee", title: "Mixer portátil recarregável",
  priceCents: 1100, ratingStar: 4.8, salesCount: 100, familyKey: null, category: "Cozinha",
};
const history = { referencePriceCents: 10000, observationCount: 3, historyDays: 7 };
const approvedEvaluation = (items) => items.map((item) => ({
  productId: item.productId, desirabilityScore: 5, hasMisleadingClaim: false,
  isAdultOrUnsafe: false, editorialCategory: "gadget_util", justification: "Útil para a rotina.",
}));

test("R$ 100 observado antes e R$ 11 agora avança com contexto verificado e ainda exige a IA", async () => {
  let payload;
  const [decision] = await processIngestionPipeline([{ ...product, comparablePriceHistory: history }], {
    autoPublish: true, evaluator: async (items) => { payload = items; return approvedEvaluation(items); },
  });
  assert.equal(decision.status, "approved");
  assert.equal(decision.actorType, "llm");
  assert.equal(decision.pricePolicy.outcome, "verified_discount");
  assert.deepEqual(payload[0].verifiedPriceReference, {
    source: "comparable_history", minimumPriceFormatted: "R$ 100.00", observationCount: 3, historyDays: 7,
  });
  assert.equal(payload[0].priceFormatted, "R$ 11.00");
});

test("Preço original riscado e histórico sem identidade não liberam a exceção", async () => {
  let called = false;
  const [decision] = await processIngestionPipeline([{
    ...product, originalPriceCents: 10000, previousMinPriceCents: 10000, observationCount: 50, historyDays: 30,
  }], { autoPublish: true, evaluator: async () => { called = true; return []; } });
  assert.equal(called, false);
  assert.equal(decision.status, "held");
  assert.equal(decision.reasonCode, "insufficient_evidence");
});

test("Produto habitualmente abaixo de R$ 20 continua retido por valor", async () => {
  const [decision] = await processIngestionPipeline([{
    ...product, comparablePriceHistory: { ...history, referencePriceCents: 1500 },
  }], { autoPublish: true, evaluator: async () => assert.fail("Não deve consultar IA") });
  assert.equal(decision.status, "held");
  assert.equal(decision.reasonCode, "weak_offer");
  assert.match(decision.reasonDetail, /Valor anterior comparável R\$ 15.00/);
});

test("Referência com poucas observações, poucos dias ou valor inválido exige revisão", async () => {
  for (const reference of [
    { ...history, observationCount: 2 }, { ...history, historyDays: 6 },
    { ...history, referencePriceCents: null }, { ...history, referencePriceCents: NaN },
  ]) {
    const [decision] = await processIngestionPipeline([{ ...product, comparablePriceHistory: reference }], {
      autoPublish: true, evaluator: async () => assert.fail("Referência insuficiente"),
    });
    assert.equal(decision.reasonCode, "insufficient_evidence");
  }
});

test("Exceção de preço não remove aprovação manual nem rejeições editoriais", async () => {
  const candidate = { ...product, comparablePriceHistory: history };
  const [manual] = await processIngestionPipeline([candidate], { autoPublish: false, evaluator: async (items) => approvedEvaluation(items) });
  assert.equal(manual.status, "pending");
  const [rejected] = await processIngestionPipeline([candidate], {
    autoPublish: true, evaluator: async (items) => approvedEvaluation(items).map((e) => ({ ...e, hasMisleadingClaim: true })),
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reasonCode, "misleading_claim");
});

test("Promoção com histórico não contorna filtros de segurança ou de nota do anúncio", async () => {
  const candidates = [
    { ...product, id: "adult", title: "Vibrador", comparablePriceHistory: history },
    { ...product, id: "bad", ratingStar: 3.2, comparablePriceHistory: history },
  ];
  const decisions = await processIngestionPipeline(candidates, { autoPublish: true, evaluator: async () => assert.fail("Bloqueios prevalecem") });
  assert.deepEqual(decisions.map((d) => d.reasonCode), ["adult_sexual", "low_quality_listing"]);
});

test("Preço positivo no piso segue normalmente e preço zero não avança", async () => {
  const decisions = await processIngestionPipeline([
    { ...product, id: "at-floor", priceCents: 2000 },
    { ...product, id: "zero", priceCents: 0, comparablePriceHistory: history },
  ], { autoPublish: true, evaluator: async (items) => approvedEvaluation(items) });
  assert.equal(decisions.find((d) => d.productId === "at-floor").status, "approved");
  assert.equal(decisions.find((d) => d.productId === "zero").reasonCode, "insufficient_evidence");
});
