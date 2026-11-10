import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFreshnessStatus, historyWindow, priceHighlight, priceNarrative, priceSignal } from "../lib/deal-signal.ts";

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

test("evaluateFreshnessStatus classifica corretamente itens frescos (<3h no mesmo dia)", () => {
  const now = new Date("2026-11-10T14:00:00-03:00");
  const fortyFiveMinAgo = new Date("2026-11-10T13:15:00-03:00");
  const freshStatus = evaluateFreshnessStatus(fortyFiveMinAgo, now);

  assert.equal(freshStatus.level, "fresh");
  assert.equal(freshStatus.label, "coletado há 45 min");
  assert.equal(freshStatus.badgeLabel, "Fresco (<3h)");
  assert.ok(freshStatus.ageHours < 3);
});

test("evaluateFreshnessStatus classifica itens em observação (3-10h no mesmo dia)", () => {
  const now = new Date("2026-11-10T18:00:00-03:00");
  const fiveHoursAgo = new Date("2026-11-10T13:00:00-03:00");
  const warmStatus = evaluateFreshnessStatus(fiveHoursAgo, now);

  assert.equal(warmStatus.level, "warm");
  assert.equal(warmStatus.label, "coletado há 5 h");
  assert.equal(warmStatus.badgeLabel, "Atenção (3-10h)");
});

test("evaluateFreshnessStatus classifica itens expirando (>10h ou virada de dia)", () => {
  const now = new Date("2026-11-10T10:00:00-03:00");
  // Virou o dia (ontem às 22h, há 12h)
  const yesterdayNight = new Date("2026-11-09T22:00:00-03:00");
  const staleDay = evaluateFreshnessStatus(yesterdayNight, now);
  assert.equal(staleDay.level, "stale");
  assert.equal(staleDay.badgeLabel, "Virou o dia");

  // Mesmo dia mas > 10h (hoje às 01:00 vs 14:00 = 13h)
  const todayEarly = new Date("2026-11-10T01:00:00-03:00");
  const todayAfternoon = new Date("2026-11-10T14:00:00-03:00");
  const staleHours = evaluateFreshnessStatus(todayEarly, todayAfternoon);
  assert.equal(staleHours.level, "stale");
  assert.equal(staleHours.badgeLabel, "Expirando (>10h)");

  // Sem data
  const noDate = evaluateFreshnessStatus(null, now);
  assert.equal(noDate.level, "stale");
});

test("evaluateFreshnessStatus preserva fresh para coletas <3h mesmo que tenham acabado de cruzar a meia-noite", () => {
  // Coletado às 23:30 de ontem, agora são 00:20 de hoje (50 minutos de idade)
  const yesterdayNight = new Date("2026-11-09T23:30:00-03:00");
  const todayAfterMidnight = new Date("2026-11-10T00:20:00-03:00");
  const status = evaluateFreshnessStatus(yesterdayNight, todayAfterMidnight);

  assert.equal(status.level, "fresh");
  assert.equal(status.badgeLabel, "Fresco (<3h)");
  assert.equal(status.label, "coletado há 50 min");
});
