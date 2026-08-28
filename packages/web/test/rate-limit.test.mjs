import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindowLimiter, captureIpKey } from "../lib/rate-limit.ts";

test("permite até o limite e bloqueia o pedido seguinte", () => {
  const limiter = new SlidingWindowLimiter(3, 60_000);
  const t0 = 1_000_000;
  assert.deepEqual(limiter.check("a", t0), { limited: false, remaining: 2 });
  assert.deepEqual(limiter.check("a", t0 + 1), { limited: false, remaining: 1 });
  assert.deepEqual(limiter.check("a", t0 + 2), { limited: false, remaining: 0 });
  assert.deepEqual(limiter.check("a", t0 + 3), { limited: true, remaining: 0 });
});

test("a janela desliza: pedidos antigos expiram e voltam a ser permitidos", () => {
  const limiter = new SlidingWindowLimiter(2, 1000);
  const t0 = 1_000_000;
  limiter.check("a", t0);
  limiter.check("a", t0 + 100);
  assert.deepEqual(limiter.check("a", t0 + 200), { limited: true, remaining: 0 });
  // depois que a janela passou, o primeiro pedido expirou
  assert.deepEqual(limiter.check("a", t0 + 1100), { limited: false, remaining: 1 });
});

test("chaves diferentes têm contagens independentes", () => {
  const limiter = new SlidingWindowLimiter(1, 60_000);
  const t0 = 1_000_000;
  assert.equal(limiter.check("a", t0).limited, false);
  assert.equal(limiter.check("b", t0).limited, false, "chave b não é afetada por a");
  assert.equal(limiter.check("a", t0 + 1).limited, true);
});

test("captureIpKey extrai o primeiro IP do x-forwarded-for", () => {
  assert.equal(captureIpKey("203.0.113.7, 70.41.3.18"), "203.0.113.7");
  assert.equal(captureIpKey("  203.0.113.7  "), "203.0.113.7");
  assert.equal(captureIpKey(null), "local");
  assert.equal(captureIpKey(""), "local");
});
