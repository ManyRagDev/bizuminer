import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

// Exercise the real cookie/header implementation in Next. Only the Auth SDK
// transport is simulated; no credentials, Auth service or database are read.
function load(file, modules) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, URL, crypto: globalThis.crypto,
    process: { env: { SUPABASE_URL: "https://auth.fixture.test", SUPABASE_PUBLISHABLE_KEY: "fixture-public-key" } },
    require(id) {
      if (id in modules) return modules[id];
      if (id === "next/server") return { NextRequest, NextResponse };
      if (id === "next/headers") return { cookies() { throw new Error("Page client must not run in middleware test"); } };
      throw new Error(`Unexpected module ${id}`);
    },
  }, { filename: file });
  return exports;
}
const uid = "2b9c755d-c3e6-44f4-9cdc-34502d6d12cf";
const cookieBase = "sb-fixture-auth-token";
const newCookies = [
  { name: `${cookieBase}.0`, value: "new-chunk-zero", options: { path: "/", secure: true, sameSite: "lax", maxAge: 3600 } },
  { name: `${cookieBase}.1`, value: "new-chunk-one", options: { path: "/", secure: true, sameSite: "lax", maxAge: 3600 } },
  { name: `${cookieBase}.2`, value: "", options: { path: "/", maxAge: 0 } },
];
const expiredCookies = [0, 1, 2].map(index => ({ name: `${cookieBase}.${index}`, value: "", options: { path: "/", maxAge: 0 } }));
const sdkHeaders = { "Cache-Control": "private, no-cache, no-store", Pragma: "no-cache", Expires: "0" };
function fixture({ authenticated = true, cookies = newCookies, refresh = true } = {}) {
  let claimsCalls = 0;
  const supabaseModule = load("../lib/supabase.ts", {
    "@supabase/ssr": {
      createServerClient(_url, _key, options) {
        return { auth: { async getClaims() {
          claimsCalls++;
          assert.equal(options.cookies.getAll().some(cookie => cookie.name === `${cookieBase}.0`), true);
          await Promise.resolve(); // The mutation happens after helper return/destructuring.
          if (refresh) options.cookies.setAll(cookies, sdkHeaders);
          return { data: { claims: authenticated ? { sub: "fixture-user" } : null }, error: null };
        } } };
      },
    },
  });
  const { middleware } = load("../middleware.ts", { "./lib/supabase": supabaseModule });
  return { middleware, supabaseModule, calls: () => claimsCalls };
}
function request(path, withUid = true) {
  const cookies = [withUid ? `bm_uid=${uid}` : null, ...[0, 1, 2].map(index => `${cookieBase}.${index}=old-${index}`)].filter(Boolean).join("; ");
  return new NextRequest(`https://app.fixture.test${path}`, { headers: { cookie: cookies } });
}
function assertSdkCookies(response, expected = newCookies) {
  for (const item of expected) {
    const cookie = response.cookies.get(item.name);
    assert.ok(cookie, `Response must carry ${item.name}, including chunk zero/tombstones`);
    assert.equal(cookie.value, item.value);
    assert.equal(cookie.path, "/");
    assert.equal(cookie.maxAge, item.options.maxAge);
    if (item.options.secure) assert.equal(cookie.secure, true);
  }
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  const lines = response.headers.getSetCookie();
  assert.equal(lines.filter(line => line.startsWith(`${cookieBase}.`)).length, expected.length, "Each fragment must be a separate Set-Cookie line");
}

test("middleware Supabase helper exposes the refreshed response after asynchronous setAll", async () => {
  const { supabaseModule } = fixture();
  const req = request("/pauta");
  const context = supabaseModule.createMiddlewareSupabase(req);
  await context.supabase.auth.getClaims();
  assert.equal(req.cookies.get(`${cookieBase}.0`).value, "new-chunk-zero");
  assert.equal(req.cookies.get(`${cookieBase}.1`).value, "new-chunk-one");
  assertSdkCookies(context.supabaseResponse);
  const downstream = context.supabaseResponse.headers.get("x-middleware-request-cookie") ?? "";
  assert.match(downstream, /sb-fixture-auth-token\.0=new-chunk-zero/);
  assert.match(downstream, /sb-fixture-auth-token\.1=new-chunk-one/);
  assert.doesNotMatch(downstream, /old-[012]/);
});

test("protected passthrough propagates both refreshed chunks to browser and downstream request", async () => {
  const { middleware, calls } = fixture();
  const req = request("/pauta");
  const response = await middleware(req);
  assert.equal(calls(), 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assertSdkCookies(response);
  const downstream = response.headers.get("x-middleware-request-cookie") ?? "";
  assert.match(downstream, /sb-fixture-auth-token\.0=new-chunk-zero/);
  assert.match(downstream, /sb-fixture-auth-token\.1=new-chunk-one/);
});

test("authenticated login redirect keeps all refreshed chunks and SDK cache headers", async () => {
  const { middleware } = fixture();
  const response = await middleware(request("/entrar"));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")).pathname, "/minha-area");
  assertSdkCookies(response);
  assert.equal(response.headers.get("x-middleware-next"), null, "A redirect must not also instruct Next to pass through");
  assert.equal(response.headers.get("x-middleware-request-cookie"), null, "Request override headers belong to passthrough only");
});

test("expired protected-session redirect retains cookie deletions instead of retrying stale fragments", async () => {
  const { middleware } = fixture({ authenticated: false, cookies: expiredCookies });
  const response = await middleware(request("/pauta"));
  assert.equal(response.status, 307);
  const target = new URL(response.headers.get("location"));
  assert.equal(target.pathname, "/entrar"); assert.equal(target.searchParams.get("next"), "/pauta");
  assertSdkCookies(response, expiredCookies);
  assert.equal(response.headers.get("x-middleware-next"), null);
});

test("unauthorized API JSON retains SDK deletions and a new anonymous UID never authorizes access", async () => {
  const { middleware } = fixture({ authenticated: false, cookies: expiredCookies });
  const req = request("/api/pauta", false);
  const response = await middleware(req);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "no_session" });
  assertSdkCookies(response, expiredCookies);
  const issued = response.cookies.get("bm_uid");
  assert.ok(issued?.value); assert.equal(issued.httpOnly, true);
  assert.equal(issued.value, req.cookies.get("bm_uid").value);
  assert.equal(response.headers.get("x-middleware-next"), null);
});


test("valid unchanged session remains a passthrough without inventing replacement cookies", async () => {
  const { middleware, calls } = fixture({ refresh: false });
  const req = request("/pauta");
  const response = await middleware(req);
  assert.equal(calls(), 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(req.cookies.get(`${cookieBase}.0`).value, "old-0");
});
