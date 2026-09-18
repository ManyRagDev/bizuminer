import assert from "node:assert/strict";
import test from "node:test";
import { buildDynamicSystemPrompt } from "../lib/ai-curation-service.ts";
import { processIngestionPipeline } from "../lib/curation-pipeline.ts";
import { DEFAULT_GUIDELINE } from "../lib/editorial-compass.ts";

test("Bússola: DEFAULT_GUIDELINE contém as diretrizes essenciais de achadinhos", () => {
  assert.ok(DEFAULT_GUIDELINE.includes("utilidades práticas"));
  assert.ok(DEFAULT_GUIDELINE.includes("peças industriais"));
});

test("Bússola: buildDynamicSystemPrompt injeta diretrizes e exemplos few-shot no prompt", () => {
  const basePrompt = buildDynamicSystemPrompt();
  assert.ok(basePrompt.includes("curador especialista do canal"));
  assert.ok(!basePrompt.includes("DIRETRIZ EDITORIAL VIGENTE"));

  const customPrompt = buildDynamicSystemPrompt({
    editorialGuideline: "Focar em itens de café gourmet e organização de mesa.",
    fewShotExamples: [
      {
        title: "Prensa Francesa Vidro Duplo 600ml",
        decision: "approved",
        rationale: "Excelente acabamento e apelo visual.",
      },
      {
        title: "Bico Injetor Diesel Common Rail",
        decision: "rejected",
        reasonCode: "low_utility",
        reasonDetail: "Peça industrial de caminhão, zero apelo de impulso.",
      },
    ],
  });

  assert.ok(customPrompt.includes("Focar em itens de café gourmet e organização de mesa."));
  assert.ok(customPrompt.includes("Prensa Francesa Vidro Duplo 600ml"));
  assert.ok(customPrompt.includes("APROVADO (Exemplo positivo)"));
  assert.ok(customPrompt.includes("Bico Injetor Diesel Common Rail"));
  assert.ok(customPrompt.includes("REJEITADO (low_utility)"));
  assert.ok(customPrompt.includes("Peça industrial de caminhão"));
});

test("Piloto Automático: autoPublish=true aprova diretamente produtos com score >= minScore", async () => {
  const products = [
    {
      id: "prod_top",
      marketplace: "mercadolivre",
      title: "Mini Processador de Alimentos Elétrico USB Portátil",
      priceCents: 3990,
      ratingStar: 4.8,
      salesCount: 500,
      familyKey: null,
      category: "Cozinha",
    },
    {
      id: "prod_regular",
      marketplace: "mercadolivre",
      title: "Porta Guardanapo Simples Plástico Branco",
      priceCents: 2200,
      ratingStar: 4.2,
      salesCount: 50,
      familyKey: null,
      category: "Cozinha",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    autoPublish: true,
    minScoreAutoPublish: 4,
    evaluator: async () => [
      {
        productId: "prod_top",
        desirabilityScore: 5,
        hasMisleadingClaim: false,
        isAdultOrUnsafe: false,
        editorialCategory: "gadget_util",
        justification: "Item de altíssima conversão e utilidade diária.",
      },
      {
        productId: "prod_regular",
        desirabilityScore: 3,
        hasMisleadingClaim: false,
        isAdultOrUnsafe: false,
        editorialCategory: "outro",
        justification: "Item funcional porém comum demais.",
      },
    ],
  });

  assert.equal(decisions.length, 2);

  const top = decisions.find((d) => d.productId === "prod_top");
  assert.ok(top);
  assert.equal(top.status, "approved");
  assert.equal(top.aiScore, 5);
  assert.equal(top.actorType, "llm");

  const regular = decisions.find((d) => d.productId === "prod_regular");
  assert.ok(regular);
  assert.equal(regular.status, "pending");
  assert.equal(regular.aiScore, 3);
  assert.equal(regular.actorType, "llm");
});

test("Piloto Automático: minScoreAutoPublish=5 exige pontuação máxima para aprovar", async () => {
  const products = [
    {
      id: "prod_four_stars",
      marketplace: "aliexpress",
      title: "Organizador de Cabos de Silicone Magnético",
      priceCents: 2800,
      ratingStar: 4.7,
      salesCount: 800,
      familyKey: null,
      category: "Escritório",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    autoPublish: true,
    minScoreAutoPublish: 5,
    evaluator: async () => [
      {
        productId: "prod_four_stars",
        desirabilityScore: 4,
        hasMisleadingClaim: false,
        isAdultOrUnsafe: false,
        editorialCategory: "gadget_util",
        justification: "Bom gadget, nota 4.",
      },
    ],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, "pending");
  assert.equal(decisions[0].aiScore, 4);
});

test("Piloto Automático: filtros determinísticos e rejeições por risco prevalecem mesmo com autoPublish ativo", async () => {
  const products = [
    {
      id: "prod_cheap",
      marketplace: "shopee",
      title: "Adesivo decorativo infantil simples",
      priceCents: 990, // R$ 9,90 < R$ 20,00
      ratingStar: 4.9,
      salesCount: 1000,
      familyKey: null,
      category: "Papelaria",
    },
    {
      id: "prod_miracle",
      marketplace: "shopee",
      title: "Chá Seca Barriga Emagrece 10kg em 3 dias",
      priceCents: 4500,
      ratingStar: 4.5,
      salesCount: 200,
      familyKey: null,
      category: "Saúde",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    autoPublish: true,
    minScoreAutoPublish: 4,
    evaluator: async () => [
      {
        productId: "prod_miracle",
        desirabilityScore: 4,
        hasMisleadingClaim: true,
        isAdultOrUnsafe: false,
        editorialCategory: "outro",
        justification: "Promessa irreal de emagrecimento.",
      },
    ],
  });

  assert.equal(decisions.length, 2);

  const cheap = decisions.find((d) => d.productId === "prod_cheap");
  assert.ok(cheap);
  assert.equal(cheap.status, "held");
  assert.equal(cheap.reasonCode, "weak_offer");

  const miracle = decisions.find((d) => d.productId === "prod_miracle");
  assert.ok(miracle);
  assert.equal(miracle.status, "rejected");
  assert.equal(miracle.reasonCode, "misleading_claim");
});

test("Cockpit Operacional: getTriageBatchesHistory e getOperationalPulse respondem com estrutura válida", async () => {
  const { getTriageBatchesHistory, getOperationalPulse } = await import("../lib/editorial-compass.ts");

  const batches = await getTriageBatchesHistory("local", 5);
  assert.ok(Array.isArray(batches));
  for (const b of batches) {
    assert.ok(typeof b.batchId === "string");
    assert.ok(typeof b.totalItems === "number");
    assert.ok(typeof b.approved === "number");
    assert.ok(typeof b.held === "number");
  }

  const pulse = await getOperationalPulse("local");
  assert.ok(typeof pulse.isCaptureRunning === "boolean");
  assert.ok(typeof pulse.pendingCount === "number");
  assert.ok(typeof pulse.lastTriageTotal === "number");
  assert.ok(typeof pulse.lastCaptureNewItems === "number");
});

test("Inspeção de Lote: getTriageBatchItems devolve array seguro", async () => {
  const { getTriageBatchItems } = await import("../lib/editorial-compass.ts");

  const items = await getTriageBatchItems(new Date().toISOString(), "local");
  assert.ok(Array.isArray(items));
});


