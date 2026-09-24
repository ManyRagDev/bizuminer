import assert from "node:assert/strict";
import test from "node:test";
import { monitoringDecision, monitoringQueue, type MonitoringCandidate } from "../src/monitoring-policy.ts";
import { missingRetryHours } from "../src/monitoring-candidates.ts";

const now = new Date("2026-09-24T12:00:00Z");
const candidate = (id: string, overrides: Partial<MonitoringCandidate> = {}): MonitoringCandidate => ({
  productId: id,
  marketplace: "shopee",
  lastObservedAt: new Date("2026-09-22T00:00:00Z"),
  activeWatches: 0,
  clicks7d: 0,
  curationStatus: "pending",
  ...overrides,
});

test("interesse explícito vem primeiro; ML vai para revisão humana", () => {
  const decision = monitoringDecision(candidate("ml", { marketplace: "mercadolivre", activeWatches: 1 }), now);
  assert.equal(decision.tier, "watch");
  assert.equal(decision.targetHours, 24);
  assert.equal(decision.lane, "human");
  assert.equal(decision.due, true);
});

test("produto rejeitado ou retido não consome consultas sem interesse", () => {
  assert.equal(monitoringDecision(candidate("held", { curationStatus: "held" }), now).due, false);
  assert.equal(monitoringDecision(candidate("legacy", { curationStatus: "legacy_visible" }), now).due, false);
  assert.equal(monitoringDecision(candidate("held", { curationStatus: "held", activeWatches: 1 }), now).tier, "watch");
});

test("fila respeita orçamento, loja e faixa antes do atraso", () => {
  const queue = monitoringQueue([
    candidate("old-pending", { lastObservedAt: new Date("2026-09-01T00:00:00Z") }),
    candidate("watched", { activeWatches: 1 }),
    candidate("approved", { curationStatus: "approved" }),
    candidate("ali", { marketplace: "aliexpress", activeWatches: 1 }),
  ], "shopee", 2, now);
  assert.deepEqual(queue.map((item) => item.productId), ["watched", "approved"]);
});

test("reserva parte do orçamento para formar histórico de candidatos", () => {
  const approved = Array.from({ length: 20 }, (_, i) => candidate(`approved-${i}`, { curationStatus: "approved" }));
  const queue = monitoringQueue([...approved,
    candidate("candidate-a", { lastObservedAt: new Date("2026-09-01T00:00:00Z") }),
    candidate("candidate-b", { lastObservedAt: new Date("2026-09-01T00:00:00Z") }),
  ], "shopee", 10, now);
  assert.equal(queue.length, 10);
  assert.equal(queue.filter((entry) => entry.tier === "candidate").length, 1);
});

test("ausências repetidas recebem recuo progressivo, menor para itens observados pelo usuário", () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => missingRetryHours(n, false)), [24, 72, 168, 336]);
  assert.deepEqual([1, 2, 3, 4].map((n) => missingRetryHours(n, true)), [6, 24, 72, 72]);
});
