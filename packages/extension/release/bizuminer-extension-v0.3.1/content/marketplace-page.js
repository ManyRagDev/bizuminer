"use strict";
var bizuMarketplaceReader = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/content/marketplace-page.ts
  var marketplace_page_exports = {};
  __export(marketplace_page_exports, {
    collectMarketplacePage: () => collectMarketplacePage,
    displayedPrice: () => displayedPrice
  });

  // ../capture/src/title.ts
  var MAX_SOURCE_TITLE_LENGTH = 2e3;
  function normalizeSourceTitle(value) {
    const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, body) => {
      if (body[0] !== "#") return named[body.toLowerCase()] ?? entity;
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 1114111 && !(code >= 55296 && code <= 57343) ? String.fromCodePoint(code) : entity;
    }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/gu, " ").trim();
  }

  // src/content/amazon-extractor.ts
  var ASIN_REGEX = /^[A-Z0-9]{10}$/;
  function parseAmazonPrice(label) {
    if (!label) return null;
    const clean = label.replace(/[^\d.,]/g, "").trim();
    const m = /(\d[\d.]*),(\d{2})/.exec(clean);
    if (m) {
      const reais = Number(m[1].replace(/\./g, ""));
      const centavos = Number(m[2]);
      if (!Number.isFinite(reais) || !Number.isFinite(centavos)) return null;
      return reais * 100 + centavos;
    }
    const intMatch = /^(\d[\d.]+)$/.exec(clean);
    if (intMatch) {
      const reais = Number(intMatch[1].replace(/\./g, ""));
      if (!Number.isFinite(reais)) return null;
      return reais * 100;
    }
    return null;
  }
  function extractAsinFromUrl(url) {
    const m = /(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(url);
    if (m && ASIN_REGEX.test(m[1].toUpperCase())) {
      return m[1].toUpperCase();
    }
    return null;
  }
  function extractAmazonProductFromDoc(doc, pageUrl) {
    let asin = extractAsinFromUrl(pageUrl);
    if (!asin) {
      const inputAsin = doc.querySelector("#ASIN, input[name='ASIN']")?.value?.trim().toUpperCase();
      if (inputAsin && ASIN_REGEX.test(inputAsin)) {
        asin = inputAsin;
      }
    }
    if (!asin) return null;
    const rawTitle = doc.querySelector("#productTitle")?.textContent?.trim() || doc.querySelector("#title")?.textContent?.trim() || doc.querySelector("h1.a-size-large")?.textContent?.trim();
    if (!rawTitle) return null;
    const title = normalizeSourceTitle(rawTitle);
    if (title.length < 3 || title.length > MAX_SOURCE_TITLE_LENGTH) return null;
    const productUrl = `https://www.amazon.com.br/dp/${asin}`;
    const priceEl = doc.querySelector(".priceToPay span.a-offscreen") || doc.querySelector("#corePriceDisplay_desktop_feature_div .priceToPay span.a-offscreen") || doc.querySelector("#corePrice_feature_div span.a-offscreen") || doc.querySelector("#apex_desktop .a-price:not([data-a-strike='true']) span.a-offscreen") || doc.querySelector("#priceblock_dealprice") || doc.querySelector("#priceblock_ourprice") || doc.querySelector("#priceblock_saleprice") || doc.querySelector("#price_inside_buybox") || doc.querySelector(".a-price.aok-align-center:not([data-a-strike='true']) span.a-offscreen") || doc.querySelector("#buyNewSection .a-color-price") || doc.querySelector("#price");
    const priceCents = parseAmazonPrice(priceEl?.textContent);
    if (!priceCents || priceCents <= 0) return null;
    const originalPriceEl = doc.querySelector("#corePriceDisplay_desktop_feature_div .basisPrice span.a-offscreen") || doc.querySelector("#corePriceDisplay_desktop_feature_div .a-text-price span.a-offscreen") || doc.querySelector("span[data-a-strike='true'] span.a-offscreen") || doc.querySelector(".basisPrice span.a-offscreen") || doc.querySelector(".a-text-price span.a-offscreen") || doc.querySelector("#listPrice");
    const parsedOriginal = parseAmazonPrice(originalPriceEl?.textContent);
    const originalPriceCents = parsedOriginal && parsedOriginal > priceCents ? parsedOriginal : void 0;
    const imgEl = doc.querySelector("#landingImage, #imgBlkFront");
    let imageUrl = imgEl?.getAttribute("data-old-hires") || imgEl?.src || void 0;
    if (!imageUrl && imgEl) {
      try {
        const dynamic = JSON.parse(imgEl.getAttribute("data-a-dynamic-image") || "{}");
        const urls = Object.keys(dynamic);
        if (urls.length > 0) imageUrl = urls[0];
      } catch {
      }
    }
    return {
      externalId: asin,
      title,
      productUrl,
      imageUrl: imageUrl && imageUrl.startsWith("https://") ? imageUrl : void 0,
      priceCents,
      originalPriceCents,
      currency: "BRL",
      priceType: "exact",
      marketplace: "amazon"
    };
  }
  function extractAmazonCardFromElement(card) {
    const asinRaw = card.getAttribute("data-asin")?.trim().toUpperCase();
    if (!asinRaw || !ASIN_REGEX.test(asinRaw)) return null;
    const titleEl = card.querySelector("h2 a span") || card.querySelector("h2 span") || card.querySelector("a.a-link-normal span");
    if (!titleEl) return null;
    const rawTitle = titleEl.textContent?.trim();
    if (!rawTitle) return null;
    const title = normalizeSourceTitle(rawTitle);
    if (title.length < 3 || title.length > MAX_SOURCE_TITLE_LENGTH) return null;
    const productUrl = `https://www.amazon.com.br/dp/${asinRaw}`;
    const currentPriceEl = card.querySelector(".a-price:not([data-a-strike='true']) .a-offscreen") || card.querySelector(".a-price .a-offscreen");
    const priceCents = parseAmazonPrice(currentPriceEl?.textContent);
    if (!priceCents || priceCents <= 0) return null;
    const originalPriceEl = card.querySelector(".a-price[data-a-strike='true'] .a-offscreen") || card.querySelector(".a-text-price .a-offscreen");
    const parsedOriginal = parseAmazonPrice(originalPriceEl?.textContent);
    const originalPriceCents = parsedOriginal && parsedOriginal > priceCents ? parsedOriginal : void 0;
    const imgEl = card.querySelector("img.s-image");
    const imageUrl = imgEl?.src?.startsWith("https://") ? imgEl.src : void 0;
    return {
      externalId: asinRaw,
      title,
      productUrl,
      imageUrl,
      priceCents,
      originalPriceCents,
      currency: "BRL",
      priceType: "exact",
      marketplace: "amazon"
    };
  }

  // src/content/marketplace-page.ts
  var BRL_AMOUNT = "(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
  var BRL_VALUE = "R\\$\\s*" + BRL_AMOUNT + "(?:\\s*(?:a|at\xE9|[-\u2013\u2014~])\\s*(?:R\\$\\s*)?" + BRL_AMOUNT + ")?(?![\\d.,])";
  function displayedPrice(label) {
    const match = new RegExp(`R\\$\\s*(${BRL_AMOUNT})(?:\\s*(?:a|at\xE9|[-\u2013\u2014~])\\s*(?:R\\$\\s*)?(${BRL_AMOUNT}))?(?![\\d.,])`, "i").exec(normalizePriceText(label));
    if (!match) return;
    const cents = (value) => {
      const fraction = /[.,](\d{1,2})$/.exec(value);
      const whole = fraction ? value.slice(0, fraction.index) : value;
      return Number(whole.replace(/\./g, "")) * 100 + Number(fraction?.[1]?.padEnd(2, "0") ?? 0);
    };
    const priceCents = cents(match[1]);
    const max = match[2] ? cents(match[2]) : void 0;
    if (priceCents <= 0 || max !== void 0 && max < priceCents) return;
    if (max && max > priceCents) return { priceCents, priceType: "range", priceMaxCents: max };
    return { priceCents, priceType: /a partir de/i.test(label) ? "from" : "exact" };
  }
  function normalizePriceText(text) {
    return text.replace(/[\u200b-\u200f\u2060\ufeff]/g, "").replace(/R\s*[$＄]|\bBRL\s*(?=\d)/gi, "R$ ").replace(/[-−–—]\s*\d{1,3}(?:[.,]\d{1,2})?\s*%/g, " ").replace(/(\d)\s*([,.])\s*(?=\d)/g, "$1$2").replace(/\s+/g, " ");
  }
  var itemId = (href, marketplace) => {
    let url;
    try {
      url = new URL(href);
    } catch {
      return;
    }
    if (url.protocol !== "https:") return;
    if (marketplace === "amazon") {
      if (!/(^|\.)amazon\.com\.br$/.test(url.hostname)) return;
      return /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i.exec(url.pathname)?.[1]?.toUpperCase();
    }
    if (!/(^|\.)aliexpress\.com$/.test(url.hostname)) return;
    return /^\/item\/(\d{8,20})(?:\.html)?\/?$/.exec(url.pathname)?.[1];
  };
  var ALI_PRICE_SELECTOR = "[class*='price-default'], [class*='price--current'], [class*='price-sale'], [class*='price--sale'], [data-testid='product-price'], [itemprop='price']";
  var ALI_CARD_SELECTOR = "[class*='search-card-item'], [class*='product-card'], [data-testid*='product-card'], [data-product-id], [data-item-id], [data-productid]";
  var visibleText = (element) => element.innerText ?? element.textContent ?? "";
  function uniquePrice(prices) {
    const unique = new Map(prices.map((price) => [`${price.priceCents}/${price.priceMaxCents ?? ""}`, price]));
    return unique.size === 1 ? unique.values().next().value : void 0;
  }
  function priceFromCardText(text) {
    const normalized = normalizePriceText(text);
    const values = [];
    const current = [];
    for (const match of normalized.matchAll(new RegExp(BRL_VALUE, "gi"))) {
      const start = match.index;
      const before = normalized.slice(Math.max(0, start - 38), start);
      const after = normalized.slice(start + match[0].length);
      if (/(?:\bde:|\bantes:?|\bfrete:?|\benvio:?|\beconomize:?|\bganhe:?|\bcashback:?|\bcupom de)\s*$/i.test(before) || /^\s*(?:off\b|de desconto\b|de cashback\b)/i.test(after)) continue;
      const price = displayedPrice(/a partir de\s*$/i.test(before) ? `a partir de ${match[0]}` : match[0]);
      if (!price) continue;
      values.push(price);
      if (/(?:\bpor:?|\bagora:?|preço (?:atual|promocional):?)\s*$/i.test(before)) current.push(price);
    }
    return uniquePrice(current.length ? current : values);
  }
  function aliPrice(card, text) {
    const identified = priceFromCardText(text);
    if (identified) return identified;
    const view = card.ownerDocument?.defaultView;
    if (!view) return;
    const labelled = [];
    for (const el of Array.from(card.querySelectorAll("[aria-label*='R$'], [aria-label*='BRL']")).slice(0, 24)) {
      const label = el.getAttribute("aria-label") ?? "";
      if (!/^\s*(?:preço (?:atual|promocional)|por|agora)[:\s]/i.test(label)) continue;
      const price = priceFromCardText(label);
      if (price) labelled.push(price);
    }
    const accessible = uniquePrice(labelled);
    if (accessible) return accessible;
    const original = /* @__PURE__ */ new Set();
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
    return original.size ? priceFromCardText(remaining) : void 0;
  }
  function intersectsViewport(el) {
    const view = el.ownerDocument?.defaultView;
    if (!view) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
  }
  function cleanTitle(text) {
    const title = text?.replace(/\s+/g, " ").trim().replace(/^(?:Marcas\+\s*|SuperOfertas\s*){1,2}/i, "");
    if (!title || title.length < 5 || title.length > 350 || !new RegExp("\\p{L}{4}", "u").test(title) || /R\s*\$|^(?:ali.?express|ver |veja |compre |escolha |oferta$|frete|cupom|mais vendido|imagem|image|foto (?:do produto|de capa)|product$|adicionar|entrega|produto indisponível)/i.test(title) || /^\d+%\s*(?:off|de desconto)/i.test(title) || /^(?:\d+%\s*off\s*)?oferta\s+(?:black friday|prime day|do dia|relâmpago)/i.test(title) || /^(?:black friday|prime day|oferta relâmpago|oferta do dia|destaque do dia)$/i.test(title)) return;
    return title;
  }
  function readCard(doc, card, id, marketplace, detail, anchor, diagnostics) {
    const amazon = marketplace === "amazon";
    const priceSelector = amazon ? ".a-price:not(.a-text-price):not([data-a-strike='true']) .a-offscreen, [data-testid*='price']" : ALI_PRICE_SELECTOR;
    const priceElement = card.querySelector(priceSelector);
    const text = visibleText(card);
    const priceText = priceElement ? visibleText(priceElement).trim() : "";
    const knownAmazon = amazon && (detail ? extractAmazonProductFromDoc(doc, doc.URL) : extractAmazonCardFromElement(card));
    const price = (amazon ? displayedPrice(priceText) : priceFromCardText(priceText) ?? (!detail ? aliPrice(card, text) : void 0)) ?? (knownAmazon ? { priceCents: knownAmazon.priceCents, priceType: "exact" } : void 0);
    if (diagnostics) {
      diagnostics.currency ||= /R\s*[$＄]|\bBRL\s*\d/i.test(text);
      diagnostics.price ||= !!price;
      diagnostics.inViewport ||= intersectsViewport(card);
    }
    if (!price) return null;
    const dealTitle = amazon ? card.querySelector("[data-testid*='deal-card-title'], [class*='deal-title'], [class*='DealTitle'], .a-truncate-cut, h2 a span, h2 span, h3 a span, h3 span, a.a-link-normal span") : null;
    const heading = card.querySelector(detail ? amazon ? "#productTitle, h1" : "h1, [data-testid='product-title']" : "h2, h3, h4, [role='heading'], [class*='title--'], [data-testid*='product-title'], [class*='product-title']");
    const img = card.querySelector("img.s-image, img#landingImage, img[alt]:not([alt='']), img[src], img[data-src]");
    const title = (knownAmazon ? cleanTitle(knownAmazon.title) : void 0) ?? cleanTitle(dealTitle?.textContent) ?? cleanTitle(dealTitle?.getAttribute?.("title")) ?? cleanTitle(heading?.textContent) ?? cleanTitle(heading?.getAttribute?.("title")) ?? cleanTitle(img?.alt) ?? cleanTitle(anchor?.getAttribute?.("title")) ?? cleanTitle(anchor?.getAttribute?.("aria-label")) ?? (!detail ? text.split(/\n+/).map(cleanTitle).find(Boolean) : void 0);
    if (!title || title.length < 3) return null;
    const scope = detail ? priceElement?.parentElement?.textContent ?? priceText : text;
    const condition = amazon && /(?:oferta|preço) (?:exclusiv[oa] )?(?:para )?(?:membros )?prime/i.test(scope) ? "prime" : /primeira compra|novo usuário|desconto de boas.vindas/i.test(scope) ? "first_purchase" : /com (?:o )?cupom|cupom aplicado/i.test(scope) ? "coupon" : /(?:no|via|com) pix\b/i.test(scope) ? "pix" : void 0;
    const variantLabel = !amazon && detail ? card.querySelector("[class*='sku-item'][aria-checked='true'], [class*='sku-item--selected']")?.getAttribute("title")?.trim() : void 0;
    return {
      ...price,
      externalId: id,
      title,
      currency: "BRL",
      condition,
      variantLabel,
      productUrl: amazon ? `https://www.amazon.com.br/dp/${id}` : `https://pt.aliexpress.com/item/${id}.html`,
      imageUrl: knownAmazon && knownAmazon.imageUrl || img?.currentSrc || img?.src || img?.getAttribute("data-src") || void 0,
      originalPriceCents: !condition && price.priceType === "exact" && knownAmazon ? knownAmazon.originalPriceCents : void 0
    };
  }
  function collectMarketplacePage(doc = document, page = new URL(location.href)) {
    const marketplace = /(^|\.)amazon\.com\.br$/.test(page.hostname) ? "amazon" : /(^|\.)aliexpress\.com$/.test(page.hostname) ? "aliexpress" : void 0;
    if (!marketplace || page.protocol !== "https:" || /\/(ap\/signin|gp\/cart|p\/trade|login|checkout)(\/|$)/i.test(page.pathname)) return null;
    const detailId = itemId(page.href, marketplace);
    const products = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    const attempts = /* @__PURE__ */ new Map();
    const report = (id) => {
      if (marketplace !== "aliexpress") return void 0;
      let item = attempts.get(id);
      if (!item) {
        item = { currency: false, price: false, inViewport: false };
        attempts.set(id, item);
      }
      return item;
    };
    if (detailId) {
      seen.add(detailId);
      const offer = readCard(doc, doc.documentElement, detailId, marketplace, true, void 0, report(detailId));
      if (offer) products.set(detailId, offer);
    } else {
      const amazon = marketplace === "amazon";
      const linkSelector = amazon ? "a[href*='/dp/'], a[href*='/gp/product/']" : "a[href*='/item/']";
      const cardSelector = amazon ? "[data-component-type='s-search-result'], [data-testid*='deal-card'], [data-asin]:not([data-asin=''])" : ALI_CARD_SELECTOR;
      for (const anchor of Array.from(doc.querySelectorAll(linkSelector)).slice(0, 1e3)) {
        const id = itemId(anchor.href, marketplace);
        if (!id || products.has(id)) continue;
        seen.add(id);
        let card = amazon ? anchor.closest(cardSelector) ?? anchor : anchor;
        const diagnostics = report(id);
        for (let level = 0; level < (amazon ? 4 : 10); level++) {
          const text = amazon ? "" : visibleText(card);
          if (text.length > 950) break;
          const offer = readCard(doc, card, id, marketplace, false, anchor, diagnostics);
          if (offer) {
            products.set(id, offer);
            break;
          }
          const parent = card.parentElement;
          if (!parent || /^(BODY|HTML|MAIN|HEADER|FOOTER|NAV)$/.test(parent.tagName) || Array.from(parent.querySelectorAll(linkSelector)).some((link) => {
            const other = itemId(link.href, marketplace);
            return other && other !== id;
          })) break;
          card = parent;
        }
        if (products.size >= 200) break;
      }
      const idAttributes = amazon ? ["data-asin"] : ["data-product-id", "data-item-id", "data-productid"];
      const idPattern = amazon ? /^[A-Z0-9]{10}$/ : /^\d{8,20}$/;
      for (const card of Array.from(doc.querySelectorAll(idAttributes.map((attr) => `[${attr}]`).join(","))).slice(0, 500)) {
        if (products.size >= 200) break;
        const id = idAttributes.map((attr) => card.getAttribute?.(attr)?.trim().toUpperCase()).find((value) => !!value && idPattern.test(value));
        if (!id || !idPattern.test(id) || products.has(id)) continue;
        seen.add(id);
        if (Array.from(card.querySelectorAll(linkSelector)).some((link) => {
          const other = itemId(link.href, marketplace);
          return other && other !== id;
        })) continue;
        const offer = readCard(doc, card, id, marketplace, false, void 0, report(id));
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
      version: 1,
      marketplace,
      requestId: crypto.randomUUID(),
      clientCapturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      page: { kind: detailId ? "product" : "listing", url: page.origin + page.pathname },
      products: [...products.values()],
      ignoredCards: seen.size - products.size,
      ...marketplace === "aliexpress" ? { diagnostics: {
        links: doc.querySelectorAll("a[href*='/item/']").length,
        products: seen.size,
        ...skipped
      } } : {}
    };
  }
  return __toCommonJS(marketplace_page_exports);
})();
bizuMarketplaceReader.collectMarketplacePage();
