/** Pure comparison policy. It does not grant publication or call a provider. */
export const CURATION_SCORE_VERSION = "curation-score-v2.1";
export type ScoreSignal = { value: number | null; confidence: number };
export type ScoreComponent = ScoreSignal & { normalized: number; contribution: number; weight: number };
export type ScoreInputs = {
  quality: ScoreSignal;
  popularity: ScoreSignal;
  discount: ScoreSignal;
  savings: ScoreSignal;
  store: ScoreSignal;
  whatsapp: ScoreSignal;
  observedAt: string | null;
  penalties?: number;
};
export type ScoreWeights = {quality:number;popularity:number;discount:number;savings:number;freshness:number;store:number;whatsapp:number};
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = { quality:0.35,popularity:0.20,discount:0.20,savings:0.10,freshness:0.10,store:0.05,whatsapp:0.25 };
export function validScoreWeights(value:ScoreWeights):boolean {
  if(!value || typeof value!=="object" || Array.isArray(value)
    || Object.keys(value).sort().join(',')!==Object.keys(DEFAULT_SCORE_WEIGHTS).sort().join(',')) return false;
  const list=Object.values(value);
  return list.every(number=>typeof number==='number' && Number.isFinite(number) && number>=0 && number<=1)
    && Math.abs(value.quality+value.popularity+value.discount+value.savings+value.freshness+value.store-1)<0.000001;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 100) / 100;

function component(signal: ScoreSignal, weight: number): ScoreComponent {
  const confidence = Number.isFinite(signal.confidence) ? clamp(signal.confidence, 0, 1) : 0;
  const value = signal.value !== null && Number.isFinite(signal.value) ? clamp(signal.value, 0, 100) : null;
  const normalized = value === null ? 50 : 50 + (value - 50) * confidence;
  return { value, confidence: value === null ? 0 : confidence, normalized: round(normalized), weight, contribution: round(normalized * weight) };
}

export function calculateCurationScore(input: ScoreInputs, now = new Date(), weights:ScoreWeights=DEFAULT_SCORE_WEIGHTS) {
  if(!validScoreWeights(weights)) throw new Error("score_weights_invalid");
  const observed = input.observedAt ? Date.parse(input.observedAt) : NaN;
  const ageHours = Number.isFinite(observed) ? Math.max(0, (now.getTime() - observed) / 3_600_000) : null;
  const freshness: ScoreSignal = { value: ageHours === null ? null : 100 * Math.pow(0.5, ageHours / 15), confidence: ageHours === null ? 0 : 1 };
  const components = {
    quality: component(input.quality, weights.quality), popularity: component(input.popularity, weights.popularity),
    discount: component(input.discount, weights.discount), savings: component(input.savings, weights.savings),
    freshness: component(freshness, weights.freshness), store: component(input.store, weights.store),
  };
  const penalties = Number.isFinite(input.penalties) ? clamp(input.penalties!, 0, 100) : 0;
  const total = Object.values(components).reduce((sum, item) => sum + item.contribution, 0);
  const scoreVitrine = round(clamp(total - penalties, 0, 100));
  const whatsapp = component(input.whatsapp, weights.whatsapp);
  return { version: CURATION_SCORE_VERSION, calculatedAt: now.toISOString(), ageHours, components, penalties,
    scoreVitrine, scorePauta: round(clamp(scoreVitrine * (1-weights.whatsapp) + whatsapp.contribution, 0, 100)),
    potentialScore: round(clamp(total - components.freshness.contribution + 100 * weights.freshness - penalties, 0, 100)), whatsapp };
}

export type ComparablePrice = { priceCents: number; observedAt: string; optionKey: string; currency: string;
  priceType: "exact" | "range" | "from" | "unknown" };
const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const historyDay = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"});
function historyDate(at:number):string {
  const parts=historyDay.formatToParts(new Date(at));
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Call with one product's observations; unknown configurations are never combined. */
export function comparableDailyReference(points: readonly ComparablePrice[], current: ComparablePrice) {
  const end = Date.parse(current.observedAt);
  if (!current.optionKey || current.optionKey === "listing" || current.currency !== "BRL" || current.priceType!=="exact" || !Number.isFinite(end)
    || !Number.isSafeInteger(current.priceCents) || current.priceCents <= 0) return null;
  const days = new Map<string, number[]>();
  for (const point of points) {
    const at = Date.parse(point.observedAt);
    if (point.optionKey !== current.optionKey || point.currency !== current.currency || point.priceType!=="exact" || !Number.isSafeInteger(point.priceCents)
      || point.priceCents <= 0 || !Number.isFinite(at) || at >= end || at < end - 60 * 86_400_000) continue;
    const day = historyDate(at);
    const values = days.get(day) ?? []; values.push(point.priceCents); days.set(day, values);
  }
  const dates = [...days.keys()].sort();
  const spanDays = dates.length ? (Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / 86_400_000 : 0;
  if (dates.length < 3 || spanDays < 7) return null;
  const medianCents = median(dates.map(day => median(days.get(day)!)));
  return { medianCents, days: dates.length, spanDays, firstDay: dates[0]!, lastDay: dates[dates.length - 1]!,
    differencePercent: round((current.priceCents / medianCents - 1) * 100) };
}
