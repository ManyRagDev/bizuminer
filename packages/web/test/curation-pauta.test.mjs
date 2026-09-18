import test from "node:test";
import assert from "node:assert/strict";
import { formatProductsForLLM } from "../lib/curation.ts";

test("formatProductsForLLM includes real product IDs in formatted string for LLM", () => {
  const sample = [
    {
      id: "prod-uuid-1",
      title: "Robô Aspirador",
      priceCents: 19900,
      category: "casa",
      ratingStar: 4.8,
      salesCount: 1500,
      slug: "ml-robo-aspirador",
      imageUrl: "https://example.com/robo.jpg",
      marketplace: "mercadolivre",
      claimedDiscountRate: 0.25,
      lowestVerified: true,
      hasHistory: true,
    },
    {
      id: "prod-uuid-2",
      title: "Canivete Suíço",
      priceCents: 8900,
      category: "ferramentas",
      ratingStar: 4.6,
      salesCount: 320,
      slug: "ml-canivete",
      imageUrl: "https://example.com/canivete.jpg",
      marketplace: "mercadolivre",
      claimedDiscountRate: 0.15,
      lowestVerified: false,
      hasHistory: true,
    },
  ];

  const formatted = formatProductsForLLM(sample);
  assert.ok(formatted.includes('id: "prod-uuid-1"'), "Must include ID of first product");
  assert.ok(formatted.includes('id: "prod-uuid-2"'), "Must include ID of second product");
  assert.ok(formatted.includes("Robô Aspirador"), "Must include product title");
  assert.ok(formatted.includes("R$ 199.00"), "Must include formatted price");
});
