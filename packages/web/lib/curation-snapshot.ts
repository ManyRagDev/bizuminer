/**
 * Snapshot imutável da decisão de curadoria (M4-D).
 *
 * Contrato do que entra em `curation_event.metadata` no momento da decisão:
 * fatos do produto e da oferta como exibidos pela mesa, sinais objetivos,
 * proveniência da captura e origem da ação — tudo versionado para que uma
 * decisão nova seja reproduzível sem consultar o estado atual mutável do
 * anúncio (regra I7 do plano).
 *
 * Este módulo é puro: a borda de banco monta os fatos (query) e chama
 * `buildSnapshotMetadata`; nunca o contrário.
 */

export const CURATION_SNAPSHOT_VERSION = 1;

export type FamilySnapshot = {
  readonly key: string;
  readonly label: string;
  readonly method: string;
  readonly version: string;
}

export type CurationSnapshotProvenance = {
  readonly presentingCaptureRunId: string | null;
  readonly presentingMarketplace: string | null;
  readonly planId: string | null;
  readonly queryId: string | null;
  readonly mode: string | null;
  readonly targetCategory: string | null;
  readonly targetFamily: string | null;
}

/** Fatos que a mesa exibiu e que sustentam a decisão. */
export type CurationSnapshotFacts = {
  readonly productId: string;
  readonly slug: string;
  readonly marketplace: string;
  readonly externalId: string;
  readonly title: string;
  readonly productUrl: string;
  readonly imageUrl: string | null;
  readonly category: string | null;
  readonly family: FamilySnapshot | null;
  readonly statusBefore: string;
  readonly priceCents: number;
  readonly originalPriceCents: number | null;
  readonly claimedDiscountRate: number | null;
  readonly ratingStar: number | null;
  readonly salesLabel: string | null;
  readonly salesCount: number | null;
  readonly observedAt: string;
  readonly observationCount: number;
  readonly historyDays: number;
  readonly previousMinPriceCents: number | null;
  readonly lowestVerified: boolean;
  readonly signalsShown: readonly string[];
  readonly provenance: CurationSnapshotProvenance;
}

export type CurationSnapshotAction = {
  readonly via: "review" | "bulk" | "undo";
  readonly groupId?: string | null;
  readonly reviewSessionId?: string | null;
  readonly bulkActionId?: string | null;
  readonly undoEventId?: string | null;
  readonly policyVersion: string;
}

export type CurationSnapshotMetadata = {
  readonly snapshot_version: number;
  readonly snapshot: CurationSnapshotFacts & { readonly action: CurationSnapshotAction };
}

export function buildSnapshotMetadata(
  facts: CurationSnapshotFacts,
  action: CurationSnapshotAction,
): CurationSnapshotMetadata {
  return {
    snapshot_version: CURATION_SNAPSHOT_VERSION,
    snapshot: { ...facts, action },
  };
}
