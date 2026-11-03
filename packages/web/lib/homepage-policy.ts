import { productFamilyForTitle } from "../../persistence/src/product-family.ts";
import { resolveVariantEvidence } from "./comparison-evidence.ts";
import { rankHeroCandidates } from "./hero-ranking.ts";
import type { EditorialCandidate } from "./editorial-selection.ts";

/** Initial editorial parameters. Changes must be evaluated against impressions. */
export const HOMEPAGE_POLICY_VERSION = "home-v2";
export const HOMEPAGE_RENEWAL_MS = 24 * 3_600_000;
export const HOMEPAGE_RETURN_INTERVAL_MS = 48 * 3_600_000;
export const HOMEPAGE_LIMIT = 24;
export const HOMEPAGE_WINDOW = 12;
export const HOMEPAGE_FAMILY_LIMIT = 2;
export interface HomepageContinuity {
  productIds: string[];
  heroProductIds: string[];
  seenProductIds: string[];
  lastFeaturedAt?: Record<string, string>;
  renewAfter: string;
}

/** These are admission checks, never invented scores for usefulness or trust. */
export function homepageClarityBlockers(candidate: Pick<EditorialCandidate, "offerEvidence" | "assessment">): string[] {
  if (candidate.assessment) return []; // The full rubric is checked by rankHeroCandidates.
  const evidence = (candidate.offerEvidence ?? {}) as Record<string, any>;
  const contents = Array.isArray(evidence.packageContents) && evidence.packageContents.some((v: unknown) => typeof v === "string" && v.trim());
  const verifiedVariant = resolveVariantEvidence(evidence).confirmed
    || (evidence.variantIdentity?.state === "source_verified" && typeof evidence.variantIdentity.key === "string" && evidence.variantIdentity.key.trim());
  // v2 may explicitly say a field does not apply; absence is not that assertion.
  const quantity = Number.isSafeInteger(evidence.packageQuantity) && evidence.packageQuantity > 0;
  const exact = evidence.priceType === "exact" || (Number.isSafeInteger(evidence.priceMinCents) && evidence.priceMinCents > 0 && evidence.priceMinCents === evidence.priceMaxCents);
  const clearContents = contents || evidence.fieldStates?.packageContents === "not_applicable";
  return [
    !verifiedVariant && "Confirme a configuração da compra na fonte.",
    !clearContents && "Confirme o conteúdo do pacote na fonte.",
    !quantity && evidence.fieldStates?.packageQuantity !== "not_applicable" && "Confirme a quantidade da compra na fonte.",
    !exact && "Confirme o preço exato da configuração.",
    evidence.version === 2 && evidence.currency !== "BRL" && "Confirme que o preço está em reais.",
  ].filter((issue): issue is string => typeof issue === "string");
}

export function homepageFamily(candidate: Pick<EditorialCandidate, "id" | "title">): string {
  // Unknown products stay independent instead of sharing an artificial "other" family.
  const family = productFamilyForTitle(candidate.title);
  if (family) return family;
  if (/\b(fones?|earbuds?|earphones?|headsets?)\b/i.test(candidate.title)) return "audio";
  return `product:${candidate.id}`;
}

/** Individual merit followed by whole-page composition. No random or timestamp tie-break. */
export function composeHomepage<T extends EditorialCandidate>(candidates: T[], now = new Date(), previous?: HomepageContinuity,
  positions: ReadonlyMap<string, number> = new Map()) {
  const ranked = rankHeroCandidates(candidates, now, positions)
    .filter(({ candidate, classification }) => classification.status === "hero" && !homepageClarityBlockers(candidate).length);
  const byId = new Map(ranked.map(entry => [entry.candidate.id, entry]));
  const rankIndex = new Map(ranked.map((entry, index) => [entry.candidate.id, index]));
  const families = new Map(ranked.map(entry => [entry.candidate.id, homepageFamily(entry.candidate)]));
  const family = (item: T) => families.get(item.id)!;
  const category = (item: T) => item.category ?? `product:${item.id}`;
  const priceBand = (item: T) => item.priceCents <= 10_000 ? "under100" : item.priceCents <= 50_000 ? "100to500" : "over500";
  const previousIds = previous?.productIds.filter(id => byId.has(id)) ?? [];
  const renewing = !previous || now.getTime() >= Date.parse(previous.renewAfter);
  const seen = new Set(previous?.seenProductIds ?? []);
  const retained = new Set(previousIds);
  const weakest = previousIds.map(id => byId.get(id)!).sort((a, b) => rankIndex.get(b.candidate.id)! - rankIndex.get(a.candidate.id)!)[0];
  const improves = (entry: typeof ranked[number]) => weakest && (
    (entry.classification.basis === "editorial" && weakest.classification.basis === "catalog")
    || (entry.classification.basis === weakest.classification.basis && (entry.classification.score ?? 0) > (weakest.classification.score ?? 0)));
  const canReturn = (id: string) => {
    const last = Date.parse(previous?.lastFeaturedAt?.[id] ?? "");
    return Number.isFinite(last) && now.getTime() - last >= HOMEPAGE_RETURN_INTERVAL_MS;
  };
  // Rotation is among qualified offers of comparable merit, never permission to
  // substitute weak evidence for novelty. Reviews and catalog scores stay separate.
  const comparableMerit = (entry: typeof ranked[number]) => !weakest || improves(entry)
    || (entry.classification.basis === weakest.classification.basis
      && (entry.classification.score ?? 0) >= (weakest.classification.score ?? 0) * 0.85);
  const discoveries = renewing ? ranked.filter(entry => !retained.has(entry.candidate.id) && comparableMerit(entry)
    && (!seen.has(entry.candidate.id) || canReturn(entry.candidate.id) || improves(entry)))
    .sort((a, b) => Number(Boolean(improves(b))) - Number(Boolean(improves(a)))
      || Number(seen.has(a.candidate.id)) - Number(seen.has(b.candidate.id))
      || (Date.parse(previous?.lastFeaturedAt?.[a.candidate.id] ?? "") || 0) - (Date.parse(previous?.lastFeaturedAt?.[b.candidate.id] ?? "") || 0)
      || rankIndex.get(a.candidate.id)! - rankIndex.get(b.candidate.id)!)
    .slice(0, Math.ceil(Math.min(HOMEPAGE_LIMIT, ranked.length) / 4)) : [];
  const replacementIds = new Set(discoveries.map(entry => entry.candidate.id));
  const retainCount = renewing ? Math.max(0, Math.min(HOMEPAGE_LIMIT, previousIds.length) - discoveries.length) : previousIds.length;
  const retainIds = new Set(previousIds.map(id => byId.get(id)!).sort((a, b) => rankIndex.get(a.candidate.id)! - rankIndex.get(b.candidate.id)!)
    .slice(0, retainCount).map(entry => entry.candidate.id));
  const priorityIds = [...previousIds.filter(id => retainIds.has(id)), ...replacementIds];
  const priority = new Map(priorityIds.map((id, index) => [id, index]));
  const chosen: typeof ranked = [];
  const remaining = previousIds.length >= HOMEPAGE_LIMIT && renewing
    ? ranked.filter(entry => priority.has(entry.candidate.id)) : [...ranked];
  while (chosen.length < HOMEPAGE_LIMIT && remaining.length) {
    const window = chosen.slice(Math.floor(chosen.length / HOMEPAGE_WINDOW) * HOMEPAGE_WINDOW);
    const counts = (key: (item: T) => string) => {
      const result = new Map<string, number>();
      for (const entry of window) { const value = key(entry.candidate); result.set(value, (result.get(value) ?? 0) + 1); }
      return (item: T) => result.get(key(item)) ?? 0;
    };
    const familyCount = counts(family), categoryCount = counts(category), marketplaceCount = counts(p => p.marketplace), priceCount = counts(priceBand);
    const eligible = remaining.filter(entry => familyCount(entry.candidate) < HOMEPAGE_FAMILY_LIMIT);
    if (!eligible.length) break; // Do not pad a sparse edition with repetitions.
    eligible.sort((a, b) => {
      // An editor's new order is explicit intent; diversity admission still applies.
      if (positions.size) return (positions.get(a.candidate.id) ?? Infinity) - (positions.get(b.candidate.id) ?? Infinity);
      const aPriority = priority.get(a.candidate.id), bPriority = priority.get(b.candidate.id);
      // Preserve positions between renewals; apply the same diversity gates each time.
      if (!renewing && (aPriority !== undefined || bPriority !== undefined)) return (aPriority ?? Infinity) - (bPriority ?? Infinity);
      // Human assessments and catalog evidence remain different scales.
      const basis = Number(a.classification.basis === "catalog") - Number(b.classification.basis === "catalog");
      if (basis) return basis;
      const diversity = (item: T) => familyCount(item) * 16
        + categoryCount(item) * 4 + marketplaceCount(item) * 3 + priceCount(item) * 2;
      const merit = (entry: typeof a) => (entry.classification.score ?? 0) - diversity(entry.candidate)
        + (priority.has(entry.candidate.id) ? 12 : 0);
      return merit(b) - merit(a) || (priority.get(a.candidate.id) ?? Infinity) - (priority.get(b.candidate.id) ?? Infinity)
        || rankIndex.get(a.candidate.id)! - rankIndex.get(b.candidate.id)!;
    });
    const next = eligible[0];
    chosen.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  const previousHero = !renewing ? previous?.heroProductIds ?? [] : [];
  const heroOrder = [...chosen].sort((a, b) => {
    const ia = previousHero.indexOf(a.candidate.id), ib = previousHero.indexOf(b.candidate.id);
    if (ia !== -1 || ib !== -1) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return rankIndex.get(a.candidate.id)! - rankIndex.get(b.candidate.id)!;
  });
  const heroes: typeof ranked = [];
  for (const entry of heroOrder) {
    if (heroes.some(other => family(other.candidate) === family(entry.candidate))) continue;
    heroes.push(entry);
    if (heroes.length === 3) break;
  }
  return { selected: chosen, heroes };
}
