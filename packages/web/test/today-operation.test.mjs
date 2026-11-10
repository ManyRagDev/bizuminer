import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStoreHealth } from "../lib/today-operation.ts";

test("evaluateStoreHealth marca fresh quando captura <3h e tem produtos aprovados", () => {
  const now = new Date("2026-11-10T14:00:00-03:00");
  const capturedAt = new Date("2026-11-10T13:10:00-03:00");
  const health = evaluateStoreHealth("amazon", capturedAt, 40, 15, now);

  assert.equal(health.status, "fresh");
  assert.equal(health.name, "Amazon");
  assert.match(health.statusLabel, /Em dia \(15 ofertas <3h\)/);
  assert.equal(health.lastCaptureAgo, "há 50 min");
});

test("evaluateStoreHealth marca warm quando captura entre 3h e 8h no mesmo dia", () => {
  const now = new Date("2026-11-10T18:00:00-03:00");
  const capturedAt = new Date("2026-11-10T14:00:00-03:00");
  const health = evaluateStoreHealth("mercadolivre", capturedAt, 20, 5, now);

  assert.equal(health.status, "warm");
  assert.equal(health.name, "Mercado Livre");
  assert.match(health.statusLabel, /Atenção/);
  assert.equal(health.lastCaptureAgo, "há 4 h");
});

test("evaluateStoreHealth marca stale quando última captura foi ontem ou >8h", () => {
  const now = new Date("2026-11-10T10:00:00-03:00");
  const yesterday = new Date("2026-11-09T20:00:00-03:00");
  const health = evaluateStoreHealth("shopee", yesterday, 0, 0, now);

  assert.equal(health.status, "stale");
  assert.equal(health.name, "Shopee");
  assert.match(health.statusLabel, /Exige rodagem/);
});

test("evaluateStoreHealth lida com lojas sem nenhuma captura", () => {
  const now = new Date("2026-11-10T10:00:00-03:00");
  const health = evaluateStoreHealth("shopee", null, 0, 0, now);

  assert.equal(health.status, "stale");
  assert.equal(health.statusLabel, "Sem rodagens");
  assert.equal(health.lastCaptureAgo, "nunca");
});
