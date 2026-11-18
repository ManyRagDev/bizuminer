import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { adminMutationOrigin } from "../lib/admin-request-origin.ts";

const canonical = "https://www.bizuminer.com.br";
const production = { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: canonical };
function request(origin = canonical, headers = {}, url = "http://0.0.0.0:3100/api/admin/connections") {
  return new NextRequest(url, { method: "POST", headers: {
    host: "www.bizuminer.com.br", ...(origin === null ? {} : { origin }), ...headers,
  }, body: "{}" });
}

test("production accepts the configured browser origin through an internal HTTP proxy URL", () => {
  const r = request(canonical, { "sec-fetch-site": "same-origin" });
  assert.notEqual(r.nextUrl.origin, canonical);
  assert.equal(adminMutationOrigin(r, production), canonical);
  assert.equal(adminMutationOrigin(r, { ...production, NEXT_PUBLIC_SITE_URL: canonical + "/" }), canonical);
});

test("Host and forwarding headers cannot select or broaden the production origin", () => {
  const spoof = { host: "attacker.invalid", forwarded: 'host="www.bizuminer.com.br";proto=https',
    "x-forwarded-host": "www.bizuminer.com.br", "x-forwarded-proto": "https", "x-forwarded-port": "443" };
  for (const origin of ["https://attacker.invalid", "http://0.0.0.0:3100", "https://bizuminer.com.br", "http://www.bizuminer.com.br"])
    assert.equal(adminMutationOrigin(request(origin, spoof), production), null, origin);
  // Forwarded metadata is ignored, including when it contradicts a legitimate Origin.
  assert.equal(adminMutationOrigin(request(canonical, { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "http" }), production), canonical);
});

test("missing, opaque, malformed, URL-shaped and multiple origins are rejected", () => {
  for (const origin of [null, "", "null", canonical + "/", canonical + "/..", canonical + "/path", canonical + "?x=1",
    canonical + "#fragment", "https://name:password@www.bizuminer.com.br", "https://@www.bizuminer.com.br",
    "https://www.bizuminer.com.br:443", "https://www.bizuminer.com.br:8443", "https://WWW.BIZUMINER.COM.BR",
    canonical + ", https://attacker.invalid", canonical + " https://attacker.invalid", "file:///tmp/file",
    "https://www.bizuminer.com.br\\", "https://www.bizuminer.com.br.attacker.invalid"])
    assert.equal(adminMutationOrigin(request(origin), production), null, String(origin));
});

test("cross-site or malformed fetch metadata stays closed even with a matching Origin", () => {
  for (const site of ["cross-site", "same-origin, cross-site", "invalid", ""])
    assert.equal(adminMutationOrigin(request(canonical, { "sec-fetch-site": site }), production), null);
  for (const site of ["same-origin", "same-site", "none"])
    assert.equal(adminMutationOrigin(request(canonical, { "sec-fetch-site": site }), production), canonical);
});

test("production missing or invalid canonical configuration never falls back to Host or localhost", () => {
  const r = request("http://localhost:3100", { host: "localhost:3100" }, "http://localhost:3100/api/admin/connections");
  for (const value of [undefined, "", "not-a-url", "http://localhost:3100", "http://www.bizuminer.com.br", canonical + "/path",
    canonical + "?x=1", canonical + "#x", "https://name:password@www.bizuminer.com.br"])
    assert.equal(adminMutationOrigin(r, { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: value }), null, String(value));
});

test("unconfigured development permits only exact loopback scheme, host and port", () => {
  for (const host of ["localhost:3100", "127.0.0.1:3100", "[::1]:3100"]) {
    const origin = "http://" + host;
    const r = request(origin, { host }, origin + "/api/admin/connections");
    assert.equal(adminMutationOrigin(r, { NODE_ENV: "development" }), origin);
    for (const wrong of ["http://localhost:3101", "https://" + host, "http://attacker.invalid:3100"])
      assert.equal(adminMutationOrigin(request(wrong, { host }, r.url), { NODE_ENV: "development" }), null);
  }
  const normalized = request("http://127.0.0.1:3100", { host: "127.0.0.1:3100" }, "http://127.0.0.1:3100/api/admin/connections");
  assert.equal(normalized.nextUrl.origin, "http://localhost:3100");
  assert.equal(adminMutationOrigin(normalized, { NODE_ENV: "development" }), "http://127.0.0.1:3100");
  assert.equal(adminMutationOrigin(request("http://localhost:3100", { host: "127.0.0.1:3100" }), { NODE_ENV: "development" }), null);
  for (const host of ["attacker.invalid:3100", "localhost.attacker.invalid:3100", "localhost:99999", "localhost/..", "name@localhost", "localhost:3100,evil", "localhost."])
    assert.equal(adminMutationOrigin(request("http://localhost:3100", { host }), { NODE_ENV: "development" }), null, host);
});

test("explicit development configuration is authoritative and cannot fall back after a typo", () => {
  const r = request("http://localhost:3100", { host: "localhost:3100" }, "http://localhost:3100/api/admin/connections");
  assert.equal(adminMutationOrigin(r, { NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:3100" }), "http://localhost:3100");
  for (const value of [canonical, "", "invalid", "http://attacker.invalid"])
    assert.equal(adminMutationOrigin(r, { NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: value }), null);
});
