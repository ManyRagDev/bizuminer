import test from "node:test";
import assert from "node:assert/strict";
import { batchCapturePlan } from "../lib/batch-capture-plan.ts";

test("lote diário sempre inclui Shopee e AliExpress", () => {
  assert.deepEqual(batchCapturePlan(false), ["shopee", "aliexpress"]);
});

test("consentimento explícito adiciona Mercado Livre ao lote", () => {
  assert.deepEqual(batchCapturePlan(true), ["mercadolivre", "shopee", "aliexpress"]);
});
