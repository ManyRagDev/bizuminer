import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  markBatchQueued,
  isBatchExpired,
  shouldRetryBatch,
  BATCH_MAX_ATTEMPTS,
  BATCH_MAX_AGE_MS,
  type StoredBrowserBatch,
} from "../src/lib/batch-queue.ts";

function fakeBatch(overrides: Partial<StoredBrowserBatch> = {}): StoredBrowserBatch {
  return {
    payload: {
      version: 1 as const,
      marketplace: "amazon" as const,
      requestId: "00000000-0000-0000-0000-000000000000",
      clientCapturedAt: new Date().toISOString(),
      page: { kind: "listing" as const, url: "https://www.amazon.com.br/s?k=fone" },
      products: [
        {
          externalId: "B00FAKEASIN",
          title: "Fone de Ouvido Bluetooth",
          productUrl: "https://www.amazon.com.br/dp/B00FAKEASIN",
          priceCents: 9900,
          currency: "BRL" as const,
          priceType: "exact" as const,
        },
      ],
      ignoredCards: 0,
    },
    ...overrides,
  };
}

describe("batch-queue", () => {
  it("markBatchQueued inicializa queuedAt e incrementa attempts", () => {
    const t0 = 1000000;
    const batch = fakeBatch();
    const queued1 = markBatchQueued(batch, "no_waiting_batch", t0);
    assert.equal(queued1.queued, true);
    assert.equal(queued1.queuedAt, t0);
    assert.equal(queued1.attempts, 1);
    assert.equal(queued1.lastError, "no_waiting_batch");

    const t1 = t0 + 30000;
    const queued2 = markBatchQueued(queued1, "network", t1);
    assert.equal(queued2.queued, true);
    assert.equal(queued2.queuedAt, t0); // preserva queuedAt original
    assert.equal(queued2.attempts, 2);
    assert.equal(queued2.lastAttemptAt, t1);
    assert.equal(queued2.lastError, "network");
  });

  it("isBatchExpired detecta lote com tempo além de BATCH_MAX_AGE_MS", () => {
    const t0 = 1000000;
    const queued = markBatchQueued(fakeBatch(), "no_waiting_batch", t0);
    assert.equal(isBatchExpired(queued, t0 + 1000), false);
    assert.equal(isBatchExpired(queued, t0 + BATCH_MAX_AGE_MS - 1), false);
    assert.equal(isBatchExpired(queued, t0 + BATCH_MAX_AGE_MS + 1), true);
  });

  it("isBatchExpired detecta lote com tentativas além de BATCH_MAX_ATTEMPTS", () => {
    const t0 = 1000000;
    const queued = fakeBatch({ queued: true, queuedAt: t0, attempts: BATCH_MAX_ATTEMPTS });
    assert.equal(isBatchExpired(queued, t0 + 1000), true);
  });

  it("shouldRetryBatch devolve true somente para lotes enfileirados e válidos", () => {
    const t0 = 1000000;
    assert.equal(shouldRetryBatch(undefined, t0), false);
    assert.equal(shouldRetryBatch(fakeBatch({ queued: false }), t0), false);
    assert.equal(shouldRetryBatch(fakeBatch({ queued: true, payload: undefined }), t0), false);

    const validQueued = markBatchQueued(fakeBatch(), "no_waiting_batch", t0);
    assert.equal(shouldRetryBatch(validQueued, t0 + 5000), true);
    assert.equal(shouldRetryBatch(validQueued, t0 + BATCH_MAX_AGE_MS + 10), false);
  });
});
