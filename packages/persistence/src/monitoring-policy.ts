import { prioritizeMonitoringQueue } from "./monitoring-priority.ts";
/** Acompanhamento do catálogo: decisão reproduzível, sem confundir interesse com evidência. */
export type MonitorMarketplace = "mercadolivre" | "shopee" | "aliexpress";
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
    : candidate.opportunityState === "prioritized" ? "watch"
    : candidate.inCurrentEdition && candidate.curationStatus === "approved" ? "edition"
    : candidate.curationStatus === "approved" ? "approved"
    : candidate.opportunityState === "monitored" && candidate.curationStatus !== "rejected" ? "approved"
    : candidate.curationStatus === "held" && ["insufficient_evidence", "weak_offer", "stale_offer"].includes(candidate.curationReason ?? "")
      && candidate.hasEditorialMerit ? "formation"
    : candidate.clicks7d > 0 ? "engaged"
    : candidate.curationStatus === "pending" && (candidate.firstSeenAt ? now.getTime()-candidate.firstSeenAt.getTime()<=14*86400000 : ageHours<=14*24) ? "candidate"
    : "archive";
  const targetHours = tier === "watch" || tier === "edition" ? 24
    : tier === "approved" ? 48
    : tier === "engaged" ? 72
    : tier === "formation" ? 72
    : tier === "candidate" ? 168
    : null;
  const overdueHours = targetHours === null ? 0 : Math.max(0, ageHours - targetHours);
  return {
    productId: candidate.productId,
    marketplace: candidate.marketplace,
    tier,
    targetHours,
    overdueHours,
    due: targetHours !== null && ageHours >= targetHours,
    lane: targetHours === null ? "none" : candidate.marketplace === "mercadolivre" ? "human" : "api",
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
  const chosen: MonitoringDecision[] = [];
  const taken = new Set<string>();
  const take = (tier: MonitorTier, count: number) => {
    for (const decision of due) {
      if (chosen.length >= cap || count <= 0) break;
      if (decision.tier !== tier || taken.has(decision.productId)) continue;
      chosen.push(decision);
      taken.add(decision.productId);
      count--;
    }
  };
  take("watch", cap);
  const remaining=due.filter(d=>!taken.has(d.productId)).map(d=>({...d,id:d.productId,observationCount:d.tier==='candidate'||d.tier==='formation'?1:2}));
  // Share the existing 10% history-building reserve between candidates and formation and explicit watches; use the same budget allocator as radar.
  const allocated=prioritizeMonitoringQueue(remaining,cap-chosen.length,cap>=10?0.1:0);
  chosen.push(...allocated);

  return chosen;
}
