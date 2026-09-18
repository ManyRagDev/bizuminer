import assert from "node:assert/strict";
import test from "node:test";
import { stateAfterDecision, stateRestoredByUndo } from "../lib/curation-transition.ts";

test("decisão consome adiamento anterior", () => {
  assert.deepEqual(
    stateAfterDecision({ status: "approved", reasonCode: null, reasonDetail: null }),
    { status: "approved", reasonCode: null, reasonDetail: null, deferredUntil: null },
  );
});

test("undo restaura motivo e adiamento anteriores", () => {
  const deferredUntil = "2026-09-10T12:00:00.000Z";
  assert.deepEqual(
    stateRestoredByUndo({
      fromStatus: "held",
      fromReasonCode: "family_saturation",
      fromReasonDetail: null,
      fromDeferredUntil: deferredUntil,
    }),
    {
      status: "held",
      reasonCode: "family_saturation",
      reasonDetail: null,
      deferredUntil,
    },
  );
});

test("undo de evento legado sem motivo obrigatório falha fechado", () => {
  assert.equal(
    stateRestoredByUndo({
      fromStatus: "rejected",
      fromReasonCode: null,
      fromReasonDetail: null,
      fromDeferredUntil: null,
    }),
    null,
  );
});
