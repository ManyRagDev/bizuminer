/**
 * Contrato de captura da extensão (E4) — validação pura, sem banco.
 *
 * Valida e normaliza o body v1 de `POST /api/extension/captures` (plano §7.3).
 * NENHUM campo de tenant/affiliate/tag é aceito do client: a identidade vem do
 * token do dispositivo (hash → device → affiliate). Campos forjados são
 * simplesmente ignorados — o schema só aceita o que é data do produto.
 */

import { MAX_SOURCE_TITLE_LENGTH, normalizeSourceTitle } from "../../capture/src/title.ts";

import type { OfferEvidenceV2 } from "../../capture/src/types.ts";

const MAX_TITLE = MAX_SOURCE_TITLE_LENGTH;
const MIN_TITLE = 3;
/** Teto defensivo de preço: R$ 1.000.000,00 em centavos. */
const MAX_PRICE_CENTS = 100_000_000;
/** Janela razoável de captura: 24h para o futuro (relógio do browser adiantado). */
const MAX_CLIENT_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hosts permitidos do ML e da CDN de imagem. */
export function isMlHost(host: string): boolean {
  return /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|mlstatic\.com)$/.test(host.toLowerCase());
}

/** Hosts permitidos da Amazon e suas CDNs de imagem. */
export function isAmazonHost(host: string): boolean {
  return /(^|\.)(amazon\.com\.br|media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com)$/.test(host.toLowerCase());
}

export type SupportedExtensionMarketplace = "mercadolivre" | "amazon" | "aliexpress";

export function isExtensionMarketplace(value: unknown): value is SupportedExtensionMarketplace {
  return value === "mercadolivre" || value === "amazon" || value === "aliexpress";
}

const isAliHost = (host: string) => /(^|\.)(aliexpress\.com|aliexpress-media\.com|alicdn\.com)$/.test(host);


function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function bad(message: string): never {
  throw new Error(message);
}

export interface ExtensionCaptureProduct {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  priceCents: number;
  originalPriceCents?: number;
  /** Absent on installed legacy extensions/outbox entries. */
  currency?: "BRL";
  priceType?: "exact" | "from" | "range" | "unknown";
  priceMaxCents?: number;
  condition?: "coupon" | "first_purchase" | "pix" | "prime";
  variantLabel?: string;
}

export interface ExtensionCapturePayload {
  version: 1;
  requestId: string;
  marketplace: SupportedExtensionMarketplace;
  clientCapturedAt: string;
  page: { kind: string; url: string };
  product: ExtensionCaptureProduct;
}

/** Valida e normaliza o body v1. Lança Error com mensagem estável em pt-BR. */
export function validateExtensionCapturePayload(raw: unknown, batch = false): ExtensionCapturePayload {
  if (typeof raw !== "object" || raw === null) bad("payload não é objeto");
  const p = raw as Record<string, unknown>;

  if (p.version !== 1) bad("versão não suportada");
  const marketplace = p.marketplace as SupportedExtensionMarketplace;
  if (!isExtensionMarketplace(marketplace) || (!batch && marketplace === "aliexpress")) bad("marketplace não suportado");

  const requestId = p.requestId;
  if (typeof requestId !== "string" || !UUID_RE.test(requestId)) bad("requestId ausente ou inválido");

  const clientCapturedAt = p.clientCapturedAt;
  if (typeof clientCapturedAt !== "string") bad("clientCapturedAt ausente");
  const capturedMs = Date.parse(clientCapturedAt);
  if (!Number.isFinite(capturedMs)) bad("clientCapturedAt inválido");
  if (capturedMs - Date.now() > MAX_CLIENT_CLOCK_SKEW_MS) bad("clientCapturedAt no futuro além do plausível");

  const page = p.page as Record<string, unknown> | undefined;
  if (typeof page !== "object" || page === null) bad("page ausente");
  const pageUrl = typeof page.url === "string" ? page.url : "";
  const pageHost = hostOf(pageUrl);
  if (!pageHost) bad("page.url inválida");
  if (marketplace === "mercadolivre" && !isMlHost(pageHost)) bad("page.url não é do Mercado Livre");
  if (marketplace === "amazon" && !isAmazonHost(pageHost)) bad("page.url não é da Amazon");
  if (marketplace === "aliexpress" && !isAliHost(pageHost)) bad("page.url não é da AliExpress");
  const pageKind = typeof page.kind === "string" ? page.kind : "";
  if (!/^(offers|search|category|product|listing)$/.test(pageKind)) bad("page.kind inválido");

  const prod = p.product as Record<string, unknown> | undefined;
  if (typeof prod !== "object" || prod === null) bad("product ausente");

  const externalId = typeof prod.externalId === "string" ? prod.externalId.trim() : "";
  if (marketplace === "mercadolivre" && !/^MLB\d{6,}$/.test(externalId)) bad("product.externalId inválido");
  if (marketplace === "amazon" && !/^[A-Z0-9]{10}$/i.test(externalId)) bad("product.externalId inválido (deve ser ASIN de 10 caracteres)");

  if (marketplace === "aliexpress" && !/^\d{8,20}$/.test(externalId)) bad("product.externalId inválido");

  const title = typeof prod.title === "string" ? normalizeSourceTitle(prod.title) : "";
  if (title.length < MIN_TITLE || title.length > MAX_TITLE) bad(`product.title fora do tamanho (3–${MAX_TITLE})`);

  const productUrl = typeof prod.productUrl === "string" ? prod.productUrl : "";
  const productHost = hostOf(productUrl);
  if (!productHost) bad("product.productUrl inválida");
  if (marketplace === "mercadolivre") {
    if (!isMlHost(productHost)) bad("product.productUrl não é do Mercado Livre");
    if (/[?&]matt_(word|tool)=/i.test(productUrl)) bad("product.productUrl não pode conter matt_* (vem do client)");
  } else if (marketplace === "amazon") {
    if (!isAmazonHost(productHost)) bad("product.productUrl não é da Amazon");
    if (/[?&]tag=/i.test(productUrl)) bad("product.productUrl não pode conter tag de afiliado (vem do client)");
  }

  if (marketplace === "aliexpress" && !isAliHost(productHost)) bad("product.productUrl não é da AliExpress");

  const priceCents = prod.priceCents;
  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents <= 0 || priceCents > MAX_PRICE_CENTS) {
    bad("product.priceCents inválido");
  }

  let originalPriceCents: number | undefined;
  if (prod.originalPriceCents !== undefined && prod.originalPriceCents !== null) {
    const op = prod.originalPriceCents;
    if (typeof op !== "number" || !Number.isInteger(op) || op <= 0 || op > MAX_PRICE_CENTS) {
      bad("product.originalPriceCents inválido");
    }
    if (op > priceCents) originalPriceCents = op;
  }

  let imageUrl: string | undefined;
  if (typeof prod.imageUrl === "string" && prod.imageUrl.length > 0) {
    const imageHost = hostOf(prod.imageUrl);
    if (imageHost) {
      if (marketplace === "mercadolivre" && isMlHost(imageHost)) imageUrl = prod.imageUrl;
      if (marketplace === "amazon" && isAmazonHost(imageHost)) imageUrl = prod.imageUrl;
      if (marketplace === "aliexpress" && isAliHost(imageHost)) imageUrl = prod.imageUrl;
    }
  }

  const range = batch && prod.priceType === "range";
  const priceMaxCents = prod.priceMaxCents;
  if (range && (typeof priceMaxCents !== "number" || !Number.isInteger(priceMaxCents)
    || priceMaxCents <= priceCents || priceMaxCents > MAX_PRICE_CENTS)) bad("product.priceMaxCents inválido");
  const condition = batch && (prod.condition === "coupon" || prod.condition === "first_purchase" || prod.condition === "pix" || marketplace === "amazon" && prod.condition === "prime")
    ? prod.condition : undefined;
  const variantLabel = batch && typeof prod.variantLabel === "string"
    ? normalizeSourceTitle(prod.variantLabel).slice(0, 100) || undefined : undefined;
  return {
    version: 1,
    requestId,
    marketplace,
    clientCapturedAt,
    page: { kind: pageKind, url: pageUrl },
    product: {
      externalId: marketplace === "amazon" ? externalId.toUpperCase() : externalId,
      title,
      productUrl,
      imageUrl,
      priceCents,
      originalPriceCents,
      currency: prod.currency === "BRL" ? "BRL" : undefined,
      priceType: range ? "range" : prod.priceType === "exact" || prod.priceType === "from" ? prod.priceType : undefined,
      ...(range ? { priceMaxCents: priceMaxCents as number } : {}),
      ...(condition ? { condition } : {}),
      ...(variantLabel ? { variantLabel } : {}),
    },
  };
}

/** Only facts explicitly transported by the reader; legacy payloads remain unknown. */
export function browserOfferEvidence(
  product: Pick<ExtensionCaptureProduct, 'currency' | 'priceType' | 'originalPriceCents' | 'priceMaxCents' | 'condition' | 'variantLabel'> & { priceCents?: number },
  url: string,
  capturedAt: string,
  marketplace: SupportedExtensionMarketplace = 'mercadolivre'
): OfferEvidenceV2 {
  return {
    version: 2,
    source: { marketplace, method: 'browser', url, capturedAt },
    currency: product.currency,
    priceType: product.priceType ?? 'unknown',
    variantIdentity: { state: 'unknown' },
    ...(product.variantLabel ? { variantLabel: product.variantLabel } : {}),
    ...(product.priceType === "range" ? { priceMinCents: product.priceCents, priceMaxCents: product.priceMaxCents } : {}),
    ...(product.condition === "prime" ? { conditions: { membership: "Oferta exclusiva Prime" } } :
      product.condition === "pix" ? { conditions: { payment: "Pagamento via Pix" } } :
      product.condition === "first_purchase" ? { conditions: { coupon: "Preço para primeira compra" } } :
      product.condition === "coupon" ? { conditions: { coupon: "Preço com cupom" } } : {}),
    originalPriceKind: product.originalPriceCents ? 'source_claimed' : 'unknown',
  };
}
