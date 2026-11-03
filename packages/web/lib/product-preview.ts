import { optionDetailPath } from "./offer-option.ts";
import { createHash } from "node:crypto";
import type { VitrineProduct } from "./deal-view.ts";
import { PRICE_CURRENT_WINDOW_HOURS, priceFreshness, priceHighlight, seenAgo } from "./deal-signal.ts";

export const PRODUCT_PREVIEW_SIZE = { width: 1200, height: 630 };
const CACHE_SECONDS = 300;

/** Bump the template revision when changing the artwork, fonts or price claims. */
export function productPreview(product: VitrineProduct, now = new Date()) {
  const stale = priceFreshness(product.evidenceObservedAt, now) === "stale";
  const highlight = priceHighlight(product);
  const imprecise = product.priceType !== "exact";
  const badge = product.offerOptionKey || stale || imprecise || product.currency !== "BRL" || highlight?.tone === "unproven" ? null : highlight;
  const observedAt = product.evidenceObservedAt ? new Date(product.evidenceObservedAt).toISOString() : null;
  const ageLabel = stale ? seenAgo(product.evidenceObservedAt, now) : null;
  const optionRevision=product.offerOptionKey ? ["confirmed-offer-preview-v2",product.slug,product.offerOptionKey,
    product.sourceTitle ?? product.title,product.offerOptionLabel,product.marketplace,product.imageUrl,
    product.priceCents,product.currency,observedAt,stale,ageLabel] : null;
  const version = createHash("sha256").update(JSON.stringify(optionRevision ?? [
    "product-preview-v3", product.slug,product.offerOptionKey,product.offerOptionLabel,product.offerConditions, product.displayTitle ?? product.title, product.marketplace, product.imageUrl,
    product.editorialRevisionId, product.benefit, product.caveat, product.purchaseContents,
    product.priceCents, product.priceType, product.currency, product.priceMinCents, product.priceMaxCents,
    product.originalPriceCents, product.originalPriceKind, observedAt, stale, ageLabel, badge,
  ])).digest("hex").slice(0, 24);
  // Never keep a "current" price across the existing 48-hour freshness boundary.
  const currentUntil = observedAt ? Date.parse(observedAt) + PRICE_CURRENT_WINDOW_HOURS * 3_600_000 : 0;
  const cacheSeconds = stale ? CACHE_SECONDS : Math.max(0, Math.min(CACHE_SECONDS,
    Math.floor((currentUntil - now.getTime()) / 1000)));
  return {
    version, stale, badge, ageLabel, cacheSeconds,
    path: `${optionDetailPath(product.slug,product.offerOptionKey)}/opengraph-image?v=${version}`,
  };
}
