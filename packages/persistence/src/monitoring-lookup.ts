/** Reconsulta exata por ID nas APIs oficiais. Ausência ou resposta inválida não vira preço. */
import type { CaptureContext, Credential, RawOffer } from "../../capture/src/types.ts";
import { ShopeeClient } from "../../capture/src/adapters/shopee/client.ts";
import { mapProductNodes as mapShopeeNodes, type ShopeeProductOfferResponse } from "../../capture/src/adapters/shopee/mapper.ts";
import { AliExpressClient } from "../../capture/src/adapters/aliexpress/client.ts";
import { mapProductNodes as mapAliNodes, type AliExpressProductNode } from "../../capture/src/adapters/aliexpress/mapper.ts";

const SHOPEE_BY_ID_QUERY = /* GraphQL */ `
  query MonitorProduct($itemId: Int64) {
    productOfferV2(itemId: $itemId, page: 1, limit: 1) {
      nodes {
        itemId shopId productName productLink offerLink imageUrl price priceMin priceMax
        priceDiscountRate commissionRate sellerCommissionRate shopeeCommissionRate
        commission sales ratingStar productCatIds periodStartTime periodEndTime
      }
    }
  }
`;

interface AliDetailResponse {
  aliexpress_affiliate_productdetail_get_response?: {
    resp_result?: {
      resp_code?: number;
      result?: { products?: { product?: AliExpressProductNode[] } };
    };
  };
}

export type MissingReason = "absent" | "id_mismatch" | "invalid_price" | "currency";
export type LookupResult = { readonly offer: RawOffer } | { readonly offer: null; readonly reason: MissingReason };

export class MonitoringLookup {
  private readonly shopee = new ShopeeClient();
  // Retenção consulta IDs em sequência. O padrão do adapter (2/s) estourou
  // o limite real da conta no GitHub Actions; espaçar a 0,4/s evita a rajada.
  private readonly aliexpress = new AliExpressClient({ ratePerSecond: 0.4 });

  async byId(cred: Credential, externalId: string, ctx: CaptureContext): Promise<RawOffer | null> {
    return (await this.byIdDetailed(cred, externalId, ctx)).offer;
  }

  async byIdDetailed(cred: Credential, externalId: string, ctx: CaptureContext): Promise<LookupResult> {
    if (cred.marketplace === "shopee") {
      const data = await this.shopee.request<ShopeeProductOfferResponse>(
        { appId: String(cred.secret.appId), appSecret: String(cred.secret.appSecret) },
        SHOPEE_BY_ID_QUERY,
        { itemId: externalId },
        ctx,
      );
      const nodes = data.productOfferV2?.nodes ?? [];
      if (nodes.length === 0) return { offer: null, reason: "absent" };
      if (!nodes.some((node) => String(node.itemId) === externalId)) return { offer: null, reason: "id_mismatch" };
      const offer = mapShopeeNodes(nodes, new Date()).offers.find((item) => item.externalId === externalId);
      return offer ? { offer } : { offer: null, reason: "invalid_price" };
    }
    if (cred.marketplace === "aliexpress") {
      const trackingId = String(cred.secret.trackingId ?? "");
      if (!trackingId) throw new Error("tracking ID da AliExpress ausente");
      const data = await this.aliexpress.request<AliDetailResponse>(
        { appKey: String(cred.secret.appKey), appSecret: String(cred.secret.appSecret), trackingId },
        "aliexpress.affiliate.productdetail.get",
        { product_ids: externalId, target_currency: "BRL", target_language: "PT", country: "BR", tracking_id: trackingId },
        ctx,
      );
      const result = data.aliexpress_affiliate_productdetail_get_response?.resp_result;
      if (result?.resp_code !== 200) throw new Error("consulta de detalhe da AliExpress não confirmou sucesso");
      const nodes = result.result?.products?.product ?? [];
      if (nodes.length === 0) return { offer: null, reason: "absent" };
      if (!nodes.some((node) => String(node.product_id) === externalId)) return { offer: null, reason: "id_mismatch" };
      const mapped = mapAliNodes(nodes, new Date(), "BRL");
      const offer = mapped.offers.find((item) => item.externalId === externalId);
      return offer ? { offer } : { offer: null, reason: mapped.skippedByCurrency > 0 ? "currency" : "invalid_price" };
    }
    throw new Error(`reconsulta por ID indisponível para ${cred.marketplace}`);
  }
}
