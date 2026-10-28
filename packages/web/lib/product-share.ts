import { priceFreshness, seenAgo } from "./deal-signal.ts";
import { marketplaceDef } from "./marketplaces.ts";
import { CANONICAL_SITE_URL } from "./site-url.ts";
import { offerPriceLabel } from "./offer-price.ts";
import type { ProductPresentation } from "./product-presentation.ts";

/** Link público direto: o robô do WhatsApp lê os metadados da página do produto. */
export function productShareUrl(slug: string): string {
  return `${CANONICAL_SITE_URL}/bizu/${encodeURIComponent(slug)}`;
}

export function productShareDescription(product: {
  price_cents: number;
  marketplace: string;
  evidence_observed_at: Date | string | null;
} & Partial<ProductPresentation>, now = new Date()): string {
  const store = marketplaceDef(product.marketplace)?.label ?? product.marketplace;
  const price = offerPriceLabel({ ...product, priceCents: product.price_cents }).replace(/ /g, " ") + (product.currency ? "" : " (moeda não confirmada)");
  const context = product.benefit ? `${product.benefit} ` : "";
  if (priceFreshness(product.evidence_observed_at, now) === "stale") {
    return `${context}Última captura: ${price} na ${store}, ${seenAgo(product.evidence_observed_at, now) ?? "sem data"}. Confira o preço atual.`;
  }
  return `${context}${price} na ${store} · preço monitorado pelo BizuMiner.`;
}
