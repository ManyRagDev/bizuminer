import test from "node:test";
import assert from "node:assert/strict";
import { processIngestionPipeline } from "../lib/curation-pipeline.ts";

test("triagem padrão avalia todos os anúncios da família, inclusive faixas, antes de selecionar destaques", async () => {
  const products = Array.from({ length: 8 }, (_, index) => ({
    id: `offer-${index}`, marketplace: "shopee", title: `Organizador doméstico ${index}`,
    priceCents: 1000, priceMinCents: 1000, priceMaxCents: 2500,
    ratingStar: 4.8, salesCount: 200, familyKey: "organizacao", category: "Casa",
  }));
  const decisions = await processIngestionPipeline(products, {
    autoPublish: true,
    evaluator: async items => {
      assert.equal(items.length, products.length);
      assert.ok(items.every(item => item.priceFormatted === "R$ 10.00 a R$ 25.00"));
      return items.map(item => ({ productId: item.productId, desirabilityScore: 4,
        hasMisleadingClaim: false, isAdultOrUnsafe: false, editorialCategory: "utilidade_pratica",
        justification: "Organização doméstica com avaliações e preço informado." }));
    },
  });
  assert.equal(decisions.length, products.length);
  assert.ok(decisions.every(decision => decision.status === "approved"));
});
