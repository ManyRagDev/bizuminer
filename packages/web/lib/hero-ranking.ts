import {
  EDITORIAL_DIMENSIONS, editorialOfferBlockers, editorialSelectionBlockers, validateEditorialAssessment,
  type EditorialCandidate, type EditorialDimensionId,
} from "./editorial-selection.ts";
import { HERO_LEVEL_POINTS, HERO_MAX_PRODUCTS, HERO_POLICY_VERSION, HERO_WEIGHTS } from "./hero-policy.ts";

type HeroCandidate = Pick<EditorialCandidate, "id" | "curationStatus" | "evidenceFingerprint" | "evidenceObservedAt" | "lastSeenAt" | "imageUrl" | "priceCents" | "offerEvidence" | "assessment">
  & Partial<Pick<EditorialCandidate, "ratingStar" | "salesCount" | "previousMinPriceCents" | "observationCount" | "historyDays" | "lowestVerified">>;
export interface HeroClassification {
  policyVersion: string;
  basis: "editorial" | "catalog";
  status: "blocked" | "selection" | "hero";
  score: number | null;
  reasons: string[];
  breakdown: Array<{ id: EditorialDimensionId; weight: number; points: number | null; contribution: number | null }>;
  catalogSignals: Array<{ label: string; points: number }>;
}

/** Evidence priority, not inferred scores for audience, usefulness or quality. */
function catalogSignals(candidate: HeroCandidate): HeroClassification["catalogSignals"] {
  const evidence = candidate.offerEvidence && typeof candidate.offerEvidence === "object" ? candidate.offerEvidence as Record<string, unknown> : {};
  const signals: HeroClassification["catalogSignals"] = [];
  const add = (label: string, points: number) => signals.push({ label, points: Math.round(points * 100) / 100 });
  const comparable = Number.isSafeInteger(candidate.previousMinPriceCents) && candidate.previousMinPriceCents! > 0;
  if (comparable && candidate.lowestVerified) add("Preço no menor patamar do histórico comparável", 20);
  if (comparable && candidate.priceCents < candidate.previousMinPriceCents!) {
    add("Redução frente ao menor preço anterior da mesma configuração", Math.min(15, (1 - candidate.priceCents / candidate.previousMinPriceCents!) * 100));
  }
  // Stars and positive-review percentage remain distinct facts. Unknown sample
  // size reduces their weight rather than claiming confidence we do not have.
  const reviews = typeof evidence.reviewCount === "number" && Number.isSafeInteger(evidence.reviewCount) && evidence.reviewCount >= 0 ? evidence.reviewCount : null;
  const sampleWeight = reviews === null ? 0.5 : Math.min(1, reviews / 20);
  if (typeof candidate.ratingStar === "number" && Number.isFinite(candidate.ratingStar) && candidate.ratingStar >= 1 && candidate.ratingStar <= 5) {
    add(`Avaliação de ${candidate.ratingStar.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5 informada pelo marketplace`, (candidate.ratingStar - 1) / 4 * 25 * sampleWeight);
  } else if (typeof evidence.positiveReviewRate === "number" && Number.isFinite(evidence.positiveReviewRate) && evidence.positiveReviewRate >= 0 && evidence.positiveReviewRate <= 1) {
    add(`${Math.round(evidence.positiveReviewRate * 100)}% de avaliações positivas informadas pelo marketplace`, evidence.positiveReviewRate * 25 * sampleWeight);
  }
  if (Array.isArray(evidence.packageContents) && evidence.packageContents.some((item) => typeof item === "string" && item.trim())) add("Conteúdo do pacote descrito na fonte", 12);
  if (typeof evidence.packageQuantity === "number" && Number.isSafeInteger(evidence.packageQuantity) && evidence.packageQuantity > 0) add("Quantidade informada na fonte", 3);
  if (typeof evidence.variantKey === "string" && evidence.variantKey.trim()) add("Configuração identificada na captura", 10);
  if (comparable && candidate.observationCount! >= 3 && candidate.historyDays! >= 7) add("Histórico comparável com ao menos três observações em sete dias", 10);
  if (typeof candidate.salesCount === "number" && Number.isSafeInteger(candidate.salesCount) && candidate.salesCount > 0) add("Vendas informadas pelo marketplace", Math.min(5, Math.log10(candidate.salesCount + 1) * 5 / 3));
  return signals;
}

export function classifyHeroCandidate(candidate: HeroCandidate, now = new Date()): HeroClassification {
  const assessment = candidate.assessment;
  // Never bypass a negative or stale review by treating it as unreviewed.
  const blockers = assessment ? editorialSelectionBlockers(candidate, assessment, now) : editorialOfferBlockers(candidate, now);
  const result: HeroClassification = { policyVersion: HERO_POLICY_VERSION, basis: assessment ? "editorial" : "catalog",
    status: blockers.length ? "blocked" : "hero", score: null, reasons: [...blockers], breakdown: [], catalogSignals: [] };
  if (!assessment) {
    result.catalogSignals = catalogSignals(candidate);
    result.score = Math.round(result.catalogSignals.reduce((sum, signal) => sum + signal.points, 0) * 100) / 100;
    return result;
  }
  if (!validateEditorialAssessment(assessment, true).ok) return result;
  // v2 changes admission, not dimensions: v1 reviews remain comparable.
  if (assessment.heroPolicyVersion && !["hero-v1", HERO_POLICY_VERSION].includes(assessment.heroPolicyVersion)) {
    result.reasons.push("Revise a avaliação com uma rubrica compatível com a hero.");
    if (result.status === "hero") result.status = "selection";
    return result;
  }
  result.breakdown = EDITORIAL_DIMENSIONS.map(({ id }) => {
    const points = HERO_LEVEL_POINTS[assessment.dimensions[id].level];
    return { id, weight: HERO_WEIGHTS[id], points, contribution: points === null ? null : points * HERO_WEIGHTS[id] / 100 };
  });
  if (result.breakdown.every((dimension) => dimension.points !== null)) result.score = result.breakdown.reduce((sum, dimension) => sum + dimension.contribution!, 0);
  return result;
}

/** Complete pool; reviews and catalog signals are different scales. Valid
 * editorial reviews take precedence, then each group ranks by score. */
export function rankHeroCandidates<T extends HeroCandidate>(candidates: T[], now = new Date(), positions: ReadonlyMap<string, number> = new Map()) {
  const priority = { hero: 0, selection: 1, blocked: 2 };
  const ranked = candidates.map((candidate) => ({ candidate, classification: classifyHeroCandidate(candidate, now) })).sort((a, b) =>
    priority[a.classification.status] - priority[b.classification.status]
    || Number(a.classification.basis === "catalog") - Number(b.classification.basis === "catalog")
    || (b.classification.score ?? -1) - (a.classification.score ?? -1)
    || (positions.get(a.candidate.id) ?? Infinity) - (positions.get(b.candidate.id) ?? Infinity)
    || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0));
  let rank = 0;
  return ranked.map((entry) => {
    const heroRank = entry.classification.status === "hero" ? ++rank : null;
    return { ...entry, heroRank, selectedForHero: heroRank !== null && heroRank <= HERO_MAX_PRODUCTS };
  });
}

export function catalogHeroPresentation(candidate: HeroCandidate, classification: HeroClassification) {
  const evidence = candidate.offerEvidence && typeof candidate.offerEvidence === "object" ? candidate.offerEvidence as Record<string, unknown> : {};
  const contents = Array.isArray(evidence.packageContents) ? evidence.packageContents.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).join("; ") : "";
  return {
    editorialRationale: classification.catalogSignals.length ? classification.catalogSignals.slice(0, 2).map((signal) => signal.label).join(". ") + "." : "Destaque entre as ofertas aprovadas com preço observado recentemente.",
    editorialPurchaseContents: contents ? `Informado pelo anúncio: ${contents}` : "",
  };
}
