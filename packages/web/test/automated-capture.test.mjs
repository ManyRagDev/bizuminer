import assert from "node:assert/strict";
import test from "node:test";
import { mlAutomatedCaptureEnabled, mlCaptureAllowedWithConsent } from "../lib/automated-capture.ts";

test("OS-032: ML permanece manual para toda combinação de flags e ambiente", () => {
  const values = [undefined, "", "false", "true", "TRUE", "1"];
  for (const NODE_ENV of [undefined, "development", "production", "test"]) {
    for (const ML_AUTOMATED_CAPTURE_ENABLED of values) {
      for (const ML_AUTOMATED_CAPTURE_PRODUCTION of values) {
        const env = { NODE_ENV, ML_AUTOMATED_CAPTURE_ENABLED, ML_AUTOMATED_CAPTURE_PRODUCTION };
        assert.equal(mlAutomatedCaptureEnabled(env), false, JSON.stringify(env));
        for (const consent of [false, true]) {
          assert.equal(mlCaptureAllowedWithConsent(consent, env), false, JSON.stringify({ ...env, consent }));
        }
      }
    }
  }
  // O ambiente real também nunca concede permissão.
  assert.equal(mlAutomatedCaptureEnabled(), false);
  assert.equal(mlCaptureAllowedWithConsent(true), false);
});
