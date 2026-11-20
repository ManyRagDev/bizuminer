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

  // src/content/ml-countdown.ts
  function extractMlCountdownFromElement(container, capturedAtMs = Date.now()) {
    const cd = container.querySelector(".poly-component__countdown") ?? Array.from(container.querySelectorAll("[class*='countdown']")).find(
      (el) => el.querySelectorAll(".poly-countdown__block").length >= 2
    );
    const root = cd ?? container;
    const blocks = Array.from(root.querySelectorAll(".poly-countdown__block")).slice(0, 3);
    if (blocks.length !== 2 && blocks.length !== 3) {
      return null;
    }
    const numbers = [];
    for (const block of blocks) {
      const rollers = Array.from(block.querySelectorAll(".poly-countdown__roller-container"));
      let digits = "";
      if (rollers.length > 0) {
        for (const roller of rollers) {
          const staticDigit = roller.querySelector(".poly-countdown__digit--static");
          const anyDigit = staticDigit ?? roller.querySelector(".poly-countdown__digit");
          const text = (anyDigit?.textContent || "").trim();
          if (/^\d{1,2}$/.test(text)) {
            digits += text;
          }
        }
      } else {
        digits = Array.from(
          block.querySelectorAll(".poly-countdown__digit--static, .poly-countdown__digit")
        ).map((d) => (d.textContent || "").trim()).filter((t) => /^\d{1,2}$/.test(t)).slice(0, 2).join("");
      }
      if (digits) {
        const val = parseInt(digits, 10);
        if (Number.isFinite(val)) {
          numbers.push(val);
        }
      }
    }
    let sec = 0;
    if (numbers.length === 3) {
      const [h, m, s] = numbers;
      sec = (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
    } else if (numbers.length === 2) {
      const [m, s] = numbers;
      sec = (m ?? 0) * 60 + (s ?? 0);
    }
    if (sec <= 0) return null;
    return {
      promotionType: "lightning",
      remainingSeconds: sec,
      promotionEndsAt: new Date(capturedAtMs + sec * 1e3).toISOString()
    };
  }
  function extractMlCountdownFromHtml(html, capturedAtMs = Date.now()) {
    const cdIdx = html.indexOf("poly-component__countdown");
    const blockIdx = html.indexOf("poly-countdown__block");
    if (cdIdx === -1 && blockIdx === -1) return null;
    const startIdx = cdIdx !== -1 ? cdIdx : blockIdx;
    const slice = html.slice(startIdx, startIdx + 3e3);
    const blockMatches = [
      ...slice.matchAll(
        /class="[^"]*poly-countdown__block[^"]*"[\s\S]*?(?=(?:class="[^"]*poly-countdown__block"|<span class="poly-countdown__separator"|<\/div>\s*<\/div>\s*<\/div>|$))/g
      )
    ];
    if (blockMatches.length !== 2 && blockMatches.length !== 3) return null;
    const rollerSplitRegex = /class="[^"]*poly-countdown__roller-container[^"]*"/g;
    const digitRegex = /class="[^"]*poly-countdown__digit[^"]*"[^>]*>\s*(\d)\s*<\/span>/;
    const digitAllRegex = /class="[^"]*poly-countdown__digit[^"]*"[^>]*>\s*(\d)\s*<\/span>/g;
    const numbers = [];
    for (const b of blockMatches) {
      const blockHtml = b[0];
      const rollerParts = blockHtml.split(rollerSplitRegex).slice(1);
      let digits = "";
      if (rollerParts.length > 0) {
        for (const part of rollerParts) {
          const m = digitRegex.exec(part);
          if (m?.[1]) digits += m[1];
        }
      } else {
        digits = [...blockHtml.matchAll(digitAllRegex)].map((m) => m[1]).slice(0, 2).join("");
      }
      if (digits) {
        const val = parseInt(digits, 10);
        if (Number.isFinite(val)) numbers.push(val);
      }
    }
    let sec = 0;
    if (numbers.length === 3) {
      const [h, m, s] = numbers;
      sec = (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
    } else if (numbers.length === 2) {
      const [m, s] = numbers;
      sec = (m ?? 0) * 60 + (s ?? 0);
    }
    if (sec <= 0) return null;
    return {
      promotionType: "lightning",
      remainingSeconds: sec,
      promotionEndsAt: new Date(capturedAtMs + sec * 1e3).toISOString()
    };
  }
  function findMlScriptPeriodEnd(doc, externalId, capturedAtMs = Date.now(), catalogProductId) {
    if (!externalId && !catalogProductId || typeof doc.querySelectorAll !== "function") return null;
    const candidateIds = [externalId, catalogProductId].filter((id) => Boolean(id));
    const scripts = Array.from(doc.querySelectorAll("script"));
    for (const s of scripts) {
      const text = s.textContent || "";
      if (!text.includes("period_end") && !text.includes("finish_date")) continue;
      for (const id of candidateIds) {
        if (!text.includes(id)) continue;
        const idToken = `"id":"${id}"`;
        let idIdx = text.indexOf(idToken);
        if (idIdx === -1) idIdx = text.indexOf(id);
        if (idIdx !== -1) {
          const nextCardIdx = text.indexOf('"metadata":{"id":', idIdx + 20);
          const endBound = nextCardIdx !== -1 ? Math.min(text.length, nextCardIdx, idIdx + 1e4) : Math.min(text.length, idIdx + 8e3);
          const cardSlice = text.slice(idIdx, endBound);
          const m = /"(?:period_end|finish_date)"\s*:\s*"([^"]+)"/.exec(cardSlice);
          if (m?.[1]) {
            const endsMs = Date.parse(m[1]);
            if (Number.isFinite(endsMs) && endsMs > capturedAtMs) {
              return {
                promotionType: "lightning",
                remainingSeconds: Math.round((endsMs - capturedAtMs) / 1e3),
                promotionEndsAt: new Date(endsMs).toISOString()
              };
            }
          }
        }
        const kvsToken = `"${id}":{`;
        const kvsIdx = text.indexOf(kvsToken);
        if (kvsIdx !== -1) {
          const nextKvsIdx = text.indexOf('},"MLB', kvsIdx + kvsToken.length);
          const kvsBound = nextKvsIdx !== -1 ? Math.min(text.length, nextKvsIdx + 2, kvsIdx + 2e3) : Math.min(text.length, kvsIdx + 1500);
          const kvsSlice = text.slice(kvsIdx, kvsBound);
          const m2 = /"(?:finish_date|period_end)"\s*:\s*"([^"]+)"/.exec(kvsSlice);
          if (m2?.[1]) {
            const endsMs = Date.parse(m2[1]);
            if (Number.isFinite(endsMs) && endsMs > capturedAtMs) {
              return {
                promotionType: "lightning",
                remainingSeconds: Math.round((endsMs - capturedAtMs) / 1e3),
                promotionEndsAt: new Date(endsMs).toISOString()
              };
            }
          }
        }
      }
    }
    return null;
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
    const listingId = url.searchParams.get("wid") ?? fragment.get("wid") ?? url.searchParams.get("pdp_filters")?.match(/item_id:(MLB\d{6,})/)?.[1];
    const externalId = listingId ?? (!url.pathname.includes("/p/") ? url.pathname.match(/MLB-?(\d{6,})/)?.[1]?.replace(/^(\d)/, "MLB$1") : void 0);
    if (!externalId || !/^MLB\d{6,}$/.test(externalId)) return null;
    const productUrl = `${url.origin}${url.pathname}${listingId || url.pathname.includes("/p/") ? `?wid=${externalId}` : ""}`;
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
    const countdown = extractMlCountdownFromHtml(html);
    return {
      externalId,
      title,
      productUrl,
      imageUrl,
      priceCents,
      currency: "BRL",
      priceType: /a\s+partir\s+de/i.test(currentLabel ?? "") ? "from" : "exact",
      originalPriceCents: originalPriceCents && originalPriceCents > priceCents ? originalPriceCents : void 0,
      marketplace: "mercadolivre",
      ...countdown ? { promotionType: countdown.promotionType, promotionEndsAt: countdown.promotionEndsAt } : {}
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
    const isMlPdp = !isAmazon && !card.classList.contains("poly-card") && Boolean(document.querySelector("h1.ui-pdp-title"));
    let extracted = isAmazon ? card.hasAttribute("data-asin") ? extractAmazonCardFromElement(card) : extractAmazonProductFromDoc(document, window.location.href) : isMlPdp ? extractMlProductFromDoc(document, window.location.href) : extractCard(card.outerHTML) ?? extractMlProductFromDoc(document, window.location.href);
    if (extracted && !isAmazon && !extracted.promotionEndsAt) {
      const catalogId = extracted.productUrl.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase();
      const cd = extractMlCountdownFromElement(card) ?? findMlScriptPeriodEnd(document, extracted.externalId, Date.now(), catalogId);
      if (cd) {
        extracted = { ...extracted, promotionType: cd.promotionType, promotionEndsAt: cd.promotionEndsAt };
      }
    }
    if (!extracted) {
      setState("Abrir produto para completar", COLORS.error);
      if (!isAmazon && !isMlPdp) {
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
        pageUrl: isMlPdp ? extracted.productUrl : window.location.href
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
  function extractMlProductFromDoc(doc, pageHref) {
    let page;
    try {
      page = new URL(pageHref);
    } catch {
      return null;
    }
    if (page.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/i.test(page.hostname)) return null;
    const normalizedPath = page.pathname.replace(/\/+$/, "");
    const title = (doc.querySelector("h1.ui-pdp-title")?.textContent || "").replace(/\s+/gu, " ").trim();
    if (!title || title.length < 3 || title.length > 2e3) return null;
    const pageFragment = new URLSearchParams(page.hash.slice(1));
    const pageFiltered = (page.searchParams.get("pdp_filters") || pageFragment.get("pdp_filters") || "").match(/item_id:(MLB\d{6,})/i);
    const pageDirect = !normalizedPath.includes("/p/") ? normalizedPath.match(/\/MLB-?(\d{6,})/i) : null;
    const domItemInput = doc.querySelector('input[name="item_id"], input[name="itemId"]')?.value || "";
    const domMetaApp = doc.querySelector('meta[name="twitter:app:url:iphone"], meta[property="al:ios:url"], meta[property="al:android:url"]')?.getAttribute("content") || "";
    const domMetaMatch = domMetaApp.match(/id=(MLB\d{6,})/i);
    const domActionLink = doc.querySelector('.ui-pdp-container a[href*="wid=MLB"], .ui-pdp-container a[href*="item_id:MLB"], .ui-pdp-container a[href*="item_id=MLB"]')?.href || "";
    const domActionMatch = domActionLink.match(/(?:wid=|item_id[:=])(MLB\d{6,})/i);
    let scriptItemId = "";
    for (const s of Array.from(doc.querySelectorAll("script"))) {
      const m = /"item_id"\s*:\s*"(MLB\d{6,})"/i.exec(s.textContent || "");
      if (m) {
        scriptItemId = m[1].toUpperCase();
        break;
      }
    }
    const listingId = (page.searchParams.get("wid") || pageFragment.get("wid") || (pageFiltered ? pageFiltered[1] : "") || (/^MLB\d{6,}$/i.test(domItemInput) ? domItemInput : "") || (domMetaMatch ? domMetaMatch[1] : "") || (domActionMatch ? domActionMatch[1] : "") || scriptItemId).toUpperCase();
    const externalId = listingId || (pageDirect ? "MLB" + pageDirect[1] : "");
    if (!/^MLB\d{6,}$/.test(externalId)) return null;
    const money = (label) => {
      const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/i.exec(label || "");
      return m ? Number(m[1].replace(/\./g, "")) * 100 + Number(m[2] || 0) : void 0;
    };
    const priceRoot = doc.querySelector(".ui-pdp-price__second-line") || doc.querySelector(".ui-pdp-price__main-container") || doc.querySelector(".ui-pdp-price");
    const priceEl = doc.querySelector('.ui-pdp-price__second-line [aria-label*="reais" i]') || doc.querySelector('.ui-pdp-price__second-line[aria-label*="reais" i]') || priceRoot?.querySelector('.andes-money-amount:not(.andes-money-amount--previous)[aria-label*="reais" i]') || priceRoot?.querySelector('.andes-money-amount:not(.andes-money-amount--previous) [aria-label*="reais" i]') || priceRoot?.querySelector('[aria-label*="reais" i]:not([aria-label^="Antes:" i])');
    const priceLabel = priceEl?.getAttribute("aria-label") || "";
    if (/\b(?:faixa|entre)\b/i.test(priceLabel)) return null;
    let priceCents = money(priceLabel || null);
    if (!priceCents && priceRoot) {
      const amountBox = priceRoot.querySelector(".andes-money-amount:not(.andes-money-amount--previous)") || priceRoot;
      const frac = (amountBox.querySelector(".andes-money-amount__fraction")?.textContent || "").replace(/\./g, "").trim();
      const cents = (amountBox.querySelector(".andes-money-amount__cents")?.textContent || "").trim();
      if (/^\d+$/.test(frac)) {
        priceCents = Number(frac) * 100 + (/^\d{1,2}$/.test(cents) ? Number(cents.padEnd(2, "0")) : 0);
      }
    }
    if (!priceCents || priceCents <= 0) return null;
    const originalEl = doc.querySelector('.ui-pdp-price__original-value [aria-label*="reais" i]') || doc.querySelector('.ui-pdp-price__original-value[aria-label*="reais" i]') || doc.querySelector('.ui-pdp-price__main-container .andes-money-amount--previous[aria-label*="reais" i]') || doc.querySelector('.ui-pdp-price__main-container .andes-money-amount--previous [aria-label*="reais" i]') || doc.querySelector('.ui-pdp-price [aria-label^="Antes:" i]');
    const originalPriceCents = money(originalEl?.getAttribute("aria-label") || null);
    const img = doc.querySelector(
      'img.ui-pdp-image[src^="https://"], img[data-zoom][src*=".mlstatic.com/"], .ui-pdp-gallery img[src*=".mlstatic.com/"]'
    );
    const imageUrl = img?.src?.startsWith("https://") ? img.src : img?.getAttribute("data-src") || void 0;
    const productUrl = page.origin + normalizedPath + (listingId || normalizedPath.includes("/p/") ? `?wid=${externalId}` : "");
    const catalogId = normalizedPath.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase();
    const cd = (doc.body ? extractMlCountdownFromElement(doc.body) : null) ?? findMlScriptPeriodEnd(doc, externalId, Date.now(), catalogId);
    return {
      externalId,
      title,
      productUrl,
      ...imageUrl?.startsWith("https://") ? { imageUrl } : {},
      priceCents,
      currency: "BRL",
      priceType: /a\s+partir\s+de/i.test(priceLabel) ? "from" : "exact",
      ...originalPriceCents && originalPriceCents > priceCents ? { originalPriceCents } : {},
      ...cd ? { promotionType: cd.promotionType, promotionEndsAt: cd.promotionEndsAt } : {},
      marketplace: "mercadolivre"
    };
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
    const mlPdpTitle = document.querySelector("h1.ui-pdp-title");
    if (mlPdpTitle) {
      const mlPdpContainer = document.querySelector(".ui-pdp-header") || document.querySelector(".ui-pdp-container__col--main") || document.querySelector(".ui-pdp-main") || mlPdpTitle.parentElement || mlPdpTitle;
      return [mlPdpContainer, ...Array.from(document.querySelectorAll(".poly-card"))];
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
