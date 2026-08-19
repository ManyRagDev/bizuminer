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
import { MARKETPLACE, ShopeeClient, type ShopeeClientOptions, type ShopeeCredentialFields } from "./client.ts";
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
    const page = cursorToPage(params.cursor);
    const limit = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const data = await this.client.request<ShopeeProductOfferResponse>(
      fields,
      PRODUCT_OFFER_QUERY,
      {
        keyword: params.keyword ?? null,
        shopId: params.shopId ? Number(params.shopId) : null,
        page,
        limit,
        // 2 = ordenação por comissão; mantido explícito para não depender do padrão.
        sortType: 2,
      },
      ctx,
    );

    const nodes = data.productOfferV2?.nodes ?? [];
    const capturedAt = new Date();
    const { offers, skipped } = mapProductNodes(nodes, capturedAt);

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
      nextCursor: hasNext ? pageToCursor(page + 1) : undefined,
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
function pageToCursor(page: number): string {
  return `page:${page}`;
}

function cursorToPage(cursor?: string): number {
  if (!cursor) return 1;
  const match = /^page:(\d+)$/.exec(cursor);
  const page = match ? Number(match[1]) : NaN;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export { MARKETPLACE as SHOPEE_MARKETPLACE };
