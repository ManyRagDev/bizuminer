import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse } from "next/server.js";
import { adminMutationOrigin } from "../lib/admin-request-origin.ts";

const forbidden = () => { throw new Error("Unexpected dependency or external operation"); };
function load(file, modules = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URL, URLSearchParams, Uint8Array, TextDecoder, AbortController, FormData, Error,
    fetch: forbidden, setInterval: forbidden, setTimeout: forbidden,
    require(id) {
      if (id in modules) return modules[id];
      if (id === "next/server") return { NextRequest, NextResponse };
      if (id === "react/jsx-runtime") return jsxRuntime;
      throw new Error(`Unmocked dependency ${id}`);
    },
  }, { filename: file });
  return exports;
}
const context = Object.freeze({ tenantId: "session-tenant", affiliateId: "session-affiliate", actor: "human",
  actorAppUserId: "session-user", authenticatedAuthUserId: "session-auth", membershipRole: "owner", requestId: "request-fixture" });
function pageFixture(options = {}) {
  const calls = [], props = [];
  const page = load("../app/admin/onboarding/page.tsx", {
    "../../../lib/page-account.ts": {
      async pageAccount() { calls.push("account"); return options.noAccount ? null : { ...context, membershipRole: options.role ?? "owner" }; },
      async platformPageContext() { calls.push("platform"); return options.platform ? context : null; },
    },
    "../../../lib/workflow-readiness.ts": {
      async verifiedWorkflowsReady() { calls.push("readiness"); if (options.probeError) throw new Error("probe unavailable"); return options.ready ?? false; },
    },
    "./workspace.tsx": { default(input) { props.push(input); return jsxRuntime.jsx("main", { children: "Conexões da conta" }); } },
  });
  return { page, calls, props };
}
test("owner connections render with rollout off and do not read SaaS progress or marketplace configuration", async () => {
  // The loader rejects every undeclared import; only identity and the optional
  // evidence capability probe are available to the actual page.
  const { page, calls, props } = pageFixture();
  assert.match(renderToStaticMarkup(await page.default()), /Conexões da conta/);
  assert.deepEqual(calls, ["account", "platform", "readiness"]);
  assert.equal(props[0].tenantId, context.tenantId);
  assert.equal(props[0].canManage, true);
  assert.equal(props[0].canDocumentLinks, false);
});
test("missing account short circuits all capability and platform reads", async () => {
  const { page, calls, props } = pageFixture({ noAccount: true });
  assert.match(renderToStaticMarkup(await page.default()), /Nenhuma conta ativa/);
  assert.deepEqual(calls, ["account"]); assert.equal(props.length, 0);
});
test("operator stays read-only even with platform access and failed readiness does not block connections", async () => {
  for (const options of [{ role: "operator", platform: true, ready: true }, { probeError: true }]) {
    const { page, props } = pageFixture(options);
    assert.match(renderToStaticMarkup(await page.default()), /Conexões da conta/);
    assert.equal(props[0].canManage, options.role !== "operator");
    assert.equal(props[0].canDocumentLinks, options.ready === true);
    assert.equal(props[0].platformAdmin, options.platform === true);
  }
});

const connections = ["mercadolivre", "shopee", "aliexpress"].map(marketplace => ({ marketplace,
  configured: true, status: "configured", configId: `${marketplace}-config`, checkedAt: null }));
function workspaceFixture(options = {}) {
  const effects = [], requests = [], updates = [];
  const data = { schemaReady: options.schemaReady ?? true, secretStorageReady: options.secretStorageReady ?? false, connections };
  const initial = [data, true, "", false, 0];
  let stateIndex = 0;
  const workspace = load("../app/admin/onboarding/workspace.tsx", {
    react: {
      useState(fallback) { const index = stateIndex++; return [index < initial.length ? initial[index] : fallback,
        value => updates.push({ index, value })]; },
      useEffect(effect) { effects.push(effect); },
    },
    "../draft-provider.tsx": { useAdminFetch: () => async (url, init) => {
      requests.push({ url, init }); return { ok: true, json: async () => data };
    } },
    "../onboarding-actions.ts": { verifyLinkTestAction: forbidden },
  });
  const html = renderToStaticMarkup(jsxRuntime.jsx(workspace.default, { tenantId: context.tenantId,
    platformAdmin: false, canManage: options.canManage ?? true, canDocumentLinks: options.canDocumentLinks ?? false }));
  return { html, effects, requests, updates };
}
function storeSection(html, store) {
  const sections = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g) ?? [];
  const section = sections.find(value => value.includes(`<h2>${store}</h2>`));
  assert.ok(section, `Missing rendered section ${store}`); return section;
}
test("missing secret storage disables only API credential forms; saved API connections remain testable", () => {
  const { html, requests } = workspaceFixture();
  assert.match(html, /armazenamento seguro de credenciais está indisponível/);
  assert.doesNotMatch(storeSection(html, "Mercado Livre"), /<fieldset disabled/);
  for (const store of ["Shopee", "AliExpress"]) {
    const section = storeSection(html, store);
    assert.match(section, /<fieldset disabled=""/);
    assert.match(section, /<button class="bm-button secondary">Testar conexão<\/button>/);
  }
  assert.doesNotMatch(html, /type="file"|Registrar conferência/);
  assert.match(html, /conexão da loja podem ser salvos acima/);
  assert.deepEqual(requests, []);
  assert.match(html,/href="\/admin\?conta=session-tenant"/);
  assert.match(html,/href="\/admin\/configuracoes\?conta=session-tenant"/);
});
test("operator forms and test controls remain disabled while owner credential forms work with storage enabled", () => {
  const operator = workspaceFixture({ canManage: false, secretStorageReady: true, canDocumentLinks: true }).html;
  assert.match(operator, /Peça ao responsável da conta/);
  assert.equal((operator.match(/<fieldset disabled=""/g) ?? []).length, 4);
  assert.equal((operator.match(/<button class="bm-button secondary" disabled="">Testar conexão/g) ?? []).length, 2);
  const owner = workspaceFixture({ secretStorageReady: true, canDocumentLinks: true }).html;
  assert.doesNotMatch(owner, /<fieldset disabled/);
  assert.match(owner, /type="file"/);
  assert.match(owner, /Registrar conferência/);
});
test("workspace initial effect requests connections once and aborts on unmount without timers or polling", async () => {
  const { effects, requests, updates } = workspaceFixture();
  assert.equal(effects.length, 1);
  const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/admin/connections");
  assert.equal(requests[0].init.signal.aborted, false);
  assert.ok(updates.some(update => update.index === 0));
  assert.ok(updates.some(update => update.index === 1 && update.value === true));
  cleanup(); assert.equal(requests[0].init.signal.aborted, true);
  await Promise.resolve(); assert.equal(requests.length, 1);
});

const requestParser = load("../lib/workspace-request.ts");
const errorContract = load("../lib/affiliate-workspace-contract.ts", {
  "./recommendation-policy.ts": { recommendationBlockers: forbidden },
});
function apiFixture(options = {}) {
  const calls = [];
  const route = load("../app/api/admin/connections/route.ts", {
    "../../../../lib/api-auth.ts": {
      async checkAffiliateUser() { calls.push({ operation: "auth" }); return options.denied ? { kind: "forbidden" }
        : { kind: "ok", context, sink: new NextResponse() }; },
      sinkJson(_sink, body, init) { const response = NextResponse.json(body, init); response.cookies.set("fixture-session", "refreshed"); return response; },
    },
    "../../../../lib/account-connections.ts": Object.fromEntries([
      ["accountConnections", "read"], ["saveAccountConnection", "save"], ["testAccountConnection", "test"],
    ].map(([name, operation]) => [name, async (receivedContext, input) => {
      assert.equal(receivedContext, context); calls.push({ operation, input, context: receivedContext });
      if (options.dalError) throw new Error(options.dalError);
      return operation === "read" ? { schemaReady: true, secretStorageReady: false, connections }
        : { ok: true, message: "Conexão processada" };
    }])),
    "../../../../lib/affiliate-workspace-contract.ts": errorContract,
    "../../../../lib/workspace-request.ts": requestParser,
    "../../../../lib/admin-request-origin.ts": {
      adminMutationOrigin: request => adminMutationOrigin(request, {
        NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://app.example.test",
      }),
    },
  });
  return { route, calls };
}
function apiRequest(body, headers = {}) {
  return new NextRequest("https://app.example.test/api/admin/connections?tenantId=forged-tenant", body === undefined ? {}
    : { method: "POST", headers: { origin: "https://app.example.test", "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body) });
}
test("connections API rejects unauthenticated reads and writes before reaching DAL", async () => {
  for (const method of ["GET", "POST"]) {
    const { route, calls } = apiFixture({ denied: true });
    const response = await route[method](apiRequest(method === "POST" ? { marketplace: "shopee" } : undefined));
    assert.equal(response.status, 403); assert.equal(calls.length, 1);
  }
});
test("connections API read returns capabilities with session-scoped context, private caching and refreshed cookies", async () => {
  const { route, calls } = apiFixture();
  const response = await route.GET(apiRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).secretStorageReady, false);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("set-cookie"), /fixture-session=refreshed/);
  assert.equal(calls[1].context.tenantId, "session-tenant");
});
test("connection writes enforce Origin before parsing or DAL and derive account context only from session", async () => {
  for (const origin of ["", "null", "https://other.example.test"]) {
    const { route, calls } = apiFixture();
    assert.equal((await route.POST(apiRequest("not-json", { origin }))).status, 403);
    assert.equal(calls.length, 1);
  }
  for (const action of ["save", "test"]) {
    const { route, calls } = apiFixture();
    const response = await route.POST(apiRequest({ action, marketplace: "shopee", tenantId: "forged-tenant",
      affiliateId: "forged-affiliate", actorAppUserId: "forged-owner", fields: { appId: "synthetic", appSecret: "synthetic" } }));
    assert.equal(response.status, 200); assert.equal(calls[1].operation, action);
    assert.equal(calls[1].context, context);
    if (action === "test") assert.equal(calls[1].input, "shopee");
  }
});
test("malformed or oversized input never reaches DAL; DAL permission errors become safe public messages", async () => {
  for (const body of ["not-json", "x".repeat(16001)]) {
    const { route, calls } = apiFixture();
    assert.equal((await route.POST(apiRequest(body))).status, 400); assert.equal(calls.length, 1);
  }
  const { route } = apiFixture({ dalError: "owner_required secret-internal-detail" });
  const response = await route.POST(apiRequest({ marketplace: "mercadolivre", fields: {} }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /permissão do responsável/); assert.doesNotMatch(body.error, /secret-internal-detail/);
});

function proxyRequest({ origin = "https://app.example.test", fetchSite, method = "POST" } = {}) {
  const headers = new Headers({ host: "app.example.test", "content-type": "application/json",
    "x-forwarded-host": "spoofed.example.test", "x-forwarded-proto": "http",
    forwarded: "host=spoofed.example.test;proto=http" });
  if (origin !== null) headers.set("origin", origin);
  if (fetchSite !== undefined) headers.set("sec-fetch-site", fetchSite);
  return new NextRequest("http://0.0.0.0:3100/api/admin/connections", {
    method, headers,
    ...(method === "POST" ? { body: JSON.stringify({ marketplace: "unsupported_probe", fields: {} }) } : {}),
  });
}
test("proxy POST uses configured public origin and reaches validation despite internal HTTP URL and spoofed forwarding headers", async () => {
  const { route, calls } = apiFixture({ dalError: "invalid_input" });
  const request = proxyRequest();
  assert.equal(request.nextUrl.origin, "http://0.0.0.0:3100");
  const response = await route.POST(request);
  assert.equal(response.status, 400, "validation failure must replace the former proxy-origin rejection");
  assert.deepEqual(calls.map(call => call.operation), ["auth", "save"]);
  assert.equal(calls[1].input.marketplace, "unsupported_probe");
  assert.deepEqual(Object.keys(calls[1].input.fields), []);
  assert.equal(calls[1].context, context);
  assert.match((await response.json()).error, /Confira os campos/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("proxy POST rejects absent, null, malformed, foreign and cross-site origins before DAL", async () => {
  for (const options of [
    { origin: null }, { origin: "" }, { origin: "null" }, { origin: "not-an-origin" },
    { origin: "https://app.example.test/path" }, { origin: "https://other.example.test" },
    { origin: "http://0.0.0.0:3100" }, { origin: "https://spoofed.example.test" },
    { origin: "https://app.example.test", fetchSite: "cross-site" },
  ]) {
    const { route, calls } = apiFixture({ dalError: "invalid_input" });
    const response = await route.POST(proxyRequest(options));
    assert.equal(response.status, 403, JSON.stringify(options));
    assert.deepEqual(calls.map(call => call.operation), ["auth"]);
    assert.equal((await response.json()).error, "Origem inválida.");
  }
});
test("proxy GET still permits authenticated reads without an Origin header", async () => {
  const { route, calls } = apiFixture();
  const response = await route.GET(proxyRequest({ origin: null, method: "GET" }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(call => call.operation), ["auth", "read"]);
  assert.equal((await response.json()).schemaReady, true);
});
