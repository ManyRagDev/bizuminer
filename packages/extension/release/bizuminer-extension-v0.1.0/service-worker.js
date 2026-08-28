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
    getToken: () => getToken,
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
        outbox: "bm_outbox"
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

  // src/background/service-worker.ts
  var API_BASE_URL = "https://www.bizuminer.com.br";
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
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message).then(sendResponse);
    return true;
  });
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id == null) return;
    void chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/activate-catalog.js"] }).catch(() => {
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
    await chrome.action.setBadgeText({ text: pending > 0 ? String(pending) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#a52a24" });
  }
  async function processDueOutbox() {
    const token = await getToken(chromeStorage());
    if (!token) return;
    let outbox = pruneExpired(await readOutbox());
    const due = dueForRetry(outbox);
    for (const entry of due) {
      try {
        const result = await postCapture({ baseUrl: API_BASE_URL, token }, entry.payload);
        if (result.ok) {
          outbox = dequeue(outbox, entry.requestId);
        } else if (result.error === "unauthorized" || result.error === "device_revoked") {
          await clearSession(chromeStorage());
          outbox = [];
          break;
        } else if (result.error === "invalid_payload") {
          outbox = dequeue(outbox, entry.requestId);
        } else {
          outbox = markRetry(outbox, entry.requestId, result.error ?? "retryable");
        }
      } catch {
        outbox = markRetry(outbox, entry.requestId, "network");
      }
    }
    await writeOutbox(outbox);
    await updateBadge();
  }
  async function handleMessage(message) {
    if (typeof message !== "object" || message === null) return { ok: false, error: "invalid_message" };
    const msg = message;
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
      const outbox = await readOutbox();
      return { ok: true, pending: outbox.length };
    }
    return { ok: false, error: "unknown_message" };
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
    try {
      const result = await postCapture({ baseUrl: API_BASE_URL, token }, payload);
      if (result.ok) {
        return { ok: true, duplicate: result.duplicate, publication: result.publication };
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
    const result = await exchangePairingCode2({ baseUrl: API_BASE_URL }, pairingCode);
    if (result.ok && result.deviceToken && result.deviceId) {
      const { setSession: setSession2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      await setSession2(chromeStorage(), {
        token: result.deviceToken,
        deviceId: result.deviceId,
        affiliateName: result.affiliate?.displayName ?? ""
      });
      return { ok: true, affiliateName: result.affiliate?.displayName ?? "" };
    }
    return { ok: false, error: result.error ?? "exchange_failed" };
  }
})();
