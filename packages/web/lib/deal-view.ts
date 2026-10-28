import type { DealRow } from "./db";
import type { ProductPresentation } from "./product-presentation.ts";

export type VitrineProduct = Partial<ProductPresentation> & {
  id: string; slug: string; title: string; priceCents: number; originalPriceCents: number | null;
  previousMinPriceCents: number | null; discountPercent: number | null; imageUrl: string | null;
  ratingStar: number | null; salesLabel: string | null; salesCount: number | null;
  evidenceObservedAt: Date | string | null; observationCount: number; historyDays: number;
  lowestVerified: boolean; category: string | null; marketplace: string;
};

export function toVitrineProduct(deal: DealRow): VitrineProduct {
  return {
    id: deal.id, slug: deal.slug, title: deal.displayTitle ?? deal.title, priceCents: deal.price_cents,
    displayTitle: deal.displayTitle, sourceTitle: deal.sourceTitle ?? deal.title, titleOrigin: deal.titleOrigin,
    editorialRevisionId: deal.editorialRevisionId, editorialReviewedAt: deal.editorialReviewedAt,
    benefit: deal.benefit, audience: deal.audience, caveat: deal.caveat, purchaseContents: deal.purchaseContents,
    coverHeadline: deal.coverHeadline, coverImageApproved: deal.coverImageApproved,
    priceType: deal.priceType, priceMinCents: deal.priceMinCents, priceMaxCents: deal.priceMaxCents,
    currency: deal.currency, originalPriceKind: deal.originalPriceKind,
    originalPriceCents: deal.original_price_cents, previousMinPriceCents: deal.previous_min_price_cents,
    discountPercent: deal.claimed_discount_rate === null ? null : Math.round(deal.claimed_discount_rate * 100),
    imageUrl: deal.image_url, ratingStar: deal.rating_star, salesLabel: deal.sales_label,
    salesCount: deal.sales_count, evidenceObservedAt: deal.evidence_observed_at,
    observationCount: deal.observation_count, historyDays: deal.history_days,
    lowestVerified: deal.lowest_verified, category: deal.category, marketplace: deal.marketplace,
  };
}
