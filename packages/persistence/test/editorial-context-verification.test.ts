import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSnapshotEvidence } from "../src/editorial-context-verification.ts";

test("verificador não aprova quando ainda não existe snapshot real", () => {
  assert.deepEqual(summarizeSnapshotEvidence(null, 0, 0), {
    evidencePresent: false,
    status: "awaiting_snapshot_evidence",
    ok: false,
  });
});

test("verificador exige zero snapshots ausentes ou malformados", () => {
  const watermark = "2026-09-04T12:00:00.000Z";
  assert.equal(summarizeSnapshotEvidence(watermark, 0, 0).ok, true);
  assert.equal(summarizeSnapshotEvidence(watermark, 1, 0).ok, false);
  assert.equal(summarizeSnapshotEvidence(watermark, 0, 1).ok, false);
});
