import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelChain,
  isTransientGeminiError,
  parseAICurationResponse,
  AICurationParseError,
  withRetry,
} from "../lib/ai-curation-service.ts";
import { processIngestionPipeline } from "../lib/curation-pipeline.ts";

test("Estágio 1: produto com ticket abaixo do mínimo (R$ 20,00) é retido como weak_offer", async () => {
  const products = [
    {
      id: "prod_cheap",
      marketplace: "shopee",
      title: "Chaveiro emborrachado fofo",
      priceCents: 1500, // R$ 15,00
      ratingStar: 4.8,
      salesCount: 100,
      familyKey: null,
      category: "Acessórios",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    evaluator: async () => [],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].productId, "prod_cheap");
  assert.equal(decisions[0].status, "held");
  assert.equal(decisions[0].reasonCode, "weak_offer");
  assert.equal(decisions[0].reasonDetail, null);
  assert.equal(decisions[0].actorType, "rule");
});

test("Estágio 1: produto com termo sexual é rejeitado como adult_sexual", async () => {
  const products = [
    {
      id: "prod_erotic",
      marketplace: "mercadolivre",
      title: "Óleo de massagem corporal sexy e vibrador recarregável",
      priceCents: 5900,
      ratingStar: 4.9,
      salesCount: 300,
      familyKey: null,
      category: "Beleza",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    evaluator: async () => [],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].productId, "prod_erotic");
  assert.equal(decisions[0].status, "rejected");
  assert.equal(decisions[0].reasonCode, "adult_sexual");
  assert.equal(decisions[0].reasonDetail, null);
  assert.equal(decisions[0].actorType, "rule");
});

test("Estágio 1: peças industriais ou de reposição são rejeitadas como low_utility", async () => {
  const products = [
    {
      id: "prod_screw",
      marketplace: "mercadolivre",
      title: "Kit Parafuso Auto Atarraxante Cabeça Chata Phillips 200un",
      priceCents: 3500,
      ratingStar: 4.7,
      salesCount: 50,
      familyKey: null,
      category: "Ferramentas",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    evaluator: async () => [],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].productId, "prod_screw");
  assert.equal(decisions[0].status, "rejected");
  assert.equal(decisions[0].reasonCode, "low_utility");
  assert.equal(decisions[0].reasonDetail, null);
  assert.equal(decisions[0].actorType, "rule");
});

test("Estágio 1: produto com avaliação comprovadamente ruim (< 4.0) é rejeitado como low_quality_listing", async () => {
  const products = [
    {
      id: "prod_bad_rating",
      marketplace: "shopee",
      title: "Mini ventilador de mesa portátil USB",
      priceCents: 2990,
      ratingStar: 3.6,
      salesCount: 200,
      familyKey: null,
      category: "Eletrônicos",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    evaluator: async () => [],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].productId, "prod_bad_rating");
  assert.equal(decisions[0].status, "rejected");
  assert.equal(decisions[0].reasonCode, "low_quality_listing");
  assert.equal(decisions[0].reasonDetail, null);
});

test("Estágio 2: anti-saturação preserva até 3 representantes e retém excedentes como family_saturation", async () => {
  const products = [
    { id: "fone_1", marketplace: "aliexpress", title: "Fone Bluetooth TWS Pro", priceCents: 3900, ratingStar: 4.9, salesCount: 500, familyKey: "fone-bluetooth", category: "Áudio" },
    { id: "fone_2", marketplace: "shopee", title: "Fone de Ouvido Sem Fio", priceCents: 4200, ratingStar: 4.8, salesCount: 300, familyKey: "fone-bluetooth", category: "Áudio" },
    { id: "fone_3", marketplace: "mercadolivre", title: "Headphone Bluetooth Extra Bass", priceCents: 5900, ratingStar: 4.7, salesCount: 200, familyKey: "fone-bluetooth", category: "Áudio" },
    { id: "fone_4", marketplace: "shopee", title: "Fone TWS Air Conectividade Rápida", priceCents: 4500, ratingStar: 4.5, salesCount: 50, familyKey: "fone-bluetooth", category: "Áudio" },
    { id: "fone_5", marketplace: "aliexpress", title: "Fone sem fio compacto esportivo", priceCents: 4800, ratingStar: 4.4, salesCount: 40, familyKey: "fone-bluetooth", category: "Áudio" },
  ];

  const evaluatedIds = [];
  const decisions = await processIngestionPipeline(products, {
    maxRepresentatives: 3,
    evaluator: async (items) => {
      for (const item of items) evaluatedIds.push(item.productId);
      return items.map((item) => ({
        productId: item.productId,
        desirabilityScore: 4,
        hasMisleadingClaim: false,
        isAdultOrUnsafe: false,
        editorialCategory: "gadget_util",
        justification: "Bom fone com excelente custo-benefício.",
      }));
    },
  });

  // Exatamente 3 avançaram para a triagem da IA
  assert.equal(evaluatedIds.length, 3);

  // Os outros 2 foram retidos por saturação de família no Estágio 2
  const heldSaturation = decisions.filter((d) => d.status === "held" && d.reasonCode === "family_saturation");
  assert.equal(heldSaturation.length, 2);
  assert.ok(heldSaturation.every((d) => d.reasonDetail === null));
});

test("Estágio 3 e 4: promessa enganosa detectada pela IA gera rejected/misleading_claim", async () => {
  const products = [
    {
      id: "prod_miracle",
      marketplace: "aliexpress",
      title: "Creme clareador instantâneo com efeito botox 3 minutos",
      priceCents: 4500,
      ratingStar: 4.6,
      salesCount: 150,
      familyKey: null,
      category: "Beleza",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    evaluator: async () => [
      {
        productId: "prod_miracle",
        desirabilityScore: 3,
        hasMisleadingClaim: true,
        isAdultOrUnsafe: false,
        editorialCategory: "outro",
        justification: "Promete efeito botox em 3 minutos sem respaldo científico.",
      },
    ],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].productId, "prod_miracle");
  assert.equal(decisions[0].status, "rejected");
  assert.equal(decisions[0].reasonCode, "misleading_claim");
  assert.equal(decisions[0].reasonDetail, null);
  assert.equal(decisions[0].actorType, "llm");
});

test("Estágio 3 e 4: achadinho nota 5/5 permanece pending com insight gravado para aprovação em 1 clique", async () => {
  const products = [
    {
      id: "prod_super_gadget",
      marketplace: "aliexpress",
      title: "Mini Selador Térmico Portátil para Sacos e Embalagens",
      priceCents: 2490,
      ratingStar: 4.8,
      salesCount: 1200,
      familyKey: null,
      category: "Cozinha",
    },
  ];

  const decisions = await processIngestionPipeline(products, {
    evaluator: async () => [
      {
        productId: "prod_super_gadget",
        desirabilityScore: 5,
        hasMisleadingClaim: false,
        isAdultOrUnsafe: false,
        editorialCategory: "gadget_util",
        justification: "Excelente achadinho: resolve uma dor real de cozinha com alto apelo de vídeo.",
      },
    ],
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].productId, "prod_super_gadget");
  assert.equal(decisions[0].status, "pending");
  assert.equal(decisions[0].reasonCode, null);
  assert.equal(decisions[0].reasonDetail, null);
  assert.equal(decisions[0].actorType, "llm");
  assert.equal(decisions[0].aiScore, 5);
  assert.equal(decisions[0].aiJustification, "Excelente achadinho: resolve uma dor real de cozinha com alto apelo de vídeo.");
  assert.equal(decisions[0].editorialCategory, "gadget_util");
});

// ------------------------------------------------------------
// Resiliência da triagem: retry em 503/transitórios e fallback de modelo
// ------------------------------------------------------------

test("isTransientGeminiError: 503, 429 e 5xx são retryáveis; 400 e 403 não", () => {
  assert.equal(isTransientGeminiError({ status: 503, statusText: "Service Unavailable" }), true);
  assert.equal(isTransientGeminiError({ status: 429, statusText: "Too Many Requests" }), true);
  assert.equal(isTransientGeminiError({ status: 500 }), true);
  assert.equal(isTransientGeminiError({ status: 504 }), true);
  assert.equal(isTransientGeminiError({ status: 408 }), true);
  assert.equal(isTransientGeminiError({ status: 400, statusText: "Bad Request" }), false);
  assert.equal(isTransientGeminiError({ status: 403 }), false);
  assert.equal(isTransientGeminiError(new Error("net")), false);
  assert.equal(isTransientGeminiError(new AICurationParseError("prosa")), true);
});

test("withRetry: erro transitório repete e o sucesso é devolvido", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw { status: 503 };
      return "ok";
    },
    { maxAttempts: 4, baseDelayMs: 2, maxDelayMs: 8 },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry: erro permanente não é repetido", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw { status: 400 };
      },
      { maxAttempts: 4, baseDelayMs: 2, maxDelayMs: 8 },
    ),
    (err) => err.status === 400,
  );
  assert.equal(calls, 1);
});

test("withRetry: teto de tentativas re-lança o último erro transitório", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw { status: 503 };
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4 },
    ),
    (err) => err.status === 503,
  );
  assert.equal(calls, 3);
});

test("buildModelChain: primário sempre primeiro e sem duplicatas/vazios", () => {
  assert.deepEqual(buildModelChain("gemini-2.5-flash"), ["gemini-2.5-flash"]);
  assert.deepEqual(buildModelChain("gemini-2.5-flash", ["gemini-2.0-flash"]), [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ]);
  assert.deepEqual(buildModelChain("gemini-2.5-flash", ["gemini-2.5-flash", "", "gemini-1.5-flash"]), [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ]);
  assert.deepEqual(buildModelChain("", ["gemini-2.0-flash"]), ["gemini-2.0-flash"]);
});

test("parseAICurationResponse: JSON de lista válida é aceito", () => {
  const text = JSON.stringify([
    { productId: "a", desirabilityScore: 4, hasMisleadingClaim: false, isAdultOrUnsafe: false, editorialCategory: "gadget_util", justification: "bom" },
    { productId: "b", desirabilityScore: 2, hasMisleadingClaim: false, isAdultOrUnsafe: false, editorialCategory: "peca_chata", justification: "chato" },
  ]);
  const parsed = parseAICurationResponse(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].productId, "a");
});

test("parseAICurationResponse: JSON inválido lança AICurationParseError (retryável)", () => {
  assert.throws(() => parseAICurationResponse("não é json"), AICurationParseError);
  assert.throws(() => parseAICurationResponse('{"objeto":"unico"}'), AICurationParseError);
  // Itens sem productId são filtrados, não derrubam o lote
  const mixed = parseAICurationResponse(
    JSON.stringify([
      { productId: "a", desirabilityScore: 4 },
      { foo: "bar" },
      "texto",
    ]),
  );
  assert.equal(mixed.length, 1);
});
