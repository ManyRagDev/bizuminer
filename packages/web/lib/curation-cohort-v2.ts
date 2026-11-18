import { calculateCurationScore, DEFAULT_SCORE_WEIGHTS, type ScoreSignal, type ScoreWeights } from "./curation-score-v2.ts";
import type { AttributeAssessment } from "./ai-curation-v2-contract.ts";

export type CohortCandidate = {
  id: string; category: string | null; priceCents: number; observedAt: string | null;
  assessment: AttributeAssessment | null; salesCount: number | null; ratingStar: number | null; ratingCount: number | null;
  historicalReferenceCents: number | null; historicalConfidence: number; declaredDiscount: number | null;
  storeSignal: number | null; storeConfidence: number; penalties?: number;
};
const missing: ScoreSignal = { value: null, confidence: 0 };
const band = (price: number) => price < 5_000 ? "ate_50" : price < 20_000 ? "50_a_200" : "acima_200";
const validCount = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0;
const hasRatedReviews = (candidate:CohortCandidate) => validCount(candidate.ratingCount) && candidate.ratingCount>0
  && candidate.ratingStar!==null && Number.isFinite(candidate.ratingStar) && candidate.ratingStar>=1 && candidate.ratingStar<=5;

function popularity(candidate: CohortCandidate): number | null {
  const parts: number[] = [];
  if (validCount(candidate.salesCount)) parts.push(Math.log10(candidate.salesCount + 1));
  if (hasRatedReviews(candidate)) {
    const count = candidate.ratingCount!;
    const bayesian = (candidate.ratingStar! * count + 3.5 * 20) / (count + 20);
    parts.push(Math.log10(count + 1) * bayesian / 5);
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function rank(value: number | null, values: readonly number[]): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (!values.length) return null;
  let low = 0, high = values.length;
  while (low < high) { const middle = (low + high) >>> 1; if (values[middle]! < value) low = middle + 1; else high = middle; }
  const first = low; high = values.length;
  while (low < high) { const middle = (low + high) >>> 1; if (values[middle]! <= value) low = middle + 1; else high = middle; }
  return 100 * (first + (low - first) / 2) / values.length;
}
function historicalSavings(candidate: CohortCandidate): number | null {
  return candidate.historicalReferenceCents !== null && candidate.historicalReferenceCents > 0
    ? candidate.historicalReferenceCents - candidate.priceCents : null;
}
function discount(candidate: CohortCandidate): { value: number | null; confidence: number; source: string } {
  if (candidate.historicalReferenceCents !== null && candidate.historicalReferenceCents > 0)
    return { value: 100 * (1 - candidate.priceCents / candidate.historicalReferenceCents), confidence: candidate.historicalConfidence, source: "historico_comparavel" };
  if (candidate.declaredDiscount !== null && Number.isFinite(candidate.declaredDiscount)
    && candidate.declaredDiscount >= 0 && candidate.declaredDiscount <= 1)
    return { value: candidate.declaredDiscount * 100, confidence: 0.5, source: "declaracao_da_fonte" };
  return { value: null, confidence: 0, source: "ausente" };
}

/** Comparison only: the caller still applies all factual/editorial admission gates. */
export type CohortEntrySnapshot = { candidate:CohortCandidate; calculatedAt:string };

export function calculateCohortScores(candidates: readonly CohortCandidate[], now = new Date(), weights:ScoreWeights=DEFAULT_SCORE_WEIGHTS,
  entries:ReadonlyMap<string,CohortEntrySnapshot>=new Map()) {
  const categories = new Map<string, CohortCandidate[]>(), narrowGroups = new Map<string, CohortCandidate[]>();
  for (const item of candidates) {
    if (!item.category || item.category === "Geral") continue;
    const categoryItems = categories.get(item.category) ?? []; categoryItems.push(item); categories.set(item.category, categoryItems);
    const key = `${item.category}\0${band(item.priceCents)}`;
    const group = narrowGroups.get(key) ?? []; group.push(item); narrowGroups.set(key, group);
  }
  const cache = new Map<readonly CohortCandidate[], { popularity: number[]; discount: number[]; savings: number[] }>();
  const sorted = (cohort: readonly CohortCandidate[], selector: (item: CohortCandidate) => number | null) =>
    cohort.map(selector).filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  return candidates.map(candidate => {
    const category = candidate.category && candidate.category !== "Geral" ? candidate.category : null;
    const categoryItems = category ? categories.get(category) ?? [] : [];
    const narrow = category ? narrowGroups.get(`${category}\0${band(candidate.priceCents)}`) ?? [] : [];
    const cohort = narrow.length >= 20 ? narrow : categoryItems.length >= 20 ? categoryItems : candidates;
    const fallback = cohort === narrow ? "categoria_faixa" : cohort === categoryItems ? "categoria" : "geral";
    let distributions = cache.get(cohort);
    if (!distributions) {
      distributions = { popularity: sorted(cohort, popularity), discount: sorted(cohort, item => discount(item).value), savings: sorted(cohort, historicalSavings) };
      cache.set(cohort, distributions);
    }
    const scoreInput=(item:CohortCandidate)=>{
      const popularityValue=popularity(item), discounted=discount(item), savings=historicalSavings(item), attribute=item.assessment;
      return { quality: attribute?.qualidade == null ? missing : { value: attribute.qualidade, confidence: attribute.confianca },
        popularity: popularityValue === null ? missing : { value: rank(popularityValue, distributions!.popularity), confidence: hasRatedReviews(item) ? 0.8 : 0.5 },
        discount: discounted.value === null ? missing : { value: rank(discounted.value, distributions!.discount), confidence: discounted.confidence },
        savings: savings === null ? missing : { value: rank(savings, distributions!.savings), confidence: item.historicalConfidence },
        store: item.storeSignal === null ? missing : { value: item.storeSignal, confidence: item.storeConfidence },
        whatsapp: attribute?.apelo_whatsapp == null ? missing : { value: attribute.apelo_whatsapp, confidence: attribute.confianca },
        observedAt: item.observedAt, penalties: item.penalties };
    };
    const popularityValue = popularity(candidate), discounted = discount(candidate), savings = historicalSavings(candidate);
    const entry=entries.get(candidate.id), entryAt=entry ? new Date(entry.calculatedAt) : null;
    const entryScore=entry && entry.candidate.id===candidate.id && entryAt && Number.isFinite(entryAt.getTime())
      ? calculateCurationScore(scoreInput(entry.candidate),entryAt,weights).scoreVitrine : null;
    return { productId: candidate.id, cohort: { fallback, category, priceBand: band(candidate.priceCents), size: cohort.length },
      raw: { popularity: popularityValue, popularitySources: { sales:validCount(candidate.salesCount),
        ratedReviews:hasRatedReviews(candidate) }, discount: discounted, savingsCents: savings },
      score: calculateCurationScore(scoreInput(candidate), now, weights), entryScore };
  });
}
