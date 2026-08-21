import { priceDifferencePercent, priceHighlight } from "./deal-signal.ts";

export type ComposerDestination = "whatsapp" | "telegram";

export interface ComposerProduct {
  slug: string;
  title: string;
  priceCents: number;
  previousMinPriceCents: number | null;
  observationCount: number;
  historyDays: number;
  lowestVerified: boolean;
}

export const COMPOSER_MAX_SELECTION = 5;

const FOOTER = "link de afiliado · BizuMiner";

// Repertório por sinal (plano-distribuicao.md §2): o texto varia junto com o
// produto para não virar padrão reconhecível. A rotação é determinística pelo
// slug — o mesmo produto repete a mesma variante, produtos diferentes divergem.
const OPENERS: Record<"verified" | "drop" | "unproven", string[]> = {
  verified: [
    "esse tá no menor preço desde que comecei a acompanhar 👀",
    "dá um bizu: menor preço que já vi nesse aqui",
  ],
  drop: [
    "caiu {pct}% do menor que eu tinha anotado",
    "esse baixou de novo, olha aí",
  ],
  unproven: [
    "achei esse hoje, tá em conta",
    "dá um bizu nessa",
  ],
};

function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant(list: string[], slug: string): string {
  return list[hashSlug(slug) % list.length];
}

/** pt-BR, sem decimais quando o valor é inteiro — mesma regra do card OG.
 * O locale usa espaço não-separável (U+00A0) entre R$ e o valor; normalizamos
 * para espaço comum para o texto colado em chat não carregar caractere invisível. */
export function formatBRL(cents: number): string {
  return (cents / 100)
    .toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    })
    .replace(/\u00A0/g, " ");
}

function toneFor(product: ComposerProduct): "verified" | "drop" | "unproven" {
  const highlight = priceHighlight({
    priceCents: product.priceCents,
    previousMinPriceCents: product.previousMinPriceCents,
    observationCount: product.observationCount,
    historyDays: product.historyDays,
    lowestVerified: product.lowestVerified,
  });
  if (!highlight) return "unproven";
  return highlight.tone;
}

export function composeOpener(product: ComposerProduct): string {
  const tone = toneFor(product);
  if (tone === "drop") {
    const gap = priceDifferencePercent({
      priceCents: product.priceCents,
      previousMinPriceCents: product.previousMinPriceCents,
      observationCount: product.observationCount,
      historyDays: product.historyDays,
      lowestVerified: product.lowestVerified,
    });
    const template = pickVariant(OPENERS.drop, product.slug);
    return template.replace("{pct}", String(Math.abs(gap ?? 0)));
  }
  return pickVariant(OPENERS[tone], product.slug);
}

export function composeSingle(product: ComposerProduct, baseUrl: string): string {
  const link = `${baseUrl}/bizu/${product.slug}`;
  return [composeOpener(product), product.title, formatBRL(product.priceCents), link, FOOTER].join("\n");
}

export function composeLot(products: ComposerProduct[], baseUrl: string): string {
  const lines = products.map(
    (product, index) => `${index + 1}. ${product.title} — ${formatBRL(product.priceCents)} — ${baseUrl}/bizu/${product.slug}`,
  );
  return ["bizus de hoje:", ...lines, FOOTER].join("\n");
}

/**
 * Gera a mensagem pronta para colar. 1 produto = mensagem única; 2+ = lote
 * numerado. O destino não altera o texto nesta versão: o lote do Telegram vira
 * N mensagens com foto e botão na D-5 (publicação real); a diferença visual por
 * canal é responsabilidade da UI (aviso do WhatsApp sobre o card único).
 */
export function composeMessage(
  products: ComposerProduct[],
  _destination: ComposerDestination,
  baseUrl: string,
): string {
  if (products.length === 0) return "";
  if (products.length === 1) return composeSingle(products[0], baseUrl);
  return composeLot(products.slice(0, COMPOSER_MAX_SELECTION), baseUrl);
}
