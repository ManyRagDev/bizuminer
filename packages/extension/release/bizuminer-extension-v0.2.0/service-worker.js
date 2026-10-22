"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/lib/api.ts
  var api_exports = {};
  __export(api_exports, {
    exchangePairingCode: () => exchangePairingCode,
    postCapture: () => postCapture
  });
  function postCapture(opts, payload) {
    const fetchImpl = opts.fetchImpl ?? fetch;
    return fetchImpl(`${opts.baseUrl}/api/extension/captures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
        "Idempotency-Key": payload.requestId
      },
      body: JSON.stringify(payload)
    }).then(async (response) => {
      const body = await response.json();
      return { ...body, ok: response.status >= 200 && response.status < 300 && body.ok === true };
    });
  }
  function exchangePairingCode(opts, pairingCode) {
    const fetchImpl = opts.fetchImpl ?? fetch;
    return fetchImpl(`${opts.baseUrl}/api/extension/pair/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode })
    }).then(async (response) => {
      const body = await response.json();
      return { ...body, ok: response.status >= 200 && response.status < 300 && body.ok === true };
    });
  }
  var init_api = __esm({
    "src/lib/api.ts"() {
      "use strict";
    }
  });

  // src/lib/storage.ts
  var storage_exports = {};
  __export(storage_exports, {
    STORAGE_KEYS: () => STORAGE_KEYS,
    chromeStorage: () => chromeStorage,
    clearSession: () => clearSession,
    getApiBaseUrl: () => getApiBaseUrl,
    getToken: () => getToken,
    setApiBaseUrl: () => setApiBaseUrl,
    setSession: () => setSession
  });
  function chromeStorage() {
    return chrome.storage.local;
  }
  async function getToken(storage) {
    const data = await storage.get(STORAGE_KEYS.token);
    const token = data[STORAGE_KEYS.token];
    return typeof token === "string" && token.length > 0 ? token : null;
  }
  async function getApiBaseUrl(storage, fallback = "http://localhost:3100") {
    const data = await storage.get(STORAGE_KEYS.apiBaseUrl);
    const url = data[STORAGE_KEYS.apiBaseUrl];
    return typeof url === "string" && url.length > 0 ? url : fallback;
  }
  async function setApiBaseUrl(storage, url) {
    await storage.set({ [STORAGE_KEYS.apiBaseUrl]: url });
  }
  async function setSession(storage, session) {
    await storage.set({
      [STORAGE_KEYS.token]: session.token,
      [STORAGE_KEYS.deviceId]: session.deviceId,
      [STORAGE_KEYS.affiliateName]: session.affiliateName
    });
  }
  async function clearSession(storage) {
    await storage.set({
      [STORAGE_KEYS.token]: "",
      [STORAGE_KEYS.deviceId]: "",
      [STORAGE_KEYS.affiliateName]: ""
    });
  }
  var STORAGE_KEYS;
  var init_storage = __esm({
    "src/lib/storage.ts"() {
      "use strict";
      STORAGE_KEYS = {
        token: "bm_token",
        deviceId: "bm_device_id",
        affiliateName: "bm_affiliate_name",
        activeTabId: "bm_active_tab_id",
        outbox: "bm_outbox",
        apiBaseUrl: "bm_api_base_url"
      };
    }
  });

  // src/background/service-worker.ts
  init_api();
  init_storage();

  // src/lib/outbox.ts
  var OUTBOX_MAX_ITEMS = 200;
  var OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var RETRY_DELAYS_MS = [5e3, 3e4, 12e4, 6e5];
  function enqueue(outbox, payload, now = Date.now()) {
    if (outbox.some((e) => e.requestId === payload.requestId)) return outbox;
    const entry = {
      requestId: payload.requestId,
      payload,
      attempts: 0,
      addedAt: now,
      nextRetryAt: now
    };
    const next = [...outbox, entry];
    return next.length > OUTBOX_MAX_ITEMS ? next.slice(next.length - OUTBOX_MAX_ITEMS) : next;
  }
  function dequeue(outbox, requestId) {
    return outbox.filter((e) => e.requestId !== requestId);
  }
  function markRetry(outbox, requestId, error, now = Date.now()) {
    return outbox.map((e) => {
      if (e.requestId !== requestId) return e;
      const delay = RETRY_DELAYS_MS[Math.min(e.attempts, RETRY_DELAYS_MS.length - 1)];
      return { ...e, attempts: e.attempts + 1, lastError: error, nextRetryAt: now + delay };
    });
  }
  function pruneExpired(outbox, now = Date.now()) {
    return outbox.filter((e) => now - e.addedAt < OUTBOX_TTL_MS);
  }
  function dueForRetry(outbox, now = Date.now()) {
    return outbox.filter((e) => e.nextRetryAt <= now);
  }

  // src/lib/contracts.ts
  function pageKindFor(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return "category";
    }
    const path = u.pathname;
    if (/\/ofertas/.test(path)) return "offers";
    if (/\/p\/MLB/.test(path) || /\/MLB-\d/.test(path)) return "product";
    if (u.hostname === "lista.mercadolivre.com.br") return "search";
    if (/\/c\//.test(path)) return "category";
    return "search";
  }

  // src/content/page-extractor.ts
  function collectBrowserOffers() {
    function money(label) {
      const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(
        label || ""
      );
      return m ? Number(m[1].replace(/\./g, "")) * 100 + Number(m[2] || 0) : void 0;
    }
    const page = new URL(location.href);
    if (page.protocol !== "https:" || !page.hostname.endsWith("mercadolivre.com.br") || !page.pathname.startsWith("/ofertas"))
      throw new Error(
        "Abra a p\xE1gina de ofertas do Mercado Livre e conclua o acesso, se solicitado."
      );
    const products = [];
    const seen = /* @__PURE__ */ new Set();
    const cards = Array.from(
      document.querySelectorAll(".poly-card")
    );
    for (const card of cards.slice(0, 200)) {
      const anchor = card.querySelector(
        "a.poly-component__title"
      );
      if (!anchor) continue;
      const url = new URL(anchor.href);
      if (!/(^|\.)mercadolivre\.com\.br$/.test(url.hostname) || url.protocol !== "https:")
        continue;
      const direct = !url.pathname.includes("/p/") ? url.pathname.match(/\/MLB-?(\d{6,})/) : null;
      const filtered = (url.searchParams.get("pdp_filters") || "").match(
        /item_id:(MLB\d{6,})/
      );
      const fragment = new URLSearchParams(url.hash.slice(1));
      const externalId = url.searchParams.get("wid") || fragment.get("wid") || (filtered ? filtered[1] : "") || (direct ? "MLB" + direct[1] : "");
      const title = (anchor.textContent || "").trim().slice(0, 250);
      const priceCents = money(
        card.querySelector('.poly-price__current [aria-label*="reais"]')?.getAttribute("aria-label") || null
      );
      if (!/^MLB\d{6,}$/.test(externalId) || !title || !priceCents || seen.has(externalId))
        continue;
      const original = money(
        card.querySelector('[aria-label^="Antes:"]')?.getAttribute("aria-label") || null
      );
      let text = card.textContent || "";
      for (const element of Array.from(card.querySelectorAll("[aria-label]")))
        text += " " + element.getAttribute("aria-label");
      const rating = /Classificação\s*([0-5](?:[.,]\d+)?)\s*de\s*5\s*estrelas/i.exec(text);
      const sales = /(?:\+\s*|Mais de\s+)(\d+(?:[.,]\d+)?)\s*(milhões|milhão|mil|mi|m)?\s*(?:produtos?\s+)?vendidos/i.exec(
        text
      );
      const img = card.querySelector(
        'img[src^="https://http2.mlstatic.com/"], img[src*=".mlstatic.com/"]'
      );
      const product = {
        externalId,
        title,
        productUrl: url.origin + url.pathname + (url.pathname.includes("/p/") ? "?wid=" + externalId : ""),
        priceCents
      };
      if (original && original > priceCents)
        product.originalPriceCents = original;
      if (img && img.src.startsWith("https://")) product.imageUrl = img.src;
      if (rating && Number(rating[1].replace(",", ".")) > 0)
        product.ratingStar = Number(rating[1].replace(",", "."));
      if (sales) {
        product.salesLabel = sales[0];
        product.salesCount = Math.round(
          Number(sales[1].replace(",", ".")) * (sales[2] ? sales[2] === "mil" ? 1e3 : 1e6 : 1)
        );
      }
      seen.add(externalId);
      products.push(product);
    }
    if (!products.length)
      throw new Error(
        "Nenhuma oferta completa encontrada. Confira se a listagem carregou."
      );
    const pagePath = page.pathname.replace(/\/+$/, "") || "/ofertas";
    return {
      version: 1,
      requestId: crypto.randomUUID(),
      marketplace: "mercadolivre",
      clientCapturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      page: { kind: "offers", url: page.origin + pagePath },
      products,
      ignoredCards: cards.length - products.length
    };
  }

  // src/background/service-worker.ts
  var DEFAULT_API_BASE = true ? "http://localhost:3100" : "http://localhost:3100";
  async function getActiveApiBase() {
    return getApiBaseUrl(chromeStorage(), DEFAULT_API_BASE);
  }
  var OUTBOX_KEY = "bm_outbox";
  var RETRY_ALARM = "bm_retry";
  async function readOutbox() {
    const data = await chromeStorage().get(OUTBOX_KEY);
    const raw = data[OUTBOX_KEY];
    return Array.isArray(raw) ? raw : [];
  }
  async function writeOutbox(items) {
    await chromeStorage().set({ [OUTBOX_KEY]: items });
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message && typeof message === "object" ? message.type : "";
    if (["PREPARE_BATCH", "IMPORT_BATCH"].includes(type) && sender.url !== chrome.runtime.getURL("popup/index.html")) {
      sendResponse({ ok: false, error: "invalid_sender" });
      return false;
    }
    void handleMessage(message).then(sendResponse).catch((err) => {
      console.error("[BizuMiner Background Error]", err);
      sendResponse({ ok: false, error: "network" });
    });
    return true;
  });
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id == null) return;
    void chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/activate-catalog.js"]
    }).catch(() => {
    });
  });
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM) void processDueOutbox();
  });
  async function updateBadge() {
    const outbox = await readOutbox();
    const pending = outbox.length;
    await chrome.action.setBadgeText({
      text: pending > 0 ? String(pending) : ""
    });
    await chrome.action.setBadgeBackgroundColor({ color: "#a52a24" });
  }
  async function processDueOutbox() {
    const token = await getToken(chromeStorage());
    if (!token) return;
    let outbox = pruneExpired(await readOutbox());
    const due = dueForRetry(outbox);
    const baseUrl = await getActiveApiBase();
    for (const entry of due) {
      try {
        const result = await postCapture(
          { baseUrl, token },
          entry.payload
        );
        if (result.ok) {
          outbox = dequeue(outbox, entry.requestId);
        } else if (result.error === "unauthorized" || result.error === "device_revoked") {
          await clearSession(chromeStorage());
          outbox = [];
          break;
        } else if (result.error === "invalid_payload") {
          outbox = dequeue(outbox, entry.requestId);
        } else {
          outbox = markRetry(
            outbox,
            entry.requestId,
            result.error ?? "retryable"
          );
        }
      } catch {
        outbox = markRetry(outbox, entry.requestId, "network");
      }
    }
    await writeOutbox(outbox);
    await updateBadge();
  }
  async function handleMessage(message) {
    if (typeof message !== "object" || message === null)
      return { ok: false, error: "invalid_message" };
    const msg = message;
    if (msg.type === "PREPARE_BATCH") return prepareBrowserBatch();
    if (msg.type === "IMPORT_BATCH") return importBrowserBatch();
    if (msg.type === "CAPTURE") {
      return handleCapture(msg);
    }
    if (msg.type === "PAIR") {
      return handlePair(msg);
    }
    if (msg.type === "LOGOUT") {
      await clearSession(chromeStorage());
      await updateBadge();
      return { ok: true };
    }
    if (msg.type === "PENDING") {
      void processDueOutbox();
      const outbox = await readOutbox();
      return { ok: true, pending: outbox.length };
    }
    if (msg.type === "GET_ENV") {
      const current = await getActiveApiBase();
      return { ok: true, baseUrl: current };
    }
    if (msg.type === "SET_ENV") {
      const nextUrl = typeof msg.baseUrl === "string" ? msg.baseUrl : "";
      if (nextUrl) {
        await setApiBaseUrl(chromeStorage(), nextUrl);
        return { ok: true, baseUrl: nextUrl };
      }
      return { ok: false, error: "invalid_url" };
    }
    return { ok: false, error: "unknown_message" };
  }
  var BROWSER_BATCH_KEY = "bm_browser_batch";
  async function prepareBrowserBatch() {
    const token = await getToken(chromeStorage());
    if (!token) return { ok: false, error: "not_paired" };
    const saved = (await chromeStorage().get(BROWSER_BATCH_KEY))[BROWSER_BATCH_KEY];
    if (saved?.sent && saved.payload && Date.parse(saved.payload.clientCapturedAt) > Date.now() - 30 * 6e4)
      return { ok: true, count: saved.payload.products.length, retry: true };
    const baseUrl = await getActiveApiBase();
    let response;
    try {
      response = await fetch(
        `${baseUrl}/api/extension/capture-batches`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15e3)
        }
      );
    } catch (err) {
      console.error("Falha de rede em prepareBrowserBatch:", err);
      return { ok: false, error: "network" };
    }
    const job = await response.json();
    if (!response.ok) return { ok: false, error: "not_paired" };
    if (!job.batchId) return { ok: false, error: "no_waiting_batch" };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null || !tab.url?.includes("mercadolivre.com.br/ofertas"))
      return { ok: false, error: "offers_page_required" };
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectBrowserOffers
      });
    } catch (err) {
      console.error("Erro ao executar leitura de ofertas na aba ativa:", err);
      return { ok: false, error: "offers_page_required" };
    }
    const payload = results[0]?.result;
    if (!payload?.products.length) return { ok: false, error: "no_offers" };
    await chromeStorage().set({
      [BROWSER_BATCH_KEY]: { batchId: job.batchId, payload, sent: false }
    });
    return {
      ok: true,
      count: payload.products.length,
      ignored: payload.ignoredCards
    };
  }
  async function importBrowserBatch() {
    const token = await getToken(chromeStorage());
    if (!token) return { ok: false, error: "not_paired" };
    const saved = (await chromeStorage().get(BROWSER_BATCH_KEY))[BROWSER_BATCH_KEY];
    if (!saved?.batchId || !saved.payload)
      return { ok: false, error: "prepare_first" };
    saved.sent = true;
    await chromeStorage().set({ [BROWSER_BATCH_KEY]: saved });
    const baseUrl = await getActiveApiBase();
    let response;
    try {
      response = await fetch(
        `${baseUrl}/api/extension/capture-batches`,
        {
          method: "POST",
          signal: AbortSignal.timeout(3e4),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ batchId: saved.batchId, payload: saved.payload })
        }
      );
    } catch (err) {
      console.error("Falha de rede em importBrowserBatch:", err);
      return { ok: false, error: "network" };
    }
    const result = await response.json();
    if (response.ok && result.ok)
      await chromeStorage().set({ [BROWSER_BATCH_KEY]: null });
    else if (response.status >= 400 && response.status < 500 && response.status !== 429)
      await chromeStorage().set({ [BROWSER_BATCH_KEY]: null });
    return result;
  }
  async function handleCapture(msg) {
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    const card = msg.card;
    const pageUrl = typeof msg.pageUrl === "string" ? msg.pageUrl : "";
    if (!requestId || !card) return { ok: false, error: "invalid_message" };
    const token = await getToken(chromeStorage());
    if (!token) return { ok: false, error: "not_paired" };
    const payload = {
      version: 1,
      requestId,
      marketplace: "mercadolivre",
      clientCapturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      page: { kind: pageKindFor(pageUrl), url: pageUrl },
      product: card
    };
    const baseUrl = await getActiveApiBase();
    try {
      const result = await postCapture({ baseUrl, token }, payload);
      if (result.ok) {
        return {
          ok: true,
          duplicate: result.duplicate,
          publication: result.publication
        };
      }
      if (result.error === "unauthorized" || result.error === "device_revoked") {
        await clearSession(chromeStorage());
        return { ok: false, error: "not_paired" };
      }
      if (result.error === "invalid_payload") {
        return { ok: false, error: "invalid_payload" };
      }
      const outbox = pruneExpired(await readOutbox());
      await writeOutbox(enqueue(outbox, payload));
      await updateBadge();
      return { ok: false, error: "queued" };
    } catch {
      const outbox = pruneExpired(await readOutbox());
      await writeOutbox(enqueue(outbox, payload));
      await updateBadge();
      return { ok: false, error: "queued" };
    }
  }
  async function handlePair(msg) {
    const pairingCode = typeof msg.pairingCode === "string" ? msg.pairingCode : "";
    if (!pairingCode) return { ok: false, error: "invalid_message" };
    const { exchangePairingCode: exchangePairingCode2 } = await Promise.resolve().then(() => (init_api(), api_exports));
    const { setSession: setSession2, setApiBaseUrl: setApiBaseUrl2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const currentBase = await getActiveApiBase();
    const alternateBase = currentBase === "http://localhost:3100" ? "https://www.bizuminer.com.br" : "http://localhost:3100";
    let chosenBase = currentBase;
    let result = await exchangePairingCode2(
      { baseUrl: chosenBase },
      pairingCode
    );
    if (!result.ok) {
      try {
        const altResult = await exchangePairingCode2(
          { baseUrl: alternateBase },
          pairingCode
        );
        if (altResult.ok) {
          chosenBase = alternateBase;
          result = altResult;
        }
      } catch {
      }
    }
    if (result.ok && result.deviceToken && result.deviceId) {
      await setApiBaseUrl2(chromeStorage(), chosenBase);
      await setSession2(chromeStorage(), {
        token: result.deviceToken,
        deviceId: result.deviceId,
        affiliateName: result.affiliate?.displayName ?? ""
      });
      return {
        ok: true,
        baseUrl: chosenBase,
        affiliateName: result.affiliate?.displayName ?? ""
      };
    }
    return { ok: false, error: result.error ?? "exchange_failed" };
  }
})();
