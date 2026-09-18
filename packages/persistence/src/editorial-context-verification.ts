export interface SnapshotEvidenceSummary {
  readonly evidencePresent: boolean;
  readonly status: "verified" | "awaiting_snapshot_evidence";
  readonly ok: boolean;
}

/** Ausência de snapshot é ausência de evidência, nunca sucesso vazio. */
export function summarizeSnapshotEvidence(
  firstSnapshotAt: Date | string | null | undefined,
  missingSnapshotCount: number,
  malformedSnapshotCount: number,
): SnapshotEvidenceSummary {
  const evidencePresent = Boolean(firstSnapshotAt);
  return {
    evidencePresent,
    status: evidencePresent ? "verified" : "awaiting_snapshot_evidence",
    ok: evidencePresent && missingSnapshotCount === 0 && malformedSnapshotCount === 0,
  };
}
