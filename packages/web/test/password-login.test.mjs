import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse } from "next/server.js";
import * as contract from "../lib/auth-contract.ts";

function load(file, modules = {}, env = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, URL, URLSearchParams, Uint8Array, TextDecoder, process: { env },
    require(id) {
      if (id in modules) return modules[id];
      if (id === "next/server") return { NextRequest, NextResponse };
      if (id.includes("auth-contract")) return contract;
      if (id === "react/jsx-runtime") return jsxRuntime;
      if (id.endsWith(".css")) return { default: {} };
      throw new Error(`Unmocked dependency ${id}`);
    },
  }, { filename: file });
  return exports;
}
const user = { id: "verified-user", email: "person@example.test", user_metadata: { full_name: "Pessoa", role: "platform_admin" } };
const forbidden = () => { throw new Error("This dependency must not execute"); };
const secret = " fixture-password-не-logged ";
function fixture(options = {}) {
  const calls = [];
  const auth = {
    async signInWithPassword(input) { calls.push("signIn"); assert.equal(input.email, "person@example.test"); assert.equal(input.password, secret); if (options.throwSignIn) throw new Error("private provider payload"); return { data: { user: options.signedUser ?? user }, error: options.signInError ?? null }; },
    async getUser() { calls.push("getUser"); return { data: { user: options.verifiedUser === undefined ? user : options.verifiedUser }, error: options.verifyError ?? null }; },
    async signOut(opts) { calls.push(`signOut:${opts.scope}`); },
  };
  const supabase = {
    createCookieSink: () => new NextResponse(null),
    createRouteSupabase(request, sink) {
      calls.push("createClient");
      sink.cookies.set("sb-fixture-auth-token", "session-cookie-fixture", { sameSite: "lax", path: "/", secure: true });
      sink.headers.set("Cache-Control", "private, no-cache, no-store");
      return { auth };
    },
    attachSink(sink, response) {
      for (const cookie of sink.cookies.getAll()) response.cookies.set(cookie);
      for (const [key, value] of sink.headers) response.headers.set(key, value);
      return response;
    },
  };
  const route = load("../app/auth/password/route.ts", {
    "../../../lib/supabase.ts": supabase,
    "../../../lib/auth-merge.ts": { async mergeAnonymousIntoAuth(input) { calls.push("merge"); assert.equal(input.authUserId, user.id); assert.equal(input.email, user.email); assert.equal(input.bmUid, "browser-fixture"); assert.deepEqual(Object.keys(input).sort(), ["authUserId", "bmUid", "displayName", "email"]); if (options.mergeError) throw new Error("retry later"); } },
  }, { AUTH_LOGIN_MODE: options.mode === undefined ? "password" : options.mode });
  return { route, calls };
}
function request(fields = {}, headers = {}, body) {
  return new NextRequest("https://app.example.test/auth/password", {
    method: "POST", headers: { origin: "https://app.example.test", "content-type": "application/x-www-form-urlencoded", cookie: "bm_uid=browser-fixture", ...headers },
    body: body ?? new URLSearchParams({ email: "person@example.test", password: secret, next: "/pauta", ...fields }).toString(),
  });
}
function assertGenericFailure(response) {
  assert.equal(response.status, 303);
  const target = new URL(response.headers.get("location"));
  assert.equal(target.pathname, "/entrar");
  assert.equal(target.searchParams.get("erro"), "credenciais");
  assert.ok(!response.headers.get("location").includes(secret));
  assert.ok(!response.headers.get("location").includes("person%40example.test"));
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

test("password login is opt-in; Google remains default and invalid mode exposes neither", () => {
  assert.deepEqual(contract.authLoginMethods(undefined), { google: true, password: false });
  assert.deepEqual(contract.authLoginMethods("google"), { google: true, password: false });
  assert.deepEqual(contract.authLoginMethods("password"), { google: false, password: true });
  assert.deepEqual(contract.authLoginMethods("both"), { google: true, password: true });
  assert.deepEqual(contract.authLoginMethods("invalid"), { google: false, password: false });
});

test("server gate rejects disabled password method and cross-origin/missing origin before Auth", async () => {
  for (const mode of ["google", "", "invalid"]) {
    const { route, calls } = fixture({ mode });
    assert.equal((await route.POST(request())).status, 404); assert.deepEqual(calls, []);
  }
  for (const headers of [{ origin: "https://other.example.test" }, { origin: "null" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    const { route, calls } = fixture();
    assert.equal((await route.POST(request({}, headers))).status, 403); assert.deepEqual(calls, []);
  }
});

test("password success verifies getUser before merge and publishes SDK cookies with internal 303/no-store", async () => {
  for (const next of ["/pauta", "https://evil.example/", "//evil.example", "/\\evil.example", "/\n/evil.example"]) {
    const { route, calls } = fixture();
    const response = await route.POST(request({ next }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `https://app.example.test${next === "/pauta" ? "/pauta" : "/minha-area"}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie"), /sb-fixture-auth-token=session-cookie-fixture/);
    assert.deepEqual(calls, ["createClient", "signIn", "getUser", "merge"]);
    assert.ok(![...response.headers].flat().join(" ").includes(secret));
  }
});

test("wrong credentials, provider failure and unverifiable/mismatched identity never publish session cookies", async () => {
  for (const options of [{ signInError: { message: "unknown user private@example.test" } }, { throwSignIn: true }, { verifiedUser: null }, { verifiedUser: { ...user, id: "other-user" } }, { verifyError: { message: "expired session" } }]) {
    const { route, calls } = fixture(options);
    const response = await route.POST(request());
    assertGenericFailure(response);
    assert.ok(!calls.includes("merge"));
    if (options.verifiedUser !== undefined || options.verifyError) assert.ok(calls.includes("signOut:local"));
  }
});

test("malformed/oversized body is rejected before provider and passwords are not trimmed", async () => {
  for (const req of [
    request({ email: "bad", password: secret }), request({ password: "" }),
    request({}, { "content-type": "application/json" }, JSON.stringify({ email: "person@example.test", password: secret })),
    request({}, {}, `email=person%40example.test&email=second%40example.test&password=${secret}`),
    request({}, {}, "x=" + "a".repeat(65_536)), request({}, { "content-length": "65537" }),
  ]) {
    const { route, calls } = fixture();
    assertGenericFailure(await route.POST(req)); assert.deepEqual(calls, []);
  }
});

test("personal merge failure preserves verified login without assigning any role", async () => {
  const { route, calls } = fixture({ mergeError: true });
  const response = await route.POST(request());
  assert.equal(response.status, 303); assert.equal(new URL(response.headers.get("location")).pathname, "/pauta");
  assert.deepEqual(calls, ["createClient", "signIn", "getUser", "merge"]);
});

test("password-only login page has native protected form and no Google/signup/recovery action", async () => {
  const password = load("../app/entrar/password-form.tsx");
  const modules = {
    "../../lib/auth": { getPageAuth: async () => null },
    "next/navigation": { redirect: forbidden },
    "../theme-toggle": { ThemeToggle: () => null },
    "../_components/detail-header": { default: () => null },
    "./google-button": { default: () => jsxRuntime.jsx("button", { children: "continuar com Google" }) },
    "./password-form": password,
  };
  const page = load("../app/entrar/page.tsx", modules, { AUTH_LOGIN_MODE: "password" });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ next: "https://evil.test", erro: "credenciais" }) }));
  assert.match(html, /<form[^>]*action="\/auth\/password"[^>]*method="post"/);
  assert.match(html, /type="password" autoComplete="current-password"/);
  assert.match(html, /name="next" value="\/minha-area"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Cadastro e recuperação de senha por e-mail não estão disponíveis/);
  assert.doesNotMatch(html, /Google|signUp|resetPassword|href="[^\"]*(?:cadastro|recovery|recuperar)/);
  const original = load("../app/entrar/page.tsx", modules);
  const originalHtml = renderToStaticMarkup(await original.default({ searchParams: Promise.resolve({}) }));
  assert.match(originalHtml, /continuar com Google/); assert.doesNotMatch(originalHtml, /auth\/password/);
});

for (const metadataSize of [0, 6000]) test(`actual Supabase SSR SDK preserves login through response headers with ${metadataSize ? "chunked" : "single"} session cookie`, async () => {
  const sdk = await import("@supabase/ssr");
  const calls = [];
  const sdkUser = { ...user, user_metadata: { ...user.user_metadata, fixturePadding: "x".repeat(metadataSize) }, id: "e8ac633c-92ea-434c-aa71-996de85434be", aud: "authenticated", role: "authenticated", email_confirmed_at: "2026-11-12T00:00:00Z", app_metadata: {}, identities: [] };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: sdkUser.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now, iss: "https://auth.fixture.test/auth/v1" })}.fixture-signature`;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://auth.fixture.test", "No real Auth or marketplace allowed");
    calls.push(url.pathname);
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "password");
      const credentials = JSON.parse(init.body);
      assert.equal(credentials.email, "person@example.test"); assert.equal(credentials.password, secret);
      return Response.json({ access_token: token, refresh_token: "fixture-refresh-token", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user: sdkUser });
    }
    if (url.pathname === "/auth/v1/user") {
      assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
      return Response.json(sdkUser);
    }
    throw new Error(`Unexpected simulated request ${url.pathname}`);
  };
  try {
    const supabase = load("../lib/supabase.ts", { "@supabase/ssr": sdk, "next/headers": { cookies: forbidden } }, {
      SUPABASE_URL: "https://auth.fixture.test", SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
    });
    const route = load("../app/auth/password/route.ts", {
      "../../../lib/supabase.ts": supabase,
      "../../../lib/auth-merge.ts": { async mergeAnonymousIntoAuth(input) { assert.equal(input.authUserId, sdkUser.id); calls.push("merge"); } },
    }, { AUTH_LOGIN_MODE: "password" });
    const response = await route.POST(request());
    assert.equal(response.status, 303); assert.equal(new URL(response.headers.get("location")).pathname, "/pauta");
    assert.deepEqual(calls, ["/auth/v1/token", "/auth/v1/user", "merge"]);
    const wireCookies = response.headers.getSetCookie();
    const expectedCookies = response.cookies.getAll();
    assert.equal(wireCookies.length, expectedCookies.length, "every SDK cookie must survive header serialization");
    assert.ok(metadataSize ? wireCookies.length > 1 : wireCookies.length === 1);
    assert.match(wireCookies[0], metadataSize ? /^sb-auth-auth-token\.0=/ : /^sb-auth-auth-token=/);
    assert.match(response.headers.get("set-cookie"), /SameSite=lax/i);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!response.headers.get("set-cookie").includes(secret));
    // Read only the cookies actually sent over HTTP, not the mutable response
    // cookie map: a later Headers.set can silently overwrite serialized chunks.
    const cookieHeader = wireCookies.map(value => value.split(";", 1)[0]).join("; ");
    const nextRequest = new NextRequest("https://app.example.test/minha-area", { headers: { cookie: cookieHeader } });
    const nextClient = supabase.createRouteSupabase(nextRequest, supabase.createCookieSink());
    const verified = await nextClient.auth.getUser();
    assert.equal(verified.error, null);
    assert.equal(verified.data.user?.id, sdkUser.id);
    assert.deepEqual(calls, ["/auth/v1/token", "/auth/v1/user", "merge", "/auth/v1/user"]);
  } finally { globalThis.fetch = previousFetch; }
});

test("real NextRequest keeps exact Host origin for loopback and reverse proxy without trusting forwarded-host", async () => {
  for (const [url, host, origin] of [
    ["http://127.0.0.1:3100/auth/password", "127.0.0.1:3100", "http://127.0.0.1:3100"],
    ["https://internal.example.test/auth/password", "login.example.test", "https://login.example.test"],
    ["http://[::1]:3100/auth/password", "[::1]:3100", "http://[::1]:3100"],
  ]) {
    const req = new NextRequest(url, { method: "POST", headers: {
      host, origin, "x-forwarded-host": "evil.example.test", "content-type": "application/x-www-form-urlencoded", cookie: "bm_uid=browser-fixture",
    }, body: new URLSearchParams({ email: "person@example.test", password: secret, next: "/pauta" }) });
    if (host === "127.0.0.1:3100") assert.equal(req.nextUrl.origin, "http://localhost:3100", "regression reproduces NextURL loopback normalization");
    const { route } = fixture();
    const response = await route.POST(req);
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), `${origin}/pauta`);
    assert.match(response.headers.get("set-cookie"), /sb-fixture-auth-token=/);
    const invalid = new NextRequest(url, { method: "POST", headers: { host, origin, "content-type": "application/x-www-form-urlencoded" }, body: "email=invalid" });
    const failure = await route.POST(invalid);
    assert.equal(failure.status, 303); assert.equal(new URL(failure.headers.get("location")).origin, origin);
  }
});

test("Host validation never equates localhost and 127.0.0.1 or accepts injected authorities", async () => {
  for (const [host, origin] of [
    ["127.0.0.1:3100", "http://localhost:3100"], ["localhost:3100", "http://127.0.0.1:3100"],
    ["good.example@evil.example", "http://evil.example"], ["good.example/evil", "http://good.example"],
    ["good.example,evil.example", "http://good.example"], ["good.example:99999", "http://good.example"],
    ["good.example?x=y", "http://good.example"], ["good.example#fragment", "http://good.example"],
    ["good.example\\evil.example", "http://good.example"],
  ]) {
    const { route, calls } = fixture();
    const req = new NextRequest("http://127.0.0.1:3100/auth/password", { method: "POST", headers: { host, origin }, body: "x=1" });
    assert.equal((await route.POST(req)).status, 403, host); assert.deepEqual(calls, []);
  }
});
