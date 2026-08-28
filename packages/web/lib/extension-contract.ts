/**
 * Contrato de captura da extensão (E4) — validação pura, sem banco.
 *
 * Valida e normaliza o body v1 de `POST /api/extension/captures` (plano §7.3).
 * NENHUM campo de tenant/affiliate/tag é aceito do client: a identidade vem do
 * token do dispositivo (hash → device → affiliate). Campos forjados são
 * simplesmente ignorados — o schema só aceita o que é data do produto.
 */

const MAX_TITLE = 250;
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
}

export interface ExtensionCapturePayload {
  version: 1;
  requestId: string;
  marketplace: "mercadolivre";
  clientCapturedAt: string;
  page: { kind: string; url: string };
  product: ExtensionCaptureProduct;
}

/** Valida e normaliza o body v1. Lança Error com mensagem estável em pt-BR. */
export function validateExtensionCapturePayload(raw: unknown): ExtensionCapturePayload {
  if (typeof raw !== "object" || raw === null) bad("payload não é objeto");
  const p = raw as Record<string, unknown>;

  if (p.version !== 1) bad("versão não suportada");
  if (p.marketplace !== "mercadolivre") bad("marketplace não suportado");

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
  if (!pageHost || !isMlHost(pageHost)) bad("page.url não é do Mercado Livre");
  const pageKind = typeof page.kind === "string" ? page.kind : "";
  if (!/^(offers|search|category|product)$/.test(pageKind)) bad("page.kind inválido");

  const prod = p.product as Record<string, unknown> | undefined;
  if (typeof prod !== "object" || prod === null) bad("product ausente");

  const externalId = typeof prod.externalId === "string" ? prod.externalId : "";
  if (!/^MLB\d{6,}$/.test(externalId)) bad("product.externalId inválido");

  const title = typeof prod.title === "string" ? prod.title.trim() : "";
  if (title.length < MIN_TITLE || title.length > MAX_TITLE) bad("product.title fora do tamanho (3–250)");

  const productUrl = typeof prod.productUrl === "string" ? prod.productUrl : "";
  const productHost = hostOf(productUrl);
  if (!productHost || !isMlHost(productHost)) bad("product.productUrl não é do Mercado Livre");
  if (/[?&]matt_(word|tool)=/i.test(productUrl)) bad("product.productUrl não pode conter matt_* (vem do client)");

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
    if (imageHost && isMlHost(imageHost)) imageUrl = prod.imageUrl;
  }

  return {
    version: 1,
    requestId,
    marketplace: "mercadolivre",
    clientCapturedAt,
    page: { kind: pageKind, url: pageUrl },
    product: { externalId, title, productUrl, imageUrl, priceCents, originalPriceCents },
  };
}
