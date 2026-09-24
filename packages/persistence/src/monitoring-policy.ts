/** Acompanhamento do catálogo: decisão reproduzível, sem confundir interesse com evidência. */
export type MonitorMarketplace = "mercadolivre" | "shopee" | "aliexpress";
export type MonitorTier = "watch" | "approved" | "engaged" | "candidate" | "archive";

export interface MonitoringCandidate {
  readonly productId: string;
  readonly marketplace: MonitorMarketplace;
  readonly lastObservedAt: Date;
  readonly activeWatches: number;
  readonly clicks7d: number;
  readonly curationStatus: string | null;
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
  const tier: MonitorTier = candidate.activeWatches > 0 ? "watch"
    : candidate.curationStatus === "approved" ? "approved"
    : candidate.clicks7d > 0 ? "engaged"
    : candidate.curationStatus === "pending" ? "candidate"
    : "archive";
  const targetHours = tier === "watch" ? 24
    : tier === "approved" ? 48
    : tier === "engaged" ? 72
    : tier === "candidate" ? 168
    : null;
  const ageHours = Math.max(0, (now.getTime() - candidate.lastObservedAt.getTime()) / 3_600_000);
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
  approved: 1,
  engaged: 2,
  candidate: 3,
  archive: 4,
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
  // Uma pequena reserva constrói histórico de candidatos e não deixa a fila
  // aprovada consumir 100% do orçamento por meses. Interesse explícito vence.
  if (cap >= 10) {
    take("candidate", Math.floor(cap * 0.1));
    take("engaged", Math.floor(cap * 0.1));
  }
  for (const decision of due) {
    if (chosen.length >= cap) break;
    if (!taken.has(decision.productId)) chosen.push(decision);
  }
  return chosen;
}
