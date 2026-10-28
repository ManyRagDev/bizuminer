/**
 * Extração pura de card do Mercado Livre (E5). Recebe o HTML de UM card e
 * devolve o payload normalizado — sem rede, sem chrome. O content script lê o
 * `outerHTML` do card clicado e chama `extractCard`.
 *
 * Regra de ouro (§4 do doc de engenharia reversa): usar o href REAL do card,
 * nunca construir permalink. Preço vem do aria-label, não de concatenação
 * visual. Card incompleto devolve `null` (o botão oferece "Abrir produto").
 */

import { MAX_SOURCE_TITLE_LENGTH, normalizeSourceTitle } from "../../../capture/src/title.ts";

export interface ExtractedCard {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  priceCents: number;
  originalPriceCents?: number;
  currency: "BRL";
  priceType: "exact" | "from";
}


function parseMoneyAria(label: string): { reais: number; centavos: number } | null {
  const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(label);
  if (!m) return null;
  const reais = Number(m[1]!.replace(/\./g, ""));
  if (!Number.isFinite(reais)) return null;
  return { reais, centavos: m[2] ? Number(m[2]) : 0 };
}

/** Extrai o card de um trecho de HTML. null = card incompleto (usar PDP). */
export function extractCard(html: string): ExtractedCard | null {
  const anchor =
    /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
  const titleAlt = /class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
  const href = anchor?.[1]?.replace(/&amp;/g, "&");
  const title = (anchor?.[2] ?? titleAlt?.[1]) ? normalizeSourceTitle((anchor?.[2] ?? titleAlt?.[1])!) : undefined;
  if (!href || !title || title.length > MAX_SOURCE_TITLE_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(href, "https://www.mercadolivre.com.br");
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/.test(url.hostname)) return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const externalId = url.searchParams.get("wid") ?? fragment.get("wid")
    ?? url.searchParams.get("pdp_filters")?.match(/item_id:(MLB\d{6,})/)?.[1]
    ?? (!url.pathname.includes("/p/") ? url.pathname.match(/MLB-?(\d{6,})/)?.[1]?.replace(/^(\d)/, "MLB$1") : undefined);
  if (!externalId || !/^MLB\d{6,}$/.test(externalId)) return null;

  // href REAL, limpo de query/fragment de tracking (a afiliação entra no servidor).
  const productUrl = `${url.origin}${url.pathname}${url.pathname.includes("/p/") ? `?wid=${externalId}` : ""}`;

  const currentSection = html.slice(html.indexOf("poly-price__current"));
  const currentLabel = /aria-label="(?!Antes:)([^"]*?reais[^"]*?)"/.exec(currentSection)?.[1];
  if (currentLabel && /\b(?:faixa|entre)\b/i.test(currentLabel)) return null;
  const current = currentLabel ? parseMoneyAria(currentLabel) : null;
  if (!current) return null;
  const priceCents = current.reais * 100 + current.centavos;
  if (priceCents <= 0) return null;

  const previousLabel = /aria-label="Antes:\s*([^"]*?reais[^"]*?)"/.exec(html)?.[1];
  const previous = previousLabel ? parseMoneyAria(previousLabel) : null;
  const originalPriceCents =
    previous && previous.reais > 0 ? previous.reais * 100 + previous.centavos : undefined;

  const imageUrl = /<img[^>]+src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/.exec(html)?.[1];

  return {
    externalId,
    title,
    productUrl,
    imageUrl,
    priceCents,
    currency: "BRL",
    priceType: /a\s+partir\s+de/i.test(currentLabel ?? "") ? "from" : "exact",
    originalPriceCents: originalPriceCents && originalPriceCents > priceCents ? originalPriceCents : undefined,
  };
}
