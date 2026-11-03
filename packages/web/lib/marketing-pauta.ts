import type { RoutineOffer } from "./marketing-contract.ts";
import {
  offerPriceLabel,
  offerPriceNote,
  type OfferPrice,
} from "./offer-price.ts";

export type MarketingPautaProduct = OfferPrice & {
  id: string;
  title: string;
  displayTitle?: string;
  imageUrl?: string | null;
  shareUrl: string;
  benefit?: string;
  editorialRationale?: string;
  purchaseContents?: string;
  editorialPurchaseContents?: string;
  caveat?: string;
  offerOptionLabel?:string;
  offerConditions?:string;
  evidenceObservedAt?: string | Date | null;
};

export function shareableLink(value: string): string {
  try {
    const link = new URL(value);
    return ["http:", "https:"].includes(link.protocol) &&
      !link.username &&
      !link.password
      ? value
      : "";
  } catch {
    return "";
  }
}

/** Reuse the exact account-scoped Pauta link. A capture is not a human verification. */
export function offerFromPauta(product: MarketingPautaProduct): RoutineOffer {
  const observed = product.evidenceObservedAt
    ? new Date(product.evidenceObservedAt)
    : null;
  const hasPrice =
    (Number.isFinite(product.priceCents) && product.priceCents > 0) ||
    (typeof product.priceMinCents === "number" && product.priceMinCents > 0);
  const currencyKnown = /^[A-Z]{3}$/.test(product.currency || "");
  const label = hasPrice
    ? offerPriceLabel(product) +
      (!currencyKnown ? " (moeda não confirmada)" : "")
    : "";
  return {
    name: (product.displayTitle || product.title).slice(0, 250),
    variant: [product.offerOptionLabel,product.purchaseContents || product.editorialPurchaseContents].filter(Boolean).join(" · ").slice(0,500),
    reason: (product.benefit || product.editorialRationale || "").slice(
      0,
      2000,
    ),
    price:
      hasPrice && product.currency === "BRL" && product.priceType === "exact"
        ? (product.priceCents / 100).toFixed(2).replace(".", ",")
        : "",
    priceLabel: label,
    conditions: [product.offerConditions,product.caveat, offerPriceNote(product)]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000),
    url: shareableLink(product.shareUrl),
    imageUrl: shareableLink(product.imageUrl || ""),
    capturedAt:
      observed && Number.isFinite(observed.getTime())
        ? observed.toISOString()
        : "",
    verifiedAt: "",
  };
}
