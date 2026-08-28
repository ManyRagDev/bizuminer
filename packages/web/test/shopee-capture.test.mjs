import assert from "node:assert/strict";
import test from "node:test";
import { shopeeCaptureEnabled } from "../lib/shopee-capture.ts";

test("shopeeCaptureEnabled: sem variáveis → desligado", () => {
  assert.equal(shopeeCaptureEnabled({}), false);
});

test("shopeeCaptureEnabled: flag ligada sem credencial → desligado", () => {
  assert.equal(shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "true" }), false);
});

test("shopeeCaptureEnabled: credencial completa sem flag → desligado", () => {
  assert.equal(shopeeCaptureEnabled({ SHOPEE_APP_ID: "x", SHOPEE_APP_SECRET: "y" }), false);
});

test("shopeeCaptureEnabled: flag true + credencial completa → ligado", () => {
  assert.equal(
    shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "true", SHOPEE_APP_ID: "x", SHOPEE_APP_SECRET: "y" }),
    true,
  );
});
