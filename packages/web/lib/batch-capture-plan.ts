export type BatchMarketplace = "shopee" | "aliexpress";

const ORDERED_MARKETPLACES: readonly BatchMarketplace[] = [
  "shopee",
  "aliexpress",
];

export class ManualCaptureOnlyError extends Error {
  readonly code = "manual_capture_only";
  constructor(message = "manual_capture_only") {
    super(message);
    this.name = "ManualCaptureOnlyError";
  }
}

/**
 * Normaliza a seleção feita no painel. Aceita somente lojas com automação direta
 * por API (Shopee e AliExpress). O Mercado Livre é de captura exclusivamente manual;
 * pedidos explícitos de ML (isolados ou em lote misto) recebem erro seguro manual_capture_only.
 */
export function batchCapturePlan(
  _consent?: boolean,
  requested?: readonly string[],
): BatchMarketplace[] {
  if (requested && requested.includes("mercadolivre")) {
    throw new ManualCaptureOnlyError("manual_capture_only");
  }
  if (!requested) return [...ORDERED_MARKETPLACES];

  const selected = new Set(requested);
  return ORDERED_MARKETPLACES.filter((slug) => selected.has(slug));
}

