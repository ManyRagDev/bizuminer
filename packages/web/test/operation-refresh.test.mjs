import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createOperationObserver} from '../lib/operation-observer.ts';
import {progressScope} from '../lib/operation-progress.ts';

// Mount real client effects against a virtual browser clock. No elapsed-time
// sleep or source-pattern assertion: the test counts the requests they issue.
function mount(file, props, responses, options = {}) {
  const effects = [], cleanups = [], timers = new Map(), calls = [], updates = [];
  let clock = 0, timerId = 0;
  const window = new EventTarget();
  Object.assign(window, {
    innerWidth: 1200,
    location: { pathname: "/", search: "", reload: () => updates.push("reload") },
    history: { replaceState() {}, pushState() {} },
    ...options.window,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { throw new Error("idle interval is forbidden"); },
  });
  const document = Object.assign(new EventTarget(), { hidden: false, visibilityState: "visible", querySelectorAll: () => options.elements ?? [] });
  const react = {
    useEffect(fn) { effects.push(fn); },
    useState(initial) { return [typeof initial === "function" ? initial() : initial, value => updates.push({ initial, value })]; },
    useMemo(fn) { return fn(); },
    useRef(current) { return { current }; },
  };
  const exports = {};
  const fetcher=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>responses[Math.min(calls.length-1,responses.length-1)]};};
  const observer=createOperationObserver({window,document,fetch:fetcher,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,now:()=>clock});
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, window, document, AbortController, URLSearchParams, Intl, Date, console, CustomEvent,
    navigator: { userAgent: "fixture" }, ...options.globals,
    localStorage: { getItem: () => null },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    fetch:fetcher,
    require(id) {
      if (options.modules?.[id]) return options.modules[id];
      if (id === "react") return react;
      if(id.includes('operation-progress.ts'))return {progressScope};
      if(id.includes('operation-observer'))return {observeOperation:(tenant,ids,listener,filter)=>observer.subscribe(tenant,ids,listener,filter)};
      if (id.endsWith(".css")) return { default: {} };
      if (id === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
      if (id.includes("marketplaces")) return { MARKETPLACES: [], marketplaceDef: () => null };
      if (id.includes("product-preview-warmup")) return { createPreviewWarmer: () => ({ warm() {}, dispose() {} }) };
      return {};
    },
  }, { filename: file });
  if (options.exportName) exports[options.exportName](...props);
  else exports.default(props);
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const advance = async ms => {
    await flush();
    const until = clock + ms;
    for (;;) {
      const next = [...timers].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    clock = until;
    await flush();
  };
  return {
    calls, advance, window, document, updates,
    operation(tenantId) { const event = new Event("bm:operation-changed"); event.detail = { tenantId }; window.dispatchEvent(event); },
    close() { for (const cleanup of cleanups) cleanup(); },
  };
}

const pauta = { products: [], recent: [], recentTotal: 0, captureActions: {}, active: true, updatedAt: "2026-11-11T00:00:00Z", revision: "1:1:1:true:0" };

const pautaSlots = { config: { hours: [], timezone: "America/Sao_Paulo", enabled: true, items_per_slot: 3, repeat_hours: 72, impulse_limit_cents: null, allow_price_improvement: false, improvement_percent: 10, dom_window_hours: 72, version: 1 } };

test("pauta ociosa não consulta; navegação e operação da conta coalescem eventos", async () => {
  const browser = mount("../app/pauta/pauta-client.tsx", { accountKey: "a", userKey: "u" }, [pautaSlots, pauta, { unchanged: true }]);
  const pautaCalls = () => browser.calls.filter(c => c.url.startsWith("/api/pauta?"));
  await browser.advance(3_600_000);
  assert.equal(pautaCalls().length, 1);
  assert.equal(browser.calls.filter(c => c.url.startsWith("/api/pauta/slots")).length, 1);
  browser.window.dispatchEvent(new Event("focus"));
  browser.document.dispatchEvent(new Event("visibilitychange"));
  await browser.advance(100);
  assert.equal(pautaCalls().length, 2);
  assert.match(pautaCalls()[1].url, /revision=/);
  browser.operation("b");
  await browser.advance(100);
  assert.equal(pautaCalls().length, 2);
  browser.operation("a");
  await browser.advance(100);
  assert.equal(pautaCalls().length, 3);
  assert.doesNotMatch(pautaCalls()[2].url, /revision=/);
  browser.close();
  browser.window.dispatchEvent(new Event("focus"));
  await browser.advance(3_600_000);
  assert.equal(pautaCalls().length, 3);
});

test("Hoje acompanha trabalho ativo e encerra consultas na espera pelo navegador", async () => {
  const status = activities => ({version:2,tenantId:'a',scope:'account',consultedAt:'2026-11-16T12:00:00Z',mode:'legacy',evaluation:null,preparation:null,captures:null,links:null,
    activities,issues:[],problems:[],pauta:{whatsapp:null,stories:null},availability:{processing:true,captures:true,whatsapp:true,stories:true,links:true},poll:{active:activities.some(a=>a.kind==='capture'),nextAt:null}});
  const browser = mount("../app/admin/use-operation-progress.ts", ["a"], [
    status([{ kind: "capture", marketplaces: ["shopee"] }]),
    status([{ kind: "browser", marketplaces: ["mercadolivre"] }]),
    status([]),
  ],{exportName:'useOperationProgress'});
  await browser.advance(20_000);
  assert.equal(browser.calls.length, 2);
  await browser.advance(3_600_000);
  assert.equal(browser.calls.length, 2);
  browser.operation("a");
  browser.window.dispatchEvent(new Event("focus"));
  await browser.advance(100);
  assert.equal(browser.calls.length, 3);
  await browser.advance(3_600_000);
  assert.equal(browser.calls.length, 3);
  browser.close();
});


test("Hoje não consulta continuamente esperas por retry, credencial ou reconciliação", async () => {
  for (const kind of ["retry", "authorization", "reconciliation"]) {
    const browser = mount("../app/admin/use-operation-progress.ts", ["a"], [{version:2,tenantId:'a',scope:'account',consultedAt:'2026-11-16T12:00:00Z',mode:'legacy',evaluation:null,preparation:null,captures:null,links:null,
      activities:[{kind,marketplaces:['shopee']}],issues:[],problems:[],pauta:{whatsapp:null,stories:null},availability:{processing:true,captures:true,whatsapp:true,stories:true,links:true},poll:{active:false,nextAt:null}}],{exportName:'useOperationProgress'});
    await browser.advance(3_600_000);
    assert.equal(browser.calls.length, 1, kind);
    browser.close();
  }
});


test("vitrine remove destaque vencido sem consulta; foco verifica uma vez a versão", async () => {
  const modules = {
    "../lib/deal-query": { CATALOG_PAGE_SIZE: 24, catalogStateToSearchParams: () => new URLSearchParams(), catalogStateToDealQuery: () => ({}), isHomepageSelectionQuery: () => true },
    "../lib/saved-products": { mergeSavedProducts: () => [], readSavedState: () => ({ ids: [], products: [] }) },
    "../lib/analytics": { trackEvent() {} },
    "../lib/home-cover": { selectCoverProduct: () => null },
    "./_components/use-homepage-engagement": { useHomepageEngagement() {} },
  };
  const browser = mount("../app/vitrine.tsx", {
    initialProducts: [], initialTotal: 0, initialState: { page: 1, search: "", category: null },
    categories: [], dateLabel: "fixture", editorialStateKey: "edition-1",
    editorialHeroValidUntil: new Date(Date.now() + 1_000).toISOString(),
  }, [{ selectionStateKey: "edition-1" }, { selectionStateKey: "edition-2" }], { modules });
  await browser.advance(3_600_000);
  assert.equal(browser.calls.length, 0);
  assert.ok(browser.updates.some(update => update?.initial === true && update?.value === false));
  browser.window.dispatchEvent(new Event("focus"));
  browser.document.dispatchEvent(new Event("visibilitychange"));
  await browser.advance(100);
  assert.equal(browser.calls.length, 1);
  assert.equal(browser.calls[0].url, "/api/editorial-selection");
  assert.equal(browser.updates.includes("reload"), false);
  browser.window.dispatchEvent(new Event("focus"));
  await browser.advance(100);
  assert.equal(browser.updates.includes("reload"), true);
  browser.close();
});

test("telemetria não agenda consultas vazias; evento observado gera um envio limitado", async () => {
  let intersect;
  const element = { getAttribute: name => name === "data-home-product" ? "product-a" : "grid", closest: () => null };
  class IntersectionObserver {
    constructor(callback) { intersect = callback; }
    observe() {}
    disconnect() {}
  }
  const browser = mount("../app/_components/use-homepage-engagement.ts", ["edition", { token: "ticket", viewId: "view" }, ["product-a"], [], true], [{}], {
    exportName: "useHomepageEngagement", elements: [element], window: { IntersectionObserver }, globals: { IntersectionObserver },
    modules: { "../../lib/homepage-engagement.ts": { isKnownAutomation: () => false } },
  });
  await browser.advance(3_600_000);
  assert.equal(browser.calls.length, 0);
  intersect([{ target: element, isIntersecting: true, intersectionRatio: 1 }]);
  await browser.advance(11_000);
  assert.equal(browser.calls.length, 1);
  assert.equal(JSON.parse(browser.calls[0].init.body).events.length, 1);
  assert.ok(Buffer.byteLength(browser.calls[0].init.body) < 1024);
  await browser.advance(3_600_000);
  assert.equal(browser.calls.length, 1);
  // Deduplication survives another intersection of the same product.
  intersect([{ target: element, isIntersecting: true, intersectionRatio: 1 }]);
  await browser.advance(11_000);
  assert.equal(browser.calls.length, 1);
  browser.close();
});
