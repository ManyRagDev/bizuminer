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

function verifiedShopeeRange(candidate: PautaCandidate): boolean {
  const { priceMinCents: min, priceMaxCents: max } = candidate;
  return candidate.marketplace === "shopee" && candidate.currency === "BRL" && candidate.priceType === "range"
    && typeof min === "number" && typeof max === "number"
    && Number.isSafeInteger(min) && Number.isSafeInteger(max) && min > 0 && max > min;
}

export function pautaBlockers(candidate: PautaCandidate, now: Date): string[] {
  const assessment = candidate.assessment;
  const range = verifiedShopeeRange(candidate);
  const reasons = assessment
    ? editorialSelectionBlockers(range ? { ...candidate, priceCents: candidate.priceMaxCents! } : candidate, assessment, now, range)
    : editorialOfferBlockers(candidate, now, range);
  if (assessment?.presentation?.status === "withdrawn") reasons.push("A ficha foi retirada pela curadoria.");
  if (candidate.offerMaterialInvalid) reasons.push("As condições mudaram. Confira a opção novamente.");
  const evidence = candidate.offerEvidence as { conditions?: Record<string, unknown>; verification?: { method?: string } } | null;
  if (!range && (candidate.currency !== "BRL" || candidate.priceType !== "exact"
      || candidate.marketplace === "aliexpress" && (!candidate.offerOptionKey || evidence?.verification?.method !== "editorial_confirmation"))) {
    reasons.push(candidate.marketplace === "aliexpress"
      ? "Confirme manualmente o preço de uma opção em reais."
      : "Confirme o preço exato em reais.");
  }
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
    const drop = candidate.priceType === "exact" && candidate.previousMinPriceCents && candidate.previousMinPriceCents > candidate.priceCents
      ? (1 - candidate.priceCents / candidate.previousMinPriceCents) * 100 : 0;
    const ageHours = Math.max(0, now.getTime() - observed) / 3_600_000;
    const score = quality + Math.min(8, drop) + (candidate.priceType === "exact" && pautaHasHistoricalLow(candidate) ? 4 : 0) + (ageHours <= 24 ? 8 : 0);
    ranked.push({ candidate, observed, score });
  }
  ranked.sort((a, b) => manualOrder
    ? positions.get(a.candidate.id)! - positions.get(b.candidate.id)!
    : b.score - a.score || b.observed - a.observed || a.candidate.id.localeCompare(b.candidate.id));

  const families = new Map<string, number>();
  const represented = new Set<string>();
  const chosen = new Set<string>();
  const familyCount = (candidate: T) => families.get(homepageFamily(candidate)) ?? 0;
  const select = (candidate: T) => {
    chosen.add(candidate.id);
    represented.add(candidate.marketplace);
    families.set(homepageFamily(candidate), familyCount(candidate) + 1);
  };
  if (!manualOrder) {
    // Give each eligible shop a chance before filling the remaining slots by merit.
    for (const { candidate } of ranked) {
      if (chosen.size >= policy.limit) break;
      if (!represented.has(candidate.marketplace) && familyCount(candidate) < policy.familyLimit) select(candidate);
    }
  }
  for (const { candidate } of ranked) {
    if (chosen.has(candidate.id)) continue;
    if (familyCount(candidate) >= policy.familyLimit) {
      reasonsById.set(candidate.id, ["Outra oferta da mesma família teve prioridade."]);
    } else if (chosen.size >= policy.limit) {
      reasonsById.set(candidate.id, ["Oferta apta. Ficou abaixo do corte deste canal."]);
    } else {
      select(candidate);
    }
  }
  const selected = ranked.flatMap(({ candidate }) => chosen.has(candidate.id) ? [candidate] : []);
  return { selected, reasonsById };
}
