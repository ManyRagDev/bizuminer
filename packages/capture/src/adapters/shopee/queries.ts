/**
 * Documentos GraphQL da Shopee Affiliate Open API.
 *
 * Endpoint: https://open-api.affiliate.shopee.com.br/graphql
 *
 * ProductOffer e ShortLink conferidos na documentação oficial em novembro de 2026.
 * A API pode mudar sem aviso — por isso o mapeamento (mapper.ts) é defensivo e
 * nenhum campo além de itemId e productName é tratado como obrigatório.
 */

import { CaptureError } from "../../errors.ts";

const PRODUCT_OFFER_FIELDS = /* GraphQL */ `
      nodes {
        itemId
        shopId
        productName
        productLink
        offerLink
        imageUrl
        priceMin
        priceMax
        priceDiscountRate
        commissionRate
        sellerCommissionRate
        shopeeCommissionRate
        commission
        sales
        ratingStar
        productCatIds
        periodStartTime
        periodEndTime
      }
      pageInfo {
        page
        limit
        hasNextPage
      }
`;

/**
 * Ofertas de produto. É o endpoint principal de captura.
 * Devolve preço atual, desconto declarado e comissão.
 */
export const PRODUCT_OFFER_QUERY = /* GraphQL */ `
  query ProductOffer(
    $keyword: String
    $shopId: Int64
    $productCatId: Int
    $page: Int
    $limit: Int
    $sortType: Int
  ) {
    productOfferV2(
      keyword: $keyword
      shopId: $shopId
      productCatId: $productCatId
      page: $page
      limit: $limit
      sortType: $sortType
    ) {
      ${PRODUCT_OFFER_FIELDS}
    }
  }
`;

const PRODUCT_ARGUMENT_TYPES = {
  keyword: "String", shopId: "Int64", productCatId: "Int", page: "Int", limit: "Int", sortType: "Int",
} as const;

function invalidLiteral(): never {
  throw new CaptureError({ kind: "marketplace_error", marketplace: "shopee", message: "graphql_input_invalid" });
}

function stringLiteral(value: unknown): string {
  if (typeof value !== "string") invalidLiteral();
  return JSON.stringify(value);
}

/** Only this fixed operation can be built; callers supply values, never GraphQL names or syntax. */
export function buildProductOfferQuery(values: Record<string, unknown>): string {
  if (Object.keys(values).some((key) => !Object.hasOwn(PRODUCT_ARGUMENT_TYPES, key))) invalidLiteral();
  // listType belongs to the separate matchId mode, not these general search filters.
  // 1=relevance (keyword only), 2=sold, 3=price descending, 4=price ascending, 5=commission descending.
  if (values.sortType != null && (![1, 2, 3, 4, 5].includes(values.sortType as number)
    || (values.sortType === 1 && (typeof values.keyword !== "string" || !values.keyword.trim())))) invalidLiteral();
  const args: string[] = [];
  for (const [name, type] of Object.entries(PRODUCT_ARGUMENT_TYPES)) {
    const value = values[name];
    if (value === null || value === undefined) continue;
    let literal: string;
    if (type === "String") literal = stringLiteral(value);
    else {
      if (typeof value !== "number" || !Number.isSafeInteger(value)
        || (type === "Int" && (value < -2147483648 || value > 2147483647))) invalidLiteral();
      literal = String(value);
    }
    args.push(`${name}: ${literal}`);
  }
  return `query ProductOffer { productOfferV2${args.length ? `(${args.join(", ")})` : ""} {${PRODUCT_OFFER_FIELDS}} }`;
}

/** GraphQL input object keys are fixed; every URL and tracking value is a quoted string literal. */
export function buildGenerateShortLinkMutation(input: { originUrl: string; subIds: readonly string[] }): string {
  if (Object.keys(input).some((key) => key !== "originUrl" && key !== "subIds")
    || !Array.isArray(input.subIds) || input.subIds.length > 5) invalidLiteral();
  const originUrl = stringLiteral(input.originUrl);
  const subIds = input.subIds.map(stringLiteral).join(", ");
  return `mutation GenerateShortLink { generateShortLink(input: {originUrl: ${originUrl}, subIds: [${subIds}]}) { shortLink } }`;
}

/**
 * Campanhas e ofertas especiais, incluindo relâmpago.
 * Não devolve produto individual — devolve a campanha e o link de entrada.
 */
export const SHOPEE_OFFER_QUERY = /* GraphQL */ `
  query ShopeeOffer($keyword: String, $page: Int, $limit: Int, $sortType: Int) {
    shopeeOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType) {
      nodes {
        commissionRate
        imageUrl
        offerLink
        originalLink
        offerName
        offerType
        categoryId
        collectionId
        periodStartTime
        periodEndTime
      }
      pageInfo {
        page
        limit
        hasNextPage
      }
    }
  }
`;

/**
 * Gera shortlink com rastreio. Aceita até 5 subIds.
 *
 * Usamos o primeiro subId para gravar o publication_id, o que fecha a
 * atribuição ponta a ponta: esta oferta, neste destino, gerou esta comissão.
 */
export const GENERATE_SHORT_LINK_MUTATION = /* GraphQL */ `
  mutation GenerateShortLink($input: ShortLinkInput!) {
    generateShortLink(input: $input) {
      shortLink
    }
  }
`;

/** Relatório de conversão — cliques, pedidos e comissão estimada. */
export const CONVERSION_REPORT_QUERY = /* GraphQL */ `
  query ConversionReport(
    $purchaseTimeStart: Int
    $purchaseTimeEnd: Int
    $scrollId: String
    $limit: Int
  ) {
    conversionReport(
      purchaseTimeStart: $purchaseTimeStart
      purchaseTimeEnd: $purchaseTimeEnd
      scrollId: $scrollId
      limit: $limit
    ) {
      nodes {
        purchaseTime
        clickTime
        conversionId
        shopeeCommissionCapped
        totalCommission
        orderStatus
        utmContent
        device
        items {
          itemId
          itemPrice
          qty
          itemTotalCommission
          itemSellerCommission
        }
      }
      pageInfo {
        scrollId
        hasNextPage
      }
    }
  }
`;

/** Consulta mínima usada só para verificar se a credencial responde. */
export const VALIDATE_QUERY = /* GraphQL */ `
  query Validate {
    productOfferV2(limit: 1, page: 1) {
      pageInfo {
        page
        limit
      }
    }
  }
`;
