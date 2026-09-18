import type { CurationReason, CurationStatus } from "./curation-contract.ts";

export interface StoredCurationState {
  readonly status: CurationStatus;
  readonly reasonCode: CurationReason | null;
  readonly reasonDetail: string | null;
  readonly deferredUntil: Date | string | null;
}

export interface PreviousCurationState {
  readonly fromStatus: CurationStatus;
  readonly fromReasonCode: CurationReason | null;
  readonly fromReasonDetail: string | null;
  readonly fromDeferredUntil: Date | string | null;
}

/** Toda decisão final consome um eventual adiamento anterior. */
export function stateAfterDecision(decision: {
  status: CurationStatus;
  reasonCode: CurationReason | null;
  reasonDetail: string | null;
}): StoredCurationState {
  return { ...decision, deferredUntil: null };
}

/**
 * Reconstrói o estado editorial anterior gravado no evento.
 * Eventos legados que vieram de held/rejected sem motivo anterior não podem
 * ser desfeitos com segurança: falham fechado em vez de violar constraints.
 */
export function stateRestoredByUndo(previous: PreviousCurationState): StoredCurationState | null {
  const needsReason = previous.fromStatus === "held" || previous.fromStatus === "rejected";
  if (needsReason && previous.fromReasonCode === null) return null;
  if (!needsReason && (previous.fromReasonCode !== null || previous.fromReasonDetail !== null)) return null;

  return {
    status: previous.fromStatus,
    reasonCode: previous.fromReasonCode,
    reasonDetail: previous.fromReasonDetail,
    deferredUntil: previous.fromDeferredUntil,
  };
}
