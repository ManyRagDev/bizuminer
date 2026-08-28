import assert from "node:assert/strict";
import test from "node:test";
import { mlAutomatedCaptureEnabled } from "../lib/automated-capture.ts";

test("kill switch ML: flag ausente → desligado (default seguro)", () => {
  assert.equal(mlAutomatedCaptureEnabled({}), false);
  assert.equal(mlAutomatedCaptureEnabled({ NODE_ENV: "development" }), false);
});

test("kill switch ML: só 'true' literal liga (case-sensitive)", () => {
  assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "" }), false);
  assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "false" }), false);
  assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "1" }), false);
  assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "TRUE" }), false);
});

test("kill switch ML: flag true em produção → desligado (falha fechada)", () => {
  assert.equal(
    mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "true", NODE_ENV: "production" }),
    false,
  );
  assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "true" }), false);
});

test("kill switch ML: flag true + development → ligado", () => {
  assert.equal(
    mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "true", NODE_ENV: "development" }),
    true,
  );
});
