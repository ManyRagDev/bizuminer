/**
 * Mapeia a resposta da Shopee para o formato normalizado.
 *
 * Postura defensiva: apenas itemId e productName são obrigatórios. Qualquer
 * outro campo ausente vira `undefined` e a oferta segue. Um campo novo ou
 * removido pela Shopee não pode derrubar a captura de um lote inteiro —
 * esse é o modo de falha mais comum em integração com API de terceiro.
 */

import { toCents, toRate, fromEpochSeconds } from "../../money.ts";
import type { RawOffer } from "../../types.ts";
import { MARKETPLACE } from "./client.ts";

/** Formato bruto devolvido por productOfferV2. Todos os campos opcionais. */
export interface ShopeeProductNode {
  itemId?: number | string;
  shopId?: number | string;
  productName?: string;
  productLink?: string;
  offerLink?: string;
  imageUrl?: string;
  price?: number | string;
  priceMin?: number | string;
  priceMax?: number | string;
  priceDiscountRate?: number | string;
  commissionRate?: number | string;
  commission?: number | string;
  sales?: number | string;
  ratingStar?: number | string;
  productCatIds?: Array<number | string>;
  periodStartTime?: number | string;
  periodEndTime?: number | string;
}

export interface ShopeeProductOfferResponse {
  productOfferV2?: {
    nodes?: ShopeeProductNode[];
    pageInfo?: { page?: number; limit?: number; hasNextPage?: boolean };
  };
}

/**
 * Converte um nó da Shopee em oferta normalizada.
 * Devolve `null` quando faltam os campos sem os quais a oferta é inútil.
 */
export function mapProductNode(
  node: ShopeeProductNode,
  capturedAt: Date = new Date(),
): RawOffer | null {
  const externalId = node.itemId != null ? String(node.itemId) : undefined;
  const title = node.productName?.trim();

  if (!externalId || !title) return null;

  // `price` nem sempre vem; priceMin é o mais confiável para item único.
  const priceCents = toCents(node.price ?? node.priceMin);
  if (priceCents == null || priceCents <= 0) return null;

  const maxCents = toCents(node.priceMax);
  const discountRate = toRate(node.priceDiscountRate);

  // A Shopee não devolve "preço de". Derivamos a partir do desconto declarado
  // quando ele existir — marcado como declarado, não verificado. A verificação
  // real vem do nosso histórico de preço, não daqui.
  const originalPriceCents =
    discountRate != null && discountRate > 0 && discountRate < 1
      ? Math.round(priceCents / (1 - discountRate))
      : maxCents != null && maxCents > priceCents
        ? maxCents
        : undefined;

  const shopId = node.shopId != null ? String(node.shopId) : undefined;
  const productUrl = node.productLink ?? node.offerLink;
  if (!productUrl) return null;

  return {
    marketplace: MARKETPLACE,
    externalId,
    externalShopId: shopId,
    title,
    productUrl,
    imageUrl: node.imageUrl || undefined,
    categoryPath: node.productCatIds?.map(String),
    priceCents,
    originalPriceCents,
    claimedDiscountRate: discountRate,
    commissionRate: toRate(node.commissionRate),
    commissionCents: toCents(node.commission),
    salesCount: numberOrUndefined(node.sales),
    ratingStar: numberOrUndefined(node.ratingStar),
    startsAt: fromEpochSeconds(node.periodStartTime),
    endsAt: fromEpochSeconds(node.periodEndTime),
    capturedAt,
    source: "official_api",
    raw: node,
  };
}

/** Mapeia um lote, descartando nós inválidos e informando quantos caíram. */
export function mapProductNodes(
  nodes: readonly ShopeeProductNode[],
  capturedAt: Date = new Date(),
): { offers: RawOffer[]; skipped: number } {
  const offers: RawOffer[] = [];
  let skipped = 0;

  for (const node of nodes) {
    const offer = mapProductNode(node, capturedAt);
    if (offer) offers.push(offer);
    else skipped++;
  }

  return { offers, skipped };
}

function numberOrUndefined(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
