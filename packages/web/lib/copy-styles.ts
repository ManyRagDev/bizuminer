import type { WorkspaceOffer } from "./affiliate-workspace-contract.ts";
import { offerPriceLabel, offerPriceNote, type OfferPrice } from "./offer-price.ts";
import { MINIMUM_HISTORY } from "./deal-signal.ts";

export type CopyTone = "relampago" | "sincero" | "direto";

export function formatPriceBRL(cents: number): string {
  return (cents / 100)
    .toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    })
    .replace(/\u00A0/g, " ");
}

export interface CopyOfferData extends OfferPrice {
  title: string;
  displayTitle?: string | null;
  benefit?: string | null;
  caveat?: string | null;
  priceCents: number;
  previousMinPriceCents?: number | null;
  historyDays?: number;
  observationCount?: number;
  lowestVerified?: boolean;
  discountPercent?: number | null;
  ratingStar?: number | null;
  marketplace: string;
  shareUrl: string;
  bioCode?: string;
  offerOptionLabel?: string | null;
  purchaseContents?: string | null;
  offerConditions?: string | null;
}

export type PautaLikeProduct = OfferPrice & {
  title: string;
  displayTitle?: string | null;
  benefit?: string | null;
  editorialRationale?: string | null;
  caveat?: string | null;
  priceCents: number;
  previousMinPriceCents?: number | null;
  historyDays?: number;
  observationCount?: number;
  lowestVerified?: boolean;
  discountPercent?: number | null;
  ratingStar?: number | null;
  marketplace: string;
  shareUrl: string;
  bioCode?: string;
  offerOptionLabel?: string | null;
  purchaseContents?: string | null;
  editorialPurchaseContents?: string | null;
  offerConditions?: string | null;
};

export function extractPautaCopyData(product: PautaLikeProduct): CopyOfferData {
  return {
    title: product.title,
    displayTitle: product.displayTitle,
    benefit: product.benefit,
    caveat: product.caveat,
    priceCents: product.priceCents,
    priceType: product.priceType,
    priceMinCents: product.priceMinCents,
    priceMaxCents: product.priceMaxCents,
    currency: product.currency,
    offerConditions: product.offerConditions,
    previousMinPriceCents: product.previousMinPriceCents,
    historyDays: product.historyDays,
    observationCount: product.observationCount,
    lowestVerified: product.lowestVerified,
    discountPercent: product.discountPercent,
    ratingStar: product.ratingStar,
    marketplace: product.marketplace,
    shareUrl: product.shareUrl,
    bioCode: product.bioCode,
    offerOptionLabel: product.offerOptionLabel,
    purchaseContents: product.purchaseContents || product.editorialPurchaseContents,
  };
}

export function extractCopyData(offer: WorkspaceOffer): CopyOfferData {
  const c = offer.candidate;
  return {
    title: c.title,
    displayTitle: c.displayTitle,
    benefit: c.assessment?.benefit ?? c.benefit,
    caveat: c.caveat,
    priceCents: c.priceCents,
    priceType: c.priceType,
    priceMinCents: c.priceMinCents,
    priceMaxCents: c.priceMaxCents,
    currency: c.currency,
    offerConditions: c.offerConditions,
    previousMinPriceCents: c.previousMinPriceCents,
    historyDays: c.historyDays,
    observationCount: c.observationCount,
    lowestVerified: c.lowestVerified,
    discountPercent: c.discountPercent != null ? c.discountPercent : (c.previousMinPriceCents && c.previousMinPriceCents > c.priceCents ? Math.round(((c.previousMinPriceCents - c.priceCents) / c.previousMinPriceCents) * 100) : null),
    ratingStar: c.ratingStar,
    marketplace: c.marketplace,
    shareUrl: offer.shareUrl || `/bizu/${c.slug}`,
    bioCode: offer.bioCode,
    offerOptionLabel: c.offerOptionLabel,
    purchaseContents: c.purchaseContents,
  };
}

function offerHeadline(data: CopyOfferData): string {
  const store = { mercadolivre: "no Mercado Livre", shopee: "na Shopee", aliexpress: "no AliExpress" }[data.marketplace];
  const from = data.priceType === "from" || data.priceType === "range";
  const price = offerPriceLabel(data).replace(/\u00A0/g, " ");
  const title = data.displayTitle || data.title;
  const priceLine = from ? `*${price}*` : `por *${price}*`;
  return `*${title}* ${priceLine}${store ? ` ${store}` : ""}`;
}

function comparablePriceLine(data: CopyOfferData): string | null {
  if (data.priceType && data.priceType !== "exact") return null;
  const days = data.historyDays ?? 0;
  if (data.lowestVerified && days >= MINIMUM_HISTORY.days
    && (data.observationCount ?? 0) >= MINIMUM_HISTORY.observations) {
    return `É o menor preço que registramos em ${days} dias.`;
  }
  if (data.previousMinPriceCents && data.previousMinPriceCents > data.priceCents && (!data.currency || data.currency === "BRL")) {
    return `O menor preço que tínhamos registrado era ${formatPriceBRL(data.previousMinPriceCents)}.`;
  }
  return null;
}

function shareLines(data: CopyOfferData): string[] {
  const variation = data.priceType === "range" ? offerPriceNote(data) : null;
  return [...(variation ? [variation] : []), `Ver oferta: ${data.shareUrl}`, ...(data.bioCode ? [`Código na bio: ${data.bioCode}`] : [])];
}

export function buildRelampagoCopy(data: CopyOfferData): string {
  const discount = data.discountPercent ?? 0;
  const priceNote = comparablePriceLine(data)
    ?? (data.priceType !== "range" && discount > 0 && discount < 99 ? `O anúncio indica ${discount}% de desconto.` : null);
  const detail = data.offerConditions || (data.offerOptionLabel ? `Opção: ${data.offerOptionLabel}` : null);
  return [offerHeadline(data), ...[priceNote, data.benefit, detail].filter(Boolean), "", ...shareLines(data)].join("\n");
}

export function buildSinceroCopy(data: CopyOfferData): string {
  const detail = [
    data.benefit,
    data.offerOptionLabel ? `Opção: ${data.offerOptionLabel}` : null,
    data.purchaseContents ? `Vem com ${data.purchaseContents}.` : null,
    data.offerConditions,
    data.caveat,
    comparablePriceLine(data),
  ].filter(Boolean);
  return [offerHeadline(data), ...detail, "", ...shareLines(data)].join("\n");
}

export function buildDiretoCopy(data: CopyOfferData): string {
  return [offerHeadline(data), ...(data.offerConditions ? [data.offerConditions] : []), ...shareLines(data)].join("\n");
}

/**
 * 4. Gerador de Prompt do PostSpark 3 (Post Único ou Carrossel)
 * Atende perfeitamente ao parser determinístico de creationBrief.ts e formatIntent.ts
 */
export function buildPostSparkPrompt(
  data: CopyOfferData,
  format: "static" | "carousel" = "carousel"
): string {
  const title = data.displayTitle || data.title;
  const currentPrice = formatPriceBRL(data.priceCents);
  const prevPrice = data.previousMinPriceCents ? formatPriceBRL(data.previousMinPriceCents) : null;
  const days = data.historyDays || 60;
  const obs = data.observationCount || 15;
  const bioCta = data.bioCode ? `Acesse o link na bio (Código ${data.bioCode})` : "Acesse o link na bio";

  if (format === "static") {
    return [
      "Post estático em imagem única para Instagram (proporção 5:6), família visual: glass-veil.",
      "Tom: amigo inteligente que manja de dados e desmascara descontos falsos.",
      "",
      "Dados auditados pelo BizuMiner:",
      `- Produto: ${title}`,
      `- Preço atual: ${currentPrice} (${prevPrice ? `preço anterior de ${prevPrice}` : "menor preço verificado"})`,
      `- Histórico: ${obs} observações nos últimos ${days} dias de monitoramento.`,
      data.benefit ? `- Ponto forte: ${data.benefit}` : "",
      data.caveat ? `- Ressalva honesta: ${data.caveat}` : "",
      "",
      `Fonte: ${data.shareUrl}`,
      `CTA: ${bioCta}`,
    ].filter(Boolean).join("\n");
  }

  // Carrossel 5 slides
  return [
    "Carrossel em 5 slides para Instagram (proporção 5:6), família visual: data-punch.",
    "Tom: amigo analista que ajuda a decidir sem empurrar produtos ruins.",
    "",
    "Dados auditados pelo BizuMiner:",
    `- Produto: ${title}`,
    `- Preço atual: ${currentPrice} (${prevPrice ? `queda sobre ${prevPrice}` : "menor preço verificado"})`,
    `- Histórico: ${obs} registros em ${days} dias (desconto real verificado, sem maquiagem).`,
    data.benefit ? `- Benefício comprovado: ${data.benefit}` : "",
    data.caveat ? `- Ressalva honesta: ${data.caveat}` : "",
    "",
    "Estrutura sugerida dos slides:",
    `- Slide 1/5 (Gancho): ${title} bateu o menor preço registrado em ${days} dias (${currentPrice}).`,
    `- Slide 2/5 (Auditoria): O robô do BizuMiner analisou ${obs} coletas de preço. O desconto é real.`,
    `- Slide 3/5 (Prós e Contras): ${data.benefit || "O que entrega muito bem"} vs ${data.caveat || "O ponto de atenção antes de comprar"}.`,
    `- Slide 4/5 (Veredito): Para quem compensa comprar agora e quando evitar.`,
    `- Slide 5/5 (Chamada): Pegue a indicação auditada antes que o estoque esgote.`,
    "",
    `Fonte: ${data.shareUrl}`,
    `CTA: ${bioCta}`,
  ].filter(Boolean).join("\n");
}

export function generateOfferCopy(data: CopyOfferData, tone: CopyTone): string {
  switch (tone) {
    case "relampago":
      return buildRelampagoCopy(data);
    case "sincero":
      return buildSinceroCopy(data);
    case "direto":
      return buildDiretoCopy(data);
    default:
      return buildRelampagoCopy(data);
  }
}
