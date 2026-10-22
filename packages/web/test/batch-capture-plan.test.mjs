import test from "node:test";
import assert from "node:assert/strict";
import { batchCapturePlan } from "../lib/batch-capture-plan.ts";

test("lote diário sempre inclui Shopee e AliExpress", () => {
  assert.deepEqual(batchCapturePlan(false), ["shopee", "aliexpress"]);
  assert.deepEqual(batchCapturePlan(true), ["shopee", "aliexpress"]);
});

test("seleção explícita mantém ordem e remove duplicatas", () => {
  assert.deepEqual(
    batchCapturePlan(false, ["aliexpress", "shopee", "aliexpress"]),
    ["shopee", "aliexpress"],
  );
  assert.deepEqual(
    batchCapturePlan(true, ["aliexpress"]),
    ["aliexpress"],
  );
});

test("pedido explícito de Mercado Livre (isolado ou misto) lança manual_capture_only", () => {
  assert.throws(
    () => batchCapturePlan(false, ["mercadolivre"]),
    /manual_capture_only/,
  );
  assert.throws(
    () => batchCapturePlan(true, ["mercadolivre"]),
    /manual_capture_only/,
  );
  assert.throws(
    () => batchCapturePlan(true, ["mercadolivre", "shopee"]),
    /manual_capture_only/,
  );
  assert.throws(
    () => batchCapturePlan(false, ["shopee", "mercadolivre"]),
    /manual_capture_only/,
  );
});

test("seleção desconhecida não entra no lote", () => {
  assert.deepEqual(batchCapturePlan(true, ["outra", "shopee"]), ["shopee"]);
});

