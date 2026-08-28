/**
 * Mapeamento da resposta da AliExpress para `RawOffer`.
 *
 * ARMADILHA CENTRAL DESTE ARQUIVO — MOEDA.
 *
 * A resposta traz o mesmo preço em DUAS moedas, e os campos de nome mais
 * óbvio são os errados. Observado na espiga de 28/08/2026, num produto real:
 *
 *   sale_price            = 119.82   sale_price_currency            = CNY
 *   original_price        = 266.26   original_price_currency        = CNY
 *   target_sale_price     =  99.69   target_sale_price_currency     = BRL
 *   target_original_price = 221.53   target_original_price_currency = BRL
 *
 * Só os campos `target_*` respeitam o `target_currency=BRL` do pedido. Ler
 * `sale_price` gravaria R$ 119,82 num produto que custa R$ 99,69 — e o
 * histórico passaria a rastrear yuan rotulado como real. Num produto cujo
 * argumento é acompanhar preço de verdade, esse bug é silencioso, plausível
 * e corrosivo. Por isso este arquivo NUNCA lê os campos sem prefixo, e
 * `assertMoedaEsperada` recusa a oferta se a moeda declarada não for a que
 * pedimos — melhor descartar uma oferta do que gravar preço em moeda errada.
 */

import { toCents, toRate } from "../../money.ts";
import type { RawOffer } from "../../types.ts";
import { MARKETPLACE } from "./client.ts";

/** Formato bruto de um produto. Todos os campos opcionais: a API pode mudar. */
export interface AliExpressProductNode {
  product_id?: number | string;
  product_title?: string;
  product_detail_url?: string;
  product_main_image_url?: string;
  promotion_link?: string;
  /** Preços na moeda ALVO (a que pedimos). São estes que valem. */
  target_sale_price?: string | number;
  target_sale_price_currency?: string;
  target_original_price?: string | number;
  target_original_price_currency?: string;
  /** Desconto declarado pelo anúncio, string tipo "54%". */
  discount?: string;
  commission_rate?: string;
  /** Volume de vendas recente. */
  lastest_volume?: number | string;
  /** Percentual de avaliações positivas ("100.0%") — NÃO é nota de 0 a 5. */
  evaluate_rate?: string;
  first_level_category_name?: string;
  second_level_category_name?: string;
  shop_id?: number | string;
}

export interface AliExpressProductQueryResponse {
  aliexpress_affiliate_product_query_response?: {
    resp_result?: {
      resp_code?: number;
      resp_msg?: string;
      result?: {
        current_record_count?: number;
        total_record_count?: number;
        current_page_no?: number;
        products?: { product?: AliExpressProductNode[] };
      };
    };
  };
}

/** Converte "54%" ou "7.0%" em fração 0..1. Devolve undefined se não fizer sentido. */
export function percentToRate(value: unknown): number | undefined {
  if (typeof value !== "string") return toRate(value);
  // Vazio é "não informado", não "zero por cento" — e zero é uma afirmação.
  // Sem esta guarda cairia em toRate(""), que devolve 0 porque Number("")===0.
  if (value.trim() === "") return undefined;
  const m = /^\s*(-?[\d.,]+)\s*%\s*$/.exec(value);
  if (!m) return toRate(value);
  const n = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(n)) return undefined;
  const rate = n / 100;
  return rate >= 0 && rate <= 1 ? rate : undefined;
}

/**
 * Confere que a moeda do campo é a esperada. Retorna false para descartar a
 * oferta. Não lança: uma oferta com moeda inesperada não pode derrubar o lote.
 */
function moedaConfere(declarada: string | undefined, esperada: string): boolean {
  if (!declarada) return false; // sem declaração explícita, não arriscamos
  return declarada.trim().toUpperCase() === esperada.toUpperCase();
}

export interface MapResult {
  readonly offers: RawOffer[];
  readonly skipped: number;
  /** Descartadas por moeda divergente — sintoma de pedido mal montado. */
  readonly skippedByCurrency: number;
}

export function mapProductNodes(
  nodes: readonly AliExpressProductNode[],
  capturedAt: Date,
  moedaEsperada: string,
): MapResult {
  const offers: RawOffer[] = [];
  let skipped = 0;
  let skippedByCurrency = 0;

  for (const node of nodes) {
    const externalId = node.product_id != null ? String(node.product_id) : undefined;
    const title = node.product_title?.trim();
    // `promotion_link` é o link afiliado que a própria query devolve; o
    // detail_url é o link cru. Preferimos o afiliado quando existir.
    const productUrl = node.promotion_link?.trim() || node.product_detail_url?.trim();

    if (!externalId || !title || !productUrl) {
      skipped++;
      continue;
    }

    if (!moedaConfere(node.target_sale_price_currency, moedaEsperada)) {
      skippedByCurrency++;
      continue;
    }

    const priceCents = toCents(node.target_sale_price);
    if (priceCents === undefined || priceCents <= 0) {
      skipped++;
      continue;
    }

    // Preço "de": só entra se vier na MESMA moeda e for maior que o atual.
    const originalDeclared = toCents(node.target_original_price);
    const originalPriceCents =
      moedaConfere(node.target_original_price_currency, moedaEsperada) &&
      originalDeclared !== undefined &&
      originalDeclared > priceCents
        ? originalDeclared
        : undefined;

    const categoryPath = [node.first_level_category_name, node.second_level_category_name]
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0);

    // Volume é contagem, não dinheiro: nada de toCents aqui (multiplicaria
    // por 100 e transformaria 25 vendas em 2.500).
    const volumeBruto = Number(node.lastest_volume);
    const salesCount =
      node.lastest_volume != null && Number.isFinite(volumeBruto) && volumeBruto >= 0
        ? Math.trunc(volumeBruto)
        : undefined;

    offers.push({
      marketplace: MARKETPLACE,
      externalId,
      externalShopId: node.shop_id != null ? String(node.shop_id) : undefined,
      title,
      productUrl,
      imageUrl: node.product_main_image_url?.trim() || undefined,
      categoryPath: categoryPath.length > 0 ? categoryPath : undefined,
      priceCents,
      originalPriceCents,
      claimedDiscountRate: percentToRate(node.discount),
      commissionRate: percentToRate(node.commission_rate),
      // ratingStar fica AUSENTE de propósito: `evaluate_rate` é percentual de
      // avaliações positivas ("100.0%"), não média de 0 a 5 como no ML e na
      // Shopee. Converter seria inventar equivalência que a loja não afirma —
      // e o produto inteiro se sustenta em não afirmar o que não se mediu.
      salesCount,
      capturedAt,
      source: "official_api",
      raw: node,
    });
  }

  return { offers, skipped, skippedByCurrency };
}
