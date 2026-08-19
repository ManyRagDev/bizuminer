/**
 * Adapter do Mercado Livre.
 *
 * Usa a API oficial de marketplace (DevCenter, OAuth 2.0). Isso dá acesso a
 * produto, preço, imagem e vendedor — que é tudo que a captura precisa.
 *
 * NÃO gera link de afiliado: o token autentica um usuário do Mercado Livre,
 * não um programa de afiliados. A própria empresa confirmou publicamente que
 * o programa de afiliados não expõe API. Por isso `linkGeneration: false`.
 *
 * A afiliação continua sendo responsabilidade do cliente, pelo portal.
 */

import { CaptureError } from "../../errors.ts";
import { toCents } from "../../money.ts";
import { paginate } from "../../types.ts";
import type {
  AdapterCapabilities,
  CaptureAdapter,
  CaptureContext,
  Credential,
  FetchParams,
  OfferPage,
  RawOffer,
  ValidationResult,
} from "../../types.ts";
import { TokenBucket, withRetry } from "../../rate-limit.ts";
import {
  ML_API_BASE,
  ML_MARKETPLACE,
  MercadoLivreTokenManager,
} from "./oauth.ts";

/** Teto por página aceito pela busca. */
const MAX_LIMIT = 50;
/**
 * O Mercado Livre limita o offset da busca. Passar disso devolve erro,
 * então paramos antes em vez de gerar falha evitável.
 */
const MAX_OFFSET = 1000;

const SITE_ID = "MLB"; // Brasil

export interface MercadoLivreSearchItem {
  id?: string;
  title?: string;
  price?: number;
  original_price?: number | null;
  thumbnail?: string;
  permalink?: string;
  sold_quantity?: number;
  available_quantity?: number;
  category_id?: string;
  seller?: { id?: number | string; nickname?: string };
  shipping?: { free_shipping?: boolean };
}

export interface MercadoLivreSearchResponse {
  results?: MercadoLivreSearchItem[];
  paging?: { total?: number; offset?: number; limit?: number };
}

export interface MercadoLivreAdapterOptions {
  readonly tokenManager: MercadoLivreTokenManager;
  readonly apiBase?: string;
  readonly ratePerSecond?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

export class MercadoLivreAdapter implements CaptureAdapter {
  readonly marketplace = ML_MARKETPLACE;

  readonly capabilities: AdapterCapabilities = {
    search: true,
    offerFeed: false,
    // O token é de usuário, não de afiliado. Ver cabeçalho.
    linkGeneration: false,
    conversionReport: false,
    source: "official_api",
  };

  private readonly tokens: MercadoLivreTokenManager;
  private readonly apiBase: string;
  private readonly bucket: TokenBucket;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MercadoLivreAdapterOptions) {
    this.tokens = opts.tokenManager;
    this.apiBase = opts.apiBase ?? ML_API_BASE;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.bucket = new TokenBucket(opts.ratePerSecond ?? 5, undefined, opts.now ?? Date.now);
  }

  async validateCredential(_cred: Credential, ctx: CaptureContext): Promise<ValidationResult> {
    try {
      await this.get<{ id?: number }>("/users/me", ctx);
      return { ok: true, checkedAt: new Date() };
    } catch (err) {
      if (err instanceof CaptureError && err.kind === "auth") {
        return {
          ok: false,
          message: "token do Mercado Livre inválido — refazer autorização",
          checkedAt: new Date(),
        };
      }
      throw err;
    }
  }

  async fetchOffers(
    _cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): Promise<OfferPage> {
    const limit = Math.min(params.pageSize ?? MAX_LIMIT, MAX_LIMIT);
    const offset = cursorToOffset(params.cursor);

    if (!params.keyword) {
      throw new CaptureError({
        kind: "marketplace_error",
        marketplace: ML_MARKETPLACE,
        message: "a busca do Mercado Livre exige palavra-chave",
      });
    }

    const query = new URLSearchParams({
      q: params.keyword,
      limit: String(limit),
      offset: String(offset),
    });
    if (params.shopId) query.set("seller_id", params.shopId);

    const data = await this.get<MercadoLivreSearchResponse>(
      `/sites/${SITE_ID}/search?${query.toString()}`,
      ctx,
    );

    const items = data.results ?? [];
    const capturedAt = new Date();
    const offers: RawOffer[] = [];
    let skipped = 0;

    for (const item of items) {
      const offer = mapSearchItem(item, capturedAt);
      if (offer) offers.push(offer);
      else skipped++;
    }

    if (skipped > 0) {
      ctx.log({
        level: "warn",
        msg: "itens do Mercado Livre descartados por campos ausentes",
        data: { skipped, received: items.length, offset },
      });
    }

    const filtered =
      params.minClaimedDiscount != null
        ? offers.filter((o) => (o.claimedDiscountRate ?? 0) >= params.minClaimedDiscount!)
        : offers;

    const total = data.paging?.total ?? 0;
    const nextOffset = offset + limit;
    const hasNext = items.length === limit && nextOffset < Math.min(total, MAX_OFFSET);

    return {
      offers: filtered,
      nextCursor: hasNext ? `offset:${nextOffset}` : undefined,
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
   * GET autenticado com renovação automática.
   *
   * Se a API devolver 401 mesmo com token que julgávamos válido — relógio
   * fora de sincronia, token revogado do outro lado — renova uma vez e repete.
   * Uma vez só: 401 persistente é problema de autorização, não de expiração,
   * e repetir em laço só queima requisição.
   */
  private async get<T>(path: string, ctx: CaptureContext, isRetry = false): Promise<T> {
    return withRetry(
      async () => {
        await this.bucket.acquire(ctx.signal);
        const accessToken = await this.tokens.getAccessToken();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const onAbort = () => controller.abort();
        ctx.signal?.addEventListener("abort", onAbort, { once: true });

        let response: Response;
        try {
          response = await this.fetchImpl(`${this.apiBase}${path}`, {
            headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
            signal: controller.signal,
          });
        } catch (cause) {
          if (ctx.signal?.aborted) {
            throw new CaptureError({
              kind: "aborted",
              marketplace: ML_MARKETPLACE,
              message: "captura cancelada",
            });
          }
          throw new CaptureError({
            kind: "transport",
            marketplace: ML_MARKETPLACE,
            message: "falha de rede ao chamar o Mercado Livre",
            cause,
          });
        } finally {
          clearTimeout(timer);
          ctx.signal?.removeEventListener("abort", onAbort);
        }

        if (response.status === 401 && !isRetry) {
          await this.tokens.forceRefresh();
          return this.get<T>(path, ctx, true);
        }

        if (response.status === 401 || response.status === 403) {
          throw new CaptureError({
            kind: "auth",
            marketplace: ML_MARKETPLACE,
            message: `acesso negado pelo Mercado Livre (HTTP ${response.status})`,
            vendorCode: response.status,
          });
        }

        if (response.status === 429) {
          throw new CaptureError({
            kind: "rate_limit",
            marketplace: ML_MARKETPLACE,
            message: "limite de requisições do Mercado Livre atingido",
            vendorCode: 429,
          });
        }

        if (response.status >= 500) {
          throw new CaptureError({
            kind: "transport",
            marketplace: ML_MARKETPLACE,
            message: `erro do servidor do Mercado Livre (HTTP ${response.status})`,
            vendorCode: response.status,
          });
        }

        if (!response.ok) {
          throw new CaptureError({
            kind: "marketplace_error",
            marketplace: ML_MARKETPLACE,
            message: `resposta inesperada do Mercado Livre (HTTP ${response.status})`,
            vendorCode: response.status,
          });
        }

        try {
          return (await response.json()) as T;
        } catch (cause) {
          throw new CaptureError({
            kind: "malformed_response",
            marketplace: ML_MARKETPLACE,
            message: "resposta do Mercado Livre não é JSON válido",
            cause,
          });
        }
      },
      { signal: ctx.signal, maxAttempts: 4 },
    );
  }
}

/**
 * Converte item da busca em oferta normalizada.
 *
 * Diferente da Shopee, o Mercado Livre informa `original_price` diretamente —
 * mas ele vem `null` na maioria dos itens, e quando vem preenchido é o preço
 * que o vendedor declara. Continua sendo desconto DECLARADO, não verificado.
 */
export function mapSearchItem(
  item: MercadoLivreSearchItem,
  capturedAt: Date = new Date(),
): RawOffer | null {
  const externalId = item.id?.trim();
  const title = item.title?.trim();
  const productUrl = item.permalink;

  if (!externalId || !title || !productUrl) return null;

  const priceCents = toCents(item.price);
  if (priceCents == null || priceCents <= 0) return null;

  const originalPriceCents = toCents(item.original_price ?? undefined);

  const claimedDiscountRate =
    originalPriceCents != null && originalPriceCents > priceCents
      ? 1 - priceCents / originalPriceCents
      : undefined;

  return {
    marketplace: ML_MARKETPLACE,
    externalId,
    externalShopId: item.seller?.id != null ? String(item.seller.id) : undefined,
    title,
    productUrl,
    imageUrl: item.thumbnail || undefined,
    categoryPath: item.category_id ? [item.category_id] : undefined,
    priceCents,
    originalPriceCents,
    claimedDiscountRate,
    salesCount: typeof item.sold_quantity === "number" ? item.sold_quantity : undefined,
    capturedAt,
    source: "official_api",
    raw: item,
  };
}

function cursorToOffset(cursor?: string): number {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  const offset = match ? Number(match[1]) : NaN;
  return Number.isFinite(offset) && offset >= 0 ? Math.min(offset, MAX_OFFSET) : 0;
}

export { ML_MARKETPLACE };
