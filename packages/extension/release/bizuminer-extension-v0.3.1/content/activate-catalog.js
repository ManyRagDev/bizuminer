"use strict";
(() => {
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

  // src/content/card-extractor.ts
  function parseMoneyAria(label) {
    const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(label);
    if (!m) return null;
    const reais = Number(m[1].replace(/\./g, ""));
    if (!Number.isFinite(reais)) return null;
    return { reais, centavos: m[2] ? Number(m[2]) : 0 };
  }
  function extractCard(html) {
    const anchor = /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
    const titleAlt = /class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
    const href = anchor?.[1]?.replace(/&amp;/g, "&");
    const title = anchor?.[2] ?? titleAlt?.[1] ? normalizeSourceTitle(anchor?.[2] ?? titleAlt?.[1]) : void 0;
    if (!href || !title || title.length > MAX_SOURCE_TITLE_LENGTH) return null;
    let url;
    try {
      url = new URL(href, "https://www.mercadolivre.com.br");
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/.test(url.hostname)) return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const externalId = url.searchParams.get("wid") ?? fragment.get("wid") ?? url.searchParams.get("pdp_filters")?.match(/item_id:(MLB\d{6,})/)?.[1] ?? (!url.pathname.includes("/p/") ? url.pathname.match(/MLB-?(\d{6,})/)?.[1]?.replace(/^(\d)/, "MLB$1") : void 0);
    if (!externalId || !/^MLB\d{6,}$/.test(externalId)) return null;
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
    const originalPriceCents = previous && previous.reais > 0 ? previous.reais * 100 + previous.centavos : void 0;
    const imageUrl = /<img[^>]+src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/.exec(html)?.[1];
    return {
      externalId,
      title,
      productUrl,
      imageUrl,
      priceCents,
      currency: "BRL",
      priceType: /a\s+partir\s+de/i.test(currentLabel ?? "") ? "from" : "exact",
      originalPriceCents: originalPriceCents && originalPriceCents > priceCents ? originalPriceCents : void 0,
      marketplace: "mercadolivre"
    };
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

  // src/lib/contracts.ts
  function newRequestId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }

  // src/content/bizu-button.ts
  var BTN = {
    idle: "Adicionar ao BizuMiner",
    saving: "Salvando\u2026",
    done: "\u2713 Adicionado",
    error: "Tentar novamente",
    reconnect: "Reconectar extens\xE3o"
  };
  var COLORS = {
    bg: "#dfff70",
    ink: "#151515",
    done: "#2563eb",
    error: "#a52a24"
  };
  function decorateCard(card) {
    if (card.querySelector("[data-bizuminer]")) return false;
    const host = document.createElement("div");
    host.setAttribute("data-bizuminer", "");
    host.style.cssText = "position:absolute;top:8px;right:8px;z-index:999;";
    const shadow = host.attachShadow({ mode: "open" });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = BTN.idle;
    btn.style.cssText = `font:600 12px/1 system-ui,-apple-system,sans-serif;color:${COLORS.ink};background:${COLORS.bg};border:none;border-radius:999px;padding:7px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);`;
    shadow.appendChild(btn);
    const setState = (label, bg) => {
      btn.textContent = label;
      btn.style.background = bg;
    };
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      void handleClick(card, setState);
    });
    const cardEl = card;
    if (getComputedStyle(cardEl).position === "static") cardEl.style.position = "relative";
    card.appendChild(host);
    return true;
  }
  async function handleClick(card, setState) {
    const isAmazon = /(^|\.)amazon\.com\.br$/.test(window.location.hostname);
    let extracted = isAmazon ? card.hasAttribute("data-asin") ? extractAmazonCardFromElement(card) : extractAmazonProductFromDoc(document, window.location.href) : extractCard(card.outerHTML);
    if (!extracted) {
      setState("Abrir produto para completar", COLORS.error);
      if (!isAmazon) {
        window.open(extractProductLink(card.outerHTML) ?? window.location.href, "_blank", "noopener");
      }
      return;
    }
    const requestId = newRequestId();
    setState(BTN.saving, COLORS.bg);
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "CAPTURE",
        requestId,
        card: extracted,
        pageUrl: window.location.href
      });
    } catch {
      setState(BTN.error, COLORS.bg);
      return;
    }
    if (response.ok) {
      setState(BTN.done, COLORS.done);
      if (response.publication?.url) {
        void copyText(response.publication.url);
      }
    } else if (response.error === "not_paired") {
      setState(BTN.reconnect, COLORS.error);
    } else if (response.error === "queued") {
      setState("Salvo \u2014 envio pendente", COLORS.bg);
    } else {
      setState(BTN.error, COLORS.bg);
    }
  }
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
    }
  }
  function extractProductLink(html) {
    const m = /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"/.exec(html);
    if (!m) return null;
    try {
      return new URL(m[1].replace(/&amp;/g, "&"), "https://www.mercadolivre.com.br").toString();
    } catch {
      return null;
    }
  }

  // src/content/catalog-observer.ts
  function isAmazonPage() {
    return typeof window !== "undefined" && /(^|\.)amazon\.com\.br$/.test(window.location.hostname);
  }
  function findCards() {
    if (isAmazonPage()) {
      const pdpContainer = document.querySelector("#titleSection") || document.querySelector("#centerCol") || document.querySelector("#desktop_buybox") || document.querySelector("#dp");
      if (pdpContainer && document.querySelector("#productTitle, #title")) {
        return [pdpContainer];
      }
      const amazonCards = Array.from(
        document.querySelectorAll("div[data-asin]:not([data-asin='']), .s-result-item[data-asin]:not([data-asin=''])")
      );
      if (amazonCards.length > 0) return amazonCards;
      return [];
    }
    return Array.from(document.querySelectorAll(".poly-card"));
  }
  function observeCatalog(onNewCard) {
    const isAmazon = isAmazonPage();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (isAmazon) {
            if (node.hasAttribute("data-asin") && node.getAttribute("data-asin") !== "") {
              onNewCard(node);
              continue;
            }
            for (const card of Array.from(node.querySelectorAll("div[data-asin]:not([data-asin=''])"))) {
              onNewCard(card);
            }
          } else {
            if (node.classList.contains("poly-card")) {
              onNewCard(node);
              continue;
            }
            for (const card of Array.from(node.querySelectorAll(".poly-card"))) {
              onNewCard(card);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  // src/content/activate-catalog.ts
  function activate() {
    const cards = findCards();
    for (const card of cards) decorateCard(card);
    observeCatalog((card) => decorateCard(card));
  }
  activate();
})();
