/**
 * Extrator puro de ofertas e produtos da Amazon Brasil (amazon.com.br).
 * Suporta tanto a página de produto individual (PDP) quanto cards de busca/ofertas.
 * Regra: link sempre canônico (/dp/[ASIN]), sem tags de tracking (adicionadas pelo backend).
 */

import { MAX_SOURCE_TITLE_LENGTH, normalizeSourceTitle } from "../../../capture/src/title.ts";
import type { ExtractedCard } from "./card-extractor.ts";

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

/** Converte strings como "R$ 149,90", "R$1.499,00", "149,90" em centavos. */
export function parseAmazonPrice(label: string | null | undefined): number | null {
  if (!label) return null;
  const clean = label.replace(/[^\d.,]/g, "").trim();
  const m = /(\d[\d.]*),(\d{2})/.exec(clean);
  if (m) {
    const reais = Number(m[1]!.replace(/\./g, ""));
    const centavos = Number(m[2]!);
    if (!Number.isFinite(reais) || !Number.isFinite(centavos)) return null;
    return reais * 100 + centavos;
  }
  const intMatch = /^(\d[\d.]+)$/.exec(clean);
  if (intMatch) {
    const reais = Number(intMatch[1]!.replace(/\./g, ""));
    if (!Number.isFinite(reais)) return null;
    return reais * 100;
  }
  return null;
}

/** Extrai o ASIN de 10 caracteres de uma URL ou string. */
export function extractAsinFromUrl(url: string): string | null {
  const m = /(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(url);
  if (m && ASIN_REGEX.test(m[1]!.toUpperCase())) {
    return m[1]!.toUpperCase();
  }
  return null;
}

/** Extrai dados do produto a partir do HTML puro de uma página PDP (usado em testes e headless). */
export function extractAmazonProductHtml(html: string, pageUrl: string): ExtractedCard | null {
  let asin = extractAsinFromUrl(pageUrl);
  if (!asin) {
    const asinMatch = /id="ASIN"\s+value="([A-Z0-9]{10})"/i.exec(html) || /name="ASIN"\s+value="([A-Z0-9]{10})"/i.exec(html);
    if (asinMatch) asin = asinMatch[1]!.toUpperCase();
  }
  if (!asin || !ASIN_REGEX.test(asin)) return null;

  const titleMatch = /id="productTitle"[^>]*>([^<]+)</.exec(html) || /<h1[^>]*id="title"[^>]*>[\s\S]*?<span[^>]*>([^<]+)</.exec(html);
  if (!titleMatch || !titleMatch[1]) return null;
  const title = normalizeSourceTitle(titleMatch[1].trim());
  if (title.length < 3 || title.length > MAX_SOURCE_TITLE_LENGTH) return null;

  const productUrl = `https://www.amazon.com.br/dp/${asin}`;

  // Preço atual
  const priceMatch =
    /class="priceToPay"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html) ||
    /id="corePriceDisplay_desktop_feature_div"[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html) ||
    /id="corePrice_feature_div"[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html) ||
    /class="a-price aok-align-center[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html) ||
    /<span class="a-offscreen">([^<]+)<\/span>/.exec(html);

  const priceCents = parseAmazonPrice(priceMatch?.[1]);
  if (!priceCents || priceCents <= 0) return null;

  // Preço original
  const origMatch =
    /class="basisPrice"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html) ||
    /class="a-text-price"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html) ||
    /data-a-strike="true"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/.exec(html);
  const parsedOriginal = parseAmazonPrice(origMatch?.[1]);
  const originalPriceCents = parsedOriginal && parsedOriginal > priceCents ? parsedOriginal : undefined;

  // Imagem
  const imgMatch =
    /id="landingImage"[^>]+data-old-hires="([^"]+)"/.exec(html) ||
    /id="landingImage"[^>]+src="([^"]+)"/.exec(html) ||
    /id="imgBlkFront"[^>]+src="([^"]+)"/.exec(html);
  const imageUrl = imgMatch?.[1]?.startsWith("https://") ? imgMatch[1] : undefined;

  return {
    externalId: asin,
    title,
    productUrl,
    imageUrl,
    priceCents,
    originalPriceCents,
    currency: "BRL",
    priceType: "exact",
    marketplace: "amazon",
  };
}

/** Extrai dados de produto a partir do Document da aba aberta (no browser). */
export function extractAmazonProductFromDoc(doc: Document, pageUrl: string): ExtractedCard | null {
  let asin = extractAsinFromUrl(pageUrl);
  if (!asin) {
    const inputAsin = doc.querySelector<HTMLInputElement>("#ASIN, input[name='ASIN']")?.value?.trim().toUpperCase();
    if (inputAsin && ASIN_REGEX.test(inputAsin)) {
      asin = inputAsin;
    }
  }
  if (!asin) return null;

  const rawTitle =
    doc.querySelector("#productTitle")?.textContent?.trim() ||
    doc.querySelector("#title")?.textContent?.trim() ||
    doc.querySelector("h1.a-size-large")?.textContent?.trim();
  if (!rawTitle) return null;

  const title = normalizeSourceTitle(rawTitle);
  if (title.length < 3 || title.length > MAX_SOURCE_TITLE_LENGTH) return null;

  const productUrl = `https://www.amazon.com.br/dp/${asin}`;

  const priceEl =
    doc.querySelector(".priceToPay span.a-offscreen") ||
    doc.querySelector("#corePriceDisplay_desktop_feature_div .priceToPay span.a-offscreen") ||
    doc.querySelector("#corePrice_feature_div span.a-offscreen") ||
    doc.querySelector("#apex_desktop .a-price:not([data-a-strike='true']) span.a-offscreen") ||
    doc.querySelector("#priceblock_dealprice") ||
    doc.querySelector("#priceblock_ourprice") ||
    doc.querySelector("#priceblock_saleprice") ||
    doc.querySelector("#price_inside_buybox") ||
    doc.querySelector(".a-price.aok-align-center:not([data-a-strike='true']) span.a-offscreen") ||
    doc.querySelector("#buyNewSection .a-color-price") ||
    doc.querySelector("#price");

  const priceCents = parseAmazonPrice(priceEl?.textContent);
  if (!priceCents || priceCents <= 0) return null;

  const originalPriceEl =
    doc.querySelector("#corePriceDisplay_desktop_feature_div .basisPrice span.a-offscreen") ||
    doc.querySelector("#corePriceDisplay_desktop_feature_div .a-text-price span.a-offscreen") ||
    doc.querySelector("span[data-a-strike='true'] span.a-offscreen") ||
    doc.querySelector(".basisPrice span.a-offscreen") ||
    doc.querySelector(".a-text-price span.a-offscreen") ||
    doc.querySelector("#listPrice");

  const parsedOriginal = parseAmazonPrice(originalPriceEl?.textContent);
  const originalPriceCents = parsedOriginal && parsedOriginal > priceCents ? parsedOriginal : undefined;

  const imgEl = doc.querySelector<HTMLImageElement>("#landingImage, #imgBlkFront");
  let imageUrl = imgEl?.getAttribute("data-old-hires") || imgEl?.src || undefined;
  if (!imageUrl && imgEl) {
    try {
      const dynamic = JSON.parse(imgEl.getAttribute("data-a-dynamic-image") || "{}") as Record<string, unknown>;
      const urls = Object.keys(dynamic);
      if (urls.length > 0) imageUrl = urls[0];
    } catch {
      // Ignora erro de JSON
    }
  }

  return {
    externalId: asin,
    title,
    productUrl,
    imageUrl: imageUrl && imageUrl.startsWith("https://") ? imageUrl : undefined,
    priceCents,
    originalPriceCents,
    currency: "BRL",
    priceType: "exact",
    marketplace: "amazon",
  };
}

/** Extrai dados de um card a partir de HTML puro (usado em testes). */
export function extractAmazonCardHtml(html: string): ExtractedCard | null {
  const asinMatch = /data-asin="([A-Z0-9]{10})"/i.exec(html);
  if (!asinMatch) return null;
  const asin = asinMatch[1]!.toUpperCase();

  const titleMatch = /<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i.exec(html) ||
                     /<a[^>]*class="[^"]*a-link-normal[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i.exec(html);
  if (!titleMatch || !titleMatch[1]) return null;
  const title = normalizeSourceTitle(titleMatch[1].trim());
  if (title.length < 3 || title.length > MAX_SOURCE_TITLE_LENGTH) return null;

  const productUrl = `https://www.amazon.com.br/dp/${asin}`;

  const priceMatch = /class="a-price[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i.exec(html);
  const priceCents = parseAmazonPrice(priceMatch?.[1]);
  if (!priceCents || priceCents <= 0) return null;

  const origMatch = /(?:class="a-text-price"|data-a-strike="true")[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i.exec(html);
  const parsedOriginal = parseAmazonPrice(origMatch?.[1]);
  const originalPriceCents = parsedOriginal && parsedOriginal > priceCents ? parsedOriginal : undefined;

  const imgMatch = /<img[^>]+class="[^"]*s-image[^"]*"[^>]+src="([^"]+)"/i.exec(html);
  const imageUrl = imgMatch?.[1]?.startsWith("https://") ? imgMatch[1] : undefined;

  return {
    externalId: asin,
    title,
    productUrl,
    imageUrl,
    priceCents,
    originalPriceCents,
    currency: "BRL",
    priceType: "exact",
    marketplace: "amazon",
  };
}

/** Extrai dados de um card Element em listas/buscas da Amazon (no browser). */
export function extractAmazonCardFromElement(card: Element): ExtractedCard | null {
  const asinRaw = card.getAttribute("data-asin")?.trim().toUpperCase();
  if (!asinRaw || !ASIN_REGEX.test(asinRaw)) return null;

  const titleEl =
    card.querySelector("h2 a span") ||
    card.querySelector("h2 span") ||
    card.querySelector("a.a-link-normal span");
  if (!titleEl) return null;

  const rawTitle = titleEl.textContent?.trim();
  if (!rawTitle) return null;
  const title = normalizeSourceTitle(rawTitle);
  if (title.length < 3 || title.length > MAX_SOURCE_TITLE_LENGTH) return null;

  const productUrl = `https://www.amazon.com.br/dp/${asinRaw}`;

  const currentPriceEl =
    card.querySelector(".a-price:not([data-a-strike='true']) .a-offscreen") ||
    card.querySelector(".a-price .a-offscreen");
  const priceCents = parseAmazonPrice(currentPriceEl?.textContent);
  if (!priceCents || priceCents <= 0) return null;

  const originalPriceEl =
    card.querySelector(".a-price[data-a-strike='true'] .a-offscreen") ||
    card.querySelector(".a-text-price .a-offscreen");
  const parsedOriginal = parseAmazonPrice(originalPriceEl?.textContent);
  const originalPriceCents = parsedOriginal && parsedOriginal > priceCents ? parsedOriginal : undefined;

  const imgEl = card.querySelector<HTMLImageElement>("img.s-image");
  const imageUrl = imgEl?.src?.startsWith("https://") ? imgEl.src : undefined;

  return {
    externalId: asinRaw,
    title,
    productUrl,
    imageUrl,
    priceCents,
    originalPriceCents,
    currency: "BRL",
    priceType: "exact",
    marketplace: "amazon",
  };
}
