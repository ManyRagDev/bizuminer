import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { processIngestionPipeline } from "../lib/curation-pipeline.ts";

const fixtureUrl = new URL("./fixtures/curation-benchmark-dataset.json", import.meta.url);
const benchmarkData = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));

test("Benchmark: dataset canônico possui exatamente 50 casos estruturados", () => {
  assert.equal(benchmarkData.length, 50);

  const groups = new Set(benchmarkData.map((d) => d.group));
  assert.deepEqual(
    Array.from(groups).sort(),
    [
      "cheap_junk",
      "cheap_useful",
      "expensive_bargain",
      "expensive_regular",
      "forbidden_risk",
      "saturation_duplicate",
    ].sort()
  );
});

test("Benchmark: 10/10 casos de sub-ticket (< R$ 20) são retidos deterministamente como weak_offer", async () => {
  const cheapJunkItems = benchmarkData.filter((d) => d.group === "cheap_junk");
  assert.equal(cheapJunkItems.length, 10);

  const candidates = cheapJunkItems.map((d) => ({
    id: d.id,
    marketplace: "shopee",
    title: d.title,
    priceCents: d.priceCents,
    ratingStar: d.ratingStar,
    salesCount: d.salesCount,
    familyKey: null,
    category: d.category,
  }));

  const decisions = await processIngestionPipeline(candidates, {
    evaluator: async () => [],
  });

  assert.equal(decisions.length, 10);
  for (const dec of decisions) {
    assert.equal(dec.status, "held");
    assert.equal(dec.reasonCode, "weak_offer");
    assert.equal(dec.actorType, "rule");
  }
});

test("Benchmark: 5/5 casos de risco/peças industriais/adulto são rejeitados deterministamente", async () => {
  const riskItems = benchmarkData.filter((d) => d.group === "forbidden_risk");
  assert.equal(riskItems.length, 5);

  const candidates = riskItems.map((d) => ({
    id: d.id,
    marketplace: "mercadolivre",
    title: d.title,
    priceCents: d.priceCents,
    ratingStar: d.ratingStar,
    salesCount: d.salesCount,
    familyKey: null,
    category: d.category,
  }));

  const decisions = await processIngestionPipeline(candidates, {
    evaluator: async () => [],
  });

  assert.equal(decisions.length, 5);
  for (const dec of decisions) {
    assert.equal(dec.status, "rejected");
    assert.ok(dec.reasonCode === "low_utility" || dec.reasonCode === "adult_sexual");
    assert.equal(dec.actorType, "rule");
  }
});

test("Benchmark: saturação de família retém excedentes mantendo até 3 representantes", async () => {
  const satItems = benchmarkData.filter((d) => d.group === "saturation_duplicate");
  assert.equal(satItems.length, 5);

  const candidates = satItems.map((d) => ({
    id: d.id,
    marketplace: "aliexpress",
    title: d.title,
    priceCents: d.priceCents,
    ratingStar: d.ratingStar,
    salesCount: d.salesCount,
    familyKey: d.familyKey,
    category: d.category,
  }));

  const mockEvaluator = async (items) => {
    return items.map((i) => ({
      productId: i.productId,
      desirabilityScore: 4,
      justification: "Bom fone custo benefício",
      editorialCategory: "gadget_util",
      hasMisleadingClaim: false,
      isAdultOrUnsafe: false,
    }));
  };

  const decisions = await processIngestionPipeline(candidates, {
    evaluator: mockEvaluator,
  });

  assert.equal(decisions.length, 5);

  const heldSaturation = decisions.filter((d) => d.status === "held" && d.reasonCode === "family_saturation");
  const passedAntiSaturation = decisions.filter((d) => d.status !== "held" || d.reasonCode !== "family_saturation");

  assert.equal(passedAntiSaturation.length, 3);
  assert.equal(heldSaturation.length, 2);
});

test("Benchmark Execução Completa: 50 casos canônicos passam pelo pipeline com calibração perfeita", async () => {
  const candidates = benchmarkData.map((d) => ({
    id: d.id,
    marketplace: "geral",
    title: d.title,
    priceCents: d.priceCents,
    ratingStar: d.ratingStar,
    salesCount: d.salesCount,
    familyKey: d.familyKey ?? null,
    category: d.category,
  }));

  const mockEvaluator = async (items) => {
    return items.map((i) => {
      const match = benchmarkData.find((b) => b.id === i.productId);
      return {
        productId: i.productId,
        desirabilityScore: match?.mockScore ?? 3,
        justification: "Justificativa de teste do benchmark",
        editorialCategory: match?.mockEditorialCat ?? "gadget_util",
        hasMisleadingClaim: false,
        isAdultOrUnsafe: false,
      };
    });
  };

  // Piloto automático ativo com minScore = 4
  const decisions = await processIngestionPipeline(candidates, {
    autoPublish: true,
    minScoreAutoPublish: 4,
    evaluator: mockEvaluator,
  });

  assert.equal(decisions.length, 50);

  // Verificações de segurança absoluta
  const approved = decisions.filter((d) => d.status === "approved");
  const held = decisions.filter((d) => d.status === "held");
  const rejected = decisions.filter((d) => d.status === "rejected");

  // 1. NENHUM produto proibido/de risco foi aprovado
  for (const riskId of benchmarkData.filter((b) => b.group === "forbidden_risk").map((b) => b.id)) {
    const dec = decisions.find((d) => d.productId === riskId);
    assert.equal(dec?.status, "rejected", "Item de risco deve ser rejeitado: " + riskId);
  }

  // 2. NENHUM produto < R$ 20 foi aprovado
  for (const junkId of benchmarkData.filter((b) => b.group === "cheap_junk").map((b) => b.id)) {
    const dec = decisions.find((d) => d.productId === junkId);
    assert.equal(dec?.status, "held", "Item sub-ticket deve ser retido: " + junkId);
    assert.equal(dec?.reasonCode, "weak_offer");
  }

  // 3. Nenhum produto com nota regular (score < 4) foi aprovado no piloto automático
  for (const regId of benchmarkData.filter((b) => b.group === "expensive_regular").map((b) => b.id)) {
    const dec = decisions.find((d) => d.productId === regId);
    assert.notEqual(dec?.status, "approved", "Item regular sem score alto não pode ser auto-aprovado: " + regId);
  }

  // 4. Achadinhos de qualidade com score >= 4 foram aprovados
  for (const bargainId of benchmarkData.filter((b) => b.group === "expensive_bargain").map((b) => b.id)) {
    const dec = decisions.find((d) => d.productId === bargainId);
    assert.equal(dec?.status, "approved", "Achadinho pechincha deve ser aprovado: " + bargainId);
  }

  assert.ok(approved.length >= 15, "Deve aprovar pelo menos 15 achadinhos válidos");
  assert.ok(held.length >= 12, "Deve reter itens sub-ticket e excedentes de saturação");
  assert.ok(rejected.length >= 5, "Deve rejeitar itens de risco");
});
