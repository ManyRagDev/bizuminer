/** Acompanhamento do catálogo: decisão reproduzível, sem confundir interesse com evidência. */
export type MonitorMarketplace = "mercadolivre" | "shopee" | "aliexpress" | "amazon";
export type MonitorTier = "watch" | "edition" | "approved" | "engaged" | "formation" | "candidate" | "archive";

export interface MonitoringCandidate {
  readonly productId: string;
  readonly marketplace: MonitorMarketplace;
  readonly lastObservedAt: Date;
  readonly activeWatches: number;
  readonly clicks7d: number;
  readonly firstSeenAt?:Date;
  readonly curationStatus: string | null;
  readonly inCurrentEdition?: boolean;
  readonly curationReason?: string | null;
  readonly hasEditorialMerit?: boolean;
  readonly needsOptionConfirmation?: boolean;
  readonly opportunityState?: "prioritized" | "monitored" | "candidate" | "held" | "archived";
}

export interface MonitoringDecision {
  readonly productId: string;
  readonly marketplace: MonitorMarketplace;
  readonly tier: MonitorTier;
  readonly targetHours: number | null;
  readonly overdueHours: number;
  readonly due: boolean;
  readonly lane: "api" | "human" | "none";
}

export function monitoringDecision(candidate: MonitoringCandidate, now = new Date()): MonitoringDecision {
  const ageHours = Math.max(0, (now.getTime() - candidate.lastObservedAt.getTime()) / 3_600_000);
  const tier: MonitorTier = candidate.activeWatches > 0 ? "watch"
    : candidate.inCurrentEdition && candidate.curationStatus === "approved" ? "edition"
    : "archive";
  const targetHours = tier === "watch" || tier === "edition" ? 24
    : null;
  const overdueHours = targetHours === null ? 0 : Math.max(0, ageHours - targetHours);
  return {
    productId: candidate.productId,
    marketplace: candidate.marketplace,
    tier,
    targetHours,
    overdueHours,
    due: targetHours !== null && ageHours >= targetHours,
    lane: targetHours === null ? "none" : candidate.marketplace === "shopee" ? "api" : "human",
  };
}

const TIER_ORDER: Record<MonitorTier, number> = {
  watch: 0,
  edition: 1,
  approved: 2,
  engaged: 3,
  formation: 4,
  candidate: 5,
  archive: 6,
};

/** Orçamento independente por loja; atrasos maiores vencem dentro de cada faixa. */
export function monitoringQueue(
  candidates: readonly MonitoringCandidate[],
  marketplace: MonitorMarketplace,
  budget: number,
  now = new Date(),
): MonitoringDecision[] {
  const due = candidates
    .filter((candidate) => candidate.marketplace === marketplace)
    .map((candidate) => monitoringDecision(candidate, now))
    .filter((decision) => decision.due)
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
      || b.overdueHours - a.overdueHours
      || a.productId.localeCompare(b.productId));
  const cap = Math.max(0, Math.floor(budget));
  // Discovery and history formation do not create a directed monitoring obligation.
  return due.slice(0, cap);
}
