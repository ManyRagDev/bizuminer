import test from "node:test";
import assert from "node:assert/strict";
import { batchCapturePlan } from "../lib/batch-capture-plan.ts";

test("lote diário sempre inclui Shopee e AliExpress", () => {
  assert.deepEqual(batchCapturePlan(false), ["shopee", "aliexpress"]);
});

test("consentimento explícito adiciona Mercado Livre ao lote", () => {
  assert.deepEqual(batchCapturePlan(true), ["mercadolivre", "shopee", "aliexpress"]);
});

test("seleção explícita mantém ordem, remove duplicatas e respeita consentimento", () => {
  assert.deepEqual(
    batchCapturePlan(true, ["aliexpress", "mercadolivre", "mercadolivre"]),
    ["mercadolivre", "aliexpress"],
  );
  assert.deepEqual(
    batchCapturePlan(false, ["mercadolivre", "shopee"]),
    ["shopee"],
  );
});

test("seleção desconhecida não entra no lote", () => {
  assert.deepEqual(batchCapturePlan(true, ["outra", "shopee"]), ["shopee"]);
});
