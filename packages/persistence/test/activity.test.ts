import assert from "node:assert/strict";
import test from "node:test";
import { classifyActivity, RECENT_WINDOW_DAYS } from "../src/activity.ts";
import { InMemoryStore } from "../src/store.ts";

test("visto na rodagem atual é ativo mesmo com dias desde a última aparição", () => {
  assert.equal(
    classifyActivity({ seenInCurrentRun: true, daysSinceLastSeen: 0 }),
    "ativo",
  );
  assert.equal(
    classifyActivity({ seenInCurrentRun: true, daysSinceLastSeen: 30 }),
    "ativo",
  );
});

test("fora da rodagem atual e dentro da janela é recente", () => {
  assert.equal(
    classifyActivity({ seenInCurrentRun: false, daysSinceLastSeen: 0 }),
    "recente",
  );
  assert.equal(
    classifyActivity({ seenInCurrentRun: false, daysSinceLastSeen: RECENT_WINDOW_DAYS }),
    "recente",
  );
});

test("fora da janela é dormente, com histórico preservado", () => {
  assert.equal(
    classifyActivity({ seenInCurrentRun: false, daysSinceLastSeen: RECENT_WINDOW_DAYS + 1 }),
    "dormente",
  );
});

test("InMemoryStore conta ativo/recente/dormente pela rodagem e datas", async () => {
  const store = new InMemoryStore();
  const now = new Date("2026-08-20T12:00:00Z");
  const dayMs = 86_400_000;

  const seed = async (runId: string, externalId: string, daysAgo: number) => {
    const observedAt = new Date(now.getTime() - daysAgo * dayMs);
    await store.upsertProductWithObservation({
      captureRunId: runId,
      tenantId: "local",
      marketplace: "mercadolivre",
      externalId,
      title: `Produto ${externalId}`,
      productUrl: `https://x/${externalId}`,
      priceCents: 1000,
      observedAt,
    });
  };

  const current = await store.startCaptureRun({
    tenantId: "local",
    marketplace: "mercadolivre",
    startedAt: now,
    collectorRunId: "t",
    parameters: {},
  });
  await seed(current, "ATIVO", 0); // visto na rodagem atual
  await seed("run-antiga", "RECENTE", 5); // visto há 5 dias, fora da rodagem
  await seed("run-antiga", "DORMENTE", 60); // visto há 60 dias

  const counts = await store.productActivity("local", current, now);
  assert.deepEqual(counts, { ativo: 1, recente: 1, dormente: 1 });
});
