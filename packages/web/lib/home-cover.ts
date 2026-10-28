import type { VitrineProduct } from "./deal-view.ts";
import { PRICE_CURRENT_WINDOW_HOURS } from "./deal-signal.ts";
import { COVER_HEADLINE_MAX_LENGTH, COVER_DESCRIPTION_MAX_LENGTH, COVER_TITLE_MAX_LENGTH } from "./product-presentation.ts";

/** Extra presentation requirements; callers supply the current, server-approved hero pool. */
export function coverBlockers(product: VitrineProduct, now = new Date()): string[] {
  const blockers: string[] = [];
  if (product.titleOrigin !== "editorial" || !product.editorialRevisionId) blockers.push("Publique a ficha editorial revisada.");
  if (!product.imageUrl || product.coverImageApproved !== true) blockers.push("Confira e aprove a foto para a capa: nítida, sem texto promocional e fiel ao que chega na compra.");
  const headline = product.coverHeadline?.trim() ?? "";
  if (headline.length < 3 || headline.length > COVER_HEADLINE_MAX_LENGTH) blockers.push("Escreva uma chamada de 3 a " + COVER_HEADLINE_MAX_LENGTH + " caracteres.");
  const title = product.displayTitle?.trim() ?? "";
  if (title.length < 3 || title.length > COVER_TITLE_MAX_LENGTH) blockers.push("Use um título editorial de até " + COVER_TITLE_MAX_LENGTH + " caracteres, preservando a identificação do produto.");
  const benefit = product.benefit?.trim() ?? "";
  if (benefit.length < 3 || benefit.length > COVER_DESCRIPTION_MAX_LENGTH) blockers.push("Resuma o benefício em até " + COVER_DESCRIPTION_MAX_LENGTH + " caracteres.");
  if (product.priceType !== "exact" || !/^[A-Z]{3}$/.test(product.currency ?? "") || !Number.isSafeInteger(product.priceCents) || product.priceCents <= 0) blockers.push("Confirme preço, moeda e versão da oferta na captura.");
  const observed = product.evidenceObservedAt ? new Date(product.evidenceObservedAt).getTime() : NaN;
  const age = now.getTime() - observed;
  if (!Number.isFinite(age) || age < 0 || age > PRICE_CURRENT_WINDOW_HOURS * 3_600_000) blockers.push("Atualize os dados da oferta nas últimas 48 horas.");
  return blockers;
}

export function selectCoverProduct(highlights: VitrineProduct[], now = new Date()): VitrineProduct | null {
  return highlights.find(product => coverBlockers(product, now).length === 0) ?? null;
}
