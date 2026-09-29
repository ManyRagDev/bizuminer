import { priceFreshness, seenAgo } from "./deal-signal.ts";
import { marketplaceDef } from "./marketplaces.ts";
import { CANONICAL_SITE_URL } from "./site-url.ts";

/** Link público direto: o robô do WhatsApp lê os metadados da página do produto. */
export function productShareUrl(slug: string): string {
  return `${CANONICAL_SITE_URL}/bizu/${encodeURIComponent(slug)}`;
}

export function productShareDescription(product: {
  price_cents: number;
  marketplace: string;
  evidence_observed_at: Date | string | null;
}, now = new Date()): string {
  const store = marketplaceDef(product.marketplace)?.label ?? product.marketplace;
  const price = (product.price_cents / 100).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
    maximumFractionDigits: product.price_cents % 100 === 0 ? 0 : 2,
  }).replace(/ /g, " ");
  if (priceFreshness(product.evidence_observed_at, now) === "stale") {
    return `Última captura: ${price} na ${store}, ${seenAgo(product.evidence_observed_at, now) ?? "sem data"}. Confira o preço atual.`;
  }
  return `${price} na ${store} · preço monitorado pelo BizuMiner.`;
}
