export const COVER_HEADLINE_MAX_LENGTH = 72;
export const COVER_DESCRIPTION_MAX_LENGTH = 160;
export const COVER_TITLE_MAX_LENGTH = 90;

/** Only human-approved, durable copy belongs here. Offer/price claims remain in the assessment. */
export interface EditorialPresentationInput {
  status: "draft" | "published" | "withdrawn";
  title: string;
  caveat: string;
  cover?: { headline: string; imageApproved: boolean };
}

export interface ProductPresentation {
  displayTitle: string;
  sourceTitle: string;
  titleOrigin: "editorial" | "source";
  editorialRevisionId?: string;
  editorialReviewedAt?: string;
  benefit?: string;
  audience?: string;
  caveat?: string;
  purchaseContents?: string;
  coverHeadline?: string;
  coverImageApproved?: boolean;
  priceType?: "exact" | "from" | "range" | "unknown";
  priceMinCents?: number;
  priceMaxCents?: number;
  currency?: string;
  originalPriceKind?: "source_claimed" | "derived_from_claim" | "unknown";
}

export function sourceProductPresentation(sourceTitle: string): ProductPresentation {
  return { displayTitle: sourceTitle, sourceTitle, titleOrigin: "source" };
}

/** Remove any cached editorial fields before applying the current server revision. */
export function applyProductPresentation<T extends { title: string }>(product: T, presentation?: ProductPresentation): T & ProductPresentation {
  const clean = { ...product } as T & Partial<ProductPresentation>;
  for (const key of ["displayTitle", "sourceTitle", "titleOrigin", "editorialRevisionId", "editorialReviewedAt", "benefit", "audience", "caveat", "purchaseContents", "coverHeadline", "coverImageApproved", "priceType", "priceMinCents", "priceMaxCents", "currency", "originalPriceKind"] as const) delete clean[key];
  return { ...clean, ...(presentation ?? sourceProductPresentation(product.title)) } as T & ProductPresentation;
}

export function validateEditorialPresentation(value: unknown): EditorialPresentationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!["draft", "published", "withdrawn"].includes(String(input.status))) return null;
  if (typeof input.title !== "string" || typeof input.caveat !== "string") return null;
  const title = input.title.trim(), caveat = input.caveat.trim();
  if (title.length > 500 || caveat.length > 1000 || (input.status === "published" && title.length < 3)) return null;
  let cover: EditorialPresentationInput["cover"];
  if (input.cover !== undefined) {
    if (!input.cover || typeof input.cover !== "object" || Array.isArray(input.cover)) return null;
    const rawCover = input.cover as Record<string, unknown>;
    if (typeof rawCover.headline !== "string" || typeof rawCover.imageApproved !== "boolean") return null;
    const headline = rawCover.headline.trim();
    if (headline.length < 3 || headline.length > COVER_HEADLINE_MAX_LENGTH) return null;
    cover = { headline, imageApproved: rawCover.imageApproved };
  }
  return { status: input.status as EditorialPresentationInput["status"], title, caveat, ...(cover ? { cover } : {}) };
}
