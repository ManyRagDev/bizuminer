import test from "node:test";
import assert from "node:assert/strict";
import { projectConservativePriceEvidence } from "../lib/offer-history.ts";
import { priceSignal, priceHighlight, priceNarrative } from "../lib/deal-signal.ts";
import { composeOpener } from "../lib/composer.ts";

test("01-0: projectConservativePriceEvidence suprime claims históricos não sustentados", () => {
  const rowWithDbNaming = {
    id: "prod-1",
    price_cents: 10000,
    original_price_cents: 15000,
    previous_min_price_cents: 12000,
    lowest_verified: true,
    min_price_cents: 12000,
    observation_count: 5,
    history_days: 10,
    observed_at: new Date("2026-10-14T10:00:00Z"),
  };

  const projectedDb = projectConservativePriceEvidence(rowWithDbNaming);
  assert.equal(projectedDb.lowest_verified, false, "lowest_verified deve ser forçado a false");
  assert.equal(projectedDb.previous_min_price_cents, null, "previous_min_price_cents deve ser forçado a null");
  assert.equal(projectedDb.min_price_cents, null, "min_price_cents deve ser forçado a null");
  assert.equal(projectedDb.price_cents, 10000, "preço observado atual deve ser preservado");
  assert.equal(projectedDb.original_price_cents, 15000, "preço riscado do vendedor deve ser preservado");
  assert.equal(projectedDb.observation_count, 5, "contagem de observações deve ser preservada");

  const rowWithCamelCase = {
    id: "prod-2",
    priceCents: 8500,
    previousMinPriceCents: 9000,
    lowestVerified: true,
    observationCount: 4,
    historyDays: 8,
  };

  const projectedCamel = projectConservativePriceEvidence(rowWithCamelCase);
  assert.equal(projectedCamel.lowestVerified, false);
  assert.equal(projectedCamel.previousMinPriceCents, null);
  assert.equal(projectedCamel.priceCents, 8500);
});

test("01-0: deal-signal não emite selo de menor preço ou queda sob projeção conservadora", () => {
  const input = projectConservativePriceEvidence({
    priceCents: 8000,
    previousMinPriceCents: 9000,
    observationCount: 5,
    historyDays: 9,
    lowestVerified: true,
  });

  const signal = priceSignal(input);
  assert.notEqual(signal.tone, "verified", "Não pode emitir tom verified sem variante confirmada");
  assert.equal(signal.tone, "monitoring", "Deve emitir monitoramento descritivo honesto");

  const highlight = priceHighlight(input);
  assert.equal(highlight, null, "Sem histórico comparável válido, silêncio no card");

  const narrative = priceNarrative(input, (c) => `R$ ${(c / 100).toFixed(2)}`);
  assert.ok(!narrative.includes("Menor preço"), "Narrativa não pode afirmar menor preço");
  assert.ok(narrative.includes("5 registros de preço"), "Narrativa deve descrever dados factuais existentes");
});

test("01-0: composer cai para repertório honesto unproven sem alegação histórica indevida", () => {
  const product = projectConservativePriceEvidence({
    slug: "produto-teste-slug",
    title: "Produto Teste",
    priceCents: 5000,
    previousMinPriceCents: 6000,
    observationCount: 4,
    historyDays: 14,
    lowestVerified: true,
    marketplace: "mercadolivre",
  });

  const opener = composeOpener(product);
  assert.ok(
    !opener.includes("menor preço"),
    "Copy do composer não pode afirmar menor preço histórico"
  );
  assert.ok(
    !opener.includes("caiu"),
    "Copy do composer não pode afirmar queda percentual sem histórico comprovado"
  );
  assert.ok(
    opener === "achei esse hoje, tá em conta" || opener === "dá um bizu nessa",
    `Opener deve vir do repertório unproven: recebido "${opener}"`
  );
});
