import { editorialOfferBlockers, editorialSelectionBlockers, type EditorialCandidate } from "./editorial-selection.ts";
import { evaluateFreshnessStatus, MINIMUM_HISTORY, PRICE_CURRENT_WINDOW_HOURS } from "./deal-signal.ts";
import { classifyHeroCandidate } from "./hero-ranking.ts";
import { homepageFamily } from "./homepage-policy.ts";
import type { ChannelPolicy, ConfirmedExposure, RecommendationChannel } from "./recommendation-policy.ts";

export type PautaChannel = Exclude<RecommendationChannel, "home">;
export const PAUTA_PRICE_WINDOW_MS = PRICE_CURRENT_WINDOW_HOURS * 3_600_000;
export const PAUTA_CATALOG_WINDOW_MS = 7 * 24 * 3_600_000;

export type PautaShelf = "impact" | "daily" | "demand";

export interface PautaCandidate extends EditorialCandidate {
  triageScore: number | null;
  aiBenefit?: string;
  // undefined is the legacy policy; null is an unverified v2 observation.
  factualValidUntil?: string | null;
  pautaScore?: number | null;
  pautaPolicyVersion?: number | null;
  curationPolicyVersion?: number;
  equivalentHumanVeto?: boolean;
  equivalenceKey?: string | null;
  cooldownException?: {reason:'price_improvement';previousPriceCents:number;confirmedAt:string;thresholdPercent:number};
  shareTarget: { kind: "site"; slug: string } | { kind: "pauta"; token: string } | null;
  watchersCount?: number;
  needsPriceRefresh?: boolean;
  shelf?: PautaShelf;
  nominalSavingsCents?: number;
}

export function calculateNominalSavingsCents(candidate: Pick<EditorialCandidate, "priceCents" | "previousMinPriceCents" | "originalPriceCents" | "priceType">): number {
  if (candidate.priceType && candidate.priceType !== "exact") return 0;
  const reference = candidate.previousMinPriceCents && candidate.previousMinPriceCents > candidate.priceCents
    ? candidate.previousMinPriceCents
    : candidate.originalPriceCents && candidate.originalPriceCents > candidate.priceCents
      ? candidate.originalPriceCents
      : null;
  return reference ? Math.max(0, reference - candidate.priceCents) : 0;
}

export function classifyPautaShelf(candidate: PautaCandidate): PautaShelf {
  if ((candidate.watchersCount ?? 0) > 0) return "demand";
  const savings = calculateNominalSavingsCents(candidate);
  if (candidate.priceCents >= 20_000 || savings >= 8_000) return "impact";
  return "daily";
}

function declaredRange(candidate: PautaCandidate, browserPrice: boolean): boolean {
  const { priceMinCents: min, priceMaxCents: max } = candidate;
  return (candidate.marketplace === "shopee" || browserPrice) && candidate.currency === "BRL" && candidate.priceType === "range"
    && typeof min === "number" && typeof max === "number"
    && Number.isSafeInteger(min) && Number.isSafeInteger(max) && min > 0 && max > min;
}

export function pautaBlockers(candidate: PautaCandidate, now: Date, allowCatalogWindow = false): string[] {
  const assessment = candidate.assessment;
  const evidence = candidate.offerEvidence as { source?: { method?: string }; conditions?: Record<string, unknown>;
    verification?: { method?: string } } | null;
  const browserPrice = (candidate.marketplace === "aliexpress" || candidate.marketplace === "amazon" || candidate.marketplace === "mercadolivre")
    && evidence?.source?.method === "browser" && candidate.currency === "BRL";
  const range = declaredRange(candidate, browserPrice);
  const from = browserPrice && candidate.priceType === "from";
  const reasons = assessment
    ? editorialSelectionBlockers(range ? { ...candidate, priceCents: candidate.priceMaxCents! } : candidate, assessment, now, range, browserPrice)
    : editorialOfferBlockers(candidate, now, range, browserPrice);
  if (candidate.factualValidUntil !== undefined
    && !(candidate.factualValidUntil && Date.parse(candidate.factualValidUntil) > +now))
    reasons.push("A oferta precisa de uma conferência atual antes da preparação.");
  if (assessment?.presentation?.status === "withdrawn") reasons.push("A ficha foi retirada pela curadoria.");
  if (candidate.offerMaterialInvalid) reasons.push("As condições mudaram. Confira a opção novamente.");
  if (!range && !from && ((candidate.currency ?? "BRL") !== "BRL" || candidate.priceType !== "exact"
      || candidate.marketplace === "aliexpress" && !browserPrice && (!candidate.offerOptionKey || evidence?.verification?.method !== "editorial_confirmation"))) {
    reasons.push(candidate.marketplace === "aliexpress"
      ? "Confirme manualmente o preço de uma opção em reais."
      : "Confirme o preço exato em reais.");
  }
  const conditions = evidence?.conditions;
  if (!browserPrice && !candidate.offerOptionKey && conditions && ["coupon", "payment", "region", "quantity"].some(key => conditions[key])) {
    reasons.push("Confira as condições desse preço antes de divulgar.");
  }
  if (!candidate.shareTarget) reasons.push(candidate.marketplace === "amazon"
    ? "Configure a tag de associado da Amazon para compartilhar esta oferta."
    : "Falta um link de afiliado válido para esta oferta.");
  if (allowCatalogWindow && candidate.evidenceObservedAt) {
    const age = now.getTime() - new Date(candidate.evidenceObservedAt).getTime();
    if (age <= PAUTA_CATALOG_WINDOW_MS && age >= 0) {
      return reasons.filter(r => r !== "Preço sem observação válida nas últimas 48 horas.");
    }
  }
  return reasons;
}

export function pautaHasHistoricalLow(product: Pick<EditorialCandidate, "lowestVerified" | "historyDays" | "observationCount">) {
  return product.lowestVerified && product.historyDays >= MINIMUM_HISTORY.days
    && product.observationCount >= MINIMUM_HISTORY.observations;
}

export type PautaV2Policy={repeatHours:number;impulseLimitCents:number|null;allowPriceImprovement:boolean;
  improvementPercent:number;categoryExposureCounts:ReadonlyMap<string,number>};

export function composeLivePauta<T extends PautaCandidate>(
  candidates: T[], policy: ChannelPolicy, exposures: Map<string, ConfirmedExposure & {priceType?:string|null}>,
  now: Date, manualOrder: string[] | null, invalidClaims: Set<string>, v2?:PautaV2Policy,
  options?: { allowCatalogWindow?: boolean },
) {
  const allowCatalog = options?.allowCatalogWindow ?? false;
  const reasonsById = new Map<string, string[]>();
  const positions = new Map(manualOrder?.map((id, index) => [id, index]));
  const ranked: Array<{ candidate: T; observed: number; score: number; freshness: number }> = [];
  for (const candidate of candidates) {
    const reasons = pautaBlockers(candidate, now, allowCatalog);
    if (candidate.equivalentHumanVeto) reasons.push("Há veto humano para esta configuração equivalente.");
    if(v2 && (typeof candidate.pautaScore!=='number' || !Number.isFinite(candidate.pautaScore))) reasons.push("Aguardando avaliação atual para a pauta.");
    // Bloqueio por impulseLimitCents removido conforme Fase 1.4 da Track 021 (Dupla Régua de Valor)
    if (invalidClaims.has(candidate.id)) reasons.push("A comparação citada na indicação precisa de nova conferência.");
    const observed = new Date(candidate.evidenceObservedAt ?? "").getTime();
    const exposure = exposures.get(candidate.id);
    const improvement=!!(exposure && exposure.productId===candidate.id && (!v2 || v2.allowPriceImprovement) && candidate.offerOptionKey
      && (!v2 || candidate.offerOptionKey!=='listing') && candidate.offerOptionKey===exposure.optionKey
      && (!v2 || candidate.priceType==='exact' && exposure.priceType==='exact')
      && candidate.priceCents<=exposure.priceCents*(1-(v2?.improvementPercent ?? policy.improvementPercent)/100)
      && observed>Date.parse(exposure.confirmedAt));
    if (exposure && now.getTime() - Date.parse(exposure.confirmedAt) < (v2?.repeatHours ?? policy.repeatHours) * 3_600_000
      && !improvement) reasons.push("Divulgada recentemente neste canal.");
    else if(v2 && exposure && improvement && now.getTime()-Date.parse(exposure.confirmedAt)<v2.repeatHours*3_600_000)
      candidate.cooldownException={reason:'price_improvement',previousPriceCents:exposure.priceCents,
        confirmedAt:exposure.confirmedAt,thresholdPercent:v2.improvementPercent};
    if (manualOrder && !positions.has(candidate.id)) reasons.push("Fora da lista manual deste canal.");
    if (reasons.length) {
      reasonsById.set(candidate.id, reasons);
      continue;
    }
    const nominalSavingsCents = calculateNominalSavingsCents(candidate);
    const shelf = classifyPautaShelf(candidate);
    candidate.nominalSavingsCents = nominalSavingsCents;
    candidate.shelf = shelf;

    const quality = candidate.assessment
      ? classifyHeroCandidate(candidate, now).score ?? 0
      : candidate.triageScore !== null ? candidate.triageScore * 20 : 75;
    const drop = candidate.priceType === "exact" && candidate.previousMinPriceCents && candidate.previousMinPriceCents > candidate.priceCents
      ? (1 - candidate.priceCents / candidate.previousMinPriceCents) * 100 : 0;
    const ageHours = Math.max(0, now.getTime() - observed) / 3_600_000;
    candidate.needsPriceRefresh = ageHours > PRICE_CURRENT_WINDOW_HOURS;

    const ratingBonus = typeof candidate.ratingStar === "number" && candidate.ratingStar >= 1 && candidate.ratingStar <= 5
      ? (candidate.ratingStar - 1) * 0.75 : 0;
    const salesBonus = typeof candidate.salesCount === "number" && candidate.salesCount > 0
      ? Math.min(1.5, Math.log10(candidate.salesCount + 1) * 0.4) : 0;
    const discountBonus = candidate.priceType === "exact" && typeof candidate.discountPercent === "number"
      && candidate.discountPercent > 0 && candidate.discountPercent < 95
      ? Math.min(1.5, candidate.discountPercent * 0.02) : 0;
    const freshnessBonus = Math.max(0, 10 * Math.exp(-ageHours / 5));

    // Bônus da Dupla Régua: economia nominal em R$ para itens de Alto Impacto
    const savingsBRLBonus = shelf === "impact"
      ? Math.min(10, (nominalSavingsCents / 100) * 0.05)
      : 0;
    // Bônus de Demanda Real da Vitrine (compradores de olho / favoritos)
    const demandBonus = Math.min(12, (candidate.watchersCount ?? 0) * 4);

    const score = (v2 ? candidate.pautaScore! : quality + Math.min(8, drop) + (candidate.priceType === "exact" && pautaHasHistoricalLow(candidate) ? 4 : 0)
      + freshnessBonus + ratingBonus + salesBonus + discountBonus) + savingsBRLBonus + demandBonus;
    // Recapture can update lastSeenAt without writing an identical price
    // observation. Rank by the actual evidence, not by the listing's presence.
    const level = evaluateFreshnessStatus(candidate.evidenceObservedAt, now).level;
    const freshness = v2 ? 0 : ageHours > PRICE_CURRENT_WINDOW_HOURS ? 3 : level === "fresh" ? 0 : level === "warm" ? 1 : 2;
    ranked.push({ candidate, observed, score, freshness });
  }
  ranked.sort((a, b) => manualOrder
    ? positions.get(a.candidate.id)! - positions.get(b.candidate.id)!
    : a.freshness - b.freshness || b.score - a.score || b.observed - a.observed || a.candidate.id.localeCompare(b.candidate.id));

  const families = new Map<string, number>();
  const categories = new Map<string, number>();
  const stores = new Map<string, number>();
  const represented = new Set<string>();
  const chosen = new Set<string>();
  const chosenEquivalences = new Set<string>();
  const orderedSelection: T[] = [];
  const family = (candidate: T) => candidate.offerOptionKey
    ? `${homepageFamily(candidate)}:${candidate.offerOptionKey}`
    : homepageFamily(candidate);
  const categoryKey = (candidate: T) => {
    if (candidate.category && candidate.category !== "Geral") return candidate.category;
    const fam = homepageFamily(candidate);
    return fam.startsWith("product:") ? "sem_categoria" : fam;
  };
  const familyCount = (candidate: T) => families.get(family(candidate)) ?? 0;
  const categoryCount = (candidate: T) => categories.get(categoryKey(candidate)) ?? 0;
  const storeCount = (candidate: T) => stores.get(candidate.marketplace) ?? 0;
  const select = (candidate: T) => {
    chosen.add(candidate.id);
    if(candidate.equivalenceKey) chosenEquivalences.add(candidate.equivalenceKey);
    orderedSelection.push(candidate);
    represented.add(candidate.marketplace);
    families.set(family(candidate), familyCount(candidate) + 1);
    categories.set(categoryKey(candidate), categoryCount(candidate) + 1);
    stores.set(candidate.marketplace, storeCount(candidate) + 1);
  };
  if (!manualOrder) {
    const eligibleStores = new Set(ranked.map(r => r.candidate.marketplace));
    const storeCeiling = Math.max(2, Math.floor(policy.limit / Math.max(1, eligibleStores.size)) + 1);

    const fill = (entries: typeof ranked, respectStoreCeiling: boolean) => {
      while (chosen.size < policy.limit) {
        let best: typeof ranked[number] | null = null;
        let bestEffectiveScore = -Infinity;
        for (const entry of entries) {
          const { candidate } = entry;
          if (chosen.has(candidate.id) || candidate.equivalenceKey && chosenEquivalences.has(candidate.equivalenceKey)
            || familyCount(candidate) >= policy.familyLimit) continue;
          if (respectStoreCeiling && storeCount(candidate) >= storeCeiling) continue;
          const categoryHistory=v2?.categoryExposureCounts.get(categoryKey(candidate)) ?? 0;
          const effectiveScore = entry.score - storeCount(candidate) * 8 - categoryCount(candidate) * 12 - Math.min(12,categoryHistory*2);
          if (
            !best ||
            effectiveScore > bestEffectiveScore ||
            (effectiveScore === bestEffectiveScore && (entry.observed > best.observed || (entry.observed === best.observed && candidate.id.localeCompare(best.candidate.id) < 0)))
          ) {
            best = entry;
            bestEffectiveScore = effectiveScore;
          }
        }
        if (!best) break;
        select(best.candidate);
      }
    };

    // Prefer the freshest eligible evidence and fall back only when needed.
    // Apply store and family diversity within each freshness group (0: <3h, 1: 3-10h, 2: 10-48h, 3: >48h).
    for (const freshness of [0, 1, 2, 3]) {
      const entries = ranked.filter(entry => entry.freshness === freshness);
      if(!v2) for (const { candidate } of entries) {
        if (chosen.size >= policy.limit) break;
        if (!represented.has(candidate.marketplace) && (!candidate.equivalenceKey || !chosenEquivalences.has(candidate.equivalenceKey))
          && familyCount(candidate) < policy.familyLimit) select(candidate);
      }
      fill(entries, true);
      fill(entries, false);
    }
  }
  for (const { candidate } of ranked) {
    if (chosen.has(candidate.id)) continue;
    if (candidate.equivalenceKey && chosenEquivalences.has(candidate.equivalenceKey)) {
      reasonsById.set(candidate.id, ["Uma oferta equivalente já foi escolhida para este canal."]);
    } else if (familyCount(candidate) >= policy.familyLimit) {
      reasonsById.set(candidate.id, ["Outra oferta da mesma família teve prioridade."]);
    } else if (chosen.size >= policy.limit) {
      reasonsById.set(candidate.id, ["Oferta apta. Ficou abaixo do corte deste canal."]);
    } else {
      select(candidate);
    }
  }
  const selected = manualOrder
    ? ranked.flatMap(({ candidate }) => chosen.has(candidate.id) ? [candidate] : [])
    : orderedSelection;
  return { selected, reasonsById };
}
