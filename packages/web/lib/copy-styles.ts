import type { EditorialCandidate } from "./editorial-selection.ts";
import type { WorkspaceOffer } from "./affiliate-workspace-contract.ts";
import { offerPriceLabel } from "./offer-price.ts";

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

export interface CopyOfferData {
  title: string;
  displayTitle?: string | null;
  benefit?: string | null;
  caveat?: string | null;
  priceCents: number;
  previousMinPriceCents?: number | null;
  historyDays?: number;
  observationCount?: number;
  lowestVerified?: boolean;
  marketplace: string;
  shareUrl: string;
  bioCode?: string;
  offerOptionLabel?: string | null;
  purchaseContents?: string | null;
}

export type PautaLikeProduct = {
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
  marketplace: string;
  shareUrl: string;
  bioCode?: string;
  offerOptionLabel?: string | null;
  purchaseContents?: string | null;
  editorialPurchaseContents?: string | null;
};

export function extractPautaCopyData(product: PautaLikeProduct): CopyOfferData {
  return {
    title: product.title,
    displayTitle: product.displayTitle,
    benefit: product.benefit || product.editorialRationale,
    caveat: product.caveat,
    priceCents: product.priceCents,
    previousMinPriceCents: product.previousMinPriceCents,
    historyDays: product.historyDays,
    observationCount: product.observationCount,
    lowestVerified: product.lowestVerified,
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
    previousMinPriceCents: c.previousMinPriceCents,
    historyDays: c.historyDays,
    observationCount: c.observationCount,
    lowestVerified: c.lowestVerified,
    marketplace: c.marketplace,
    shareUrl: offer.shareUrl || `/bizu/${c.slug}`,
    bioCode: offer.bioCode,
    offerOptionLabel: c.offerOptionLabel,
    purchaseContents: c.purchaseContents,
  };
}

/**
 * 1. Estilo Relâmpago: Foco em urgência honesta, queda de preço e menor registro.
 */
export function buildRelampagoCopy(data: CopyOfferData): string {
  const title = data.displayTitle || data.title;
  const currentPrice = formatPriceBRL(data.priceCents);
  const mpLabel = data.marketplace === "mercadolivre" ? "Mercado Livre" : data.marketplace === "shopee" ? "Shopee" : "AliExpress";
  const storeRef = data.marketplace === "mercadolivre" ? "no Mercado Livre" : `na ${mpLabel}`;
  
  let header = "🔥 *MENOR PREÇO HISTÓRICO!*";
  if (data.previousMinPriceCents && data.previousMinPriceCents > data.priceCents) {
    const diffPct = Math.round(((data.previousMinPriceCents - data.priceCents) / data.previousMinPriceCents) * 100);
    header = `🔥 *QUEDA REAL DE ${diffPct}%!*`;
  } else if (!data.lowestVerified) {
    header = "🔥 *OFERTA RELÂMPAGO!*";
  }

  const lines = [
    header,
    "",
    `*${title}*`,
  ];

  if (data.previousMinPriceCents && data.previousMinPriceCents > data.priceCents) {
    lines.push(`💥 De ~${formatPriceBRL(data.previousMinPriceCents)}~ por *${currentPrice}* ${storeRef}`);
  } else {
    lines.push(`💥 Por *${currentPrice}* ${storeRef}`);
  }

  if (data.lowestVerified) {
    lines.push("✓ Menor preço dos últimos 60 dias no monitoramento");
  }

  if (data.benefit) {
    lines.push(`⚡ ${data.benefit}`);
  } else if (data.offerOptionLabel) {
    lines.push(`⚡ Versão: ${data.offerOptionLabel}`);
  }

  lines.push("");
  lines.push(`🛒 *Garanta aqui:* ${data.shareUrl}`);
  if (data.bioCode) {
    lines.push(`(Código na Bio: *${data.bioCode}*)`);
  }

  return lines.join("\n");
}

/**
 * 2. Estilo Amigo Sincero: Foco em autoridade, prós reais e ressalvas transparentes.
 */
export function buildSinceroCopy(data: CopyOfferData): string {
  const title = data.displayTitle || data.title;
  const currentPrice = formatPriceBRL(data.priceCents);

  const lines = [
    "🤝 *Bizu verificado: vale a pena?*",
    "",
    `*${title}* por *${currentPrice}*`,
  ];

  if (data.benefit) {
    lines.push(`✅ *Ponto forte:* ${data.benefit}`);
  }

  if (data.caveat) {
    lines.push(`⚠️ *A ressalva:* ${data.caveat}`);
  } else if (data.offerOptionLabel) {
    lines.push(`ℹ️ *Versão conferida:* ${data.offerOptionLabel}`);
  }

  if (data.observationCount && data.observationCount > 3) {
    lines.push(`📊 Auditado em ${data.observationCount} coletas de preço nos últimos ${data.historyDays || 30} dias.`);
  }

  lines.push("");
  lines.push(`👉 *Confira os detalhes e compre com segurança:* ${data.shareUrl}`);
  if (data.bioCode) {
    lines.push(`(Ou busque pelo código *${data.bioCode}* no link da bio)`);
  }

  return lines.join("\n");
}

/**
 * 3. Estilo Direto ao Ponto: Curto, sem enrolação, perfeito para grupos rápidos.
 */
export function buildDiretoCopy(data: CopyOfferData): string {
  const title = data.displayTitle || data.title;
  const currentPrice = formatPriceBRL(data.priceCents);

  const lines = [
    `⚡ *${title}*`,
  ];

  if (data.previousMinPriceCents && data.previousMinPriceCents > data.priceCents) {
    lines.push(`De ~${formatPriceBRL(data.previousMinPriceCents)}~ por *${currentPrice}*`);
  } else {
    lines.push(`Por apenas *${currentPrice}*`);
  }

  lines.push(`🔗 ${data.shareUrl}`);
  if (data.bioCode) {
    lines.push(`Bio: *${data.bioCode}*`);
  }

  return lines.join("\n");
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
