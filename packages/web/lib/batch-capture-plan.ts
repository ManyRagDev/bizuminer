export type BatchMarketplace = "mercadolivre" | "shopee" | "aliexpress";

const ORDERED_MARKETPLACES: readonly BatchMarketplace[] = [
  "mercadolivre",
  "shopee",
  "aliexpress",
];

/**
 * Normaliza a seleção feita no painel. Sem seleção explícita, preserva o
 * comportamento legado (duas APIs e ML somente com consentimento).
 */
export function batchCapturePlan(
  consent: boolean,
  requested?: readonly string[],
): BatchMarketplace[] {
  const allowed = new Set(
    consent ? ORDERED_MARKETPLACES : ORDERED_MARKETPLACES.filter((slug) => slug !== "mercadolivre"),
  );
  if (!requested) return ORDERED_MARKETPLACES.filter((slug) => allowed.has(slug));

  const selected = new Set(requested);
  return ORDERED_MARKETPLACES.filter((slug) => allowed.has(slug) && selected.has(slug));
}
