import { editorialSelectionBlockers,hasSuperiorityClaim,type EditorialCandidate, type EditorialDestination } from "./editorial-selection.ts";
import { classifyHeroCandidate } from "./hero-ranking.ts";
import { homepageClarityBlockers, homepageFamily } from "./homepage-policy.ts";

export const RECOMMENDATION_POLICY_VERSION = "recommendation-v1";
export const RECOMMENDATION_CHANNELS = ["home", "whatsapp", "stories"] as const;
export type RecommendationChannel = typeof RECOMMENDATION_CHANNELS[number];
export const recommendationChannel = (value: EditorialDestination | "all" | string): RecommendationChannel =>
  value === "pauta" || value === "whatsapp" ? "whatsapp" : value === "stories" ? "stories" : "home";
export interface ChannelPolicy {
  limit: number;
  repeatHours: number;
  familyLimit: number;
  improvementPercent: number;
}
/** Ceilings, never quotas. These defaults can be calibrated in the editorial desk. */
export const defaultChannelPolicy = (channel: RecommendationChannel): ChannelPolicy => ({
  limit: channel === "home" ? 24 : channel === "whatsapp" ? 12 : 8,
  repeatHours: channel === "home" ? 0 : 72,
  familyLimit: channel === "home" ? 2 : 1,
  improvementPercent:5,
});
export function validateChannelPolicy(raw: unknown): ChannelPolicy | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ChannelPolicy;
  return Number.isInteger(p.limit) && p.limit >= 1 && p.limit <= 24
    && Number.isInteger(p.repeatHours) && p.repeatHours >= 0 && p.repeatHours <= 720
    && Number.isInteger(p.improvementPercent) && p.improvementPercent>=1 && p.improvementPercent<=50
    && Number.isInteger(p.familyLimit) && p.familyLimit >= 1 && p.familyLimit <= 4
    ? { limit: p.limit, repeatHours: p.repeatHours, familyLimit: p.familyLimit, improvementPercent:p.improvementPercent } : null;
}
export interface ConfirmedExposure { productId: string; optionKey: string | null; priceCents: number; confirmedAt: string }
export function recommendationBlockers(candidate: EditorialCandidate, channel: RecommendationChannel, now = new Date()): string[] {
  const blockers = candidate.assessment
    ? editorialSelectionBlockers(candidate, candidate.assessment, now)
    : classifyHeroCandidate(candidate, now).reasons;
  if (candidate.offerMaterialInvalid)blockers.push("As condições desta opção mudaram; confira a oferta novamente.");
  if (channel === "home") return blockers;
  blockers.push(...homepageClarityBlockers({ ...candidate, assessment: null }));
  if(candidate.assessment?.presentation?.status==='withdrawn')blockers.push("A ficha foi retirada. Revise a indicação antes de divulgar novamente.");
  if (!candidate.assessment) blockers.push("Avalie o benefício e o mérito antes da indicação direta.");
  else for (const [key, dimension] of Object.entries(candidate.assessment.dimensions)) {
    if (!["strong", "exceptional"].includes(dimension.level)) blockers.push(`Indicação direta exige avaliação forte: ${key}.`);
  }
  if (candidate.assessment && (hasSuperiorityClaim([candidate.assessment.benefit,candidate.assessment.audience,candidate.assessment.purchaseContents].join(" "))
    || /R\$|\d+[.,]?\d*\s*%|menor pre[çc]o/iu.test([candidate.assessment.benefit,candidate.assessment.audience,candidate.assessment.purchaseContents].join(" ")))) blockers.push("Explique benefício e conteúdo sem alegações de preço; registre comparações na justificativa da oferta.");
  if (candidate.currency !== "BRL" || candidate.priceType !== "exact") blockers.push("Indicação direta exige preço exato e moeda confirmada.");
  if (!candidate.offerOptionKey || !candidate.offerOptionLabel) blockers.push("Escolha uma opção de compra confirmada.");
  return [...new Set(blockers)];
}
/** Merit precedes novelty. Exposure is confirmed publication, never copying or opening. */
export function composeRecommendations<T extends EditorialCandidate>(candidates: T[], channel: RecommendationChannel,
  policy = defaultChannelPolicy(channel), exposures: ConfirmedExposure[] = [], now = new Date(), manualOrder?: string[]) {
  const excluded: Array<{ productId: string; reasons: string[] }> = [];
  const eligible = candidates.filter(candidate => {
    const reasons = recommendationBlockers(candidate, channel, now);
    const exposure = exposures.filter(e => e.productId === candidate.id).sort((a,b) => Date.parse(b.confirmedAt)-Date.parse(a.confirmedAt))[0];
    // A different variant does not evade the product's exposure interval. A
    // comparable, independently observed price improvement may justify return.
    if (exposure && now.getTime()-Date.parse(exposure.confirmedAt) < policy.repeatHours*3_600_000
      && !(candidate.offerOptionKey === exposure.optionKey && candidate.priceCents <= exposure.priceCents*(1-policy.improvementPercent/100)
        && Date.parse(String(candidate.evidenceObservedAt)) > Date.parse(exposure.confirmedAt))) reasons.push("Produto divulgado recentemente neste canal.");
    if (reasons.length) excluded.push({ productId: candidate.id, reasons });
    return !reasons.length && (!manualOrder || manualOrder.includes(candidate.id));
  });
  const order = new Map(manualOrder?.map((id,index) => [id,index]));
  eligible.sort((a,b) => {
    if (manualOrder) return order.get(a.id)!-order.get(b.id)!;
    const ca=classifyHeroCandidate(a,now), cb=classifyHeroCandidate(b,now);
    return Number(ca.basis === "catalog")-Number(cb.basis === "catalog")
      || (cb.score ?? 0)-(ca.score ?? 0) || a.id.localeCompare(b.id);
  });
  const families = new Map<string,number>();
  const selected: T[]=[];
  for (const candidate of eligible) {
    if (selected.length >= policy.limit) break;
    const family=homepageFamily(candidate), count=families.get(family) ?? 0;
    if (count >= policy.familyLimit) continue;
    selected.push(candidate); families.set(family,count+1);
  }
  return { selected, excluded };
}
