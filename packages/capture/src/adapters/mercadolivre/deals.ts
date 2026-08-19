/**
 * Captura de ofertas da página pública de Ofertas do Mercado Livre.
 *
 * A página https://www.mercadolivre.com.br/ofertas é renderizada no
 * servidor: um fetch simples devolve ~44 cards com título, preço, desconto
 * e o href real do produto. É a fonte de descoberta de produtos do ML.
 *
 * Duas regras de ouro (ver docs/tecnico/mercadolivre-engenharia-reversa.md):
 *
 * 1. NUNCA construir permalink do zero. O slug canônico do ML não é
 *    adivinhável e um redirect de correção pode derrubar os parâmetros de
 *    afiliado. Usamos sempre o href que vem no card.
 *
 * 2. NUNCA abrir links de produção por código. Acesso automatizado a página
 *    de produto responde 302 → /gz/account-verification (anti-bot). Este
 *    adapter lê apenas a listagem, sem seguir links.
 *
 * Cadência: varrer a cada 30–60 min é comportamento de usuário normal.
 */

import { CaptureError } from "../../errors.ts";
import { paginate } from "../../types.ts";
import type {
  AdapterCapabilities,
  AffiliateTag,
  CaptureAdapter,
  CaptureContext,
  Credential,
  FetchParams,
  OfferPage,
  RawOffer,
  ValidationResult,
} from "../../types.ts";
import { TokenBucket, withRetry } from "../../rate-limit.ts";
import { ML_MARKETPLACE } from "./oauth.ts";
import { buildAffiliateLink as buildLink } from "./affiliate-link.ts";

export const DEALS_URL = "https://www.mercadolivre.com.br/ofertas";

/** User-Agent de navegador comum — a página pública exige um UA plausível. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Páginas de ofertas além disso são quase sempre repetição. */
const MAX_PAGE = 5;

/**
 * Lê valor monetário do aria-label do andes-money-amount. Formatos
 * observados: "1375 reais", "1375 reais com 90 centavos", "Antes: 2699
 * reais com 99 centavos". O aria-label é mais estável que a marcação
 * visual (fração/cents mudam de classe entre layouts).
 */
function parseMoneyAria(label: string): { reais: number; centavos: number } | null {
  const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(label);
  if (!m) return null;
  const reais = Number(m[1]!.replace(/\./g, ""));
  if (!Number.isFinite(reais)) return null;
  return { reais, centavos: m[2] ? Number(m[2]) : 0 };
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
  };
  let decoded = value;
  for (let pass = 0; pass < 3; pass++) {
    const next = decoded.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, body: string) => {
      if (body.startsWith("#x")) {
        const codePoint = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      if (body.startsWith("#")) {
        const codePoint = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      return named[body.toLowerCase()] ?? entity;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function parseMarketplaceEvidence(chunk: string): { ratingStar?: number; salesLabel?: string; salesCount?: number } {
  const ratingText = /Classificação\s+([0-5](?:[.,]\d+)?)\s+de\s+5\s+estrelas/i.exec(chunk)?.[1];
  const salesLabel = /\|\s*(\+[^<|]+?\s+vendidos)/i.exec(chunk)?.[1]?.replace(/\s+/g, " ").trim();
  const ratingStar = ratingText ? Number(ratingText.replace(",", ".")) : undefined;
  const countMatch = salesLabel?.match(/\+(\d+(?:[.,]\d+)?)\s*(mil|mi|m|milhão|milhões)?/i);
  let salesCount: number | undefined;
  if (countMatch) {
    const base = Number(countMatch[1]!.replace(",", "."));
    const multiplierToken = countMatch[2] ?? "";
    const multiplier = /^(?:mi|m|milhão|milhões)$/i.test(multiplierToken)
      ? 1_000_000
      : /^mil$/i.test(multiplierToken)
        ? 1_000
        : 1;
    if (Number.isFinite(base)) salesCount = Math.round(base * multiplier);
  }
  return { ratingStar: ratingStar != null && ratingStar >= 0 && ratingStar <= 5 ? ratingStar : undefined, salesLabel, salesCount };
}

/** Extrai as ofertas de um HTML da página /ofertas. Puro — sem rede. */
export function parseDealsHtml(html: string, capturedAt: Date = new Date()): RawOffer[] {
  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  // Cada card de produto começa nesta assinatura de classe.
  const chunks = html.split("poly-card poly-card--grid-card").slice(1);

  for (const chunk of chunks) {
    const offer = parseCard(chunk, capturedAt);
    if (offer && !seen.has(offer.externalId)) {
      seen.add(offer.externalId);
      offers.push(offer);
    }
  }

  return offers;
}

function parseCard(chunk: string, capturedAt: Date): RawOffer | null {
  // Título e href vêm juntos no âncora poly-component__title.
  const anchor =
    /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(chunk);
  const titleAlt = /class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(chunk);
  const href = anchor?.[1]?.replace(/&amp;/g, "&");
  const title = (anchor?.[2] ?? titleAlt?.[1]) ? decodeHtmlEntities((anchor?.[2] ?? titleAlt?.[1])!.trim()) : undefined;
  if (!href || !title) return null;

  // Regra §4 do doc: usar sempre o href REAL do card, nunca reconstruir.
  const url = (() => {
    try {
      return new URL(href, "https://www.mercadolivre.com.br");
    } catch {
      return null;
    }
  })();
  if (!url) return null;

  // externalId: o anúncio real. Em card de catálogo (/p/MLB...?wid=MLB...),
  // o item real vem em wid=; na vitrine e em anúncio direto, o ID está no path.
  const externalId = url.searchParams.get("wid") ?? url.pathname.match(/(MLB\d{6,})/)?.[1];
  if (!externalId) return null;

  // O query do card é tracking interno do ML (pdp_filters, position) e o
  // fragment carrega deal_print_id — limpamos ambos; a afiliação adiciona
  // os parâmetros dela em cima do path limpo.
  const productUrl = `${url.origin}${url.pathname}`;

  // Preço atual: dentro de poly-price__current (preço à vista/Pix). O
  // primeiro aria-label "N reais" a partir daquele índice é o preço atual —
  // vem antes das parcelas (poly-price__installments).
  const currentSection = chunk.slice(chunk.indexOf("poly-price__current"));
  const currentLabel = /aria-label="([^"]*?reais[^"]*?)"/.exec(currentSection)?.[1];
  const current = currentLabel ? parseMoneyAria(currentLabel) : null;
  if (!current) return null;
  const priceCents = current.reais * 100 + current.centavos;
  if (priceCents <= 0) return null;

  // Preço anterior: marcado com "Antes:" (andes-money-amount--previous).
  const previousLabel = /aria-label="Antes:\s*([^"]*?reais[^"]*?)"/.exec(chunk)?.[1];
  const previous = previousLabel ? parseMoneyAria(previousLabel) : null;
  const originalPriceCents =
    previous && previous.reais > 0 ? previous.reais * 100 + previous.centavos : undefined;

  const claimedDiscountRate =
    originalPriceCents != null && originalPriceCents > priceCents
      ? 1 - priceCents / originalPriceCents
      : undefined;

  const imageUrl = /<img[^>]+src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/.exec(chunk)?.[1];

  return {
    marketplace: ML_MARKETPLACE,
    externalId,
    title,
    productUrl,
    imageUrl,
    priceCents,
    originalPriceCents,
    claimedDiscountRate,
    ...parseMarketplaceEvidence(chunk),
    capturedAt,
    source: "http_html",
    raw: { href },
  };
}


export interface MercadoLivreDealsAdapterOptions {
  /** Base da página de ofertas — injetável para teste. */
  readonly dealsUrl?: string;
  readonly ratePerSecond?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

export class MercadoLivreDealsAdapter implements CaptureAdapter {
  readonly marketplace = ML_MARKETPLACE;

  readonly capabilities: AdapterCapabilities = {
    search: false,
    offerFeed: true,
    // Atribuição por matt_word/matt_tool provada em campo (2026-08-17) —
    // ver affiliate-link.ts. O adapter de API oficial continua false.
    linkGeneration: true,
    conversionReport: false,
    source: "http_html",
  };

  private readonly dealsUrl: string;
  private readonly bucket: TokenBucket;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MercadoLivreDealsAdapterOptions = {}) {
    this.dealsUrl = opts.dealsUrl ?? DEALS_URL;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.bucket = new TokenBucket(opts.ratePerSecond ?? 0.2, undefined, opts.now ?? Date.now);
  }

  /**
   * A fonte é pública — não há credencial para validar. Confirma apenas
   * que a página responde e tem cards; falha aqui é sinal de mudança no
   * layout ou de bloqueio, e o onboarding precisa saber na hora.
   */
  async validateCredential(_cred: Credential, ctx: CaptureContext): Promise<ValidationResult> {
    try {
      const page = await this.fetchPage(1, ctx);
      const ok = page.offers.length > 0;
      return {
        ok,
        message: ok
          ? undefined
          : "página de ofertas respondeu sem ofertas — layout mudou ou acesso bloqueado",
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        checkedAt: new Date(),
      };
    }
  }

  async fetchOffers(
    _cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): Promise<OfferPage> {
    const page = cursorToPage(params.cursor);
    const result = await this.fetchPage(page, ctx);

    const offers = params.minClaimedDiscount
      ? result.offers.filter((o) => (o.claimedDiscountRate ?? 0) >= params.minClaimedDiscount!)
      : result.offers;

    const capped = params.pageSize ? offers.slice(0, params.pageSize) : offers;

    return {
      offers: capped,
      nextCursor: page < MAX_PAGE && result.offers.length > 0 ? `page:${page + 1}` : undefined,
    };
  }

  streamOffers(
    cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): AsyncGenerator<readonly RawOffer[], void, undefined> {
    return paginate(this, cred, params, ctx);
  }

  /**
   * Gera o link de afiliado sobre o productUrl capturado. Estratégia
   * `matt_full`, verificada em campo (2026-08-17). Se `subIds[0]` vier
   * preenchido, entra como sufixo do matt_word — é a nossa telemetria
   * própria de cliques (o portal só agrega, e com latência).
   */
  async buildAffiliateLink(
    _cred: Credential,
    productUrl: string,
    tag: AffiliateTag,
    _ctx: CaptureContext,
  ): Promise<string> {
    const itemId = productUrl.match(/(MLB\d{6,})/)?.[1] ?? "";
    const built = buildLink({
      productUrl,
      itemId,
      trackingId: tag.trackingId,
      toolId: tag.toolId,
      subId: tag.subIds?.[0],
    });
    if (!built) {
      throw new CaptureError({
        kind: "marketplace_error",
        marketplace: ML_MARKETPLACE,
        message: "não há estratégia de link verificada — ver affiliate-link.ts",
      });
    }
    return built.url;
  }

  private async fetchPage(page: number, ctx: CaptureContext): Promise<{ offers: RawOffer[] }> {
    const url = page > 1 ? `${this.dealsUrl}?page=${page}` : this.dealsUrl;
    return withRetry(
      async () => {
        await this.bucket.acquire(ctx.signal);
        const response = await this.fetchImpl(url, {
          headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
          signal: ctx.signal,
        });

        if (response.status === 429) {
          throw new CaptureError({
            kind: "rate_limit",
            marketplace: ML_MARKETPLACE,
            message: "página de ofertas do Mercado Livre limitou as requisições",
            vendorCode: 429,
          });
        }

        if (!response.ok) {
          throw new CaptureError({
            kind: "transport",
            marketplace: ML_MARKETPLACE,
            message: `página de ofertas respondeu HTTP ${response.status}`,
            vendorCode: response.status,
          });
        }

        const html = await response.text();
        const offers = parseDealsHtml(html);
        if (offers.length === 0 && page === 1) {
          // Primeira página sem nenhum card parseável é sinal forte de
          // mudança de layout — melhor gritar do que capturar zero em silêncio.
          throw new CaptureError({
            kind: "malformed_response",
            marketplace: ML_MARKETPLACE,
            message: "nenhuma oferta extraída da página de ofertas — layout mudou?",
          });
        }
        return { offers };
      },
      { signal: ctx.signal, maxAttempts: 3 },
    );
  }
}

function cursorToPage(cursor?: string): number {
  if (!cursor) return 1;
  const m = /^page:(\d+)$/.exec(cursor);
  const page = m ? Number(m[1]) : NaN;
  return Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}
