import { classifyHeroCandidate } from "./hero-ranking.ts";
import { composeHomepage, homepageClarityBlockers } from "./homepage-policy.ts";
import type { EditorialCandidate } from "./editorial-selection.ts";

export type HomepageRenewalOutcome = "not_started" | "published" | "unchanged" | "awaiting_review" | "manual_edition" | "failed";
export interface HomepageRenewalState {
  schemaReady: boolean;
  enabled: boolean;
  lastAttemptAt: string | null;
  outcome: HomepageRenewalOutcome;
  renewedAt: string | null;
  renewAfter: string | null;
}

/** Operator-only diagnostics. No invented assessments and no public rubric data. */
export function homepageRenewalReadiness(candidates: EditorialCandidate[], publishedProductIds: string[], now = new Date()) {
  const published = new Set(publishedProductIds);
  const entries = candidates.map(candidate => {
    const classification = classifyHeroCandidate(candidate, now);
    return { candidate, classification, blockers: [...classification.reasons, ...homepageClarityBlockers(candidate),
      ...(!published.has(candidate.id) ? ["Publique um link ativo para este produto."] : [])] };
  });
  const eligible = entries.filter(entry => !entry.blockers.length && entry.classification.status === "hero");
  const reasons = new Map<string, number>();
  for (const entry of entries) for (const blocker of new Set(entry.blockers)) reasons.set(blocker, (reasons.get(blocker) ?? 0) + 1);
  const composed = composeHomepage(eligible.map(entry => entry.candidate), now);
  return {
    candidates: candidates.length,
    qualified: eligible.length,
    editionCount: composed.selected.length,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    reviewProducts: entries.filter(entry => entry.blockers.length).sort((a, b) =>
      Number(a.classification.status === "blocked") - Number(b.classification.status === "blocked")
      || (b.classification.score ?? 0) - (a.classification.score ?? 0) || a.candidate.id.localeCompare(b.candidate.id))
      .slice(0, 6).map(({ candidate, blockers }) => ({ id: candidate.id, title: candidate.title, blockers })),
  };
}

export function homepageRefreshExitCode(result: { ready: boolean; blocked?: string }, strict = false): number {
  return !result.ready || (result.blocked && (strict || result.blocked !== "initialization_required")) ? 1 : 0;
}
