import { editorialOfferBlockers, editorialSelectionBlockers, type EditorialCandidate } from "./editorial-selection.ts";
import { MINIMUM_HISTORY, PRICE_CURRENT_WINDOW_HOURS } from "./deal-signal.ts";
import { classifyHeroCandidate } from "./hero-ranking.ts";
import { homepageFamily } from "./homepage-policy.ts";
import type { ChannelPolicy, ConfirmedExposure, RecommendationChannel } from "./recommendation-policy.ts";

export type PautaChannel = Exclude<RecommendationChannel, "home">;
export const PAUTA_PRICE_WINDOW_MS = PRICE_CURRENT_WINDOW_HOURS * 3_600_000;

export interface PautaCandidate extends EditorialCandidate {
  triageScore: number | null;
  shareTarget: { kind: "site"; slug: string } | { kind: "pauta"; token: string } | null;
}

export function pautaBlockers(candidate: PautaCandidate, now: Date): string[] {
  const assessment = candidate.assessment;
  const reasons = assessment
    ? editorialSelectionBlockers(candidate, assessment, now)
    : editorialOfferBlockers(candidate, now);
  if (assessment?.presentation?.status === "withdrawn") reasons.push("A ficha foi retirada pela curadoria.");
  if (candidate.offerMaterialInvalid) reasons.push("As condições mudaram. Confira a opção novamente.");
  if (candidate.currency !== "BRL" || candidate.priceType !== "exact") {
    reasons.push("Confirme o preço exato em reais.");
  }
  const evidence = candidate.offerEvidence as { conditions?: Record<string, unknown> } | null;
  const conditions = evidence?.conditions;
  if (!candidate.offerOptionKey && conditions && ["coupon", "payment", "region", "quantity"].some(key => conditions[key])) {
    reasons.push("Confira as condições desse preço antes de divulgar.");
  }
  if (!candidate.shareTarget) reasons.push("Falta um link de afiliado válido para esta oferta.");
  return reasons;
}

export function pautaHasHistoricalLow(product: Pick<EditorialCandidate, "lowestVerified" | "historyDays" | "observationCount">) {
  return product.lowestVerified && product.historyDays >= MINIMUM_HISTORY.days
    && product.observationCount >= MINIMUM_HISTORY.observations;
}

export function composeLivePauta<T extends PautaCandidate>(
  candidates: T[], policy: ChannelPolicy, exposures: Map<string, ConfirmedExposure>,
  now: Date, manualOrder: string[] | null, invalidClaims: Set<string>,
) {
  const reasonsById = new Map<string, string[]>();
  const positions = new Map(manualOrder?.map((id, index) => [id, index]));
  const ranked = [];
  for (const candidate of candidates) {
    const reasons = pautaBlockers(candidate, now);
    if (invalidClaims.has(candidate.id)) reasons.push("A comparação citada na indicação precisa de nova conferência.");
    const observed = new Date(candidate.evidenceObservedAt ?? "").getTime();
    const exposure = exposures.get(candidate.id);
    if (exposure && now.getTime() - Date.parse(exposure.confirmedAt) < policy.repeatHours * 3_600_000
      && !(candidate.offerOptionKey && candidate.offerOptionKey === exposure.optionKey
        && candidate.priceCents <= exposure.priceCents * (1 - policy.improvementPercent / 100)
        && observed > Date.parse(exposure.confirmedAt))) reasons.push("Divulgada recentemente neste canal.");
    if (manualOrder && !positions.has(candidate.id)) reasons.push("Fora da lista manual deste canal.");
    if (reasons.length) {
      reasonsById.set(candidate.id, reasons);
      continue;
    }
    const quality = candidate.assessment
      ? classifyHeroCandidate(candidate, now).score ?? 0
      : candidate.triageScore !== null ? candidate.triageScore * 20 : 75;
    const drop = candidate.previousMinPriceCents && candidate.previousMinPriceCents > candidate.priceCents
      ? (1 - candidate.priceCents / candidate.previousMinPriceCents) * 100 : 0;
    const ageHours = Math.max(0, now.getTime() - observed) / 3_600_000;
    const score = quality + Math.min(8, drop) + (pautaHasHistoricalLow(candidate) ? 4 : 0) + (ageHours <= 24 ? 8 : 0);
    ranked.push({ candidate, observed, score });
  }
  ranked.sort((a, b) => manualOrder
    ? positions.get(a.candidate.id)! - positions.get(b.candidate.id)!
    : b.score - a.score || b.observed - a.observed || a.candidate.id.localeCompare(b.candidate.id));

  const families = new Map<string, number>();
  const selected: T[] = [];
  for (const { candidate } of ranked) {
    const family = homepageFamily(candidate);
    const count = families.get(family) ?? 0;
    if (count >= policy.familyLimit) {
      reasonsById.set(candidate.id, ["Outra oferta da mesma família teve prioridade."]);
    } else if (selected.length >= policy.limit) {
      reasonsById.set(candidate.id, ["Oferta apta. Ficou abaixo do corte deste canal."]);
    } else {
      selected.push(candidate);
      families.set(family, count + 1);
    }
  }
  return { selected, reasonsById };
}
