import type { ProductPresentation } from "./product-presentation.ts";

export type OfferPrice = Pick<Partial<ProductPresentation>, "priceType" | "priceMinCents" | "priceMaxCents" | "currency" | "originalPriceKind"> & { priceCents: number };
export function formatOfferMoney(cents: number, currency = "BRL"): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}
export function offerPriceLabel(product: OfferPrice): string {
  const confirmedCurrency = typeof product.currency === "string" && /^[A-Z]{3}$/.test(product.currency);
  const money = (value: number) => confirmedCurrency ? formatOfferMoney(value, product.currency)
    : (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: value % 100 === 0 ? 0 : 2, maximumFractionDigits: value % 100 === 0 ? 0 : 2 });
  if (product.priceType === "range" && product.priceMinCents && product.priceMaxCents && product.priceMaxCents > product.priceMinCents) {
    return `${money(product.priceMinCents)} a ${money(product.priceMaxCents)}`;
  }
  if (product.priceType === "from") return `a partir de ${money(product.priceMinCents ?? product.priceCents)}`;
  return money(product.priceCents);
}
export function offerPriceNote(product: OfferPrice): string | null {
  if (!product.currency || !/^[A-Z]{3}$/.test(product.currency)) return "Moeda não confirmada; confira o preço na loja";
  if (product.priceType === "range" || product.priceType === "from") return "O valor depende da versão escolhida. Confira na loja.";
  if (product.priceType !== "exact") return "Preço exibido no anúncio. Confirme a versão e as condições na loja.";
  return null;
}
