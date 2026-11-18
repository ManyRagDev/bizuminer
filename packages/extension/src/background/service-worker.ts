/** Human initiated capture. All storage mutations and deliveries share one queue. */
import type { collectMarketplacePage } from "../content/marketplace-page.ts";
import { collectBrowserOffers } from "../content/page-extractor.ts";
import type { ExtractedCard } from "../content/card-extractor.ts";
import { postCapture, postJson, exchangePairingCode, type DeliveryResult } from "../lib/api.ts";
import { chromeStorage, clearSession, setSession, STORAGE_KEYS, BUILD_API_ORIGIN } from "../lib/storage.ts";
import { enqueue, dequeue, pruneExpired, OUTBOX_TTL_MS, OUTBOX_MAX_ATTEMPTS, RETRY_DELAYS_MS, type OutboxEntry } from "../lib/outbox.ts";
import { BROWSER_BATCH_KEY, BATCH_QUEUE_ALARM, BATCH_MAX_AGE_MS, BATCH_MAX_ATTEMPTS, type StoredBrowserBatch } from "../lib/batch-queue.ts";
import { pageKindFor, type CapturePayload } from "../lib/contracts.ts";
import { sanitizeImportReport, type ImportReport } from "../lib/import-report.ts";
import { RECAPTURE_ALARM, controlRecapture, openAssistedRecapture, readAssistedRecapture, recaptureStatus, startRecapture, stepRecapture, stopRecapture } from "../lib/recapture-session.ts";

declare const __COLLECTOR_VERSION__: string;
const COLLECTOR_VERSION = typeof __COLLECTOR_VERSION__ === "string" && __COLLECTOR_VERSION__.length <= 64
  && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(__COLLECTOR_VERSION__) ? __COLLECTOR_VERSION__ : null;

export const DEFAULT_API_BASE = BUILD_API_ORIGIN;
export async function getActiveApiBase(): Promise<string> { return DEFAULT_API_BASE; }
const OUTBOX_KEY = STORAGE_KEYS.outbox;
const RETRY_ALARM = "bm_retry";
const RECEIPTS_KEY = "bm_capture_receipts";
const IMPORT_REPORT_KEY = "bm_last_import_report";
const IMPORT_REPORT_TTL_MS = 24 * 60 * 60 * 1000;
type Scope = { origin: string; deviceId: string; token: string };
type Receipt = { requestId: string; origin: string; deviceId: string; at: number; result: DeliveryResult };
let tail: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const task = tail.then(work, work);
  tail = task.catch(() => undefined);
  return task;
}
async function readOutbox(): Promise<OutboxEntry[]> {
  const data = await chromeStorage().get(OUTBOX_KEY);
  return Array.isArray(data[OUTBOX_KEY]) ? data[OUTBOX_KEY] as OutboxEntry[] : [];
}
async function writeOutbox(items: OutboxEntry[]) { await chromeStorage().set({ [OUTBOX_KEY]: items }); }
async function readBatch(): Promise<StoredBrowserBatch | undefined> {
  return (await chromeStorage().get(BROWSER_BATCH_KEY))[BROWSER_BATCH_KEY] as StoredBrowserBatch | undefined;
}
async function writeBatch(batch: StoredBrowserBatch | null) { await chromeStorage().set({ [BROWSER_BATCH_KEY]: batch }); }
const matches = (item: { origin?: string; deviceId?: string }, scope: Scope) => item.origin === scope.origin && item.deviceId === scope.deviceId;
async function scope(): Promise<Scope | null> {
  const data = await chromeStorage().get([STORAGE_KEYS.token, STORAGE_KEYS.deviceId, STORAGE_KEYS.sessionOrigin]);
  const token = data[STORAGE_KEYS.token], deviceId = data[STORAGE_KEYS.deviceId];
  return typeof token === "string" && token.startsWith("bm_ext_") && typeof deviceId === "string" && !!deviceId
    && data[STORAGE_KEYS.sessionOrigin] === DEFAULT_API_BASE ? { token, deviceId, origin: DEFAULT_API_BASE } : null;
}
/** A bounded receipt is independent of the retry payload and never transfers across devices. */
async function readImportReport(current: Scope | null): Promise<ImportReport | null> {
  const stored = (await chromeStorage().get(IMPORT_REPORT_KEY))[IMPORT_REPORT_KEY] as
    { origin?: string; deviceId?: string; report?: unknown } | undefined;
  if (!stored) return null;
  const report = sanitizeImportReport(stored.report);
  if (!current || !matches(stored, current) || !report || Date.now() - report.at >= IMPORT_REPORT_TTL_MS || report.at > Date.now() + 60_000) {
    await chromeStorage().set({ [IMPORT_REPORT_KEY]: null });
    return null;
  }
  return report;
}
async function rememberImport(current: Scope, saved: StoredBrowserBatch, result: DeliveryResult, clearBatch = false): Promise<ImportReport | null> {
  // Only acknowledged success / definitive rejection produce a receipt. Unknown delivery is still queued.
  const report = sanitizeImportReport({ requestId: saved.payload?.requestId, at: Date.now(), ok: result.ok,
    capturedAt: saved.payload?.clientCapturedAt, preparedVersion: saved.collectorVersion ?? null,
    importedCount: result.importedCount, alreadyRecordedCount: result.alreadyRecordedCount,
    error: result.error, diagnostics: result.diagnostics });
  if (!report) throw new Error("invalid_import_report");
  await chromeStorage().set({ [IMPORT_REPORT_KEY]: { origin: current.origin, deviceId: current.deviceId, report },
    ...(clearBatch ? { [BROWSER_BATCH_KEY]: null } : {}) });
  return report;
}
async function stopSession(reason: string) {
  await stopRecapture();
  await clearSession(chromeStorage());
  await chromeStorage().set({ [IMPORT_REPORT_KEY]: null });
  await writeOutbox((await readOutbox()).map(entry => ({ ...entry, stopped: true, lastError: reason })));
  const batch = await readBatch();
  if (batch?.payload) await writeBatch({ ...batch, queued: false, stopped: true, lastError: reason });
  await chrome.alarms.clear(RETRY_ALARM);
  await chrome.alarms.clear(BATCH_QUEUE_ALARM);
}
/** Old versions did not record a session origin. Never infer it from a mutable URL preference. */
async function reconcile() {
  const current = await scope();
  await readImportReport(current);
  if (!current) await clearSession(chromeStorage());
  await chromeStorage().set({ [STORAGE_KEYS.apiBaseUrl]: DEFAULT_API_BASE });
  await writeOutbox(pruneExpired(await readOutbox()).map(entry => !entry.stopped && (!current || !matches(entry, current))
    ? { ...entry, stopped: true, lastError: "session_changed" } : entry));
  const batch = await readBatch();
  if (batch?.payload && !batch.stopped) {
    const expired = Date.now() - Date.parse(batch.payload.clientCapturedAt) >= BATCH_MAX_AGE_MS;
    if (!current || !matches(batch, current) || expired || (batch.attempts ?? 0) >= BATCH_MAX_ATTEMPTS)
      await writeBatch({ ...batch, stopped: true, queued: false, lastError: !current || !matches(batch, current)
        ? "session_changed" : expired ? "capture_expired" : "retry_limit" });
  }
}
async function schedule() {
  const current = await scope();
  const items = (await readOutbox()).filter(entry => !entry.stopped && current && matches(entry, current));
  if (items.length) await chrome.alarms.create(RETRY_ALARM, { when: Math.max(Date.now() + 1000,
    Math.min(...items.map(entry => Math.min(entry.nextRetryAt, entry.addedAt + OUTBOX_TTL_MS)))) });
  else await chrome.alarms.clear(RETRY_ALARM);
  const batch = await readBatch();
  if (batch?.queued && !batch.stopped && batch.payload && current && matches(batch, current))
    await chrome.alarms.create(BATCH_QUEUE_ALARM, { when: Math.max(Date.now() + 1000,
      Math.min(batch.nextRetryAt ?? Date.now(), Date.parse(batch.payload.clientCapturedAt) + BATCH_MAX_AGE_MS)) });
  else await chrome.alarms.clear(BATCH_QUEUE_ALARM);
  const failed = (await readOutbox()).some(entry => entry.stopped) || batch?.stopped;
  await chrome.action.setBadgeText({ text: failed ? "!" : items.length ? String(items.length) : batch?.queued ? "…" : "" });
  if (failed || items.length || batch?.queued) await chrome.action.setBadgeBackgroundColor({ color: failed ? "#a52a24" : "#f59e0b" });
}
async function coordinated<T>(work: () => Promise<T>): Promise<T> {
  return serialize(async () => { await reconcile(); try { return await work(); }
    catch (error) {
      if (error instanceof Error && error.message === "recapture_device_revoked") await stopSession("not_paired");
      throw error;
    } finally { await schedule(); } });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && typeof message === "object" ? message.type : "";
  const popupOnly = ["PAIR", "LOGOUT", "SET_ENV", "PREPARE_BATCH", "REFRESH_BATCH", "IMPORT_BATCH", "CANCEL_BATCH", "CLEAR_FAILED", "CAPTURE_ACTIVE",
    "RECAPTURE_START","RECAPTURE_PAUSE","RECAPTURE_RESUME","RECAPTURE_CANCEL","RECAPTURE_STATUS","RECAPTURE_ASSIST_OPEN","RECAPTURE_ASSIST_READ"];
  if (popupOnly.includes(type) && sender.url !== chrome.runtime.getURL("popup/index.html")) {
    sendResponse({ ok: false, error: "invalid_sender" }); return false;
  }
  void coordinated(() => handleMessage(message)).then(sendResponse, error => sendResponse({ ok: false,
    error: error instanceof Error && error.message === "recapture_device_revoked" ? "not_paired" : "storage_or_network" }));
  return true;
});
chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) void chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/activate-catalog.js"] }).catch(() => {});
});
const wake = () => { void coordinated(async () => { await stepRecapture(await scope()); }).catch(() => {}); };
chrome.runtime.onInstalled.addListener(wake);
chrome.runtime.onStartup.addListener(wake);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RETRY_ALARM) void coordinated(processDueOutbox).catch(() => {});
  if (alarm.name === BATCH_QUEUE_ALARM) void coordinated(async () => { await importBrowserBatch(true); }).catch(() => {});
  if (alarm.name === RECAPTURE_ALARM) void coordinated(async () => { await stepRecapture(await scope()); }).catch(() => {});
});
wake();
const authFailed = (result: DeliveryResult) => result.status === 401 || result.error === "unauthorized" || result.error === "device_revoked" || result.error === "affiliate_access_required";
const delay = (attempts: number, result: DeliveryResult) => Math.max(RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!, result.retryAfterMs ?? 0);
async function remember(entry: OutboxEntry, result: DeliveryResult) {
  const data = await chromeStorage().get(RECEIPTS_KEY);
  const receipts = Array.isArray(data[RECEIPTS_KEY]) ? data[RECEIPTS_KEY] as Receipt[] : [];
  await chromeStorage().set({ [RECEIPTS_KEY]: [...receipts.filter(r => Date.now() - r.at < OUTBOX_TTL_MS).slice(-199),
    { requestId: entry.requestId, origin: entry.origin, deviceId: entry.deviceId, at: Date.now(), result }] });
}
async function deliverSingle(entry: OutboxEntry, current: Scope): Promise<DeliveryResult> {
  // Persist intent before fetch. A worker interrupted during fetch resumes with the same payload.
  const sending = { ...entry, attempts: entry.attempts + 1, nextRetryAt: Date.now() + 30_000 };
  await writeOutbox((await readOutbox()).map(e => e.requestId === entry.requestId ? sending : e));
  await schedule();
  const result = await postCapture({ baseUrl: current.origin, token: current.token }, entry.payload);
  if (result.ok) {
    await remember(sending, result);
    await writeOutbox(dequeue(await readOutbox(), entry.requestId));
  } else if (authFailed(result)) await stopSession("not_paired");
  else {
    const stopped = !result.retryable || sending.attempts >= OUTBOX_MAX_ATTEMPTS;
    await writeOutbox((await readOutbox()).map(e => e.requestId !== entry.requestId ? e : { ...sending, stopped,
      lastError: sending.attempts >= OUTBOX_MAX_ATTEMPTS ? "retry_limit" : result.error ?? "request_failed", nextRetryAt: Date.now() + delay(sending.attempts, result) }));
  }
  return result;
}
async function processDueOutbox() {
  const current = await scope();
  if (!current) return;
  // One bounded delivery per wake; the next one-shot alarm drains remaining work.
  const entry = (await readOutbox()).find(e => !e.stopped && matches(e, current) && e.nextRetryAt <= Date.now());
  if (entry) await deliverSingle(entry, current);
}
async function handleMessage(message: unknown): Promise<unknown> {
  if (!message || typeof message !== "object") return { ok: false, error: "invalid_message" };
  const msg = message as Record<string, unknown>;
  switch (msg.type) {
    case "GET_ENV": return { ok: true, baseUrl: DEFAULT_API_BASE, allowedBaseUrls: [DEFAULT_API_BASE] };
    case "SET_ENV": return msg.baseUrl === DEFAULT_API_BASE ? { ok: true, baseUrl: DEFAULT_API_BASE } : { ok: false, error: "invalid_url" };
    case "PAIR": return handlePair(msg);
    case "LOGOUT": await stopSession("session_changed"); return { ok: true };
    case "CAPTURE": return handleCapture(msg);
    case "PREPARE_BATCH": return prepareBrowserBatch();
    case "REFRESH_BATCH": return prepareBrowserBatch(true);
    case "IMPORT_BATCH": return importBrowserBatch();
    case "CAPTURE_ACTIVE": return captureActiveProduct();
    case "CANCEL_BATCH": await writeBatch(null); return { ok: true };
    case "CLEAR_FAILED": await writeOutbox((await readOutbox()).filter(e => !e.stopped)); return { ok: true };
    case "RECAPTURE_STATUS": return {ok:true,...await recaptureStatus(await scope())};
    case "RECAPTURE_START": {
      const current=await scope(); if (!current) return {ok:false,error:"not_paired"};
      const origins:Record<string,string>={mercadolivre:"https://*.mercadolivre.com.br/*",amazon:"https://*.amazon.com.br/*",aliexpress:"https://*.aliexpress.com/*"};
      const origin=typeof msg.marketplace==="string" ? origins[msg.marketplace] : undefined;
      if (!origin) return {ok:false,error:"marketplace_invalid"};
      const assisted=msg.assisted===true;
      if (!assisted && !await chrome.permissions.contains({origins:[origin]})) return {ok:false,error:"permission_required"};
      return startRecapture(current,msg.marketplace,assisted ? "assisted" : "automatic",msg.pace ?? "normal");
    }
    case "RECAPTURE_ASSIST_OPEN": case "RECAPTURE_ASSIST_READ": {
      const current=await scope(); if (!current) return {ok:false,error:"not_paired"};
      return msg.type==="RECAPTURE_ASSIST_OPEN" ? openAssistedRecapture(current) : readAssistedRecapture(current);
    }
    case "RECAPTURE_PAUSE": case "RECAPTURE_RESUME": case "RECAPTURE_CANCEL": {
      const current=await scope(); if (!current) return {ok:false,error:"not_paired"};
      return controlRecapture(current,msg.type==="RECAPTURE_PAUSE" ? "pause" : msg.type==="RECAPTURE_RESUME" ? "resume" : "cancel");
    }
    case "PENDING": {
      const outbox = await readOutbox();
      return { ok: true, pending: outbox.filter(e => !e.stopped).length, failed: outbox.filter(e => e.stopped).length,
        errors: outbox.filter(e => e.stopped).map(e => e.lastError ?? "request_failed") };
    }
    case "GET_BATCH_STATE": {
      const saved = await readBatch();
      const lastImport = await readImportReport(await scope());
      return saved?.payload ? { ok: true, hasBatch: true, queued: Boolean(saved.queued), stopped: Boolean(saved.stopped),
        lastError: saved.lastError, count: saved.payload.products.length, marketplace: saved.payload.marketplace,
        attempts: saved.attempts ?? 0, queuedAt: saved.queuedAt, lastImport,
        capturedAt: saved.payload.clientCapturedAt, preparedVersion: saved.collectorVersion ?? null,
        sent: Boolean(saved.sent), canReplace: canReplaceBatch(saved) }
        : { ok: true, hasBatch: false, lastImport, capturedAt: null, preparedVersion: null, sent: false, canReplace: false };
    }
    default: return { ok: false, error: "unknown_message" };
  }
}
function canReplaceBatch(saved: StoredBrowserBatch): boolean {
  // Old queue metadata can imply an uncertain delivery even when the sent flag is missing.
  return !saved.sent && !saved.queued && !(saved.attempts && saved.attempts > 0) && !saved.batchId;
}
async function prepareBrowserBatch(replace = false) {
  const current = await scope();
  if (!current) return { ok: false, error: "not_paired" };
  const saved = await readBatch();
  if (saved?.payload && replace && !canReplaceBatch(saved)) return { ok: false, error: "discard_required" };
  if (saved?.payload && !replace) return { ok: !saved.stopped, error: saved.lastError, preserved: true, count: saved.payload.products.length,
    retry: Boolean(saved.sent), queued: Boolean(saved.queued), stopped: Boolean(saved.stopped),
    capturedAt: saved.payload.clientCapturedAt, preparedVersion: saved.collectorVersion ?? null,
    sent: Boolean(saved.sent), canReplace: canReplaceBatch(saved) };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  const host = url?.hostname ?? "";
  const marketplace = /(^|\.)mercadolivre\.com\.br$/.test(host) ? "mercadolivre"
    : /(^|\.)amazon\.com\.br$/.test(host) ? "amazon"
    : /(^|\.)aliexpress\.com$/.test(host) ? "aliexpress" : null;
  if (tab?.id == null || url?.protocol !== "https:" || !marketplace)
    return { ok: false, error: "offers_page_required" };

  let payload: ReturnType<typeof collectBrowserOffers> | ReturnType<typeof collectMarketplacePage> | undefined;
  try {
    const target = { tabId: tab.id };
    const results = marketplace === "mercadolivre"
      ? await chrome.scripting.executeScript({ target, func: collectBrowserOffers })
      : await chrome.scripting.executeScript<[], ReturnType<typeof collectMarketplacePage>>({ target, files: ["content/marketplace-page.js"] });
    payload = results[0]?.result;
  } catch (err) {
    console.error("Erro ao executar leitura de ofertas na aba ativa:", err);
    return { ok: false, error: "offers_page_required" };
  }
  if (!payload?.products.length) return { ok: false, error: "no_offers",
    diagnostics: payload && "diagnostics" in payload ? payload.diagnostics : undefined };

  await writeBatch({ payload, collectorVersion: COLLECTOR_VERSION, sent: false, queued: false, origin: current.origin, deviceId: current.deviceId });
  return { ok: true, count: payload.products.length, ignored: payload.ignoredCards,
    capturedAt: payload.clientCapturedAt, preparedVersion: COLLECTOR_VERSION, sent: false, canReplace: true,
    diagnostics: "diagnostics" in payload ? payload.diagnostics : undefined,
    sample: payload.products[0] };
}
async function captureActiveProduct(): Promise<unknown> {
  const current = await scope();
  if (!current) return { ok: false, error: "not_paired" };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  const host = url?.hostname ?? "";
  const marketplace = /(^|\.)mercadolivre\.com\.br$/.test(host) ? "mercadolivre"
    : /(^|\.)amazon\.com\.br$/.test(host) ? "amazon"
    : /(^|\.)aliexpress\.com$/.test(host) ? "aliexpress" : null;
  if (tab?.id == null || url?.protocol !== "https:" || !marketplace)
    return { ok: false, error: "offers_page_required" };

  let payload: ReturnType<typeof collectBrowserOffers> | ReturnType<typeof collectMarketplacePage> | undefined;
  try {
    const target = { tabId: tab.id };
    const results = marketplace === "mercadolivre"
      ? await chrome.scripting.executeScript({ target, func: collectBrowserOffers })
      : await chrome.scripting.executeScript<[], ReturnType<typeof collectMarketplacePage>>({ target, files: ["content/marketplace-page.js"] });
    payload = results[0]?.result;
  } catch (err) {
    console.error("Erro ao executar leitura de anúncio na aba ativa:", err);
    return { ok: false, error: "offers_page_required" };
  }
  if (!payload?.products.length) return { ok: false, error: "no_offers" };

  const singleProduct = payload.products[0]!;
  const singlePayload = { ...payload, products: [singleProduct], ignoredCards: 0 } as NonNullable<StoredBrowserBatch["payload"]>;
  const saved: StoredBrowserBatch = {
    payload: singlePayload,
    collectorVersion: COLLECTOR_VERSION,
    sent: true,
    queued: false,
    origin: current.origin,
    deviceId: current.deviceId,
  };
  let result = await postJson({ baseUrl: current.origin, token: current.token }, "/api/extension/capture-batches",
    { mode: "manual", payload: singlePayload }, singlePayload.requestId);
  if (result.ok && (!Number.isSafeInteger(result.importedCount) || (result.importedCount ?? -1) < 0
    || (result.importedCount ?? 0) > 1))
    result = { ok: false, error: "invalid_response", retryable: true };
  if (result.ok) {
    const lastImport = await rememberImport(current, saved, result, false);
    return { ...result, count: 1, sample: singleProduct, lastImport };
  } else if (authFailed(result)) {
    await stopSession("not_paired");
    return result;
  } else if (result.retryable) {
    await writeBatch({ ...saved, queued: true, queuedAt: Date.now(), attempts: 1, lastAttemptAt: Date.now(), nextRetryAt: Date.now() + 30_000 });
    return { ok: true, queued: true, count: 1, sample: singleProduct, attempts: 1, error: result.error };
  } else {
    await rememberImport(current, saved, result, false);
    return result;
  }
}
async function importBrowserBatch(fromAlarm = false): Promise<DeliveryResult> {
  const current = await scope();
  if (!current) return { ok: false, error: "not_paired" };
  const saved = await readBatch();
  if (!saved?.payload) return { ok: false, error: "prepare_first" };
  if (saved.stopped || !matches(saved, current)) return { ok: false, error: saved.lastError ?? "session_changed" };
  if ((fromAlarm && !saved.queued) || (saved.nextRetryAt ?? 0) > Date.now())
    return { ok: true, queued: Boolean(saved.queued), count: saved.payload.products.length, attempts: saved.attempts ?? 0 };
  const sending = { ...saved, sent: true, queued: true, queuedAt: saved.queuedAt ?? Date.now(),
    attempts: (saved.attempts ?? 0) + 1, lastAttemptAt: Date.now(), nextRetryAt: Date.now() + 30_000 };
  await writeBatch(sending);
  await schedule();
  let result = await postJson({ baseUrl: current.origin, token: current.token }, "/api/extension/capture-batches",
    { mode: "manual", payload: saved.payload }, saved.payload.requestId);
  if (result.ok && (!Number.isSafeInteger(result.importedCount) || (result.importedCount ?? -1) < 0
    || (result.importedCount ?? 0) > saved.payload.products.length))
    result = { ok: false, error: "invalid_response", retryable: true };
  if (result.ok) {
    const lastImport = await rememberImport(current, saved, result, true);
    return { ...result, lastImport };
  }
  else if (authFailed(result)) await stopSession("not_paired");
  else {
    if (!result.retryable) await rememberImport(current, saved, result);
    const stopped = !result.retryable || sending.attempts >= BATCH_MAX_ATTEMPTS;
    await writeBatch({ ...sending, stopped, queued: !stopped,
      lastError: sending.attempts >= BATCH_MAX_ATTEMPTS ? "retry_limit" : result.error ?? "request_failed",
      nextRetryAt: Date.now() + delay(sending.attempts, result) });
    if (!stopped) return { ok: true, queued: true, count: saved.payload.products.length, attempts: sending.attempts, error: result.error };
  }
  return result;
}
async function handleCapture(msg: Record<string, unknown>): Promise<unknown> {
  const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
  const card = msg.card as ExtractedCard | undefined;
  const pageUrl = typeof msg.pageUrl === "string" ? msg.pageUrl : "";
  if (!requestId || !card) return { ok: false, error: "invalid_message" };
  const current = await scope();
  if (!current) return { ok: false, error: "not_paired" };
  const receiptData = await chromeStorage().get(RECEIPTS_KEY);
  const receipts = Array.isArray(receiptData[RECEIPTS_KEY]) ? receiptData[RECEIPTS_KEY] as Receipt[] : [];
  const receipt = receipts.find(r => r.requestId === requestId && matches(r, current) && Date.now() - r.at < OUTBOX_TTL_MS);
  if (receipt) return receipt.result;
  const outbox = await readOutbox();
  const previous = outbox.find(entry => entry.requestId === requestId);
  if (previous) return { ok: false, error: previous.stopped ? previous.lastError : "queued" };
  const marketplace: "mercadolivre" | "amazon" = card.marketplace ??
    (/(^|\.)amazon\.com\.br$/.test(new URL(pageUrl).hostname) ? "amazon" : "mercadolivre");
  const payload: CapturePayload = { version: 1, requestId, marketplace, clientCapturedAt: new Date().toISOString(),
    page: { kind: pageKindFor(pageUrl), url: pageUrl }, product: card };
  let next: OutboxEntry[];
  try { next = enqueue(outbox, payload).map(e => e.requestId === requestId ? { ...e, origin: current.origin, deviceId: current.deviceId } : e); }
  catch { return { ok: false, error: "queue_full" }; }
  await writeOutbox(next);
  const result = await deliverSingle(next.find(e => e.requestId === requestId)!, current);
  return result.ok || !result.retryable ? result : { ok: false, error: "queued" };
}
async function handlePair(msg: Record<string, unknown>): Promise<unknown> {
  if (typeof msg.pairingCode !== "string" || !msg.pairingCode.trim()) return { ok: false, error: "invalid_message" };
  // Pairing explicitly changes authority. Retain old deliveries as failures, never transfer ownership.
  await stopSession("session_changed");
  const result = await exchangePairingCode({ baseUrl: DEFAULT_API_BASE }, msg.pairingCode);
  if (!result.ok || !result.deviceToken || !result.deviceId) return { ok: false, error: result.error ?? "exchange_failed" };
  await setSession(chromeStorage(), { token: result.deviceToken, deviceId: result.deviceId,
    affiliateName: result.affiliate?.displayName ?? "", origin: DEFAULT_API_BASE });
  return { ok: true, baseUrl: DEFAULT_API_BASE, affiliateName: result.affiliate?.displayName ?? "" };
}
