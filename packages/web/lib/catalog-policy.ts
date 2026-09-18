/**
 * Política única de elegibilidade do catálogo.
 *
 * `last_seen_at` é renovado sempre que o anúncio reaparece numa captura, mesmo
 * quando o preço não mudou. Isso é intencional: uma nova leitura confirma que
 * a oferta e o preço continuam atuais; exigir mudança de valor esconderia uma
 * oferta válida só porque ela permaneceu estável.
 */
export const PRODUCT_EVIDENCE_TTL_DAYS = 7;

/** O legado continua no histórico e na fila, mas nunca é publicado por padrão. */
export const PUBLIC_CURATION_STATUS = "approved" as const;

export function isProductEvidenceFresh(lastSeenAt: Date | string, now = new Date()): boolean {
  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  return lastSeenMs >= now.getTime() - PRODUCT_EVIDENCE_TTL_DAYS * 24 * 60 * 60 * 1_000;
}

export function isPublicCatalogEligible(
  status: string,
  lastSeenAt: Date | string,
  now = new Date(),
): boolean {
  return status === PUBLIC_CURATION_STATUS && isProductEvidenceFresh(lastSeenAt, now);
}
