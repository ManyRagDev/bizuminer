/** SQL for known, identical configurations. Callers use internal SQL aliases only. */
export function sameOfferConfigurationSql(latest: string, historical: string): string {
  if (![latest, historical].every((alias) => /^[a-z_]+$/.test(alias))) throw new Error("invalid_sql_alias");
  const key = (alias: string) => `coalesce(${alias}.offer_evidence->'variantIdentity'->>'key', ${alias}.offer_evidence->>'variantKey')`;
  const singlePrice = (alias: string) => `(${alias}.offer_evidence->>'priceMinCents' is null
    or ${alias}.offer_evidence->>'priceMaxCents' is null
    or ${alias}.offer_evidence->>'priceMinCents'=${alias}.offer_evidence->>'priceMaxCents')`;
  const currencyMatch = `(coalesce(${latest}.offer_evidence->>'currency', 'BRL') = coalesce(${historical}.offer_evidence->>'currency', 'BRL'))`;
  return `(${currencyMatch} and ${singlePrice(latest)} and ${singlePrice(historical)} and (
    (${key(latest)} is not null and ${key(historical)} is not null and ${key(latest)} = ${key(historical)})
    or (${key(latest)} is null and ${key(historical)} is null)
  ))`;
}

/**
 * Projeção conservadora comum de evidência de preço para entrega 01-0 (EP-01).
 * Enquanto não houver evidência canônica C-02 homologada (variantKey confirmada e política E3 aprovada),
 * suprime alegações históricas não sustentadas (lowest_verified = false, previous_min_price_cents = null)
 * sem apagar dados de observação, mantendo preços observados e caminhos de compra.
 */
export function projectConservativePriceEvidence<T extends Record<string, any>>(row: T): T {
  const result: any = { ...row };
  if ("lowest_verified" in result) {
    result.lowest_verified = false;
  }
  if ("lowestVerified" in result) {
    result.lowestVerified = false;
  }
  if ("previous_min_price_cents" in result) {
    result.previous_min_price_cents = null;
  }
  if ("previousMinPriceCents" in result) {
    result.previousMinPriceCents = null;
  }
  if ("min_price_cents" in result) {
    result.min_price_cents = null;
  }
  return result as T;
}

export * from "./price-evidence.ts";

