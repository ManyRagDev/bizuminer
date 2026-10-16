/** SQL for known, identical configurations. Callers use internal SQL aliases only. */
export function sameOfferConfigurationSql(latest: string, historical: string): string {
  if (![latest, historical].every((alias) => /^[a-z_]+$/.test(alias))) throw new Error("invalid_sql_alias");
  const key = (alias: string) => `coalesce(${alias}.offer_evidence->'variantIdentity'->>'key', ${alias}.offer_evidence->>'variantKey')`;
  const stateCheck = (alias: string) => `(not (${alias}.offer_evidence ? 'variantIdentity') or coalesce(${alias}.offer_evidence->'variantIdentity'->>'state','unknown') in ('source_verified','human_verified'))`;
  const quantity = (alias: string) => `coalesce(${alias}.offer_evidence->'packageQuantity', ${alias}.offer_evidence->'conditions'->'quantity')`;
  const material = (alias: string) => `jsonb_build_object(
    'key', ${key(alias)},
    'label', ${alias}.offer_evidence->'variantLabel',
    'quantity', ${quantity(alias)},
    'contents', ${alias}.offer_evidence->'packageContents',
    'dimensions', ${alias}.offer_evidence->'dimensions')`;
  const singlePrice = (alias: string) => `(${alias}.offer_evidence->>'priceMinCents' is null
    or ${alias}.offer_evidence->>'priceMaxCents' is null
    or ${alias}.offer_evidence->>'priceMinCents'=${alias}.offer_evidence->>'priceMaxCents')`;
  const exactType = (alias: string) => `(${alias}.offer_evidence->>'priceType' is null or ${alias}.offer_evidence->>'priceType'='exact')`;
  const currencyMatch = `(${latest}.offer_evidence->>'currency' is null or ${historical}.offer_evidence->>'currency' is null or ${latest}.offer_evidence->>'currency'=${historical}.offer_evidence->>'currency')`;
  return `(${key(latest)} is not null
    and ${key(historical)} is not null
    and ${key(latest)}=${key(historical)}
    and ${stateCheck(latest)} and ${stateCheck(historical)}
    and ${material(latest)}=${material(historical)}
    and ${singlePrice(latest)} and ${singlePrice(historical)}
    and ${exactType(latest)} and ${exactType(historical)}
    and ${currencyMatch})`;
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

