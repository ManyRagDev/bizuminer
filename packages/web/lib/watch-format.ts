import { formatOfferMoney } from "./offer-price.ts";

/** Never assign a currency to a legacy reference that did not record one. */
export function formatWatchMoney(cents: number, currency: string | null): string {
  if (currency && /^[A-Z]{3}$/.test(currency)) return formatOfferMoney(cents, currency);
  return `${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (moeda não informada)`;
}

export function countComparableDrops(watches: Array<{ baselineCents: number; currentCents: number | null; comparisonStatus: string }>): number {
  return watches.filter(watch => watch.comparisonStatus === "comparable" && watch.currentCents !== null && watch.currentCents < watch.baselineCents).length;
}
