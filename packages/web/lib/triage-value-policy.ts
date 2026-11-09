/** Price is a screening input, never an approval by itself. */
export const TRIAGE_VALUE_POLICY_VERSION = "triage-value-v2";
export const VALUE_REFERENCE_MIN_OBSERVATIONS = 3;
export const VALUE_REFERENCE_MIN_DAYS = 7;
export const VALUE_REFERENCE_LOOKBACK_DAYS = 90;

/** Only prior observations of the same configuration belong here. */
export type ComparablePriceHistory = {
  referencePriceCents: number | null;
  observationCount: number;
  historyDays: number;
};

export type TriageValueDecision = {
  version: typeof TRIAGE_VALUE_POLICY_VERSION;
  currentPriceCents: number;
  outcome: "current_price" | "verified_discount" | "invalid_price";
  comparableHistory: ComparablePriceHistory | null;
};

export function evaluateTriageValue(
  priceCents: number,
  history?: ComparablePriceHistory | null,
): TriageValueDecision {
  const result: TriageValueDecision = {
    version: TRIAGE_VALUE_POLICY_VERSION, currentPriceCents: priceCents,
    outcome: "current_price", comparableHistory: history ?? null,
  };
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
    return { ...result, outcome: "invalid_price" };
  }
  if (!history || history.referencePriceCents === null
    || !Number.isSafeInteger(history.referencePriceCents) || history.referencePriceCents <= priceCents
    || !Number.isSafeInteger(history.observationCount) || history.observationCount < VALUE_REFERENCE_MIN_OBSERVATIONS
    || !Number.isSafeInteger(history.historyDays) || history.historyDays < VALUE_REFERENCE_MIN_DAYS) return result;

  return { ...result, outcome: "verified_discount" };
}
