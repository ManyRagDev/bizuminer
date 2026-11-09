/**
 * Adapter da Shopee — primeira implementação de CaptureAdapter.
 *
 * Usa exclusivamente a Open API oficial. Não faz scraping: a Seção 4.3(d) dos
 * Termos do Programa de Afiliados da Shopee proíbe expressamente extração
 * automatizada de dados, e a penalidade recairia sobre a conta de afiliado do
 * nosso cliente.
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
import { MARKETPLACE, SYSTEM_ERROR_CODE, ShopeeClient, type ShopeeClientOptions, type ShopeeCredentialFields } from "./client.ts";
import { mapProductNodes, type ShopeeProductOfferResponse } from "./mapper.ts";
import {
  GENERATE_SHORT_LINK_MUTATION,
  PRODUCT_OFFER_QUERY,
  VALIDATE_QUERY,
} from "./queries.ts";

/** Teto por página aceito pela API. Pedir mais é rejeitado. */
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 50;

export class ShopeeAdapter implements CaptureAdapter {
  readonly marketplace = MARKETPLACE;

  readonly capabilities: AdapterCapabilities = {
    search: true,
    offerFeed: true,
    linkGeneration: true,
    conversionReport: true,
    source: "official_api",
  };

  private readonly client: ShopeeClient;

  constructor(opts: ShopeeClientOptions = {}) {
    this.client = new ShopeeClient(opts);
  }

  async validateCredential(cred: Credential, ctx: CaptureContext): Promise<ValidationResult> {
    const fields = readCredential(cred);
    try {
      await this.client.request(fields, VALIDATE_QUERY, {}, ctx);
      return { ok: true, checkedAt: new Date() };
    } catch (err) {
      if (err instanceof CaptureError && err.kind === "auth") {
        return { ok: false, message: "credencial rejeitada pela Shopee", checkedAt: new Date() };
      }
      // Falha de rede não significa credencial inválida — não marcar como
      // inválida por indisponibilidade momentânea, senão o cliente recebe
      // alerta falso e perde a confiança no aviso.
      throw err;
    }
  }

  async fetchOffers(
    cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): Promise<OfferPage> {
    const fields = readCredential(cred);
    const { page, limit: cursorLimit } = readPageCursor(params.cursor);
    const requestedLimit = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    let limit = cursorLimit ?? requestedLimit;
    let keyword: string | null = params.keyword ?? null;
    let productCatId: number | null = null;
    let listType: number | null = null;
    // 2 = ordenação por comissão/vendas
    let sortType = 2;

    if (params.sourceQuery?.kind === "department") {
      const parsedCatId = Number(params.sourceQuery.categoryId);
      if (Number.isInteger(parsedCatId) && parsedCatId > 0) {
        productCatId = parsedCatId;
        listType = 0;
      }
      if (!params.keyword) {
        keyword = null;
      }
      if (params.sourceQuery.order === "default") {
        sortType = 0;
      } else if (params.sourceQuery.order === "sales") {
        sortType = 2;
      } else if (params.sourceQuery.order === "discount") {
        sortType = 1;
      }
    }

    const request = (limit: number, maxAttempts?: number) => this.client.request<ShopeeProductOfferResponse>(
      fields,
      PRODUCT_OFFER_QUERY,
      {
        keyword,
        shopId: params.shopId ? Number(params.shopId) : null,
        productCatId,
        listType,
        page,
        limit,
        sortType,
      },
      ctx,
      maxAttempts,
    );

    let data;
    try {
      data = await request(limit);
    } catch (error) {
      if (!(error instanceof CaptureError) || error.vendorCode !== SYSTEM_ERROR_CODE
        || page !== 1 || params.cursor || limit <= 10) throw error;
      // Only the first page can change size. The cursor pins the new page boundaries.
      const originalLimit = limit;
      limit = originalLimit > 20 ? 20 : 10;
      ctx.log({ level: "warn", msg: "Shopee retornou erro de sistema; tentando página menor", data: { originalLimit, limit } });
      data = await request(limit, 2);
    }

    const nodes = data.productOfferV2?.nodes;
    if (!Array.isArray(nodes)) {
      throw new CaptureError({ kind: "malformed_response", marketplace: MARKETPLACE, message: "Shopee não devolveu a lista de ofertas" });
    }
    const capturedAt = new Date();
    const { offers, skipped } = mapProductNodes(nodes, capturedAt);

    if (params.sourceQuery?.kind === "department") {
      const requestedCatId = params.sourceQuery.categoryId;
      const matched = nodes.filter((n) =>
        n.productCatIds?.some((id) => String(id) === requestedCatId),
      ).length;
      ctx.log({
        level: "info",
        msg: "consulta Shopee por departamento executada",
        data: {
          categoryId: requestedCatId,
          order: params.sourceQuery.order ?? "sales",
          received: nodes.length,
          matchedCategory: matched,
          page,
        },
      });
    }

    if (skipped > 0) {
      ctx.log({
        level: "warn",
        msg: "ofertas descartadas por campos obrigatórios ausentes",
        data: { skipped, received: nodes.length, page },
      });
    }

    // Filtro de desconto aplicado após o mapeamento porque a API não
    // oferece esse parâmetro na query.
    const filtered =
      params.minClaimedDiscount != null
        ? offers.filter(
            (o) => (o.claimedDiscountRate ?? 0) >= params.minClaimedDiscount!,
          )
        : offers;

    const hasNext = data.productOfferV2?.pageInfo?.hasNextPage ?? nodes.length === limit;

    return {
      offers: filtered,
      nextCursor: hasNext ? pageToCursor(page + 1, limit === requestedLimit ? undefined : limit) : undefined,
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
   * Gera o shortlink rastreável do cliente.
   *
   * O primeiro subId carrega o publication_id, o que fecha a atribuição:
   * esta oferta, publicada neste destino, gerou esta comissão. Nenhum
   * concorrente entrega esse dado.
   */
  async buildAffiliateLink(
    cred: Credential,
    productUrl: string,
    tag: AffiliateTag,
    ctx: CaptureContext,
  ): Promise<string> {
    const fields = readCredential(cred);

    const subIds = (tag.subIds ?? []).slice(0, 5);

    const data = await this.client.request<{
      generateShortLink?: { shortLink?: string };
    }>(
      fields,
      GENERATE_SHORT_LINK_MUTATION,
      { input: { originUrl: productUrl, subIds } },
      ctx,
    );

    const link = data.generateShortLink?.shortLink;
    if (!link) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: MARKETPLACE,
        message: "Shopee não devolveu shortLink",
      });
    }
    return link;
  }
}

/**
 * Lê e valida a credencial. Mensagem de erro nunca inclui o valor —
 * apenas quais chaves faltam.
 */
function readCredential(cred: Credential): ShopeeCredentialFields {
  const appId = cred.secret.appId;
  const appSecret = cred.secret.appSecret;

  const missing: string[] = [];
  if (!appId) missing.push("appId");
  if (!appSecret) missing.push("appSecret");

  if (!appId || !appSecret) {
    throw new CaptureError({
      kind: "auth",
      marketplace: MARKETPLACE,
      message: `credencial da Shopee incompleta: faltam ${missing.join(", ")}`,
    });
  }

  return { appId, appSecret };
}

/**
 * A Shopee pagina por número de página, mas o contrato expõe cursor opaco.
 * Encapsular aqui permite trocar para `scrollId` — que é o que o
 * conversionReport usa — sem mudar o núcleo.
 */
function pageToCursor(page: number, limit?: number): string {
  return limit === undefined ? `page:${page}` : `page:${page}:${limit}`;
}

function readPageCursor(cursor?: string): { page: number; limit?: number } {
  const match = /^page:(\d+)(?::(10|20))?$/.exec(cursor ?? "");
  const page = Number(match?.[1]);
  if (!Number.isSafeInteger(page) || page < 1) return { page: 1 };
  return { page, limit: match?.[2] ? Number(match[2]) : undefined };
}

export { MARKETPLACE as SHOPEE_MARKETPLACE };
