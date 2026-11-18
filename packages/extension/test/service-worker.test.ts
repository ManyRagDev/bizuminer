import { test } from "node:test";
import assert from "node:assert/strict";
import { postJson, exchangePairingCode } from "../src/lib/api.ts";

const base = "https://www.bizuminer.com.br";
const originalNow = Date.now;
const originalFetch = globalThis.fetch;
const popup = "chrome-extension://test/popup/index.html";
let serial = 0;
const payload = () => ({ version: 1, requestId: "b85bf399-a34e-44fe-83ad-32befbf29646", marketplace: "mercadolivre",
  clientCapturedAt: new Date().toISOString(), page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
  products: [{ externalId: "MLB1234567", title: "Produto real de teste", productUrl: "https://produto.mercadolivre.com.br/MLB-1234567-item", priceCents: 1000, currency: "BRL", priceType: "exact" }], ignoredCards: 0 });
const session = () => ({ bm_token: "bm_ext_test", bm_device_id: "device-1", bm_session_origin: base });
const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
async function harness(initial: Record<string, any> = session(), responder: (call: any, index: number) => Promise<Response> | Response = () => ok({ ok: true, importedCount: 1 }), collectorVersion: string | undefined = "0.3.6") {
  let now = originalNow(); Date.now = () => now;
  const data = structuredClone(initial);
  const listeners: Record<string, Function> = {};
  const alarms = new Map<string, any>();
  const calls: Array<{ url: string; init: RequestInit; body: any }> = [];
  let extracted = payload();
  let extractionError: Error | undefined;
  let extractionCount = 0;
  (globalThis as any).__COLLECTOR_VERSION__ = collectorVersion;
  const hook = (name: string) => ({ addListener: (fn: Function) => { listeners[name] = fn; } });
  (globalThis as any).chrome = {
    storage: { local: { get: async (keys: string | string[] | null) => structuredClone(Object.fromEntries(
      (keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]))),
      set: async (values: object) => { Object.assign(data, structuredClone(values)); } } },
    runtime: { onMessage: hook("message"), onInstalled: hook("installed"), onStartup: hook("startup"), getURL: (path: string) => `chrome-extension://test/${path}` },
    alarms: { onAlarm: hook("alarm"), create: async (name: string, spec: any) => { assert.equal(spec.periodInMinutes, undefined); alarms.set(name, spec); }, clear: async (name: string) => alarms.delete(name) },
    action: { onClicked: hook("clicked"), setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { query: async () => [{ id: 1, url: "https://www.mercadolivre.com.br/ofertas" }] },
    scripting: { executeScript: async () => { extractionCount++; if (extractionError) throw extractionError; return [{ result: structuredClone(extracted) }]; } },
  };
  globalThis.fetch = (async (url: any, init: RequestInit) => {
    const call = { url: String(url), init, body: JSON.parse(String(init.body)) }; calls.push(call);
    assert.ok(call.url.startsWith(`${base}/api/extension/`), "never use an alternate environment");
    assert.equal(init.method, "POST"); assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit");
    return responder(call, calls.length);
  }) as typeof fetch;
  await import(`../src/background/service-worker.ts?test=${++serial}`);
  const send = (type: string, rest: object = {}, sender = popup) => new Promise<any>(resolve => listeners.message!({ type, ...rest }, { url: sender }, resolve));
  await send("GET_ENV"); // await initialization queue
  return { data, alarms, calls, send, setPayload: (next: any) => { extracted = next; },
    extractions: () => extractionCount, setExtractionError: (next: Error | undefined) => { extractionError = next; },
    advance: (ms: number) => { now += ms; },
    alarm: async (name: string) => { listeners.alarm!({ name }); await send("GET_ENV"); },
    nextAlarm: async (name: string) => { now = Math.max(now, alarms.get(name)?.when ?? now); listeners.alarm!({ name }); await send("GET_ENV"); },
    installed: async () => { listeners.installed!(); await send("GET_ENV"); },
  };
}
const capture = (requestId = "single-1") => ({ requestId, pageUrl: "https://www.mercadolivre.com.br/ofertas", card: {
  externalId: "MLB1234567", title: "Produto", productUrl: "https://produto.mercadolivre.com.br/MLB-1234567-item", priceCents: 1000, currency: "BRL", priceType: "exact",
} });

test("whole worker: idle installation, PENDING and empty alarms make zero HTTP requests", async () => {
  const h = await harness();
  await h.installed(); await h.alarm("bm_retry"); await h.alarm("bm_batch_queue_retry");
  assert.equal((await h.send("PENDING")).pending, 0);
  assert.equal(h.calls.length, 0); assert.equal(h.alarms.size, 0);
  assert.deepEqual(await h.send("GET_ENV"), { ok: true, baseUrl: base, allowedBaseUrls: [base] });
  assert.equal((await h.send("SET_ENV", { baseUrl: "http://localhost:3100" })).error, "invalid_url");
});
test("pairing never falls back; legacy credentials and queues are quarantined", async () => {
  const p = payload();
  const h = await harness({ bm_token: "bm_ext_legacy", bm_device_id: "legacy", bm_api_base_url: base,
    bm_browser_batch: { payload: p, queued: true }, bm_outbox: [{ requestId: "old", payload: p, attempts: 0, addedAt: originalNow(), nextRetryAt: 0 }] }, () => ok({ ok: false, error: "invalid_code" }, 400));
  assert.equal(h.data.bm_token, "");
  await h.alarm("bm_retry"); await h.alarm("bm_batch_queue_retry");
  assert.equal(h.calls.length, 0);
  assert.equal((await h.send("GET_BATCH_STATE")).stopped, true);
  assert.equal((await h.send("PENDING")).failed, 1);
  assert.equal((await h.send("PAIR", { pairingCode: "bad" })).ok, false);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0]!.url, `${base}/api/extension/pair/exchange`);
});
test("bulk manual POST is serialized and retains full payload through Retry-After retry", async () => {
  const h = await harness(session(), (_call, index) => index === 1 ? ok({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "120" }) : ok({ ok: true, importedCount: 1 }));
  const p = payload(); h.setPayload(p);
  assert.equal((await h.send("PREPARE_BATCH")).ok, true);
  const [first, second] = await Promise.all([h.send("IMPORT_BATCH"), h.send("IMPORT_BATCH")]);
  assert.equal(first.queued, true); assert.equal(second.queued, true); assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0]!.body, { mode: "manual", payload: p });
  assert.equal((h.calls[0]!.init.headers as any)["Idempotency-Key"], p.requestId);
  const planned = h.alarms.get("bm_batch_queue_retry").when;
  assert.ok(planned >= Date.now() + 120_000);
  await h.send("PENDING"); await h.alarm("bm_batch_queue_retry"); assert.equal(h.calls.length, 1);
  h.setPayload({ ...p, requestId: "different" });
  assert.equal((await h.send("PREPARE_BATCH")).preserved, true);
  await h.nextAlarm("bm_batch_queue_retry");
  assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1]!.body, h.calls[0]!.body);
  assert.equal(h.data.bm_browser_batch, null); assert.equal(h.alarms.size, 0);
});
test("permanent bulk 4xx stops visibly; preparing cannot silently replace the failed payload", async () => {
  const h = await harness(session(), () => ok({ ok: false, error: "marketplace_capture_unavailable" }, 403));
  await h.send("PREPARE_BATCH"); const before = structuredClone(h.data.bm_browser_batch.payload);
  assert.equal((await h.send("IMPORT_BATCH")).error, "marketplace_capture_unavailable");
  assert.equal((await h.send("GET_BATCH_STATE")).stopped, true);
  await h.alarm("bm_batch_queue_retry"); await h.send("IMPORT_BATCH"); await h.send("PREPARE_BATCH");
  assert.equal(h.calls.length, 1); assert.deepEqual(h.data.bm_browser_batch.payload, before); assert.equal(h.alarms.size, 0);
  await h.send("CANCEL_BATCH"); assert.equal(h.data.bm_browser_batch, null);
});
test("single capture, alarm and duplicate click cannot race; successful receipts prevent repeated POST", async () => {
  const h = await harness(session(), (_call, index) => index === 1 ? ok({ ok: false, error: "temporary" }, 503) : ok({ ok: true, productId: "product-1" }));
  await Promise.all([h.send("CAPTURE", capture()), h.send("CAPTURE", capture())]);
  assert.equal(h.calls.length, 1); assert.equal(h.data.bm_outbox.length, 1);
  assert.equal(h.calls[0]!.body.mode, "manual");
  const before = structuredClone(h.calls[0]!.body);
  await h.send("PENDING"); assert.equal(h.calls.length, 1);
  await h.nextAlarm("bm_retry");
  assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1]!.body, before);
  assert.equal((await h.send("CAPTURE", capture())).ok, true); assert.equal(h.calls.length, 2);
  assert.deepEqual(h.data.bm_outbox, []); assert.equal(h.alarms.size, 0);
});
test("bounded retries and expiry retain errors, including malformed successful responses", async () => {
  const h = await harness(session(), () => new Response("not json", { status: 200 }));
  await h.send("PREPARE_BATCH"); await h.send("IMPORT_BATCH");
  for (let i = 0; i < 8; i++) await h.nextAlarm("bm_batch_queue_retry");
  assert.equal(h.calls.length, 6); assert.equal((await h.send("GET_BATCH_STATE")).lastError, "retry_limit");
  assert.equal(h.alarms.size, 0);
  await h.send("CANCEL_BATCH");
  const old = payload(); old.clientCapturedAt = new Date(Date.now() - 31 * 60_000).toISOString(); h.setPayload(old);
  await h.send("PREPARE_BATCH");
  assert.equal((await h.send("IMPORT_BATCH")).error, "capture_expired"); assert.equal(h.calls.length, 6);
});
test("single errors stop after six attempts and permanent failures remain visible", async () => {
  const h = await harness(session(), () => ok({ ok: false, error: "unavailable" }, 503));
  await h.send("CAPTURE", capture());
  for (let i = 0; i < 8; i++) await h.nextAlarm("bm_retry");
  assert.equal(h.calls.length, 6);
  assert.deepEqual(await h.send("PENDING"), { ok: true, pending: 0, failed: 1, errors: ["retry_limit"] });
  assert.equal(h.alarms.size, 0); await h.send("CLEAR_FAILED"); assert.equal(h.data.bm_outbox.length, 0);
});
test("revocation pauses both queues, and new owner never receives old payloads", async () => {
  const h = await harness(session(), (call) => call.url.endsWith("pair/exchange")
    ? ok({ ok: true, deviceId: "device-2", deviceToken: "bm_ext_new", affiliate: { displayName: "New owner" } })
    : ok({ ok: false, error: "device_revoked" }, 401));
  await h.send("PREPARE_BATCH"); await h.send("CAPTURE", capture());
  assert.equal(h.data.bm_token, ""); assert.equal((await h.send("GET_BATCH_STATE")).stopped, true);
  await h.send("PAIR", { pairingCode: "new-code" });
  await h.alarm("bm_retry"); await h.alarm("bm_batch_queue_retry"); await h.send("IMPORT_BATCH");
  assert.equal(h.calls.length, 2); assert.equal(h.data.bm_device_id, "device-2");
  assert.equal(h.data.bm_outbox[0].deviceId, "device-1"); assert.equal(h.data.bm_browser_batch.deviceId, "device-1");
});
test("concurrent captures and alarm retain both entries without duplicate POST; restart resumes unchanged payload", async () => {
  let release!: () => void, started!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const h = await harness(session(), async (_call, index) => {
    if (index === 1) { started(); await gate; }
    return index <= 2 ? ok({ ok: false, error: "temporary" }, 503) : ok({ ok: true, productId: "p" });
  });
  const first = h.send("CAPTURE", capture("a"));
  await startedPromise;
  const second = h.send("CAPTURE", capture("b"));
  const alarm = h.alarm("bm_retry");
  release(); await Promise.all([first, second, alarm]);
  assert.equal(h.calls.length, 2); assert.deepEqual(h.data.bm_outbox.map((e: any) => e.requestId), ["a", "b"]);
  const original = structuredClone(h.data.bm_outbox.map((e: any) => e.payload));
  const resumed = await harness(structuredClone(h.data), () => ok({ ok: true, productId: "p" }));
  await resumed.nextAlarm("bm_retry"); await resumed.nextAlarm("bm_retry");
  assert.equal(resumed.calls.length, 2); assert.deepEqual(resumed.calls.map(c => c.body), original.map((p: any) => ({ ...p, mode: "manual" })));
  assert.equal(resumed.alarms.size, 0); assert.equal(resumed.data.bm_outbox.length, 0);
});
test("malformed permanent single response is retained and never retried", async () => {
  const h = await harness(session(), () => new Response("bad request", { status: 400 }));
  await h.send("CAPTURE", capture()); await h.alarm("bm_retry");
  assert.equal(h.calls.length, 1); assert.equal((await h.send("PENDING")).failed, 1);
  assert.equal(h.alarms.size, 0); assert.equal(h.data.bm_token, "bm_ext_test");
});
test("bulk diagnostic receipt survives successful queue clear, popup reopen and worker restart without HTTP", async () => {
  const diagnostics = { received: 53, valid: 35, duplicates: 10, rejected: 8, items: Array.from({ length: 18 }, (_, i) => ({
    index: i + 36, externalId: `MLB${1234500 + i}`, status: i < 10 ? "duplicate" : "rejected",
    reason: i < 10 ? "duplicate_external_id" : "product_price_invalid",
  })) };
  const h = await harness(session(), () => ok({ ok: true, importedCount: 30, alreadyRecordedCount: 5, diagnostics }));
  const p = payload(); p.products = Array.from({ length: 53 }, (_, i) => ({ ...p.products[0]!, externalId: `MLB${1234500 + i}` })); h.setPayload(p);
  await h.send("PREPARE_BATCH"); const response = await h.send("IMPORT_BATCH");
  assert.equal(response.lastImport.importedCount, 30);
  assert.equal(h.data.bm_browser_batch, null);
  const state = await h.send("GET_BATCH_STATE");
  assert.equal(state.hasBatch, false); assert.equal(state.lastImport.requestId, p.requestId);
  assert.deepEqual(state.lastImport.diagnostics, diagnostics); assert.equal(state.lastImport.alreadyRecordedCount, 5);
  await h.send("CANCEL_BATCH"); await h.alarm("bm_batch_queue_retry"); await h.send("PENDING");
  assert.deepEqual((await h.send("GET_BATCH_STATE")).lastImport, state.lastImport); assert.equal(h.calls.length, 1);
  const reopened = await harness(structuredClone(h.data));
  assert.deepEqual((await reopened.send("GET_BATCH_STATE")).lastImport, state.lastImport);
  await reopened.alarm("bm_batch_queue_retry"); assert.equal(reopened.calls.length, 0);
  assert.equal(JSON.stringify(reopened.data.bm_last_import_report).includes("bm_ext_"), false);
});
test("all-invalid 400 preserves rejection report after cancel and does not retry", async () => {
  const diagnostics = { received: 1, valid: 0, duplicates: 0, rejected: 1,
    items: [{ index: 1, externalId: "MLB1234567", status: "rejected", reason: "product_price_invalid" }] };
  const h = await harness(session(), () => ok({ ok: false, error: "invalid_payload", diagnostics }, 400));
  await h.send("PREPARE_BATCH"); await h.send("IMPORT_BATCH");
  const report = (await h.send("GET_BATCH_STATE")).lastImport;
  assert.equal(report.ok, false); assert.deepEqual(report.diagnostics, diagnostics);
  assert.equal(report.importedCount, undefined); assert.equal(report.alreadyRecordedCount, undefined);
  await h.send("CANCEL_BATCH"); await h.alarm("bm_batch_queue_retry");
  assert.deepEqual((await h.send("GET_BATCH_STATE")).lastImport, report); assert.equal(h.calls.length, 1);
});
test("old backend receipt keeps only acknowledged count; uncertain retries create no receipt", async () => {
  const h = await harness(session(), (_call, index) => index === 1 ? ok({ ok: false, error: "temporary" }, 503) : ok({ ok: true, importedCount: 1 }));
  await h.send("PREPARE_BATCH"); assert.equal((await h.send("IMPORT_BATCH")).queued, true);
  assert.equal((await h.send("GET_BATCH_STATE")).lastImport, null);
  await h.nextAlarm("bm_batch_queue_retry");
  const report = (await h.send("GET_BATCH_STATE")).lastImport;
  assert.equal(report.ok, true); assert.equal(report.importedCount, 1); assert.equal(report.diagnostics, undefined);
  assert.equal(report.alreadyRecordedCount, undefined);
  assert.deepEqual(h.calls[0]!.body, h.calls[1]!.body);
});
test("receipt expires after 24h and never crosses session origin/device or logout/pair", async () => {
  const h = await harness(session(), () => ok({ ok: true, importedCount: 1 }));
  await h.send("PREPARE_BATCH"); await h.send("IMPORT_BATCH"); const saved = structuredClone(h.data);
  h.advance(24 * 60 * 60_000); assert.equal((await h.send("GET_BATCH_STATE")).lastImport, null);
  assert.equal(h.data.bm_last_import_report, null);
  const otherOwner = await harness({ ...structuredClone(saved), bm_device_id: "other-device" });
  assert.equal((await otherOwner.send("GET_BATCH_STATE")).lastImport, null); assert.equal(otherOwner.calls.length, 0);
  const otherOrigin = await harness({ ...structuredClone(saved), bm_session_origin: "http://localhost:3100" });
  assert.equal((await otherOrigin.send("GET_BATCH_STATE")).lastImport, null); assert.equal(otherOrigin.calls.length, 0);
  const logout = await harness(structuredClone(saved)); await logout.send("LOGOUT");
  assert.equal(logout.data.bm_last_import_report, null);
  const paired = await harness(structuredClone(saved), () => ok({ ok: true, deviceId: "new-device", deviceToken: "bm_ext_new" }));
  await paired.send("PAIR", { pairingCode: "new-code" }); assert.equal((await paired.send("GET_BATCH_STATE")).lastImport, null);
});
test("oversized or inconsistent server diagnostics are not stored or invented", async () => {
  const h = await harness(session(), () => ok({ ok: true, importedCount: 1, alreadyRecordedCount: 999999,
    diagnostics: { received: 201, valid: 1, duplicates: 200, rejected: 0, items: Array.from({ length: 201 }, () => ({
      index: 1, externalId: "https://secret.invalid/raw?token=x", status: "duplicate", reason: "raw secret explanation",
    })) } }));
  await h.send("PREPARE_BATCH"); await h.send("IMPORT_BATCH");
  const report = (await h.send("GET_BATCH_STATE")).lastImport;
  assert.equal(report.importedCount, 1); assert.equal(report.diagnostics, undefined); assert.equal(report.alreadyRecordedCount, undefined);
  assert.ok(JSON.stringify(h.data.bm_last_import_report).length < 1000);
  assert.equal(JSON.stringify(h.data.bm_last_import_report).includes("secret.invalid"), false);
});
test("reopening after an update preserves original capture/version and receipt describes the saved extraction", async () => {
  const h = await harness(session(), undefined, "0.3.5");
  const old = payload(); old.clientCapturedAt = new Date(Date.now() - 5 * 60_000).toISOString(); h.setPayload(old);
  await h.send("PREPARE_BATCH");
  const original = structuredClone(h.data.bm_browser_batch);
  const reopened = await harness(structuredClone(h.data), undefined, "0.3.6");
  const state = await reopened.send("GET_BATCH_STATE");
  assert.equal(state.capturedAt, old.clientCapturedAt); assert.equal(state.preparedVersion, "0.3.5");
  assert.equal(state.sent, false); assert.equal(state.canReplace, true);
  assert.equal((await reopened.send("PREPARE_BATCH")).preserved, true);
  assert.deepEqual(reopened.data.bm_browser_batch, original); assert.equal(reopened.extractions(), 0); assert.equal(reopened.calls.length, 0);
  const result = await reopened.send("IMPORT_BATCH");
  assert.equal(result.lastImport.capturedAt, old.clientCapturedAt); assert.equal(result.lastImport.preparedVersion, "0.3.5");
  assert.ok(result.lastImport.at > Date.parse(result.lastImport.capturedAt));
  assert.deepEqual(reopened.calls[0]!.body.payload, old);
});
test("REFRESH_BATCH replaces an unsent draft only after a new extraction, with exact fresh ID/time and zero HTTP", async () => {
  const old = payload();
  const h = await harness({ ...session(), bm_browser_batch: { payload: old, collectorVersion: "0.3.5", origin: base, deviceId: "device-1", sent: false, queued: false } });
  h.advance(60_000);
  const fresh = { ...payload(), requestId: "619be3b8-7ecf-45ba-ad27-5a0cfc9c2c3f", clientCapturedAt: new Date(Date.now()).toISOString() }; h.setPayload(fresh);
  assert.equal((await h.send("REFRESH_BATCH", {}, "https://www.mercadolivre.com.br/ofertas")).error, "invalid_sender");
  assert.equal(h.extractions(), 0);
  const result = await h.send("REFRESH_BATCH");
  assert.equal(result.ok, true); assert.equal(result.preparedVersion, "0.3.6"); assert.equal(result.capturedAt, fresh.clientCapturedAt);
  assert.deepEqual(h.data.bm_browser_batch.payload, fresh); assert.equal(h.data.bm_browser_batch.collectorVersion, "0.3.6");
  assert.notEqual(h.data.bm_browser_batch.payload.requestId, old.requestId);
  assert.equal(h.extractions(), 1); assert.equal(h.calls.length, 0); assert.equal(h.alarms.size, 0);
});
test("failed or empty refresh preserves prior unsent payload and collector metadata", async () => {
  const h = await harness(); await h.send("PREPARE_BATCH"); const original = structuredClone(h.data.bm_browser_batch);
  h.setExtractionError(new Error("test_dom_failure"));
  assert.equal((await h.send("REFRESH_BATCH")).error, "offers_page_required");
  assert.deepEqual(h.data.bm_browser_batch, original);
  h.setExtractionError(undefined); h.setPayload({ ...payload(), products: [] });
  assert.equal((await h.send("REFRESH_BATCH")).error, "no_offers"); assert.deepEqual(h.data.bm_browser_batch, original);
  assert.equal(h.calls.length, 0);
});
test("sent, queued or uncertain legacy drafts require explicit discard before extracting again", async () => {
  for (const flags of [{ sent: true }, { queued: true }, { attempts: 1 }, { batchId: "legacy-uncertain" }]) {
    const h = await harness({ ...session(), bm_browser_batch: { payload: payload(), origin: base, deviceId: "device-1", ...flags } });
    const before = structuredClone(h.data.bm_browser_batch);
    assert.equal((await h.send("GET_BATCH_STATE")).canReplace, false);
    assert.equal((await h.send("REFRESH_BATCH")).error, "discard_required");
    assert.deepEqual(h.data.bm_browser_batch, before); assert.equal(h.extractions(), 0); assert.equal(h.calls.length, 0);
    await h.send("CANCEL_BATCH"); await h.send("PREPARE_BATCH");
    assert.equal(h.extractions(), 1); assert.equal(h.data.bm_browser_batch.sent, false); assert.equal(h.data.bm_browser_batch.collectorVersion, "0.3.6");
  }
});
test("legacy draft has unknown version until explicitly refreshed; no current-version stamp on resume", async () => {
  const p = payload();
  const h = await harness({ ...session(), bm_browser_batch: { payload: p, origin: base, deviceId: "device-1", sent: false, queued: false } });
  assert.equal((await h.send("GET_BATCH_STATE")).preparedVersion, null);
  assert.equal((await h.send("PREPARE_BATCH")).preparedVersion, null);
  assert.equal(Object.hasOwn(h.data.bm_browser_batch, "collectorVersion"), false);
  assert.equal(h.extractions(), 0); assert.equal(h.calls.length, 0);
  await h.send("REFRESH_BATCH"); assert.equal(h.data.bm_browser_batch.collectorVersion, "0.3.6");
  assert.equal(h.extractions(), 1); assert.equal(h.calls.length, 0);
});
test("API bounds hung fetch/body reads and malformed pair response", async () => {
  const hungFetch = (() => new Promise(() => {})) as typeof fetch;
  const start = performance.now();
  const response = await postJson({ baseUrl: base, fetchImpl: hungFetch, timeoutMs: 10 }, "/test", {});
  assert.equal(response.error, "timeout"); assert.ok(performance.now() - start < 1000);
  const hungBody = (async () => ({ status: 200, ok: true, headers: new Headers(), text: () => new Promise(() => {}) })) as unknown as typeof fetch;
  assert.equal((await postJson({ baseUrl: base, fetchImpl: hungBody, timeoutMs: 10 }, "/test", {})).error, "timeout");
  const malformed = (async () => ok({ ok: true, deviceId: "d" })) as typeof fetch;
  assert.equal((await exchangePairingCode({ baseUrl: base, fetchImpl: malformed }, "code")).error, "invalid_response");
  Date.now = originalNow; globalThis.fetch = originalFetch;
});
