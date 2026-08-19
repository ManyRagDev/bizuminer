/**
 * Documentos GraphQL da Shopee Affiliate Open API.
 *
 * Endpoint: https://open-api.affiliate.shopee.com.br/graphql
 *
 * Os campos abaixo refletem a documentação pública consultada em julho de 2026.
 * A API pode mudar sem aviso — por isso o mapeamento (mapper.ts) é defensivo e
 * nenhum campo além de itemId e productName é tratado como obrigatório.
 */

/**
 * Ofertas de produto. É o endpoint principal de captura.
 * Devolve preço atual, desconto declarado e comissão.
 */
export const PRODUCT_OFFER_QUERY = /* GraphQL */ `
  query ProductOffer(
    $keyword: String
    $shopId: Int64
    $page: Int
    $limit: Int
    $sortType: Int
  ) {
    productOfferV2(
      keyword: $keyword
      shopId: $shopId
      page: $page
      limit: $limit
      sortType: $sortType
    ) {
      nodes {
        itemId
        shopId
        productName
        productLink
        offerLink
        imageUrl
        price
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
    }
  }
`;

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
