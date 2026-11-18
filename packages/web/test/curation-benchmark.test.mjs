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

test("Benchmark: conteúdo restrito é rejeitado por regra e peças industriais seguem para avaliação sem aprovação", async () => {
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
    evaluator: async (items) => items.map((i) => ({
      productId: i.productId,
      desirabilityScore: 1,
      justification: "Peça técnica avaliada em vez de rejeitada antes da triagem",
      editorialCategory: "peca_tecnica_avulsa",
      hasMisleadingClaim: false,
      isAdultOrUnsafe: false,
    })),
  });

  assert.equal(decisions.length, 5);
  const adult = decisions.find((d) => d.productId === "bench_risk_04");
  assert.equal(adult?.status, "rejected");
  assert.equal(adult?.reasonCode, "adult_sexual");
  assert.equal(adult?.actorType, "rule");
  for (const dec of decisions.filter((d) => d.productId !== "bench_risk_04")) {
    assert.equal(dec.status, "pending");
    assert.equal(dec.actorType, "llm");
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
    maxRepresentatives: 3,
    evaluator: mockEvaluator,
  });

  assert.equal(decisions.length, 5);

  const pendingSurplus = decisions.filter((d) => d.status === "pending" && d.actorType === "rule");
  const passedAntiSaturation = decisions.filter((d) => d.status !== "pending" || d.actorType !== "rule");

  assert.equal(passedAntiSaturation.length, 3);
  assert.equal(pendingSurplus.length, 2);
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

  // Piloto automático ativo com minScore = 4 e limite explícito de 3 representantes
  const decisions = await processIngestionPipeline(candidates, {
    maxRepresentatives: 3,
    autoPublish: true,
    minScoreAutoPublish: 4,
    evaluator: mockEvaluator,
  });

  assert.equal(decisions.length, 50);

  // Verificações de segurança absoluta
  const approved = decisions.filter((d) => d.status === "approved");
  const rejected = decisions.filter((d) => d.status === "rejected");
  const pending = decisions.filter((d) => d.status === "pending");

  // 1. Conteúdo adulto/restrito é rejeitado por regra e nenhum item vira aprovado pela nota legada 1–5
  assert.equal(approved.length, 0);
  const adultRisk = decisions.find((d) => d.productId === "bench_risk_04");
  assert.equal(adultRisk?.status, "rejected");
  assert.equal(adultRisk?.reasonCode, "adult_sexual");
  for (const riskId of benchmarkData.filter((b) => b.group === "forbidden_risk" && b.id !== "bench_risk_04").map((b) => b.id)) {
    const dec = decisions.find((d) => d.productId === riskId);
    assert.equal(dec?.status, "pending", "Item técnico não é aprovado nem descartado em bloco: " + riskId);
  }

  // 2. Itens baratos sem bloqueio de segurança permanecem pendentes com sinal registrado (não auto-rejeitados por low_utility)
  for (const fixture of benchmarkData.filter((b) => b.group === "cheap_junk")) {
    const dec = decisions.find((d) => d.productId === fixture.id);
    assert.equal(dec?.status, "pending");
    assert.equal(dec?.reasonCode, null);
    assert.equal(dec?.actorType, fixture.expectedActor);
    assert.equal(dec?.aiScore, fixture.mockScore);
  }

  // 3. Nenhum produto com nota regular (score < 4) ou alta (score >= 4) é auto-aprovado pelo escore legado 1–5
  for (const regId of benchmarkData.filter((b) => b.group === "expensive_regular" || b.group === "expensive_bargain").map((b) => b.id)) {
    const dec = decisions.find((d) => d.productId === regId);
    assert.equal(dec?.status, "pending", "Nota legada 1–5 mantém pending para avaliação v2: " + regId);
  }

  assert.ok(pending.length >= 49, "Itens avaliados permanecem pendentes sem promoção legada");
  assert.equal(rejected.length, 1, "Somente bloqueio restrito rejeita automaticamente neste benchmark");
});
