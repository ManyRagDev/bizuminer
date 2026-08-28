import type { DealRow } from "./db";

export type VitrineProduct = {
  id: string; slug: string; title: string; priceCents: number; originalPriceCents: number | null;
  previousMinPriceCents: number | null; discountPercent: number | null; imageUrl: string | null;
  ratingStar: number | null; salesLabel: string | null; salesCount: number | null;
  evidenceObservedAt: Date | string | null; observationCount: number; historyDays: number;
  lowestVerified: boolean; category: string | null; marketplace: string;
};

export function toVitrineProduct(deal: DealRow): VitrineProduct {
  return {
    id: deal.id, slug: deal.slug, title: deal.title, priceCents: deal.price_cents,
    originalPriceCents: deal.original_price_cents, previousMinPriceCents: deal.previous_min_price_cents,
    discountPercent: deal.claimed_discount_rate === null ? null : Math.round(deal.claimed_discount_rate * 100),
    imageUrl: deal.image_url, ratingStar: deal.rating_star, salesLabel: deal.sales_label,
    salesCount: deal.sales_count, evidenceObservedAt: deal.evidence_observed_at,
    observationCount: deal.observation_count, historyDays: deal.history_days,
    lowestVerified: deal.lowest_verified, category: deal.category, marketplace: deal.marketplace,
  };
}
