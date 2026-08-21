import assert from "node:assert/strict";
import test from "node:test";
import { historyWindow, priceHighlight, priceNarrative, priceSignal } from "../lib/deal-signal.ts";

test("selo do card cala quando o preço não se moveu", () => {
  const parado = { priceCents: 10000, previousMinPriceCents: 10000, observationCount: 4, historyDays: 0, lowestVerified: false };
  assert.equal(priceHighlight(parado), null);
  const acima = { priceCents: 12000, previousMinPriceCents: 10000, observationCount: 4, historyDays: 2, lowestVerified: false };
  assert.equal(priceHighlight(acima), null, "estar acima do menor anterior não é notícia acionável");
});

test("selo do card fala nos três estados que o anúncio não revela", () => {
  const menor = { priceCents: 8000, previousMinPriceCents: 9000, observationCount: 5, historyDays: 9, lowestVerified: true };
  assert.deepEqual(priceHighlight(menor), { tone: "verified", label: "menor preço que já vimos" });

  const caiu = { priceCents: 8800, previousMinPriceCents: 10000, observationCount: 4, historyDays: 3, lowestVerified: false };
  assert.deepEqual(priceHighlight(caiu), { tone: "drop", label: "caiu 12% desde o menor que vimos" });

  const semHistorico = { priceCents: 9990, previousMinPriceCents: null, observationCount: 1, historyDays: 0, lowestVerified: false };
  assert.deepEqual(priceHighlight(semHistorico), { tone: "unproven", label: "ainda sem histórico" });
});

test("menor preço confirmado tem precedência sobre a queda", () => {
  const ambos = { priceCents: 8000, previousMinPriceCents: 10000, observationCount: 6, historyDays: 12, lowestVerified: true };
  assert.equal(priceHighlight(ambos).tone, "verified");
});

test("acompanhamento iniciado hoje não vira '0 dias'", () => {
  const input = { priceCents: 9990, previousMinPriceCents: null, observationCount: 4, historyDays: 0, lowestVerified: false };
  assert.equal(priceSignal(input).label, "4 registros hoje");
  assert.equal(priceNarrative(input, (value) => `R$ ${value / 100}`), "Temos 4 registros de preço coletados hoje; o acompanhamento acabou de começar.");
});

test("janela de histórico concorda em número e singular", () => {
  assert.equal(historyWindow(0), "hoje");
  assert.equal(historyWindow(1), "1 dia");
  assert.equal(historyWindow(9), "9 dias");
});

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
