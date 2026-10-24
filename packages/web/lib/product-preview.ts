import { createHash } from "node:crypto";
import type { VitrineProduct } from "./deal-view.ts";
import { PRICE_CURRENT_WINDOW_HOURS, priceFreshness, priceHighlight, seenAgo } from "./deal-signal.ts";

export const PRODUCT_PREVIEW_SIZE = { width: 1200, height: 630 };
const CACHE_SECONDS = 300;

/** Bump the template revision when changing the artwork, fonts or price claims. */
export function productPreview(product: VitrineProduct, now = new Date()) {
  const stale = priceFreshness(product.evidenceObservedAt, now) === "stale";
  const highlight = priceHighlight(product);
  const badge = stale || highlight?.tone === "unproven" ? null : highlight;
  const observedAt = product.evidenceObservedAt ? new Date(product.evidenceObservedAt).toISOString() : null;
  const ageLabel = stale ? seenAgo(product.evidenceObservedAt, now) : null;
  const version = createHash("sha256").update(JSON.stringify([
    "product-preview-v1", product.slug, product.title, product.marketplace, product.imageUrl,
    product.priceCents, product.originalPriceCents, observedAt, stale, ageLabel, badge,
  ])).digest("hex").slice(0, 24);
  // Never keep a "current" price across the existing 48-hour freshness boundary.
  const currentUntil = observedAt ? Date.parse(observedAt) + PRICE_CURRENT_WINDOW_HOURS * 3_600_000 : 0;
  const cacheSeconds = stale ? CACHE_SECONDS : Math.max(0, Math.min(CACHE_SECONDS,
    Math.floor((currentUntil - now.getTime()) / 1000)));
  return {
    version, stale, badge, ageLabel, cacheSeconds,
    path: `/bizu/${encodeURIComponent(product.slug)}/opengraph-image?v=${version}`,
  };
}
