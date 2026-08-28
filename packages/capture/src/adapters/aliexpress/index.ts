/**
 * Adapter da AliExpress — terceira implementação de `CaptureAdapter`.
 *
 * Usa exclusivamente a Open Platform oficial (esquema TOP), com a
 * especificação determinada empiricamente pela espiga
 * (`bin/aliexpress-probe.ts`, 28/08/2026) e não inferida de documentação.
 * Ver `client.ts` para o registro do que foi testado.
 *
 * Este arquivo é a prova do que M-R5 prometia: adicionar um marketplace é
 * escrever arquivo novo. `sweep()`, o store e a vitrine não mudaram.
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
import {
  AliExpressClient,
  MARKETPLACE,
  type AliExpressClientOptions,
  type AliExpressCredentialFields,
} from "./client.ts";
import { mapProductNodes, type AliExpressProductQueryResponse } from "./mapper.ts";

/**
 * Teto por página. A FAQ do Portals cita 50 itens/página e até 100 páginas
 * por busca (5.000 itens), recomendando particionar por faixa de preço acima
 * disso — por isso não tentamos varrer o catálogo inteiro numa rodagem.
 */
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 50;

/** Moeda/idioma/país do pedido. A moeda é verificada no mapper. */
const TARGET_CURRENCY = "BRL";
const TARGET_LANGUAGE = "PT";
const SHIP_TO_COUNTRY = "BR";

const METHOD_PRODUCT_QUERY = "aliexpress.affiliate.product.query";
const METHOD_LINK_GENERATE = "aliexpress.affiliate.link.generate";

export class AliExpressAdapter implements CaptureAdapter {
  readonly marketplace = MARKETPLACE;

  readonly capabilities: AdapterCapabilities = {
    search: true,
    offerFeed: true,
    linkGeneration: true,
    conversionReport: false,
    source: "official_api",
  };

  private readonly client: AliExpressClient;

  constructor(opts: AliExpressClientOptions = {}) {
    this.client = new AliExpressClient(opts);
  }

  async validateCredential(cred: Credential, ctx: CaptureContext): Promise<ValidationResult> {
    const fields = readCredential(cred);
    try {
      await this.client.request<AliExpressProductQueryResponse>(
        fields,
        METHOD_PRODUCT_QUERY,
        { keywords: "teste", page_no: "1", page_size: "1", target_currency: TARGET_CURRENCY },
        ctx,
      );
      return { ok: true, checkedAt: new Date() };
    } catch (err) {
      if (err instanceof CaptureError && err.kind === "auth") {
        return { ok: false, message: "credencial rejeitada pela AliExpress", checkedAt: new Date() };
      }
      // Indisponibilidade momentânea não é credencial inválida — marcar como
      // inválida geraria alerta falso e o dono perderia confiança no aviso.
      throw err;
    }
  }

  async fetchOffers(cred: Credential, params: FetchParams, ctx: CaptureContext): Promise<OfferPage> {
    const fields = readCredential(cred);
    const page = cursorToPage(params.cursor);
    const limit = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const business: Record<string, string> = {
      page_no: String(page),
      page_size: String(limit),
      target_currency: TARGET_CURRENCY,
      target_language: TARGET_LANGUAGE,
      ship_to_country: SHIP_TO_COUNTRY,
    };
    if (params.keyword) business.keywords = params.keyword;
    // O tracking_id vai no pedido para que o `promotion_link` devolvido já
    // venha atribuído à nossa conta. Sem ele a API responde igual, mas o
    // link não gera comissão — falha silenciosa e cara.
    if (fields.trackingId) business.tracking_id = fields.trackingId;

    const payload = await this.client.request<AliExpressProductQueryResponse>(
      fields,
      METHOD_PRODUCT_QUERY,
      business,
      ctx,
    );

    const result = payload.aliexpress_affiliate_product_query_response?.resp_result?.result;
    const nodes = result?.products?.product ?? [];
    const capturedAt = new Date();
    const { offers, skipped, skippedByCurrency } = mapProductNodes(nodes, capturedAt, TARGET_CURRENCY);

    if (skipped > 0) {
      ctx.log({
        level: "warn",
        msg: "ofertas descartadas por campos obrigatórios ausentes",
        data: { skipped, received: nodes.length, page },
      });
    }
    if (skippedByCurrency > 0) {
      // Sintoma de pedido mal montado (target_currency perdido), não de
      // oferta ruim. Merece nível de erro: silenciar isso deixaria o
      // catálogo encolher sem explicação.
      ctx.log({
        level: "error",
        msg: "ofertas descartadas por moeda divergente — verificar target_currency do pedido",
        data: { skippedByCurrency, esperada: TARGET_CURRENCY, received: nodes.length, page },
      });
    }

    const filtered =
      params.minClaimedDiscount != null
        ? offers.filter((o) => (o.claimedDiscountRate ?? 0) >= params.minClaimedDiscount!)
        : offers;

    // A API informa o total; paramos quando a página veio incompleta.
    const hasNext = nodes.length === limit;

    return { offers: filtered, nextCursor: hasNext ? pageToCursor(page + 1) : undefined };
  }

  streamOffers(
    cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): AsyncGenerator<readonly RawOffer[], void, undefined> {
    return paginate(this, cred, params, ctx);
  }

  /**
   * Gera o link rastreável. Diferente da Shopee (que aceita subIds por
   * publicação), a atribuição da AliExpress é pelo `tracking_id` do canal —
   * por isso ele é OBRIGATÓRIO aqui e falha fechado se ausente: gerar link
   * sem atribuição é pior que não gerar, porque parece que funcionou.
   */
  async buildAffiliateLink(
    cred: Credential,
    productUrl: string,
    tag: AffiliateTag,
    ctx: CaptureContext,
  ): Promise<string> {
    const fields = readCredential(cred);
    const trackingId = tag.trackingId || fields.trackingId;
    if (!trackingId) {
      throw new CaptureError({
        kind: "auth",
        marketplace: MARKETPLACE,
        message: "tracking_id ausente: link sem atribuição não gera comissão",
      });
    }

    const payload = await this.client.request<{
      aliexpress_affiliate_link_generate_response?: {
        resp_result?: {
          result?: { promotion_links?: { promotion_link?: Array<{ promotion_link?: string }> } };
        };
      };
    }>(
      fields,
      METHOD_LINK_GENERATE,
      { promotion_link_type: "0", source_values: productUrl, tracking_id: trackingId },
      ctx,
    );

    const link =
      payload.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links
        ?.promotion_link?.[0]?.promotion_link;

    if (!link) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: MARKETPLACE,
        message: "AliExpress não devolveu promotion_link",
      });
    }
    return link;
  }
}

/** Lê e valida a credencial. A mensagem nunca inclui o valor — só o que falta. */
function readCredential(cred: Credential): AliExpressCredentialFields {
  const appKey = cred.secret.appKey;
  const appSecret = cred.secret.appSecret;

  const missing: string[] = [];
  if (!appKey) missing.push("appKey");
  if (!appSecret) missing.push("appSecret");

  if (!appKey || !appSecret) {
    throw new CaptureError({
      kind: "auth",
      marketplace: MARKETPLACE,
      message: `credencial da AliExpress incompleta: faltam ${missing.join(", ")}`,
    });
  }

  return { appKey, appSecret, trackingId: cred.secret.trackingId };
}

/** A AliExpress pagina por número; o contrato expõe cursor opaco. */
function pageToCursor(page: number): string {
  return `page:${page}`;
}

function cursorToPage(cursor?: string): number {
  if (!cursor) return 1;
  const match = /^page:(\d+)$/.exec(cursor);
  const page = match ? Number(match[1]) : NaN;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export { MARKETPLACE as ALIEXPRESS_MARKETPLACE };
