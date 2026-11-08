import test from "node:test";
import assert from "node:assert/strict";
import { rankPautaCandidates } from "../lib/pauta-ranking.ts";

test("rankPautaCandidates handles empty list", () => {
  assert.deepEqual(rankPautaCandidates([], "whatsapp"), []);
});

test("rankPautaCandidates prioritizes fresh captures (< 24h) over old items with static discounts", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const candidates = [
    {
      id: "old-shopee",
      marketplace: "shopee",
      title: "Cozedor Antigo com 70% de desconto de 6 dias atrás",
      price_cents: 3000,
      claimed_discount_rate: 0.70,
      rating_star: 4.8,
      lowest_verified: true,
      evidence_observed_at: new Date("2026-11-02T12:00:00Z"), // 6 dias atrás
    },
    {
      id: "fresh-ml",
      marketplace: "mercadolivre",
      title: "Mochila Impermeável capturada hoje com 40% de desconto",
      price_cents: 8900,
      claimed_discount_rate: 0.40,
      rating_star: 4.9,
      lowest_verified: false,
      evidence_observed_at: new Date("2026-11-08T11:00:00Z"), // 1 hora atrás
    },
  ];

  const selected = rankPautaCandidates(candidates, "whatsapp", { now });
  assert.equal(selected[0].id, "fresh-ml", "O produto recém-capturado deve liderar devido ao bônus de recência");
});

test("rankPautaCandidates sanitizes ghost 100% discounts without price drop", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const candidates = [
    {
      id: "buggy-airfryer",
      marketplace: "shopee",
      title: "Airfryer com bug de 100% de desconto",
      price_cents: 21990,
      claimed_discount_rate: 1.0, // Anomalia
      previous_min_price_cents: null,
      rating_star: 4.5,
      lowest_verified: false,
      evidence_observed_at: new Date("2026-11-06T12:00:00Z"),
    },
    {
      id: "real-good-deal",
      marketplace: "mercadolivre",
      title: "Lixeira Inteligente com 50% de desconto real",
      price_cents: 5990,
      claimed_discount_rate: 0.50,
      rating_star: 4.8,
      lowest_verified: false,
      evidence_observed_at: new Date("2026-11-06T12:00:00Z"),
    },
  ];

  const selected = rankPautaCandidates(candidates, "whatsapp", { now });
  assert.equal(selected[0].id, "real-good-deal", "O produto com 50% real deve superar o produto com anomalia de 100%");
});

test("rankPautaCandidates enforces marketplace diversity (limits per marketplace)", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  // 10 itens Shopee com notas e descontos altos
  const shopeeItems = Array.from({ length: 10 }, (_, i) => ({
    id: `shp-${i}`,
    marketplace: "shopee",
    title: `Item Shopee ${i}`,
    price_cents: 2000,
    claimed_discount_rate: 0.60,
    rating_star: 4.9,
    evidence_observed_at: now,
  }));

  // 4 itens Mercado Livre
  const mlItems = Array.from({ length: 4 }, (_, i) => ({
    id: `ml-${i}`,
    marketplace: "mercadolivre",
    title: `Item ML ${i}`,
    price_cents: 5000,
    claimed_discount_rate: 0.48,
    rating_star: 4.8,
    evidence_observed_at: now,
  }));

  // 4 itens AliExpress
  const aliItems = Array.from({ length: 4 }, (_, i) => ({
    id: `ali-${i}`,
    marketplace: "aliexpress",
    title: `Item Ali ${i}`,
    price_cents: 4000,
    claimed_discount_rate: 0.35,
    rating_star: 4.8,
    evidence_observed_at: now,
  }));

  const candidates = [...shopeeItems, ...mlItems, ...aliItems];
  const selected = rankPautaCandidates(candidates, "whatsapp", { now, limit: 12, maxPerMarketplace: 5 });

  const shopeeCount = selected.filter((p) => p.marketplace === "shopee").length;
  const mlCount = selected.filter((p) => p.marketplace === "mercadolivre").length;
  const aliCount = selected.filter((p) => p.marketplace === "aliexpress").length;

  assert.equal(shopeeCount, 5, "Shopee não deve ultrapassar o teto de 5 itens no top 12 quando há outras lojas");
  assert.equal(mlCount, 4, "Mercado Livre deve ocupar todas as suas 4 vagas disponíveis");
  assert.equal(aliCount, 3, "AliExpress deve preencher as 3 vagas restantes até 12");
  assert.equal(selected.length, 12);
});

test("rankPautaCandidates rotates order deterministically across different days", () => {
  const candidates = Array.from({ length: 20 }, (_, i) => ({
    id: `prod-${i}`,
    marketplace: i % 2 === 0 ? "shopee" : "mercadolivre",
    title: `Produto ${i}`,
    price_cents: 3000 + i * 100,
    claimed_discount_rate: 0.40,
    rating_star: 4.8,
    evidence_observed_at: new Date("2026-11-05T12:00:00Z"),
  }));

  const day1 = rankPautaCandidates(candidates, "whatsapp", { todayStr: "2026-11-08" });
  const day2 = rankPautaCandidates(candidates, "whatsapp", { todayStr: "2026-11-09" });

  const idsDay1 = day1.map((p) => p.id);
  const idsDay2 = day2.map((p) => p.id);

  assert.notDeepEqual(idsDay1, idsDay2, "A ordem e a seleção da pauta devem alternar no dia seguinte");
});
