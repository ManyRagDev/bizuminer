/** Reconsulta exata por ID nas APIs oficiais. Ausência ou resposta inválida não vira preço. */
import type { CaptureContext, Credential, RawOffer } from "../../capture/src/types.ts";
import { ShopeeClient } from "../../capture/src/adapters/shopee/client.ts";
import { mapProductNodes as mapShopeeNodes, type ShopeeProductOfferResponse } from "../../capture/src/adapters/shopee/mapper.ts";

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

export type MissingReason = "absent" | "id_mismatch" | "invalid_price" | "currency";
export type LookupResult = { readonly offer: RawOffer } | { readonly offer: null; readonly reason: MissingReason };

export class MonitoringLookup {
  private readonly shopee: ShopeeClient;

  constructor(options: { maxAttempts?: number } = {}) {
    this.shopee = new ShopeeClient(options);
  }

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
      return offer ? { offer: { ...offer, offerEvidence: offer.offerEvidence?.version === 2
        ? { ...offer.offerEvidence, observationMethod: "id_lookup" } : offer.offerEvidence } }
        : { offer: null, reason: "invalid_price" };
    }
    throw new Error(`reconsulta por ID indisponível para ${cred.marketplace}`);
  }
}
