import { extractAmazonCardFromElement, extractAmazonProductFromDoc } from "./amazon-extractor.ts";

type Marketplace = "amazon" | "aliexpress";
type Price = {
  priceCents: number;
  priceType: "exact" | "from" | "range";
  priceMaxCents?: number;
};
type Offer = Price & {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  originalPriceCents?: number;
  currency: "BRL";
  condition?: "coupon" | "first_purchase" | "pix" | "prime";
  variantLabel?: string;
};

// Some Brazilian listings use a dot for decimals even with the BRL symbol.
const BRL_AMOUNT = "(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
const BRL_VALUE = "R\\$\\s*" + BRL_AMOUNT + "(?:\\s*(?:a|até|[-–—~])\\s*(?:R\\$\\s*)?" + BRL_AMOUNT + ")?(?![\\d.,])";

export function displayedPrice(label: string): Price | undefined {
  const match = new RegExp(`R\\$\\s*(${BRL_AMOUNT})(?:\\s*(?:a|até|[-–—~])\\s*(?:R\\$\\s*)?(${BRL_AMOUNT}))?(?![\\d.,])`, "i")
    .exec(normalizePriceText(label));
  if (!match) return;
  const cents = (value: string) => {
    const fraction = /[.,](\d{1,2})$/.exec(value);
    const whole = fraction ? value.slice(0, fraction.index) : value;
    return Number(whole.replace(/\./g, "")) * 100 + Number(fraction?.[1]?.padEnd(2, "0") ?? 0);
  };
  const priceCents = cents(match[1]!);
  const max = match[2] ? cents(match[2]) : undefined;
  if (priceCents <= 0 || max !== undefined && max < priceCents) return;
  if (max && max > priceCents) return { priceCents, priceType: "range", priceMaxCents: max };
  return { priceCents, priceType: /a partir de/i.test(label) ? "from" : "exact" };
}

function normalizePriceText(text: string): string {
  return text.replace(/[\u200b-\u200f\u2060\ufeff]/g, "")
    .replace(/R\s*[$＄]|\bBRL\s*(?=\d)/gi, "R$ ")
    // The storefront can concatenate the price and its negative discount badge.
    .replace(/[-−–—]\s*\d{1,3}(?:[.,]\d{1,2})?\s*%/g, " ")
    .replace(/(\d)\s*([,.])\s*(?=\d)/g, "$1$2")
    .replace(/\s+/g, " ");
}

const itemId = (href: string, marketplace: Marketplace) => {
  let url: URL;
  try { url = new URL(href); } catch { return; }
  if (url.protocol !== "https:") return;
  if (marketplace === "amazon") {
    if (!/(^|\.)amazon\.com\.br$/.test(url.hostname)) return;
    return /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i.exec(url.pathname)?.[1]?.toUpperCase();
  }
  if (!/(^|\.)aliexpress\.com$/.test(url.hostname)) return;
  return /^\/item\/(\d{8,20})(?:\.html)?\/?$/.exec(url.pathname)?.[1];
};

const ALI_PRICE_SELECTOR = "[class*='price-default'], [class*='price--current'], [class*='price-sale'], [class*='price--sale'], [data-testid='product-price'], [itemprop='price']";
const ALI_CARD_SELECTOR = "[class*='search-card-item'], [class*='product-card'], [data-testid*='product-card'], [data-product-id], [data-item-id], [data-productid]";

const visibleText = (element: Element): string => (element as HTMLElement).innerText ?? element.textContent ?? "";

function uniquePrice(prices: Price[]): Price | undefined {
  const unique = new Map(prices.map(price => [`${price.priceCents}/${price.priceMaxCents ?? ""}`, price]));
  return unique.size === 1 ? unique.values().next().value : undefined;
}

function priceFromCardText(text: string): Price | undefined {
  const normalized = normalizePriceText(text);
  const values: Price[] = [];
  const current: Price[] = [];
  for (const match of normalized.matchAll(new RegExp(BRL_VALUE, "gi"))) {
    const start = match.index!;
    const before = normalized.slice(Math.max(0, start - 38), start);
    const after = normalized.slice(start + match[0].length);
    if (/(?:\bde:|\bantes:?|\bfrete:?|\benvio:?|\beconomize:?|\bganhe:?|\bcashback:?|\bcupom de)\s*$/i.test(before)
      || /^\s*(?:off\b|de desconto\b|de cashback\b)/i.test(after)) continue;
    const price = displayedPrice(/a partir de\s*$/i.test(before) ? `a partir de ${match[0]}` : match[0]);
    if (!price) continue;
    values.push(price);
    if (/(?:\bpor:?|\bagora:?|preço (?:atual|promocional):?)\s*$/i.test(before)) current.push(price);
  }
  return uniquePrice(current.length ? current : values);
}

function aliPrice(card: Element, text: string): Price | undefined {
  const identified = priceFromCardText(text);
  if (identified) return identified;
  const view = card.ownerDocument?.defaultView;
  if (!view) return;

  const labelled: Price[] = [];
  for (const el of Array.from(card.querySelectorAll("[aria-label*='R$'], [aria-label*='BRL']")).slice(0, 24)) {
    const label = el.getAttribute("aria-label") ?? "";
    if (!/^\s*(?:preço (?:atual|promocional)|por|agora)[:\s]/i.test(label)) continue;
    const price = priceFromCardText(label);
    if (price) labelled.push(price);
  }
  const accessible = uniquePrice(labelled);
  if (accessible) return accessible;

  // Remove only amounts explicitly crossed out by the store.
  const original = new Set<string>();
  for (const el of Array.from(card.querySelectorAll("s, del, span, small, div, p, b, strong")).slice(0, 120)) {
    const label = normalizePriceText(visibleText(el)).trim();
    if (!/^R\$\s*[\d.,]+$/i.test(label)) continue;
    if (el.matches("s, del") || view.getComputedStyle(el).textDecorationLine.includes("line-through")) original.add(label);
  }
  let remaining = normalizePriceText(text);
  for (const label of original) {
    const first = remaining.indexOf(label);
    if (first >= 0 && remaining.indexOf(label, first + label.length) < 0) remaining = remaining.replace(label, " ");
  }
  return original.size ? priceFromCardText(remaining) : undefined;
}

type ReadDiagnostics = { currency: boolean; price: boolean; inViewport: boolean };

function intersectsViewport(el: Element): boolean {
  const view = el.ownerDocument?.defaultView;
  if (!view) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
    && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

function cleanTitle(text: string | null | undefined): string | undefined {
  const title = text?.replace(/\s+/g, " ").trim().replace(/^(?:Marcas\+\s*|SuperOfertas\s*){1,2}/i, "");
  if (!title || title.length < 5 || title.length > 350 || !/\p{L}{4}/u.test(title)
    || /R\s*\$|^(?:ali.?express|ver |veja |compre |escolha |oferta$|frete|cupom|mais vendido|imagem|image|foto (?:do produto|de capa)|product$|adicionar|entrega|produto indisponível)/i.test(title)
    || /^\d+%\s*(?:off|de desconto)/i.test(title)
    || /^(?:\d+%\s*off\s*)?oferta\s+(?:black friday|prime day|do dia|relâmpago)/i.test(title)
    || /^(?:black friday|prime day|oferta relâmpago|oferta do dia|destaque do dia)$/i.test(title)) return;
  return title;
}

function readCard(doc: Document, card: Element, id: string, marketplace: Marketplace, detail: boolean, anchor?: HTMLAnchorElement, diagnostics?: ReadDiagnostics): Offer | null {
  const amazon = marketplace === "amazon";
  const priceSelector = amazon
    ? ".a-price:not(.a-text-price):not([data-a-strike='true']) .a-offscreen, [data-testid*='price']"
    : ALI_PRICE_SELECTOR;
  const priceElement = card.querySelector(priceSelector);
  const text = visibleText(card);
  const priceText = priceElement ? visibleText(priceElement).trim() : "";
  const knownAmazon = amazon && (detail ? extractAmazonProductFromDoc(doc, doc.URL) : extractAmazonCardFromElement(card));
  const price = (amazon ? displayedPrice(priceText) : priceFromCardText(priceText) ?? (!detail ? aliPrice(card, text) : undefined))
    ?? (knownAmazon ? { priceCents: knownAmazon.priceCents, priceType: "exact" as const } : undefined);
  if (diagnostics) {
    diagnostics.currency ||= /R\s*[$＄]|\bBRL\s*\d/i.test(text);
    diagnostics.price ||= !!price;
    diagnostics.inViewport ||= intersectsViewport(card);
  }
  if (!price) return null;
  const dealTitle = amazon ? card.querySelector<HTMLElement>("[data-testid*='deal-card-title'], [class*='deal-title'], [class*='DealTitle'], .a-truncate-cut, h2 a span, h2 span, h3 a span, h3 span, a.a-link-normal span") : null;
  const heading = card.querySelector<HTMLElement>(detail
    ? amazon ? "#productTitle, h1" : "h1, [data-testid='product-title']"
    : "h2, h3, h4, [role='heading'], [class*='title--'], [data-testid*='product-title'], [class*='product-title']");
  const img = card.querySelector<HTMLImageElement>("img.s-image, img#landingImage, img[alt]:not([alt='']), img[src], img[data-src]");
  const title = (knownAmazon ? cleanTitle(knownAmazon.title) : undefined)
    ?? cleanTitle(dealTitle?.textContent)
    ?? cleanTitle(dealTitle?.getAttribute?.("title"))
    ?? cleanTitle(heading?.textContent)
    ?? cleanTitle(heading?.getAttribute?.("title"))
    ?? cleanTitle(img?.alt)
    ?? cleanTitle(anchor?.getAttribute?.("title"))
    ?? cleanTitle(anchor?.getAttribute?.("aria-label"))
    ?? (!detail ? text.split(/\n+/).map(cleanTitle).find(Boolean) : undefined);
  if (!title || title.length < 3) return null;
  const scope = detail ? priceElement?.parentElement?.textContent ?? priceText : text;
  const condition = amazon && /(?:oferta|preço) (?:exclusiv[oa] )?(?:para )?(?:membros )?prime/i.test(scope) ? "prime"
    : /primeira compra|novo usuário|desconto de boas.vindas/i.test(scope)
    ? "first_purchase" : /com (?:o )?cupom|cupom aplicado/i.test(scope)
      ? "coupon" : /(?:no|via|com) pix\b/i.test(scope) ? "pix" : undefined;
  const variantLabel = !amazon && detail
    ? card.querySelector("[class*='sku-item'][aria-checked='true'], [class*='sku-item--selected']")?.getAttribute("title")?.trim()
    : undefined;
  return {
    ...price, externalId: id, title, currency: "BRL", condition, variantLabel,
    productUrl: amazon ? `https://www.amazon.com.br/dp/${id}` : `https://pt.aliexpress.com/item/${id}.html`,
    imageUrl: knownAmazon && knownAmazon.imageUrl || img?.currentSrc || img?.src || img?.getAttribute("data-src") || undefined,
    originalPriceCents: !condition && price.priceType === "exact" && knownAmazon ? knownAmazon.originalPriceCents : undefined,
  };
}

export function collectMarketplacePage(doc = document, page = new URL(location.href)) {
  const marketplace: Marketplace | undefined = /(^|\.)amazon\.com\.br$/.test(page.hostname) ? "amazon"
    : /(^|\.)aliexpress\.com$/.test(page.hostname) ? "aliexpress" : undefined;
  if (!marketplace || page.protocol !== "https:" || /\/(ap\/signin|gp\/cart|p\/trade|login|checkout)(\/|$)/i.test(page.pathname)) return null;
  const detailId = itemId(page.href, marketplace);
  const products = new Map<string, Offer>();
  const seen = new Set<string>();
  const attempts = new Map<string, ReadDiagnostics>();
  const report = (id: string) => {
    if (marketplace !== "aliexpress") return undefined;
    let item = attempts.get(id);
    if (!item) {
      item = { currency: false, price: false, inViewport: false };
      attempts.set(id, item);
    }
    return item;
  };
  if (detailId) {
    seen.add(detailId);
    const offer = readCard(doc, doc.documentElement, detailId, marketplace, true, undefined, report(detailId));
    if (offer) products.set(detailId, offer);
  } else {
    const amazon = marketplace === "amazon";
    const linkSelector = amazon ? "a[href*='/dp/'], a[href*='/gp/product/']" : "a[href*='/item/']";
    const cardSelector = amazon
      ? "[data-component-type='s-search-result'], [data-testid*='deal-card'], [data-asin]:not([data-asin=''])"
      : ALI_CARD_SELECTOR;
    for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>(linkSelector)).slice(0, 1000)) {
      const id = itemId(anchor.href, marketplace);
      if (!id || products.has(id)) continue;
      seen.add(id);
      let card = amazon ? anchor.closest(cardSelector) ?? anchor : anchor as Element;
      const diagnostics = report(id);
      // Some offer grids have no card marker. Climb only while this element
      // contains one product, so a price from a neighbor cannot be attached.
      for (let level = 0; level < (amazon ? 4 : 10); level++) {
        const text = amazon ? "" : visibleText(card);
        if (text.length > 950) break;
        const offer = readCard(doc, card, id, marketplace, false, anchor, diagnostics);
        if (offer) { products.set(id, offer); break; }
        const parent = card.parentElement;
        if (!parent || /^(BODY|HTML|MAIN|HEADER|FOOTER|NAV)$/.test(parent.tagName) || Array.from(parent.querySelectorAll<HTMLAnchorElement>(linkSelector))
          .some(link => { const other = itemId(link.href, marketplace); return other && other !== id; })) break;
        card = parent;
      }
      if (products.size >= 200) break;
    }
    const idAttributes = amazon ? ["data-asin"] : ["data-product-id", "data-item-id", "data-productid"];
    const idPattern = amazon ? /^[A-Z0-9]{10}$/ : /^\d{8,20}$/;
    for (const card of Array.from(doc.querySelectorAll<HTMLElement>(idAttributes.map(attr => `[${attr}]`).join(","))).slice(0, 500)) {
      if (products.size >= 200) break;
      const id = idAttributes.map(attr => card.getAttribute?.(attr)?.trim().toUpperCase()).find(value => !!value && idPattern.test(value));
      if (!id || !idPattern.test(id) || products.has(id)) continue;
      seen.add(id);
      // An explicit item id can identify a card whose click is handled by the site.
      // Skip wrappers that contain links to a different item.
      if (Array.from(card.querySelectorAll<HTMLAnchorElement>(linkSelector))
        .some(link => { const other = itemId(link.href, marketplace); return other && other !== id; })) continue;
      const offer = readCard(doc, card, id, marketplace, false, undefined, report(id));
      if (offer) products.set(id, offer);
    }
  }
  const skipped = { noPrice: 0, uncertainPrice: 0, noTitle: 0, visibleNoPrice: 0 };
  for (const id of seen) {
    if (products.has(id)) continue;
    const attempt = attempts.get(id);
    if (attempt?.price) skipped.noTitle++;
    else if (attempt?.currency) skipped.uncertainPrice++;
    else {
      skipped.noPrice++;
      if (attempt?.inViewport) skipped.visibleNoPrice++;
    }
  }
  return {
    version: 1 as const, marketplace, requestId: crypto.randomUUID(), clientCapturedAt: new Date().toISOString(),
    page: { kind: detailId ? "product" : "listing", url: page.origin + page.pathname },
    products: [...products.values()], ignoredCards: seen.size - products.size,
    ...(marketplace === "aliexpress" ? { diagnostics: {
      links: doc.querySelectorAll("a[href*='/item/']").length,
      products: seen.size,
      ...skipped,
    }} : {}),
  };
}
