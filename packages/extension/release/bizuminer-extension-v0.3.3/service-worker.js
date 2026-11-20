"use strict";
(() => {
  // src/content/page-extractor.ts
  function collectBrowserOffers() {
    function money(label) {
      const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(
        label || ""
      );
      return m ? Number(m[1].replace(/\./g, "")) * 100 + Number(m[2] || 0) : void 0;
    }
    function countdownInfo(cardOrDoc, extId, catalogId) {
      const root = cardOrDoc && typeof cardOrDoc.querySelector === "function" ? cardOrDoc : typeof document !== "undefined" && typeof document.querySelector === "function" ? document : null;
      if (root) {
        const cd = root.querySelector(".poly-component__countdown") || (typeof root.querySelectorAll === "function" ? Array.from(root.querySelectorAll("[class*='countdown']")).find((el) => el.querySelectorAll(".poly-countdown__block").length >= 2) : null);
        const cdRoot = cd || root;
        if (typeof cdRoot.querySelectorAll === "function") {
          const blocks = Array.from(cdRoot.querySelectorAll(".poly-countdown__block")).slice(0, 3);
          if (blocks.length === 2 || blocks.length === 3) {
            const nums = [];
            for (const b of blocks) {
              const rollers = Array.from(b.querySelectorAll(".poly-countdown__roller-container"));
              let digits = "";
              if (rollers.length > 0) {
                for (const r of rollers) {
                  const st = r.querySelector(".poly-countdown__digit--static") || r.querySelector(".poly-countdown__digit");
                  const t = (st?.textContent || "").trim();
                  if (/^\d{1,2}$/.test(t)) digits += t;
                }
              } else {
                digits = Array.from(b.querySelectorAll(".poly-countdown__digit--static, .poly-countdown__digit")).map((d) => (d.textContent || "").trim()).filter((t) => /^\d{1,2}$/.test(t)).slice(0, 2).join("");
              }
              if (digits) {
                const val = parseInt(digits, 10);
                if (Number.isFinite(val)) nums.push(val);
              }
            }
            let sec = 0;
            if (nums.length === 3) {
              sec = (nums[0] || 0) * 3600 + (nums[1] || 0) * 60 + (nums[2] || 0);
            } else if (nums.length === 2) {
              sec = (nums[0] || 0) * 60 + (nums[1] || 0);
            }
            if (sec > 0) {
              return {
                promotionType: "lightning",
                promotionEndsAt: new Date(Date.now() + sec * 1e3).toISOString()
              };
            }
          }
        }
      }
      const candidateIds = [extId, catalogId].filter((id) => Boolean(id));
      if (candidateIds.length > 0 && typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
        for (const s of Array.from(document.querySelectorAll("script"))) {
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
              const windowSlice = text.slice(idIdx, endBound);
              const m = /"(?:period_end|finish_date)"\s*:\s*"([^"]+)"/.exec(windowSlice);
              if (m && m[1]) {
                const endsMs = Date.parse(m[1]);
                if (Number.isFinite(endsMs) && endsMs > Date.now()) {
                  return {
                    promotionType: "lightning",
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
              if (m2 && m2[1]) {
                const endsMs = Date.parse(m2[1]);
                if (Number.isFinite(endsMs) && endsMs > Date.now()) {
                  return {
                    promotionType: "lightning",
                    promotionEndsAt: new Date(endsMs).toISOString()
                  };
                }
              }
            }
          }
        }
      }
      return null;
    }
    const page = new URL(location.href);
    const normalizedPath = page.pathname.replace(/\/+$/, "");
    const blockedPaths = [
      "/gz/",
      "/login",
      "/account-verification",
      "/seguranca",
      "/checkpoint"
    ];
    const isBlocked = blockedPaths.some(
      (prefix) => normalizedPath.includes(prefix)
    );
    if (page.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/.test(page.hostname) || isBlocked)
      throw new Error(
        "Abra uma p\xE1gina de an\xFAncios do Mercado Livre e conclua o acesso, se solicitado."
      );
    const products = [];
    const seen = /* @__PURE__ */ new Set();
    const pdpTitleEl = typeof document.querySelector === "function" ? document.querySelector("h1.ui-pdp-title") : null;
    const pdpTitle = (pdpTitleEl?.textContent || "").replace(/\s+/gu, " ").trim();
    if (pdpTitle && pdpTitle.length <= 2e3 && typeof document.querySelector === "function") {
      const pageFragment = new URLSearchParams(page.hash.slice(1));
      const pageFiltered = (page.searchParams.get("pdp_filters") || pageFragment.get("pdp_filters") || "").match(/item_id:(MLB\d{6,})/i);
      const pageDirect = !normalizedPath.includes("/p/") ? normalizedPath.match(/\/MLB-?(\d{6,})/i) : null;
      const domItemInput = document.querySelector('input[name="item_id"], input[name="itemId"]')?.value || "";
      const domMetaApp = document.querySelector('meta[name="twitter:app:url:iphone"], meta[property="al:ios:url"], meta[property="al:android:url"]')?.getAttribute("content") || "";
      const domMetaMatch = domMetaApp.match(/id=(MLB\d{6,})/i);
      const domActionLink = document.querySelector('.ui-pdp-container a[href*="wid=MLB"], .ui-pdp-container a[href*="item_id:MLB"], .ui-pdp-container a[href*="item_id=MLB"]')?.href || "";
      const domActionMatch = domActionLink.match(/(?:wid=|item_id[:=])(MLB\d{6,})/i);
      let scriptItemId = "";
      if (typeof document.querySelectorAll === "function") {
        for (const s of Array.from(document.querySelectorAll("script"))) {
          const m = /"item_id"\s*:\s*"(MLB\d{6,})"/i.exec(s.textContent || "");
          if (m) {
            scriptItemId = m[1].toUpperCase();
            break;
          }
        }
      }
      const pdpListingId = (page.searchParams.get("wid") || pageFragment.get("wid") || (pageFiltered ? pageFiltered[1] : "") || (/^MLB\d{6,}$/i.test(domItemInput) ? domItemInput : "") || (domMetaMatch ? domMetaMatch[1] : "") || (domActionMatch ? domActionMatch[1] : "") || scriptItemId).toUpperCase();
      const pdpExternalId = pdpListingId || (pageDirect ? "MLB" + pageDirect[1] : "");
      const pdpPriceRoot = document.querySelector(".ui-pdp-price__second-line") || document.querySelector(".ui-pdp-price__main-container") || document.querySelector(".ui-pdp-price");
      const pdpPriceEl = document.querySelector('.ui-pdp-price__second-line [aria-label*="reais" i]') || document.querySelector('.ui-pdp-price__second-line[aria-label*="reais" i]') || pdpPriceRoot?.querySelector('.andes-money-amount:not(.andes-money-amount--previous)[aria-label*="reais" i]') || pdpPriceRoot?.querySelector('.andes-money-amount:not(.andes-money-amount--previous) [aria-label*="reais" i]') || pdpPriceRoot?.querySelector('[aria-label*="reais" i]:not([aria-label^="Antes:" i])');
      const pdpPriceLabel = pdpPriceEl?.getAttribute("aria-label") || "";
      let pdpPriceCents = money(pdpPriceLabel || null);
      if (!pdpPriceCents && pdpPriceRoot) {
        const amountBox = pdpPriceRoot.querySelector(".andes-money-amount:not(.andes-money-amount--previous)") || pdpPriceRoot;
        const frac = (amountBox.querySelector(".andes-money-amount__fraction")?.textContent || "").replace(/\./g, "").trim();
        const cents = (amountBox.querySelector(".andes-money-amount__cents")?.textContent || "").trim();
        if (/^\d+$/.test(frac)) {
          pdpPriceCents = Number(frac) * 100 + (/^\d{1,2}$/.test(cents) ? Number(cents.padEnd(2, "0")) : 0);
        }
      }
      if (/^MLB\d{6,}$/.test(pdpExternalId) && pdpPriceCents && !/\b(?:faixa|entre)\b/i.test(pdpPriceLabel)) {
        const pdpOriginalEl = document.querySelector('.ui-pdp-price__original-value [aria-label*="reais" i]') || document.querySelector('.ui-pdp-price__original-value[aria-label*="reais" i]') || document.querySelector('.ui-pdp-price__main-container .andes-money-amount--previous[aria-label*="reais" i]') || document.querySelector('.ui-pdp-price__main-container .andes-money-amount--previous [aria-label*="reais" i]') || document.querySelector('.ui-pdp-price [aria-label^="Antes:" i]');
        const pdpOriginal = money(pdpOriginalEl?.getAttribute("aria-label") || null);
        const pdpImg = document.querySelector(
          'img.ui-pdp-image[src^="https://"], img[data-zoom][src*=".mlstatic.com/"], .ui-pdp-gallery img[src*=".mlstatic.com/"]'
        );
        let pdpText = (document.querySelector(".ui-pdp-header, .ui-pdp-container")?.textContent || "") + " " + (document.querySelector(".ui-pdp-subtitle")?.textContent || "");
        for (const el of Array.from(document.querySelectorAll(".ui-pdp-header [aria-label]"))) {
          pdpText += " " + el.getAttribute("aria-label");
        }
        const pdpRating = /Classificação\s*([0-5](?:[.,]\d+)?)\s*de\s*5\s*estrelas/i.exec(pdpText) || /^([0-5](?:[.,]\d+)?)$/.exec((document.querySelector(".ui-pdp-review__rating")?.textContent || "").trim());
        const pdpSales = /(?:\+\s*|Mais de\s+)(\d+(?:[.,]\d+)?)\s*(milhões|milhão|mil|mi|m)?\s*(?:produtos?\s+)?vendidos/i.exec(pdpText);
        const pdpProduct = {
          externalId: pdpExternalId,
          title: pdpTitle,
          productUrl: page.origin + normalizedPath + (pdpListingId || normalizedPath.includes("/p/") ? "?wid=" + pdpExternalId : ""),
          priceCents: pdpPriceCents,
          currency: "BRL",
          priceType: /a\s+partir\s+de/i.test(pdpPriceLabel) ? "from" : "exact"
        };
        if (pdpOriginal && pdpOriginal > pdpPriceCents) pdpProduct.originalPriceCents = pdpOriginal;
        if (pdpImg) {
          const src = pdpImg.src && pdpImg.src.startsWith("https://") ? pdpImg.src : pdpImg.getAttribute("data-src");
          if (src && src.startsWith("https://")) pdpProduct.imageUrl = src;
        }
        if (pdpRating && Number(pdpRating[1].replace(",", ".")) > 0) {
          pdpProduct.ratingStar = Number(pdpRating[1].replace(",", "."));
        }
        if (pdpSales) {
          pdpProduct.salesLabel = pdpSales[0];
          pdpProduct.salesCount = Math.round(
            Number(pdpSales[1].replace(",", ".")) * (pdpSales[2] ? pdpSales[2] === "mil" ? 1e3 : 1e6 : 1)
          );
        }
        const pdpCatalogId = normalizedPath.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase();
        const pdpCd = countdownInfo(document.body, pdpExternalId, pdpCatalogId);
        if (pdpCd) {
          pdpProduct.promotionType = pdpCd.promotionType;
          pdpProduct.promotionEndsAt = pdpCd.promotionEndsAt;
        }
        const pdpSource = new URL(page.origin + (normalizedPath || "/"));
        if (pdpListingId || normalizedPath.includes("/p/")) {
          pdpSource.searchParams.set("wid", pdpExternalId);
        }
        return {
          version: 1,
          requestId: crypto.randomUUID(),
          marketplace: "mercadolivre",
          clientCapturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          page: { kind: "product", url: pdpSource.toString() },
          products: [pdpProduct],
          ignoredCards: 0
        };
      }
    }
    const cards = Array.from(
      document.querySelectorAll(
        ".poly-card, .ui-search-layout__item, .ui-search-result"
      )
    );
    for (const card of cards.slice(0, 200)) {
      const anchor = card.querySelector("a.poly-component__title") || card.querySelector("a.ui-search-link") || card.querySelector(
        "a.ui-search-item__group__element"
      );
      if (!anchor) continue;
      let url;
      try {
        url = new URL(anchor.href);
      } catch {
        continue;
      }
      if (!/(^|\.)mercadolivre\.com\.br$/.test(url.hostname) || url.protocol !== "https:")
        continue;
      const direct = !url.pathname.includes("/p/") ? url.pathname.match(/\/MLB-?(\d{6,})/) : null;
      const filtered = (url.searchParams.get("pdp_filters") || "").match(
        /item_id:(MLB\d{6,})/
      );
      const fragment = new URLSearchParams(url.hash.slice(1));
      const listingId = url.searchParams.get("wid") || fragment.get("wid") || (filtered ? filtered[1] : "");
      const externalId = listingId || (direct ? "MLB" + direct[1] : "");
      const title = (anchor.textContent || "").replace(/\s+/gu, " ").trim();
      const priceEl = card.querySelector('.poly-price__current [aria-label*="reais"]') || card.querySelector(
        '.ui-search-price__second-line [aria-label*="reais"]'
      ) || card.querySelector('.price-tag [aria-label*="reais"]') || card.querySelector('[aria-label*="reais"]');
      const priceLabel = priceEl?.getAttribute("aria-label") || "";
      const priceCents = money(priceLabel || null);
      if (!/^MLB\d{6,}$/.test(externalId) || !title || title.length > 2e3 || /\b(?:faixa|entre)\b/i.test(priceLabel) || !priceCents || seen.has(externalId))
        continue;
      const originalEl = card.querySelector('[aria-label^="Antes:"]') || card.querySelector('.poly-price__original [aria-label*="reais"]') || card.querySelector(
        '.ui-search-price__original-value [aria-label*="reais"]'
      );
      const original = money(originalEl?.getAttribute("aria-label") || null);
      let text = card.textContent || "";
      for (const element of Array.from(card.querySelectorAll("[aria-label]")))
        text += " " + element.getAttribute("aria-label");
      const rating = /Classificação\s*([0-5](?:[.,]\d+)?)\s*de\s*5\s*estrelas/i.exec(text);
      const sales = /(?:\+\s*|Mais de\s+)(\d+(?:[.,]\d+)?)\s*(milhões|milhão|mil|mi|m)?\s*(?:produtos?\s+)?vendidos/i.exec(
        text
      );
      const img = card.querySelector(
        'img[src^="https://http2.mlstatic.com/"], img[src*=".mlstatic.com/"], img[data-src*=".mlstatic.com/"]'
      );
      const product = {
        externalId,
        title,
        productUrl: url.origin + url.pathname + // The listing may differ from the ID in a direct URL too. Dropping
        // its explicit identity here makes server validation see another item.
        (listingId || url.pathname.includes("/p/") ? "?wid=" + externalId : ""),
        priceCents,
        currency: "BRL",
        priceType: /a\s+partir\s+de/i.test(priceLabel) ? "from" : "exact"
      };
      if (original && original > priceCents)
        product.originalPriceCents = original;
      if (img) {
        const src = img.src && img.src.startsWith("https://") ? img.src : img.getAttribute("data-src");
        if (src && src.startsWith("https://")) product.imageUrl = src;
      }
      if (rating && Number(rating[1].replace(",", ".")) > 0)
        product.ratingStar = Number(rating[1].replace(",", "."));
      if (sales) {
        product.salesLabel = sales[0];
        product.salesCount = Math.round(
          Number(sales[1].replace(",", ".")) * (sales[2] ? sales[2] === "mil" ? 1e3 : 1e6 : 1)
        );
      }
      const catalogId = url.pathname.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase();
      const cd = countdownInfo(card, externalId, catalogId);
      if (cd) {
        product.promotionType = cd.promotionType;
        product.promotionEndsAt = cd.promotionEndsAt;
      }
      seen.add(externalId);
      products.push(product);
    }
    if (!products.length)
      throw new Error(
        "Nenhuma oferta completa encontrada. Confira se a listagem carregou."
      );
    const pageKind = normalizedPath.startsWith("/ofertas") ? "offers" : page.hostname.startsWith("lista.") || normalizedPath.includes("/busca/") ? "search" : normalizedPath.startsWith("/c/") ? "category" : "listing";
    const pagePath = normalizedPath || "/ofertas";
    const source = new URL(page.origin + pagePath);
    for (const key of ["q", "search", "page", "wid"]) {
      for (const value of page.searchParams.getAll(key)) {
        if (!value || value.length > 120 || /[@\r\n]/.test(value)) continue;
        if (key === "page" && !/^[1-9]\d{0,4}$/.test(value)) continue;
        if (key === "wid" && !/^MLB\d{6,}$/i.test(value)) continue;
        if (["q", "search"].includes(key) && (/\d{10,}/.test(value) || /(?:bearer|token|session|password|senha)/i.test(value))) continue;
        source.searchParams.append(key, value);
      }
    }
    return {
      version: 1,
      requestId: crypto.randomUUID(),
      marketplace: "mercadolivre",
      clientCapturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      page: { kind: pageKind, url: source.toString() },
      products,
      ignoredCards: cards.length - products.length
    };
  }

  // src/lib/api.ts
  var REQUEST_TIMEOUT_MS = 2e4;
  async function getJson(opts, path) {
    const controller = new AbortController();
    let timer;
    let status;
    let retryDelay;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({
          ok: false,
          error: "timeout",
          status,
          retryable: status === void 0 || status === 408 || status === 429 || status >= 500 || status >= 200 && status < 300,
          retryAfterMs: retryDelay
        });
      }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
    });
    const work = async () => {
      try {
        const response = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}${path}`, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers: { ...opts.token ? { Authorization: `Bearer ${opts.token}` } : {} }
        });
        status = response.status;
        retryDelay = retryAfterMs(response.headers.get("retry-after"));
        const text = await response.text();
        if (text.length > 1e6) throw new Error("invalid_response");
        const data = JSON.parse(text);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_response");
        const result = data;
        return {
          ...result,
          ok: response.ok && result.ok === true,
          status: response.status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500 || response.ok && result.ok !== true,
          retryAfterMs: retryDelay
        };
      } catch {
        return {
          ok: false,
          error: status === void 0 ? "network" : "invalid_response",
          status,
          retryable: status === void 0 || status === 408 || status === 429 || status >= 500 || status >= 200 && status < 300,
          retryAfterMs: retryDelay
        };
      }
    };
    try {
      return await Promise.race([work(), timeout]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  function retryAfterMs(value, now = Date.now()) {
    if (!value) return void 0;
    const delay2 = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1e3 : Date.parse(value) - now;
    return Number.isFinite(delay2) ? Math.max(0, delay2) : void 0;
  }
  async function postJson(opts, path, payload, requestId) {
    const controller = new AbortController();
    let timer;
    let status;
    let retryDelay;
    const retryableStatus = () => status === void 0 || status === 408 || status === 429 || status >= 500 || status >= 200 && status < 300;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, error: "timeout", status, retryable: retryableStatus(), retryAfterMs: retryDelay });
      }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
    });
    const work = async () => {
      try {
        const response = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}${path}`, {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
            ...requestId ? { "Idempotency-Key": requestId } : {}
          },
          body: JSON.stringify(payload)
        });
        status = response.status;
        retryDelay = retryAfterMs(response.headers.get("retry-after"));
        const raw = await response.text();
        if (raw.length > 1e6) throw new Error("invalid_response");
        const body = JSON.parse(raw);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_response");
        const data = body;
        return {
          ...data,
          ok: response.ok && data.ok === true,
          status,
          error: typeof data.error === "string" ? data.error.slice(0, 160) : data.ok === true && response.ok ? void 0 : "invalid_response",
          retryable: status === 408 || status === 429 || status >= 500 || response.ok && data.ok !== true,
          retryAfterMs: retryDelay
        };
      } catch {
        return {
          ok: false,
          error: status ? "invalid_response" : "network",
          status,
          retryable: retryableStatus(),
          retryAfterMs: retryDelay
        };
      }
    };
    try {
      return await Promise.race([work(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function postCapture(opts, payload) {
    const result = await postJson(opts, "/api/extension/captures", { ...payload, mode: "manual" }, payload.requestId);
    if (result.ok && (typeof result.productId !== "string" || !result.productId)) return { ok: false, error: "invalid_response", retryable: true };
    return result;
  }
  async function exchangePairingCode(opts, pairingCode) {
    const result = await postJson(opts, "/api/extension/pair/exchange", { pairingCode });
    if (result.ok && (typeof result.deviceId !== "string" || !result.deviceId || typeof result.deviceToken !== "string" || !result.deviceToken.startsWith("bm_ext_")))
      return { ok: false, error: "invalid_response" };
    return result;
  }

  // src/lib/storage.ts
  var BUILD_API_ORIGIN = true ? "https://www.bizuminer.com.br" : "https://www.bizuminer.com.br";
  if (!["https://www.bizuminer.com.br", "http://localhost:3100"].includes(BUILD_API_ORIGIN)) throw new Error("invalid_build_origin");
  var STORAGE_KEYS = {
    token: "bm_token",
    deviceId: "bm_device_id",
    affiliateName: "bm_affiliate_name",
    activeTabId: "bm_active_tab_id",
    outbox: "bm_outbox",
    apiBaseUrl: "bm_api_base_url",
    sessionOrigin: "bm_session_origin"
  };
  function chromeStorage() {
    return chrome.storage.local;
  }
  async function setSession(storage, session) {
    await storage.set({
      [STORAGE_KEYS.sessionOrigin]: session.origin,
      [STORAGE_KEYS.token]: session.token,
      [STORAGE_KEYS.deviceId]: session.deviceId,
      [STORAGE_KEYS.affiliateName]: session.affiliateName
    });
  }
  async function clearSession(storage) {
    await storage.set({
      [STORAGE_KEYS.sessionOrigin]: "",
      [STORAGE_KEYS.token]: "",
      [STORAGE_KEYS.deviceId]: "",
      [STORAGE_KEYS.affiliateName]: ""
    });
  }

  // src/lib/outbox.ts
  var OUTBOX_MAX_ITEMS = 200;
  var OUTBOX_TTL_MS = 30 * 60 * 1e3;
  var OUTBOX_MAX_ATTEMPTS = 6;
  var RETRY_DELAYS_MS = [5e3, 3e4, 12e4, 6e5];
  function enqueue(outbox, payload, now = Date.now()) {
    if (outbox.some((e) => e.requestId === payload.requestId)) return outbox;
    if (outbox.length >= OUTBOX_MAX_ITEMS) throw new Error("queue_full");
    const entry = {
      requestId: payload.requestId,
      payload,
      attempts: 0,
      addedAt: now,
      nextRetryAt: now
    };
    return [...outbox, entry];
  }
  function dequeue(outbox, requestId) {
    return outbox.filter((e) => e.requestId !== requestId);
  }
  function pruneExpired(outbox, now = Date.now()) {
    return outbox.map((e) => !e.stopped && (now - e.addedAt >= OUTBOX_TTL_MS || e.attempts >= OUTBOX_MAX_ATTEMPTS) ? { ...e, stopped: true, lastError: e.attempts >= OUTBOX_MAX_ATTEMPTS ? "retry_limit" : "capture_expired" } : e);
  }

  // src/lib/batch-queue.ts
  var BROWSER_BATCH_KEY = "bm_browser_batch";
  var BATCH_QUEUE_ALARM = "bm_batch_queue_retry";
  var BATCH_MAX_ATTEMPTS = 6;
  var BATCH_MAX_AGE_MS = 30 * 60 * 1e3;

  // src/lib/contracts.ts
  function pageKindFor(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return "category";
    }
    const path = u.pathname;
    if (/(^|\.)amazon\.com\.br$/.test(u.hostname)) {
      if (/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(path)) return "product";
      if (/\/deals/i.test(path)) return "offers";
      if (/\/b(?:\/|$)/i.test(path)) return "category";
      return "search";
    }
    if (/\/ofertas/.test(path)) return "offers";
    if (/\/p\/MLB/.test(path) || /\/MLB-\d/.test(path)) return "product";
    if (u.hostname === "lista.mercadolivre.com.br") return "search";
    if (/\/c\//.test(path)) return "category";
    return "search";
  }

  // src/lib/import-report.ts
  var IMPORT_REASON_LABELS = {
    duplicate_external_id: "Identificador repetido nesta leitura",
    product_invalid: "Dados do produto incompletos",
    product_id_invalid: "Identificador do produto inv\xE1lido",
    product_title_invalid: "Nome do produto ausente ou inv\xE1lido",
    product_url_invalid: "Endere\xE7o do produto inv\xE1lido",
    product_identity_invalid: "Endere\xE7o e identificador n\xE3o correspondem",
    product_price_invalid: "Pre\xE7o ausente ou inv\xE1lido",
    product_original_price_invalid: "Pre\xE7o de refer\xEAncia inv\xE1lido",
    product_price_range_invalid: "Faixa de pre\xE7o inv\xE1lida",
    image_url_invalid: "Endere\xE7o da imagem inv\xE1lido"
  };
  var MAX_ITEMS = 200;
  function collectionMetadata(value) {
    const raw = record(value);
    if (!raw) return {};
    const result = {};
    if (typeof raw.capturedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.capturedAt) && Number.isFinite(Date.parse(raw.capturedAt)) && new Date(raw.capturedAt).toISOString().replace(".000Z", "Z") === raw.capturedAt.replace(".000Z", "Z")) result.capturedAt = raw.capturedAt;
    if (typeof raw.preparedVersion === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(raw.preparedVersion)) result.preparedVersion = raw.preparedVersion;
    return result;
  }
  var count = (value) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_ITEMS;
  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function safeId(value) {
    return typeof value === "string" && value.length <= 64 && (/^MLB\d{6,}$/.test(value) || /^[A-Z0-9]{10}$/.test(value) || /^\d{8,20}$/.test(value));
  }
  function diagnostics(value) {
    const d = record(value);
    if (!d || !count(d.received) || !count(d.valid) || !count(d.duplicates) || !count(d.rejected) || d.received !== d.valid + d.duplicates + d.rejected || !Array.isArray(d.items) || d.items.length !== d.duplicates + d.rejected || d.items.length > MAX_ITEMS) return void 0;
    const items = [];
    const indices = /* @__PURE__ */ new Set();
    for (const raw of d.items) {
      const item = record(raw);
      if (!item || !count(item.index) || item.index < 1 || item.index > d.received || indices.has(item.index) || item.status !== "duplicate" && item.status !== "rejected") return void 0;
      indices.add(item.index);
      const reason = typeof item.reason === "string" && Object.hasOwn(IMPORT_REASON_LABELS, item.reason) ? item.reason : "unknown_reason";
      items.push({
        index: item.index,
        status: item.status,
        reason,
        ...safeId(item.externalId) ? { externalId: item.externalId } : {}
      });
    }
    if (items.filter((item) => item.status === "duplicate").length !== d.duplicates || items.filter((item) => item.status === "rejected").length !== d.rejected) return void 0;
    return {
      received: d.received,
      valid: d.valid,
      duplicates: d.duplicates,
      rejected: d.rejected,
      items: items.sort((a, b) => a.index - b.index)
    };
  }
  var SAFE_ERRORS = /* @__PURE__ */ new Set([
    "invalid_payload",
    "no_valid_products",
    "network",
    "timeout",
    "invalid_response",
    "not_paired",
    "unauthorized",
    "forbidden",
    "device_revoked",
    "account_suspended",
    "capture_expired",
    "retry_limit",
    "session_changed",
    "marketplace_capture_unavailable",
    "browser_capture_forbidden",
    "request_failed",
    "storage_or_network"
  ]);
  function sanitizeImportReport(value) {
    const raw = record(value);
    if (!raw || typeof raw.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.requestId) || !Number.isSafeInteger(raw.at) || Number(raw.at) < 0 || !Number.isFinite(new Date(Number(raw.at)).getTime()) || typeof raw.ok !== "boolean") return null;
    const result = { requestId: raw.requestId, at: Number(raw.at), ok: raw.ok, ...collectionMetadata(raw) };
    const detail = diagnostics(raw.diagnostics);
    if (detail) result.diagnostics = detail;
    if (count(raw.importedCount) && (!detail || raw.importedCount <= detail.valid)) result.importedCount = raw.importedCount;
    if (detail && result.importedCount !== void 0 && count(raw.alreadyRecordedCount) && raw.alreadyRecordedCount + result.importedCount === detail.valid) result.alreadyRecordedCount = raw.alreadyRecordedCount;
    if (typeof raw.duplicate === "boolean") result.duplicate = raw.duplicate;
    if (typeof raw.error === "string") result.error = SAFE_ERRORS.has(raw.error) ? raw.error : "request_failed";
    return result;
  }

  // src/content/ml-product-extractor.ts
  function collectMercadoLivreProduct() {
    const page = new URL(location.href);
    if (page.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/i.test(page.hostname)) return null;
    const externalId = (page.searchParams.get("wid") ?? page.pathname.match(/MLB-?(\d{6,})/i)?.[1]?.replace(/^(\d)/, "MLB$1"))?.toUpperCase();
    if (!externalId || !/^MLB\d{6,}$/.test(externalId)) return null;
    if (document.querySelector('iframe[src*="captcha" i], form[action*="validateCaptcha" i], #captchacharacters'))
      return { status: "blocked", products: [] };
    if (document.querySelector('form[action*="signin" i], form[action*="login" i]')) return { status: "needs_login", products: [] };
    const heading = (document.querySelector("h1.ui-pdp-title")?.textContent ?? "").trim().replace(/\s+/g, " ");
    const unavailable = document.querySelector('.ui-pdp-message--error, .ui-pdp-not-found, [data-testid="item-unavailable"]');
    if (unavailable && /(?:an[uú]ncio|produto|item).{0,60}(?:indispon[ií]vel|n[aã]o est[aá] dispon[ií]vel|n[aã]o existe)/i.test(unavailable.textContent ?? "")) {
      const ambiguous = page.searchParams.has("variation") || !!document.querySelector('[data-variation-id], [class*="ui-pdp-variations"]');
      return { status: ambiguous ? "configuration_mismatch" : "unavailable_confirmed", products: [] };
    }
    const priceRoot = document.querySelector(".ui-pdp-price__second-line, .ui-pdp-price__main-container");
    const amount = priceRoot?.querySelector('[aria-label*="reais" i]');
    if (heading && !priceRoot) return { status: "no_price", products: [] };
    const label = amount?.getAttribute("aria-label") ?? "";
    const match = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/i.exec(label);
    const priceCents = match ? Number(match[1].replace(/\./g, "")) * 100 + Number(match[2] ?? 0) : 0;
    if (!heading || !Number.isSafeInteger(priceCents) || priceCents <= 0 || /\b(?:faixa|entre)\b/i.test(label)) return { status: "parse_error", products: [] };
    const image = document.querySelector('img.ui-pdp-image, img[data-zoom][src*="mlstatic.com"]');
    const selected = document.querySelector('[data-variation-id][aria-checked="true"], [data-variation-id][aria-selected="true"]');
    const shownId = selected?.getAttribute("data-variation-id")?.trim();
    const requestedId = page.searchParams.get("variation");
    const variantKey = shownId && /^\d{1,24}$/.test(shownId) && (!requestedId || requestedId === shownId) ? shownId : void 0;
    if ((requestedId || shownId) && !variantKey) return { status: "configuration_mismatch", products: [] };
    const variantLabel = variantKey ? (selected?.getAttribute("aria-label") ?? selected?.getAttribute("title") ?? selected?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100) : void 0;
    const productUrl = page.origin + page.pathname + (page.searchParams.has("wid") ? `?wid=${encodeURIComponent(externalId)}` : "");
    let cdEndsAt;
    const cdEl = document.querySelector(".poly-component__countdown") || Array.from(document.querySelectorAll("[class*='countdown']")).find((el) => el.querySelectorAll(".poly-countdown__block").length >= 2);
    if (cdEl) {
      const blocks = Array.from(cdEl.querySelectorAll(".poly-countdown__block")).slice(0, 3);
      if (blocks.length === 2 || blocks.length === 3) {
        const nums = [];
        for (const b of blocks) {
          const rollers = Array.from(b.querySelectorAll(".poly-countdown__roller-container"));
          let digits = "";
          if (rollers.length > 0) {
            for (const r of rollers) {
              const st = r.querySelector(".poly-countdown__digit--static") || r.querySelector(".poly-countdown__digit");
              const t = (st?.textContent || "").trim();
              if (/^\d{1,2}$/.test(t)) digits += t;
            }
          } else {
            digits = Array.from(b.querySelectorAll(".poly-countdown__digit--static, .poly-countdown__digit")).map((d) => (d.textContent || "").trim()).filter((t) => /^\d{1,2}$/.test(t)).slice(0, 2).join("");
          }
          if (digits) {
            const val = parseInt(digits, 10);
            if (Number.isFinite(val)) nums.push(val);
          }
        }
        let sec = 0;
        if (nums.length === 3) sec = (nums[0] || 0) * 3600 + (nums[1] || 0) * 60 + (nums[2] || 0);
        else if (nums.length === 2) sec = (nums[0] || 0) * 60 + (nums[1] || 0);
        if (sec > 0) cdEndsAt = new Date(Date.now() + sec * 1e3).toISOString();
      }
    }
    const catalogId = page.pathname.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase();
    const candidateIds = [externalId, catalogId].filter((id) => Boolean(id));
    if (!cdEndsAt && typeof document.querySelectorAll === "function") {
      for (const s of Array.from(document.querySelectorAll("script"))) {
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
            const windowSlice = text.slice(idIdx, endBound);
            const m = /"(?:period_end|finish_date)"\s*:\s*"([^"]+)"/.exec(windowSlice);
            if (m && m[1]) {
              const endsMs = Date.parse(m[1]);
              if (Number.isFinite(endsMs) && endsMs > Date.now()) {
                cdEndsAt = new Date(endsMs).toISOString();
                break;
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
            if (m2 && m2[1]) {
              const endsMs = Date.parse(m2[1]);
              if (Number.isFinite(endsMs) && endsMs > Date.now()) {
                cdEndsAt = new Date(endsMs).toISOString();
                break;
              }
            }
          }
        }
        if (cdEndsAt) break;
      }
    }
    return { status: "observed", products: [{
      externalId,
      title: heading,
      productUrl,
      priceCents,
      currency: "BRL",
      priceType: /a\s+partir\s+de/i.test(label) ? "from" : "exact",
      ...cdEndsAt ? { promotionType: "lightning", promotionEndsAt: cdEndsAt } : {},
      ...variantKey ? { variantKey, ...variantLabel ? { variantLabel } : {} } : {},
      ...image?.src?.startsWith("https://") ? { imageUrl: image.src } : {}
    }] };
  }

  // ../capture/src/source-page-url.ts
  function sourcePageUrl(page, marketplace) {
    const keys = {
      mercadolivre: ["q", "search", "page", "wid", "variation"],
      amazon: ["k", "page"],
      aliexpress: ["SearchText", "page", "catId", "sku_id"]
    };
    const result = new URL(page.origin + (page.pathname || "/"));
    for (const key of keys[marketplace]) {
      for (const value of page.searchParams.getAll(key)) {
        if (!value || value.length > 120 || /[@\r\n]/.test(value)) continue;
        if (key === "page" && !/^[1-9]\d{0,4}$/.test(value)) continue;
        if (key === "wid" && !/^MLB\d{6,}$/i.test(value)) continue;
        if (["catId", "sku_id", "variation"].includes(key) && !/^\d{1,24}$/.test(value)) continue;
        if (["q", "search", "k", "SearchText"].includes(key) && (/\d{10,}/.test(value) || /(?:bearer|token|session|password|senha)/i.test(value))) continue;
        result.searchParams.append(key, value);
      }
    }
    return result.toString();
  }
  function ambiguousSourceIdentity(page, marketplace) {
    const keys = marketplace === "mercadolivre" ? ["wid", "variation"] : marketplace === "aliexpress" ? ["sku_id"] : [];
    return keys.some((key) => new Set(page.searchParams.getAll(key).map((value) => key === "wid" ? value.toUpperCase() : value)).size > 1);
  }

  // src/lib/recapture-session.ts
  var RECAPTURE_KEY = "bm_recapture_v2";
  var RECAPTURE_ALARM = "bm_recapture_v2_next";
  var pauseMs = (state) => {
    const [min, max] = state?.pace === "lento" ? [3e4, 6e4] : state?.pace === "tranquilo" ? [15e3, 3e4] : [5e3, 15e3];
    return min + Math.floor(Math.random() * (max - min + 1));
  };
  var read = async () => (await chromeStorage().get(RECAPTURE_KEY))[RECAPTURE_KEY];
  var write = async (state) => chromeStorage().set({ [RECAPTURE_KEY]: state });
  var hexToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, "0")).join("");
  var validId = (value) => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  var validStore = (value) => value === "mercadolivre" || value === "amazon" || value === "aliexpress";
  function requireDeviceAuthorization(result) {
    if (result.status === 401 || result.error === "unauthorized" || result.error === "device_revoked" || result.error === "affiliate_access_required")
      throw new Error("recapture_device_revoked");
  }
  function safeTask(value, store) {
    if (!value || typeof value !== "object") return null;
    const task = value;
    if (!validId(task.id) || task.marketplace !== store || task.kind !== "listing" && task.kind !== "pdp" || typeof task.url !== "string" || typeof task.revision !== "string" || !/^[a-f0-9]{64}$/.test(task.revision) || typeof task.deadline !== "string" || !Number.isFinite(Date.parse(task.deadline)) || Date.parse(task.deadline) <= Date.now() || !Array.isArray(task.targets) || !task.targets.length || task.targets.length > 500) return null;
    let url;
    try {
      url = new URL(task.url);
    } catch {
      return null;
    }
    const host = store === "mercadolivre" ? /(^|\.)mercadolivre\.com\.br$/i : store === "amazon" ? /(^|\.)amazon\.com\.br$/i : /(^|\.)aliexpress\.com$/i;
    if (ambiguousSourceIdentity(url, store) || url.protocol !== "https:" || url.username || url.password || url.port || !host.test(url.hostname) || sourcePageUrl(url, store) !== task.url || /\/(?:login|checkout|ap\/signin|gp\/cart|p\/trade)(?:\/|$)/i.test(url.pathname)) return null;
    const targets = [];
    for (const item of task.targets) {
      if (!item || typeof item !== "object") return null;
      const target = item;
      if (typeof target.productId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(target.productId) || typeof target.externalId !== "string" || target.externalId.length > 64 || !target.externalId || typeof target.optionKey !== "string" || !/^(?:listing|[a-f0-9]{32})$/.test(target.optionKey)) return null;
      targets.push({ productId: target.productId, externalId: target.externalId, optionKey: target.optionKey });
    }
    return { id: task.id, marketplace: store, kind: task.kind, url: task.url, revision: task.revision, deadline: task.deadline, targets };
  }
  async function schedule(state) {
    await write(state);
    if (["paused", "completed", "cancelled", "awaiting_open", "awaiting_page"].includes(state.phase)) await chrome.alarms.clear(RECAPTURE_ALARM);
    else await chrome.alarms.create(RECAPTURE_ALARM, { when: Math.max(Date.now() + 1e3, state.nextAt) });
  }
  async function recaptureStatus(scope2) {
    const state = await read();
    if (!state || !scope2 || state.origin !== scope2.origin || state.deviceId !== scope2.deviceId) return { active: false };
    return {
      active: !["completed", "cancelled"].includes(state.phase),
      phase: state.phase,
      marketplace: state.marketplace,
      pace: state.pace ?? "normal",
      completed: state.completed,
      observed: state.observed,
      residual: state.residual,
      error: state.error ?? null,
      lastReport: state.lastReport,
      remaining: state.remaining,
      mode: state.mode ?? "automatic",
      taskUrl: state.mode === "assisted" && ["awaiting_open", "awaiting_page"].includes(state.phase) ? state.task?.url : void 0
    };
  }
  async function startRecapture(scope2, store, mode = "automatic", pace = "normal") {
    if (!validStore(store)) return { ok: false, error: "marketplace_invalid" };
    if (pace !== "normal" && pace !== "tranquilo" && pace !== "lento") return { ok: false, error: "recapture_pace_invalid" };
    const existing = await read();
    if (existing && !["completed", "cancelled"].includes(existing.phase)) return { ok: false, error: "recapture_already_running" };
    await schedule({
      origin: scope2.origin,
      deviceId: scope2.deviceId,
      sessionId: crypto.randomUUID(),
      marketplace: store,
      mode,
      pace,
      phase: "between",
      attempts: 0,
      completed: 0,
      observed: 0,
      residual: 0,
      nextAt: Date.now()
    });
    return { ok: true };
  }
  async function controlRecapture(scope2, action) {
    const state = await read();
    if (!state || state.origin !== scope2.origin || state.deviceId !== scope2.deviceId) return { ok: false, error: "session_changed" };
    const controlSequence = (state.controlSequence ?? 0) + 1;
    if (!Number.isSafeInteger(controlSequence) || controlSequence > 2147483647) return { ok: false, error: "recapture_session_invalid" };
    const stopped = action === "resume" ? { ...state, controlSequence } : {
      ...state,
      controlSequence,
      phase: "paused",
      resumePhase: state.phase === "paused" ? state.resumePhase : state.phase,
      error: void 0
    };
    await schedule(stopped);
    const result = await postJson({ baseUrl: scope2.origin, token: scope2.token }, "/api/extension/recapture-plan/session", { sessionId: state.sessionId, action, controlSequence });
    requireDeviceAuthorization(result);
    if (!result.ok) {
      if (action !== "resume") await schedule({ ...stopped, error: result.error ?? "recapture_failed" });
      return result;
    }
    if (action === "pause") return { ok: true };
    if (action === "resume") await schedule({ ...stopped, phase: state.resumePhase && state.resumePhase !== "paused" ? state.resumePhase : "between", resumePhase: void 0, nextAt: Date.now() + pauseMs(state), error: void 0 });
    if (action === "cancel") {
      await schedule({ ...stopped, phase: "cancelled", error: void 0 });
      if (state.mode !== "assisted" && state.tabId !== void 0) await chrome.tabs.remove(state.tabId).catch(() => {
      });
    }
    return { ok: true };
  }
  async function stopRecapture() {
    const state = await read();
    if (state && !["completed", "cancelled"].includes(state.phase)) await schedule({ ...state, phase: "cancelled", error: "session_changed" });
    if (state?.mode !== "assisted" && state?.tabId !== void 0) await chrome.tabs.remove(state.tabId).catch(() => {
    });
    await chrome.alarms.clear(RECAPTURE_ALARM);
  }
  function detectRecaptureAccessChallenge() {
    if (document.querySelector('form[action*="validateCaptcha" i], #captchacharacters, iframe[src*="captcha/challenge" i], [data-testid="captcha-challenge"]'))
      return "blocked";
    if (document.querySelector('form[action*="signin" i] input[type="password"], form[action*="login" i] input[type="password"]'))
      return "needs_login";
    return null;
  }
  async function collectRecaptureTab(state, tab, timedOut = false) {
    if (!state.task || !state.claimToken || state.tabId === void 0) throw new Error("recapture_state_invalid");
    let failure = timedOut ? "timeout" : null, current = null;
    if (!failure) try {
      current = new URL(tab.url ?? "");
    } catch {
      failure = "timeout";
    }
    if (current && /\/(?:login|ap\/signin|account-verification|checkpoint)(?:\/|$)/i.test(current.pathname)) failure = "needs_login";
    else if (current && (current.protocol !== "https:" || sourcePageUrl(current, state.marketplace) !== state.task.url)) failure = "blocked";
    let products = [];
    if (!failure && tab.status === "complete") {
      try {
        const access = await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: detectRecaptureAccessChallenge });
        failure = access[0]?.result ?? null;
        const results = failure ? [] : state.marketplace === "mercadolivre" && state.task.kind === "pdp" ? await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: collectMercadoLivreProduct }) : state.marketplace === "mercadolivre" ? await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: collectBrowserOffers }) : await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ["content/marketplace-page.js"] });
        const payload = results[0]?.result;
        if (!failure) {
          if (!payload) failure = "parse_error";
          else if ("status" in payload && payload.status && payload.status !== "observed") failure = payload.status;
          else products = payload.products;
        }
      } catch {
        failure = "parse_error";
      }
    } else if (!failure) failure = "timeout";
    const report = {
      version: 2,
      requestId: crypto.randomUUID(),
      taskId: state.task.id,
      sessionId: state.sessionId,
      claimToken: state.claimToken,
      marketplace: state.marketplace,
      observedAt: (/* @__PURE__ */ new Date()).toISOString(),
      page: { kind: state.task.kind === "pdp" ? "product" : "listing", url: state.task.url },
      products: failure ? [] : products,
      results: state.task.targets.map((target) => ({
        ...target,
        status: failure ?? (products.some((product) => product.externalId === target.externalId) ? "observed" : state.task.kind === "pdp" ? "configuration_mismatch" : "not_found_on_listing"),
        ...failure === "unavailable_confirmed" ? { evidence: "explicit_product_unavailable" } : {}
      }))
    };
    await schedule({ ...state, phase: "reporting", report, attempts: 0, nextAt: Date.now() });
    return;
  }
  async function openAssistedRecapture(scope2) {
    let state = await read();
    if (!state || state.origin !== scope2.origin || state.deviceId !== scope2.deviceId || state.mode !== "assisted" || state.phase !== "awaiting_open" || !state.task || !state.claimRequestId || !state.claimToken)
      return { ok: false, error: "recapture_state_invalid" };
    if (state.nextAt > Date.now()) return { ok: false, error: "recapture_retry_wait" };
    if (Date.parse(state.task.deadline) <= Date.now()) {
      await schedule({ ...state, phase: "between", task: void 0, claimRequestId: void 0, claimToken: void 0, nextAt: Date.now() + pauseMs(state) });
      return { ok: false, error: "recapture_plan_changed" };
    }
    const result = await postJson({ baseUrl: scope2.origin, token: scope2.token }, "/api/extension/recapture-plan/claim", {
      requestId: state.claimRequestId,
      sessionId: state.sessionId,
      taskId: state.task.id,
      revision: state.task.revision,
      claimToken: state.claimToken,
      ...state.claimSupportsTargets ? { supportsClaimTargets: true } : {}
    }, state.claimRequestId);
    requireDeviceAuthorization(result);
    if (!result.ok) {
      if (result.error === "recapture_plan_changed" || result.error === "recapture_task_no_longer_needed" || result.error === "recapture_claim_expired") {
        await schedule({
          ...state,
          phase: "between",
          task: void 0,
          claimRequestId: void 0,
          claimToken: void 0,
          error: void 0,
          nextAt: Date.now() + pauseMs(state)
        });
        return result;
      }
      await schedule({
        ...state,
        error: result.error ?? "recapture_failed",
        nextAt: result.retryable ? Date.now() + Math.max(3e4, result.retryAfterMs ?? 0) : state.nextAt
      });
      return result;
    }
    if (result.skipped === true) {
      await schedule({
        ...state,
        phase: "between",
        task: void 0,
        claimRequestId: void 0,
        claimToken: void 0,
        error: void 0,
        nextAt: Date.now() + pauseMs(state)
      });
      return { ok: true, skipped: true };
    }
    if (typeof result.leaseUntil !== "string" || !Number.isFinite(Date.parse(result.leaseUntil)) || Date.parse(result.leaseUntil) <= Date.now())
      return { ok: false, error: "recapture_claim_expired" };
    const claimedTask = safeTask({ ...state.task, targets: state.claimSupportsTargets ? result.targets : state.task.targets }, state.marketplace);
    if (!claimedTask) return { ok: false, error: "invalid_response" };
    const task = claimedTask;
    state = { ...state, task, phase: "awaiting_page", leaseUntil: result.leaseUntil, error: void 0 };
    await schedule(state);
    try {
      const existing = state.tabId === void 0 ? null : await chrome.tabs.get(state.tabId).catch(() => null);
      if (existing?.id !== void 0) await chrome.tabs.update(existing.id, { url: task.url, active: true });
      else {
        const tab = await chrome.tabs.create({ url: task.url, active: true });
        if (tab.id !== void 0) await schedule({ ...state, tabId: tab.id });
      }
    } catch {
      return { ok: false, error: "navigation_unknown" };
    }
    return { ok: true };
  }
  async function readAssistedRecapture(scope2) {
    const state = await read();
    if (!state || state.origin !== scope2.origin || state.deviceId !== scope2.deviceId || state.mode !== "assisted" || state.phase !== "awaiting_page" || !state.task || !state.claimToken || !state.leaseUntil)
      return { ok: false, error: "recapture_state_invalid" };
    if (Date.parse(state.leaseUntil) <= Date.now()) {
      await schedule({
        ...state,
        phase: "between",
        task: void 0,
        claimRequestId: void 0,
        claimToken: void 0,
        leaseUntil: void 0,
        error: "recapture_claim_expired",
        nextAt: Date.now() + pauseMs(state)
      });
      return { ok: false, error: "recapture_claim_expired" };
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === void 0 || tab.status !== "complete" || !tab.url) return { ok: false, error: "active_page_not_ready" };
    let current;
    try {
      current = new URL(tab.url);
    } catch {
      return { ok: false, error: "active_page_mismatch" };
    }
    const expected = new URL(state.task.url);
    const login = /\/(?:login|ap\/signin|account-verification|checkpoint)(?:\/|$)/i.test(current.pathname);
    if (current.protocol !== "https:" || current.username || current.password || current.port || sourcePageUrl(current, state.marketplace) !== state.task.url && !(login && current.hostname === expected.hostname))
      return { ok: false, error: "active_page_mismatch" };
    await collectRecaptureTab({ ...state, tabId: tab.id }, tab);
    return { ok: true };
  }
  async function stepRecapture(scope2) {
    let state = await read();
    if (!state || ["completed", "cancelled"].includes(state.phase)) return;
    if (!scope2 || state.origin !== scope2.origin || state.deviceId !== scope2.deviceId) {
      await stopRecapture();
      return;
    }
    if (["paused", "awaiting_open", "awaiting_page"].includes(state.phase)) return;
    if (state.nextAt > Date.now()) {
      await schedule(state);
      return;
    }
    const pause = async (error) => schedule({ ...state, resumePhase: state.phase, phase: "paused", error });
    const retry = async (result) => {
      const attempts = state.attempts + 1;
      if (!result.retryable || attempts >= 6) return pause(result.error ?? "recapture_failed");
      await schedule({ ...state, attempts, nextAt: Date.now() + Math.max(3e4, result.retryAfterMs ?? 0) });
    };
    const abandonExpired = async (error) => schedule({
      ...state,
      phase: "between",
      task: void 0,
      claimRequestId: void 0,
      claimToken: void 0,
      leaseUntil: void 0,
      report: void 0,
      attempts: 0,
      error,
      nextAt: Date.now() + pauseMs(state)
    });
    if (state.phase === "between") {
      const result = await getJson({ baseUrl: scope2.origin, token: scope2.token }, "/api/extension/recapture-plan");
      requireDeviceAuthorization(result);
      if (!result.ok) return retry(result);
      if (!Array.isArray(result.tasks) || result.tasks.some((value) => !value || typeof value !== "object" || Array.isArray(value) || !validStore(value.marketplace)))
        return retry({ ok: false, error: "invalid_response", retryable: true });
      if (result.remaining && typeof result.remaining === "object" && !Array.isArray(result.remaining)) {
        const raw = result.remaining;
        const amount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 500 ? value : null;
        state = { ...state, remaining: { listing: amount(raw.listing), pdp: amount(raw.pdp), asOf: (/* @__PURE__ */ new Date()).toISOString() } };
      }
      const relevant = result.tasks.filter((value) => value && typeof value === "object" && !Array.isArray(value) && value.marketplace === state.marketplace);
      const parsed = relevant.map((value) => safeTask(value, state.marketplace));
      if (parsed.some((task2) => task2 === null)) return retry({ ok: false, error: "invalid_response", retryable: true });
      const task = parsed.find(Boolean) ?? null;
      if (!task) {
        if (Array.isArray(result.busyMarketplaces) && result.busyMarketplaces.includes(state.marketplace))
          return pause("recapture_target_busy");
        if (result.planUpdating === true) return pause("recapture_plan_updating");
        await schedule({ ...state, phase: "completed", error: void 0 });
        if (state.mode !== "assisted" && state.tabId !== void 0) await chrome.tabs.remove(state.tabId).catch(() => {
        });
        return;
      }
      state = {
        ...state,
        task,
        phase: state.mode === "assisted" ? "awaiting_open" : "claiming",
        claimRequestId: crypto.randomUUID(),
        claimToken: hexToken(),
        claimSupportsTargets: Array.isArray(result.capabilities) && result.capabilities.includes("claim-targets-v1"),
        attempts: 0,
        nextAt: Date.now()
      };
      await schedule(state);
      return;
    }
    if (!state.task || !state.claimRequestId || !state.claimToken) return pause("recapture_state_invalid");
    if (state.phase === "claiming") {
      const origins = { mercadolivre: "https://*.mercadolivre.com.br/*", amazon: "https://*.amazon.com.br/*", aliexpress: "https://*.aliexpress.com/*" };
      if (!await chrome.permissions.contains({ origins: [origins[state.marketplace]] })) return pause("permission_required");
      const result = await postJson({ baseUrl: scope2.origin, token: scope2.token }, "/api/extension/recapture-plan/claim", {
        requestId: state.claimRequestId,
        sessionId: state.sessionId,
        taskId: state.task.id,
        revision: state.task.revision,
        claimToken: state.claimToken,
        ...state.claimSupportsTargets ? { supportsClaimTargets: true } : {}
      }, state.claimRequestId);
      requireDeviceAuthorization(result);
      if (!result.ok) {
        if (result.error === "recapture_plan_changed" || result.error === "recapture_claim_expired" || result.error === "recapture_target_busy" || result.error === "recapture_task_no_longer_needed") return abandonExpired(result.error);
        return retry(result);
      }
      if (result.skipped === true) {
        await schedule({
          ...state,
          phase: "between",
          task: void 0,
          claimRequestId: void 0,
          claimToken: void 0,
          attempts: 0,
          error: void 0,
          nextAt: Date.now() + pauseMs(state)
        });
        return;
      }
      if (typeof result.leaseUntil !== "string" || !Number.isFinite(Date.parse(result.leaseUntil)) || Date.parse(result.leaseUntil) <= Date.now()) return pause("recapture_claim_expired");
      const claimedTask = safeTask({ ...state.task, targets: state.claimSupportsTargets ? result.targets : state.task.targets }, state.marketplace);
      if (!claimedTask) return pause("invalid_response");
      await schedule({ ...state, task: claimedTask, phase: "preparing_tab", leaseUntil: result.leaseUntil, attempts: 0, nextAt: Date.now() + pauseMs(state) });
      return;
    }
    if (state.phase === "preparing_tab") {
      if (!state.leaseUntil || Date.parse(state.leaseUntil) <= Date.now()) return abandonExpired("recapture_claim_expired");
      const origins = { mercadolivre: "https://*.mercadolivre.com.br/*", amazon: "https://*.amazon.com.br/*", aliexpress: "https://*.aliexpress.com/*" };
      if (!await chrome.permissions.contains({ origins: [origins[state.marketplace]] })) return pause("permission_required");
      let tabId = state.tabId;
      if (tabId === void 0) {
        const tab = await chrome.tabs.create({ url: "about:blank", active: false });
        if (tab.id === void 0) return pause("tab_unavailable");
        tabId = tab.id;
      }
      state = { ...state, tabId, phase: "navigating", navigationStartedAt: Date.now(), nextAt: Date.now() + 1e4 };
      await schedule(state);
      try {
        await chrome.tabs.update(tabId, { url: state.task.url });
      } catch {
        await schedule({ ...state, phase: "paused", resumePhase: "navigating", error: "navigation_unknown" });
      }
      return;
    }
    if (state.phase === "navigating") {
      if (!state.leaseUntil || Date.parse(state.leaseUntil) <= Date.now()) return abandonExpired("recapture_claim_expired");
      if (state.tabId === void 0) return pause("tab_unavailable");
      let tab;
      try {
        tab = await chrome.tabs.get(state.tabId);
      } catch {
        return pause("tab_unavailable");
      }
      const loading = tab.status !== "complete" || Boolean(tab.pendingUrl);
      if (loading && Date.now() - (state.navigationStartedAt ?? Date.now()) < 12e4) {
        await schedule({ ...state, nextAt: Date.now() + 15e3 });
        return;
      }
      await collectRecaptureTab(state, tab, loading);
      return;
    }
    if (state.phase === "reporting") {
      if (!state.report) return pause("recapture_state_invalid");
      const result = await postJson({ baseUrl: scope2.origin, token: scope2.token }, "/api/extension/observations", state.report, state.report.requestId);
      requireDeviceAuthorization(result);
      if (!result.ok) {
        if (result.error === "recapture_claim_expired") {
          return abandonExpired(result.error);
        }
        return retry(result);
      }
      const validCount = (value, max) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
      if (!validCount(result.observed, 500) || !validCount(result.residual, 500) || !validCount(result.unreported, 500) || !validCount(result.unavailable, 500) || !validCount(result.discovered, 200) || !Array.isArray(result.results) || result.results.length > 500)
        return retry({ ok: false, error: "invalid_response", retryable: true });
      const resultKeys = /* @__PURE__ */ new Set();
      for (const item of result.results) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return retry({ ok: false, error: "invalid_response", retryable: true });
        const row = item;
        if (typeof row.productId !== "string" || typeof row.optionKey !== "string" || !["observed", "unavailable_confirmed", "residual", "unreported"].includes(String(row.status)))
          return retry({ ok: false, error: "invalid_response", retryable: true });
        const key = JSON.stringify([row.productId, row.optionKey]);
        if (resultKeys.has(key)) return retry({ ok: false, error: "invalid_response", retryable: true });
        resultKeys.add(key);
      }
      if (state.claimSupportsTargets && (resultKeys.size !== state.task.targets.length || state.task.targets.some((target) => !resultKeys.has(JSON.stringify([target.productId, target.optionKey])))))
        return retry({ ok: false, error: "invalid_response", retryable: true });
      const blocking = state.report.results.some((item) => item.status === "needs_login") ? "needs_login" : state.report.results.some((item) => item.status === "blocked") ? "blocked" : void 0;
      const allowedReasons = /* @__PURE__ */ new Set([
        "price_conflict",
        "no_price",
        "not_found_on_listing",
        "configuration_mismatch",
        "needs_login",
        "blocked",
        "parse_error",
        "timeout",
        "superseded_observation",
        "unreported"
      ]);
      const reasons = {};
      if (Array.isArray(result.results) && result.results.length <= 500) for (const raw of result.results) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const item = raw;
        const reason = item.status === "unreported" ? "unreported" : item.status === "residual" ? item.reason : null;
        if (typeof reason === "string" && allowedReasons.has(reason)) reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      const count2 = (value, max) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : 0;
      const lastReport = { discovered: count2(result.discovered, 200), unavailable: count2(result.unavailable, 500), reasons };
      await schedule({
        ...state,
        phase: blocking ? "paused" : "between",
        resumePhase: blocking ? "between" : void 0,
        error: blocking,
        task: void 0,
        claimRequestId: void 0,
        claimToken: void 0,
        leaseUntil: void 0,
        report: void 0,
        completed: state.completed + 1,
        observed: state.observed + (typeof result.observed === "number" ? result.observed : 0),
        residual: state.residual + (typeof result.residual === "number" ? result.residual : 0) + (typeof result.unreported === "number" ? result.unreported : 0),
        lastReport,
        attempts: 0,
        nextAt: Date.now() + pauseMs(state)
      });
    }
  }

  // src/background/service-worker.ts
  var COLLECTOR_VERSION = "0.3.7".length <= 64 && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test("0.3.7") ? "0.3.7" : null;
  var DEFAULT_API_BASE = BUILD_API_ORIGIN;
  async function getActiveApiBase() {
    return DEFAULT_API_BASE;
  }
  var OUTBOX_KEY = STORAGE_KEYS.outbox;
  var RETRY_ALARM = "bm_retry";
  var RECEIPTS_KEY = "bm_capture_receipts";
  var IMPORT_REPORT_KEY = "bm_last_import_report";
  var IMPORT_REPORT_TTL_MS = 24 * 60 * 60 * 1e3;
  var tail = Promise.resolve();
  function serialize(work) {
    const task = tail.then(work, work);
    tail = task.catch(() => void 0);
    return task;
  }
  async function readOutbox() {
    const data = await chromeStorage().get(OUTBOX_KEY);
    return Array.isArray(data[OUTBOX_KEY]) ? data[OUTBOX_KEY] : [];
  }
  async function writeOutbox(items) {
    await chromeStorage().set({ [OUTBOX_KEY]: items });
  }
  async function readBatch() {
    return (await chromeStorage().get(BROWSER_BATCH_KEY))[BROWSER_BATCH_KEY];
  }
  async function writeBatch(batch) {
    await chromeStorage().set({ [BROWSER_BATCH_KEY]: batch });
  }
  var matches = (item, scope2) => item.origin === scope2.origin && item.deviceId === scope2.deviceId;
  async function scope() {
    const data = await chromeStorage().get([STORAGE_KEYS.token, STORAGE_KEYS.deviceId, STORAGE_KEYS.sessionOrigin]);
    const token = data[STORAGE_KEYS.token], deviceId = data[STORAGE_KEYS.deviceId];
    return typeof token === "string" && token.startsWith("bm_ext_") && typeof deviceId === "string" && !!deviceId && data[STORAGE_KEYS.sessionOrigin] === DEFAULT_API_BASE ? { token, deviceId, origin: DEFAULT_API_BASE } : null;
  }
  async function readImportReport(current) {
    const stored = (await chromeStorage().get(IMPORT_REPORT_KEY))[IMPORT_REPORT_KEY];
    if (!stored) return null;
    const report = sanitizeImportReport(stored.report);
    if (!current || !matches(stored, current) || !report || Date.now() - report.at >= IMPORT_REPORT_TTL_MS || report.at > Date.now() + 6e4) {
      await chromeStorage().set({ [IMPORT_REPORT_KEY]: null });
      return null;
    }
    return report;
  }
  async function rememberImport(current, saved, result, clearBatch = false) {
    const report = sanitizeImportReport({
      requestId: saved.payload?.requestId,
      at: Date.now(),
      ok: result.ok,
      capturedAt: saved.payload?.clientCapturedAt,
      preparedVersion: saved.collectorVersion ?? null,
      importedCount: result.importedCount,
      alreadyRecordedCount: result.alreadyRecordedCount,
      error: result.error,
      diagnostics: result.diagnostics
    });
    if (!report) throw new Error("invalid_import_report");
    await chromeStorage().set({
      [IMPORT_REPORT_KEY]: { origin: current.origin, deviceId: current.deviceId, report },
      ...clearBatch ? { [BROWSER_BATCH_KEY]: null } : {}
    });
    return report;
  }
  async function stopSession(reason) {
    await stopRecapture();
    await clearSession(chromeStorage());
    await chromeStorage().set({ [IMPORT_REPORT_KEY]: null });
    await writeOutbox((await readOutbox()).map((entry) => ({ ...entry, stopped: true, lastError: reason })));
    const batch = await readBatch();
    if (batch?.payload) await writeBatch({ ...batch, queued: false, stopped: true, lastError: reason });
    await chrome.alarms.clear(RETRY_ALARM);
    await chrome.alarms.clear(BATCH_QUEUE_ALARM);
  }
  async function reconcile() {
    const current = await scope();
    await readImportReport(current);
    if (!current) await clearSession(chromeStorage());
    await chromeStorage().set({ [STORAGE_KEYS.apiBaseUrl]: DEFAULT_API_BASE });
    await writeOutbox(pruneExpired(await readOutbox()).map((entry) => !entry.stopped && (!current || !matches(entry, current)) ? { ...entry, stopped: true, lastError: "session_changed" } : entry));
    const batch = await readBatch();
    if (batch?.payload && !batch.stopped) {
      const expired = Date.now() - Date.parse(batch.payload.clientCapturedAt) >= BATCH_MAX_AGE_MS;
      if (!current || !matches(batch, current) || expired || (batch.attempts ?? 0) >= BATCH_MAX_ATTEMPTS)
        await writeBatch({ ...batch, stopped: true, queued: false, lastError: !current || !matches(batch, current) ? "session_changed" : expired ? "capture_expired" : "retry_limit" });
    }
  }
  async function schedule2() {
    const current = await scope();
    const items = (await readOutbox()).filter((entry) => !entry.stopped && current && matches(entry, current));
    if (items.length) await chrome.alarms.create(RETRY_ALARM, { when: Math.max(
      Date.now() + 1e3,
      Math.min(...items.map((entry) => Math.min(entry.nextRetryAt, entry.addedAt + OUTBOX_TTL_MS)))
    ) });
    else await chrome.alarms.clear(RETRY_ALARM);
    const batch = await readBatch();
    if (batch?.queued && !batch.stopped && batch.payload && current && matches(batch, current))
      await chrome.alarms.create(BATCH_QUEUE_ALARM, { when: Math.max(
        Date.now() + 1e3,
        Math.min(batch.nextRetryAt ?? Date.now(), Date.parse(batch.payload.clientCapturedAt) + BATCH_MAX_AGE_MS)
      ) });
    else await chrome.alarms.clear(BATCH_QUEUE_ALARM);
    const failed = (await readOutbox()).some((entry) => entry.stopped) || batch?.stopped;
    await chrome.action.setBadgeText({ text: failed ? "!" : items.length ? String(items.length) : batch?.queued ? "\u2026" : "" });
    if (failed || items.length || batch?.queued) await chrome.action.setBadgeBackgroundColor({ color: failed ? "#a52a24" : "#f59e0b" });
  }
  async function coordinated(work) {
    return serialize(async () => {
      await reconcile();
      try {
        return await work();
      } catch (error) {
        if (error instanceof Error && error.message === "recapture_device_revoked") await stopSession("not_paired");
        throw error;
      } finally {
        await schedule2();
      }
    });
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message && typeof message === "object" ? message.type : "";
    const popupOnly = [
      "PAIR",
      "LOGOUT",
      "SET_ENV",
      "PREPARE_BATCH",
      "REFRESH_BATCH",
      "IMPORT_BATCH",
      "CANCEL_BATCH",
      "CLEAR_FAILED",
      "CAPTURE_ACTIVE",
      "RECAPTURE_START",
      "RECAPTURE_PAUSE",
      "RECAPTURE_RESUME",
      "RECAPTURE_CANCEL",
      "RECAPTURE_STATUS",
      "RECAPTURE_ASSIST_OPEN",
      "RECAPTURE_ASSIST_READ"
    ];
    if (popupOnly.includes(type) && sender.url !== chrome.runtime.getURL("popup/index.html")) {
      sendResponse({ ok: false, error: "invalid_sender" });
      return false;
    }
    void coordinated(() => handleMessage(message)).then(sendResponse, (error) => sendResponse({
      ok: false,
      error: error instanceof Error && error.message === "recapture_device_revoked" ? "not_paired" : "storage_or_network"
    }));
    return true;
  });
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id != null) void chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/activate-catalog.js"] }).catch(() => {
    });
  });
  var wake = () => {
    void coordinated(async () => {
      await stepRecapture(await scope());
    }).catch(() => {
    });
  };
  chrome.runtime.onInstalled.addListener(wake);
  chrome.runtime.onStartup.addListener(wake);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM) void coordinated(processDueOutbox).catch(() => {
    });
    if (alarm.name === BATCH_QUEUE_ALARM) void coordinated(async () => {
      await importBrowserBatch(true);
    }).catch(() => {
    });
    if (alarm.name === RECAPTURE_ALARM) void coordinated(async () => {
      await stepRecapture(await scope());
    }).catch(() => {
    });
  });
  wake();
  var authFailed = (result) => result.status === 401 || result.error === "unauthorized" || result.error === "device_revoked" || result.error === "affiliate_access_required";
  var delay = (attempts, result) => Math.max(RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)], result.retryAfterMs ?? 0);
  async function remember(entry, result) {
    const data = await chromeStorage().get(RECEIPTS_KEY);
    const receipts = Array.isArray(data[RECEIPTS_KEY]) ? data[RECEIPTS_KEY] : [];
    await chromeStorage().set({ [RECEIPTS_KEY]: [
      ...receipts.filter((r) => Date.now() - r.at < OUTBOX_TTL_MS).slice(-199),
      { requestId: entry.requestId, origin: entry.origin, deviceId: entry.deviceId, at: Date.now(), result }
    ] });
  }
  async function deliverSingle(entry, current) {
    const sending = { ...entry, attempts: entry.attempts + 1, nextRetryAt: Date.now() + 3e4 };
    await writeOutbox((await readOutbox()).map((e) => e.requestId === entry.requestId ? sending : e));
    await schedule2();
    const result = await postCapture({ baseUrl: current.origin, token: current.token }, entry.payload);
    if (result.ok) {
      await remember(sending, result);
      await writeOutbox(dequeue(await readOutbox(), entry.requestId));
    } else if (authFailed(result)) await stopSession("not_paired");
    else {
      const stopped = !result.retryable || sending.attempts >= OUTBOX_MAX_ATTEMPTS;
      await writeOutbox((await readOutbox()).map((e) => e.requestId !== entry.requestId ? e : {
        ...sending,
        stopped,
        lastError: sending.attempts >= OUTBOX_MAX_ATTEMPTS ? "retry_limit" : result.error ?? "request_failed",
        nextRetryAt: Date.now() + delay(sending.attempts, result)
      }));
    }
    return result;
  }
  async function processDueOutbox() {
    const current = await scope();
    if (!current) return;
    const entry = (await readOutbox()).find((e) => !e.stopped && matches(e, current) && e.nextRetryAt <= Date.now());
    if (entry) await deliverSingle(entry, current);
  }
  async function handleMessage(message) {
    if (!message || typeof message !== "object") return { ok: false, error: "invalid_message" };
    const msg = message;
    switch (msg.type) {
      case "GET_ENV":
        return { ok: true, baseUrl: DEFAULT_API_BASE, allowedBaseUrls: [DEFAULT_API_BASE] };
      case "SET_ENV":
        return msg.baseUrl === DEFAULT_API_BASE ? { ok: true, baseUrl: DEFAULT_API_BASE } : { ok: false, error: "invalid_url" };
      case "PAIR":
        return handlePair(msg);
      case "LOGOUT":
        await stopSession("session_changed");
        return { ok: true };
      case "CAPTURE":
        return handleCapture(msg);
      case "PREPARE_BATCH":
        return prepareBrowserBatch();
      case "REFRESH_BATCH":
        return prepareBrowserBatch(true);
      case "IMPORT_BATCH":
        return importBrowserBatch();
      case "CAPTURE_ACTIVE":
        return captureActiveProduct();
      case "CANCEL_BATCH":
        await writeBatch(null);
        return { ok: true };
      case "CLEAR_FAILED":
        await writeOutbox((await readOutbox()).filter((e) => !e.stopped));
        return { ok: true };
      case "RECAPTURE_STATUS":
        return { ok: true, ...await recaptureStatus(await scope()) };
      case "RECAPTURE_START": {
        const current = await scope();
        if (!current) return { ok: false, error: "not_paired" };
        const origins = { mercadolivre: "https://*.mercadolivre.com.br/*", amazon: "https://*.amazon.com.br/*", aliexpress: "https://*.aliexpress.com/*" };
        const origin = typeof msg.marketplace === "string" ? origins[msg.marketplace] : void 0;
        if (!origin) return { ok: false, error: "marketplace_invalid" };
        const assisted = msg.assisted === true;
        if (!assisted && !await chrome.permissions.contains({ origins: [origin] })) return { ok: false, error: "permission_required" };
        return startRecapture(current, msg.marketplace, assisted ? "assisted" : "automatic", msg.pace ?? "normal");
      }
      case "RECAPTURE_ASSIST_OPEN":
      case "RECAPTURE_ASSIST_READ": {
        const current = await scope();
        if (!current) return { ok: false, error: "not_paired" };
        return msg.type === "RECAPTURE_ASSIST_OPEN" ? openAssistedRecapture(current) : readAssistedRecapture(current);
      }
      case "RECAPTURE_PAUSE":
      case "RECAPTURE_RESUME":
      case "RECAPTURE_CANCEL": {
        const current = await scope();
        if (!current) return { ok: false, error: "not_paired" };
        return controlRecapture(current, msg.type === "RECAPTURE_PAUSE" ? "pause" : msg.type === "RECAPTURE_RESUME" ? "resume" : "cancel");
      }
      case "PENDING": {
        const outbox = await readOutbox();
        return {
          ok: true,
          pending: outbox.filter((e) => !e.stopped).length,
          failed: outbox.filter((e) => e.stopped).length,
          errors: outbox.filter((e) => e.stopped).map((e) => e.lastError ?? "request_failed")
        };
      }
      case "GET_BATCH_STATE": {
        const saved = await readBatch();
        const lastImport = await readImportReport(await scope());
        return saved?.payload ? {
          ok: true,
          hasBatch: true,
          queued: Boolean(saved.queued),
          stopped: Boolean(saved.stopped),
          lastError: saved.lastError,
          count: saved.payload.products.length,
          marketplace: saved.payload.marketplace,
          lightningCount: saved.payload.products.filter((p) => p.promotionType === "lightning").length,
          attempts: saved.attempts ?? 0,
          queuedAt: saved.queuedAt,
          lastImport,
          capturedAt: saved.payload.clientCapturedAt,
          preparedVersion: saved.collectorVersion ?? null,
          sent: Boolean(saved.sent),
          canReplace: canReplaceBatch(saved)
        } : { ok: true, hasBatch: false, lastImport, capturedAt: null, preparedVersion: null, sent: false, canReplace: false };
      }
      default:
        return { ok: false, error: "unknown_message" };
    }
  }
  function canReplaceBatch(saved) {
    return !saved.sent && !saved.queued && !(saved.attempts && saved.attempts > 0) && !saved.batchId;
  }
  async function prepareBrowserBatch(replace = false) {
    const current = await scope();
    if (!current) return { ok: false, error: "not_paired" };
    const saved = await readBatch();
    if (saved?.payload && replace && !canReplaceBatch(saved)) return { ok: false, error: "discard_required" };
    if (saved?.payload && !replace) return {
      ok: !saved.stopped,
      error: saved.lastError,
      preserved: true,
      count: saved.payload.products.length,
      retry: Boolean(saved.sent),
      queued: Boolean(saved.queued),
      stopped: Boolean(saved.stopped),
      capturedAt: saved.payload.clientCapturedAt,
      preparedVersion: saved.collectorVersion ?? null,
      sent: Boolean(saved.sent),
      canReplace: canReplaceBatch(saved)
    };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url) : null;
    const host = url?.hostname ?? "";
    const marketplace = /(^|\.)mercadolivre\.com\.br$/.test(host) ? "mercadolivre" : /(^|\.)amazon\.com\.br$/.test(host) ? "amazon" : /(^|\.)aliexpress\.com$/.test(host) ? "aliexpress" : null;
    if (tab?.id == null || url?.protocol !== "https:" || !marketplace)
      return { ok: false, error: "offers_page_required" };
    let payload;
    try {
      const target = { tabId: tab.id };
      const results = marketplace === "mercadolivre" ? await chrome.scripting.executeScript({ target, func: collectBrowserOffers }) : await chrome.scripting.executeScript({ target, files: ["content/marketplace-page.js"] });
      payload = results[0]?.result;
    } catch (err) {
      console.error("Erro ao executar leitura de ofertas na aba ativa:", err);
      return { ok: false, error: "offers_page_required" };
    }
    if (!payload?.products.length) return {
      ok: false,
      error: "no_offers",
      diagnostics: payload && "diagnostics" in payload ? payload.diagnostics : void 0
    };
    await writeBatch({ payload, collectorVersion: COLLECTOR_VERSION, sent: false, queued: false, origin: current.origin, deviceId: current.deviceId });
    return {
      ok: true,
      count: payload.products.length,
      ignored: payload.ignoredCards,
      lightningCount: payload.products.filter((p) => p.promotionType === "lightning").length,
      capturedAt: payload.clientCapturedAt,
      preparedVersion: COLLECTOR_VERSION,
      sent: false,
      canReplace: true,
      diagnostics: "diagnostics" in payload ? payload.diagnostics : void 0,
      sample: payload.products[0]
    };
  }
  async function captureActiveProduct() {
    const current = await scope();
    if (!current) return { ok: false, error: "not_paired" };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url) : null;
    const host = url?.hostname ?? "";
    const marketplace = /(^|\.)mercadolivre\.com\.br$/.test(host) ? "mercadolivre" : /(^|\.)amazon\.com\.br$/.test(host) ? "amazon" : /(^|\.)aliexpress\.com$/.test(host) ? "aliexpress" : null;
    if (tab?.id == null || url?.protocol !== "https:" || !marketplace)
      return { ok: false, error: "offers_page_required" };
    let payload;
    try {
      const target = { tabId: tab.id };
      const results = marketplace === "mercadolivre" ? await chrome.scripting.executeScript({ target, func: collectBrowserOffers }) : await chrome.scripting.executeScript({ target, files: ["content/marketplace-page.js"] });
      payload = results[0]?.result;
    } catch (err) {
      console.error("Erro ao executar leitura de an\xFAncio na aba ativa:", err);
      return { ok: false, error: "offers_page_required" };
    }
    if (!payload?.products.length) return { ok: false, error: "no_offers" };
    const singleProduct = payload.products[0];
    const singlePayload = { ...payload, products: [singleProduct], ignoredCards: 0 };
    const saved = {
      payload: singlePayload,
      collectorVersion: COLLECTOR_VERSION,
      sent: true,
      queued: false,
      origin: current.origin,
      deviceId: current.deviceId
    };
    let result = await postJson(
      { baseUrl: current.origin, token: current.token },
      "/api/extension/capture-batches",
      { mode: "manual", payload: singlePayload },
      singlePayload.requestId
    );
    if (result.ok && (!Number.isSafeInteger(result.importedCount) || (result.importedCount ?? -1) < 0 || (result.importedCount ?? 0) > 1))
      result = { ok: false, error: "invalid_response", retryable: true };
    if (result.ok) {
      const lastImport = await rememberImport(current, saved, result, false);
      return { ...result, count: 1, sample: singleProduct, lastImport };
    } else if (authFailed(result)) {
      await stopSession("not_paired");
      return result;
    } else if (result.retryable) {
      await writeBatch({ ...saved, queued: true, queuedAt: Date.now(), attempts: 1, lastAttemptAt: Date.now(), nextRetryAt: Date.now() + 3e4 });
      return { ok: true, queued: true, count: 1, sample: singleProduct, attempts: 1, error: result.error };
    } else {
      await rememberImport(current, saved, result, false);
      return result;
    }
  }
  async function importBrowserBatch(fromAlarm = false) {
    const current = await scope();
    if (!current) return { ok: false, error: "not_paired" };
    const saved = await readBatch();
    if (!saved?.payload) return { ok: false, error: "prepare_first" };
    if (saved.stopped || !matches(saved, current)) return { ok: false, error: saved.lastError ?? "session_changed" };
    if (fromAlarm && !saved.queued || (saved.nextRetryAt ?? 0) > Date.now())
      return { ok: true, queued: Boolean(saved.queued), count: saved.payload.products.length, attempts: saved.attempts ?? 0 };
    const sending = {
      ...saved,
      sent: true,
      queued: true,
      queuedAt: saved.queuedAt ?? Date.now(),
      attempts: (saved.attempts ?? 0) + 1,
      lastAttemptAt: Date.now(),
      nextRetryAt: Date.now() + 3e4
    };
    await writeBatch(sending);
    await schedule2();
    let result = await postJson(
      { baseUrl: current.origin, token: current.token },
      "/api/extension/capture-batches",
      { mode: "manual", payload: saved.payload },
      saved.payload.requestId
    );
    if (result.ok && (!Number.isSafeInteger(result.importedCount) || (result.importedCount ?? -1) < 0 || (result.importedCount ?? 0) > saved.payload.products.length))
      result = { ok: false, error: "invalid_response", retryable: true };
    if (result.ok) {
      const lastImport = await rememberImport(current, saved, result, true);
      return { ...result, lastImport };
    } else if (authFailed(result)) await stopSession("not_paired");
    else {
      if (!result.retryable) await rememberImport(current, saved, result);
      const stopped = !result.retryable || sending.attempts >= BATCH_MAX_ATTEMPTS;
      await writeBatch({
        ...sending,
        stopped,
        queued: !stopped,
        lastError: sending.attempts >= BATCH_MAX_ATTEMPTS ? "retry_limit" : result.error ?? "request_failed",
        nextRetryAt: Date.now() + delay(sending.attempts, result)
      });
      if (!stopped) return { ok: true, queued: true, count: saved.payload.products.length, attempts: sending.attempts, error: result.error };
    }
    return result;
  }
  async function handleCapture(msg) {
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    const card = msg.card;
    const pageUrl = typeof msg.pageUrl === "string" ? msg.pageUrl : "";
    if (!requestId || !card) return { ok: false, error: "invalid_message" };
    const current = await scope();
    if (!current) return { ok: false, error: "not_paired" };
    const receiptData = await chromeStorage().get(RECEIPTS_KEY);
    const receipts = Array.isArray(receiptData[RECEIPTS_KEY]) ? receiptData[RECEIPTS_KEY] : [];
    const receipt = receipts.find((r) => r.requestId === requestId && matches(r, current) && Date.now() - r.at < OUTBOX_TTL_MS);
    if (receipt) return receipt.result;
    const outbox = await readOutbox();
    const previous = outbox.find((entry) => entry.requestId === requestId);
    if (previous) return { ok: false, error: previous.stopped ? previous.lastError : "queued" };
    const marketplace = card.marketplace ?? (/(^|\.)amazon\.com\.br$/.test(new URL(pageUrl).hostname) ? "amazon" : "mercadolivre");
    const payload = {
      version: 1,
      requestId,
      marketplace,
      clientCapturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      page: { kind: pageKindFor(pageUrl), url: pageUrl },
      product: card
    };
    let next;
    try {
      next = enqueue(outbox, payload).map((e) => e.requestId === requestId ? { ...e, origin: current.origin, deviceId: current.deviceId } : e);
    } catch {
      return { ok: false, error: "queue_full" };
    }
    await writeOutbox(next);
    const result = await deliverSingle(next.find((e) => e.requestId === requestId), current);
    return result.ok || !result.retryable ? result : { ok: false, error: "queued" };
  }
  async function handlePair(msg) {
    if (typeof msg.pairingCode !== "string" || !msg.pairingCode.trim()) return { ok: false, error: "invalid_message" };
    await stopSession("session_changed");
    const result = await exchangePairingCode({ baseUrl: DEFAULT_API_BASE }, msg.pairingCode);
    if (!result.ok || !result.deviceToken || !result.deviceId) return { ok: false, error: result.error ?? "exchange_failed" };
    await setSession(chromeStorage(), {
      token: result.deviceToken,
      deviceId: result.deviceId,
      affiliateName: result.affiliate?.displayName ?? "",
      origin: DEFAULT_API_BASE
    });
    return { ok: true, baseUrl: DEFAULT_API_BASE, affiliateName: result.affiliate?.displayName ?? "" };
  }
})();
