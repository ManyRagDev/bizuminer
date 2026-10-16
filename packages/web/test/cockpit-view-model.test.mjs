import test from "node:test";
import assert from "node:assert/strict";
import { determineCockpitNextAction } from "../lib/cockpit-view-model.ts";

test("determineCockpitNextAction resolves review_evidence for candidate or E0 items", () => {
  const action1 = determineCockpitNextAction({
    opportunityState: "candidate",
    evidenceLevel: "E1",
  });
  assert.equal(action1.action, "review_evidence");
  assert.equal(action1.enabled, true);

  const action2 = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E0",
  });
  assert.equal(action2.action, "review_evidence");
  assert.equal(action2.enabled, true);
});

test("determineCockpitNextAction resolves monitor for held and monitored states", () => {
  const actionMonitored = determineCockpitNextAction({
    opportunityState: "monitored",
    evidenceLevel: "E2",
  });
  assert.equal(actionMonitored.action, "monitor");
  assert.equal(actionMonitored.enabled, true);

  const actionHeld = determineCockpitNextAction({
    opportunityState: "held",
    evidenceLevel: "E2",
  });
  assert.equal(actionHeld.action, "monitor");
  assert.equal(actionHeld.enabled, true);
});

test("determineCockpitNextAction resolves create_draft for prioritized items without kit", () => {
  const action = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: false,
  });
  assert.equal(action.action, "create_draft");
  assert.equal(action.enabled, true);
});

test("determineCockpitNextAction resolves kit revision, validation and export states", () => {
  const actionRevise = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "needs_revision",
  });
  assert.equal(actionRevise.action, "revise_kit");
  assert.equal(actionRevise.enabled, true);

  const actionApprove = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "validating",
  });
  assert.equal(actionApprove.action, "approve");
  assert.equal(actionApprove.enabled, true);

  const actionExport = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "ready",
    hasValidMonetization: true,
  });
  assert.equal(actionExport.action, "export");
  assert.equal(actionExport.enabled, true);
});

test("determineCockpitNextAction disables export when monetization is invalid/unvalidated", () => {
  const actionBlocked = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "ready",
    hasValidMonetization: false,
  });
  assert.equal(actionBlocked.action, "export");
  assert.equal(actionBlocked.enabled, false);
  assert.ok(actionBlocked.disabledReason?.includes("Link de monetização"));
});

test("determineCockpitNextAction handles publication confirmation, reconciliation, and archival", () => {
  const actionConfirm = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "exported",
  });
  assert.equal(actionConfirm.action, "confirm");
  assert.equal(actionConfirm.enabled, true);

  const actionReconcile = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "failed",
  });
  assert.equal(actionReconcile.action, "reconcile");
  assert.equal(actionReconcile.enabled, true);

  const actionArchived = determineCockpitNextAction({
    opportunityState: "archived",
  });
  assert.equal(actionArchived.action, "none");
  assert.equal(actionArchived.enabled, false);
});
