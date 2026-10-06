/** SQL for known, identical configurations. Callers use internal SQL aliases only. */
export function sameOfferConfigurationSql(latest: string, historical: string): string {
  if (![latest, historical].every((alias) => /^[a-z_]+$/.test(alias))) throw new Error("invalid_sql_alias");
  const material = (alias: string) => `jsonb_build_object(
    'key',${alias}.offer_evidence->'variantKey','label',${alias}.offer_evidence->'variantLabel',
    'quantity',${alias}.offer_evidence->'packageQuantity','contents',${alias}.offer_evidence->'packageContents',
    'dimensions',${alias}.offer_evidence->'dimensions')`;
  const singlePrice = (alias: string) => `(${alias}.offer_evidence->>'priceMinCents' is null
    or ${alias}.offer_evidence->>'priceMaxCents' is null
    or ${alias}.offer_evidence->>'priceMinCents'=${alias}.offer_evidence->>'priceMaxCents')`;
  return `(${latest}.offer_evidence->>'variantKey' is not null
    and ${historical}.offer_evidence->>'variantKey' is not null
    and ${material(latest)}=${material(historical)}
    and ${singlePrice(latest)} and ${singlePrice(historical)})`;
}
