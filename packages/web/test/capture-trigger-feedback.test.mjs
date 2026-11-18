import assert from "node:assert/strict";
import test from "node:test";
import { captureTriggerFailureMessage } from "../lib/capture-trigger-feedback.ts";

test("captureTriggerFailureMessage maps 403 invalid_origin and trial authorization clearly", () => {
  const originMsg = captureTriggerFailureMessage(403, { error: "invalid_origin" });
  assert.match(originMsg ?? "", /403/);
  assert.match(originMsg ?? "", /NEXT_PUBLIC_SITE_URL/);

  const trialMsg = captureTriggerFailureMessage(403, {
    error: "capture_trial_not_authorized",
    message: "O ensaio de captura não está autorizado para esta conta.",
  });
  assert.equal(trialMsg, "O ensaio de captura não está autorizado para esta conta.");

  const forbiddenMsg = captureTriggerFailureMessage(403, { error: "forbidden" });
  assert.match(forbiddenMsg ?? "", /403/);

  const generic403 = captureTriggerFailureMessage(403, {});
  assert.match(generic403 ?? "", /403/);
});

test("captureTriggerFailureMessage preserves session, batch and manual capture messages", () => {
  assert.match(captureTriggerFailureMessage(401, {}) ?? "", /Sessão expirada/);
  assert.equal(
    captureTriggerFailureMessage(409, { error: "batch_in_progress" }),
    "Já há uma captura em andamento.",
  );
  assert.match(
    captureTriggerFailureMessage(409, { error: "manual_capture_only" }) ?? "",
    /Mercado Livre/,
  );
  assert.equal(captureTriggerFailureMessage(500, { error: "batch_create_failed" }), null);
});
