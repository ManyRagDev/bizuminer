import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enqueue, dequeue, markRetry, pruneExpired, dueForRetry, OUTBOX_MAX_ITEMS, OUTBOX_TTL_MS, RETRY_DELAYS_MS } from "../src/lib/outbox.ts";
import type { CapturePayload } from "../src/lib/contracts.ts";

function payload(requestId: string): CapturePayload {
  return {
    version: 1,
    requestId,
    marketplace: "mercadolivre",
    clientCapturedAt: new Date().toISOString(),
    page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
    product: { externalId: "MLB1234567890", title: "Produto", productUrl: "https://x", priceCents: 100 },
  };
}

describe("outbox", () => {
  it("enqueue preserva requestId e não duplica o mesmo requestId", () => {
    let box = enqueue([], payload("r1"), 0);
    box = enqueue(box, payload("r1"), 0);
    assert.equal(box.length, 1);
    assert.equal(box[0]!.requestId, "r1");
  });

  it("retry NUNCA gera outro requestId (markRetry só incrementa attempts)", () => {
    let box = enqueue([], payload("r1"), 0);
    box = markRetry(box, "r1", "network", 0);
    assert.equal(box[0]!.requestId, "r1");
    assert.equal(box[0]!.attempts, 1);
    assert.equal(box[0]!.nextRetryAt, 0 + RETRY_DELAYS_MS[0]!);
  });

  it("dequeue remove por requestId (200, mesmo duplicate:true)", () => {
    let box = enqueue([], payload("r1"), 0);
    box = enqueue(box, payload("r2"), 0);
    box = dequeue(box, "r1");
    assert.deepEqual(box.map((e) => e.requestId), ["r2"]);
  });

  it("pruneExpired remove itens além do TTL", () => {
    let box = enqueue([], payload("old"), 0);
    box = enqueue(box, payload("new"), OUTBOX_TTL_MS + 1);
    const pruned = pruneExpired(box, OUTBOX_TTL_MS + 2);
    assert.deepEqual(pruned.map((e) => e.requestId), ["new"]);
  });

  it("limita a fila a OUTBOX_MAX_ITEMS", () => {
    let box: ReturnType<typeof enqueue> = [];
    for (let i = 0; i < OUTBOX_MAX_ITEMS + 10; i++) box = enqueue(box, payload(`r${i}`), 0);
    assert.equal(box.length, OUTBOX_MAX_ITEMS);
  });

  it("dueForRetry devolve apenas itens cujo backoff já venceu", () => {
    let box = enqueue([], payload("r1"), 0);
    box = markRetry(box, "r1", "net", 0);
    assert.equal(dueForRetry(box, RETRY_DELAYS_MS[0]! - 1).length, 0);
    assert.equal(dueForRetry(box, RETRY_DELAYS_MS[0]!).length, 1);
  });
});
