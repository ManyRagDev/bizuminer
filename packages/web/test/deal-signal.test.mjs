import assert from "node:assert/strict";
import test from "node:test";
import { priceNarrative, priceSignal } from "../lib/deal-signal.ts";

test("descreve uma única observação como primeiro registro", () => {
  const input = { priceCents: 9990, previousMinPriceCents: null, observationCount: 1, historyDays: 0, lowestVerified: false };
  assert.equal(priceSignal(input).label, "primeiro registro de preço");
});

test("explica preço acima do menor registro sem vender uma certeza falsa", () => {
  const input = { priceCents: 12000, previousMinPriceCents: 10000, observationCount: 4, historyDays: 2, lowestVerified: false };
  assert.equal(priceNarrative(input, (value) => `R$ ${value / 100}`), "Está 20% acima do menor registro anterior (R$ 100).");
});

test("expõe quantidade e período sem usar estado metafórico", () => {
  const input = { priceCents: 10000, previousMinPriceCents: 10000, observationCount: 4, historyDays: 2, lowestVerified: false };
  assert.equal(priceSignal(input).label, "4 registros · 2 dias");
  assert.equal(priceNarrative(input, (value) => `R$ ${value / 100}`), "Preço igual ao menor registro anterior (R$ 100).");
});
