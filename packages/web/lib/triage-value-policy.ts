/** Price is a screening input, never an approval by itself. */
export const TRIAGE_VALUE_POLICY_VERSION = "triage-value-v1";
export const MIN_PRODUCT_VALUE_CENTS_DEFAULT = 2000;
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
  minValueCents: number;
  currentPriceCents: number;
  outcome: "current_price" | "verified_discount" | "unverified_value" | "low_value" | "invalid_price";
  comparableHistory: ComparablePriceHistory | null;
};

export function evaluateTriageValue(
  priceCents: number,
  history?: ComparablePriceHistory | null,
  minValueCents = MIN_PRODUCT_VALUE_CENTS_DEFAULT,
): TriageValueDecision {
  const result: TriageValueDecision = {
    version: TRIAGE_VALUE_POLICY_VERSION, minValueCents, currentPriceCents: priceCents,
    outcome: "unverified_value", comparableHistory: history ?? null,
  };
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
    return { ...result, outcome: "invalid_price" };
  }
  if (priceCents >= minValueCents) return { ...result, outcome: "current_price" };
  if (!history || !Number.isSafeInteger(history.referencePriceCents) || history.referencePriceCents! <= 0
    || !Number.isSafeInteger(history.observationCount) || history.observationCount < VALUE_REFERENCE_MIN_OBSERVATIONS
    || !Number.isSafeInteger(history.historyDays) || history.historyDays < VALUE_REFERENCE_MIN_DAYS) return result;

  return { ...result, outcome: history.referencePriceCents! >= minValueCents && priceCents < history.referencePriceCents!
    ? "verified_discount" : "low_value" };
}
