/**
 * Contratos da extensão (E5). Tipos compartilhados entre content script,
 * service worker e popup. Nenhum segredo/config ML vive aqui.
 */

export interface CaptureProduct {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  priceCents: number;
  originalPriceCents?: number;
}

export interface CapturePage {
  kind: "offers" | "search" | "category" | "product";
  url: string;
}

export interface CapturePayload {
  version: 1;
  requestId: string;
  marketplace: "mercadolivre";
  clientCapturedAt: string;
  page: CapturePage;
  product: CaptureProduct;
}

export interface CaptureResult {
  ok: boolean;
  duplicate?: boolean;
  productId?: string;
  observationId?: string;
  publication?: { slug: string; url: string };
  error?: string;
  message?: string;
}

export interface PairExchangeResult {
  ok: boolean;
  deviceId?: string;
  deviceToken?: string;
  affiliate?: { displayName: string };
  error?: string;
}

/** Cria um requestId UUID v4 — preservado em todos os retries (I4). */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Descobre o tipo de página de catálogo do ML a partir da URL. */
export function pageKindFor(url: string): CapturePage["kind"] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "category";
  }
  const path = u.pathname;
  if (/\/ofertas/.test(path)) return "offers";
  if (/\/p\/MLB/.test(path) || /\/MLB-\d/.test(path)) return "product";
  if (u.hostname === "lista.mercadolivre.com.br") return "search";
  if (/\/c\//.test(path)) return "category";
  return "search";
}
