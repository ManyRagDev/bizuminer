import type { ProductPresentation } from "./product-presentation.ts";

export type OfferPrice = Pick<Partial<ProductPresentation>, "priceType" | "priceMinCents" | "priceMaxCents" | "currency" | "originalPriceKind"> & { priceCents: number };
export function formatOfferMoney(cents: number, currency = "BRL"): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).replace(/\u202F/g, "\u00A0");
}
export function offerPriceLabel(product: OfferPrice): string {
  const money = (value: number) => formatOfferMoney(value, product.currency || "BRL");
  if (product.priceType === "from") return `a partir de ${money(product.priceMinCents ?? product.priceCents)}`;
  return money(product.priceMinCents ?? product.priceCents);
}
export function offerPriceNote(product: OfferPrice): string | null {
  if (product.priceType === "range" || product.priceType === "from") return "O valor depende da versão escolhida. Confira na loja.";
  if (product.priceType !== "exact") return "Preço exibido no anúncio. Confirme a versão e as condições na loja.";
  return null;
}
