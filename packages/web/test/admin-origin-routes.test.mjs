/** Route-level origin rejection with real NextRequest and the production origin helper.
 * Authentication/feature gates are fixtures; every business effect is a fail-fast spy.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";
import { adminMutationOrigin } from "../lib/admin-request-origin.ts";

const site = "https://www.bizuminer.com.br";
const env = Object.freeze({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: site,
  GITHUB_ACTIONS_WRITE_TOKEN: "synthetic-must-never-be-used" });
const routes = ["workspace", "work-drafts", "marketing", "artifacts/upload", "rodagem/lote",
  "rodagem/navegador", "monitoring/dispatch", "monitoring/policy", "connections"];
const owner = Object.freeze({ tenantId: "local", affiliateId: "aff_local", actor: "human",
  actorAppUserId: "owner-fixture", authenticatedAuthUserId: "auth-fixture", membershipRole: "owner",
  requestId: "origin-route-test" });

function fixture(name, kind = "ok") {
  const method = name === "marketing" ? "PUT" : "POST";
  const effects = [], calls = { auth: 0, guard: 0, feature: 0, scope: 0, body: 0 };
  const fail = label => { effects.push(label); throw new Error(`Unexpected effect: ${label}`); };
  // Reading an imported symbol is harmless. Calling/constructing any unapproved
  // dependency records failure, even if a route catches the thrown exception.
  function blocked(label) {
    return new Proxy(function () {}, {
      get(_target, key) { return key === "__esModule" ? true : blocked(`${label}.${String(key)}`); },
      apply() { return fail(label); },
      construct() { return fail(label); },
    });
  }
  const source = ts.transpileModule(readFileSync(new URL(`../app/api/admin/${name}/route.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, URL, URLSearchParams, Response, Request, Headers, NextRequest, NextResponse,
    Uint8Array, TextDecoder, File, Buffer, process: { env },
    fetch: blocked("fetch"), console: { error: blocked("console.error"), log: blocked("console.log"), warn: blocked("console.warn") },
    require(id) {
      if (id === "next/server") return { NextRequest, NextResponse };
      if (/\/admin-request-origin(?:\.ts)?$/.test(id)) return {
        adminMutationOrigin(request) { calls.guard++; return adminMutationOrigin(request, env); },
      };
      if (/\/api-auth(?:\.ts)?$/.test(id)) return {
        checkAffiliateUser: async request => {
          assert.ok(request instanceof NextRequest); calls.auth++;
          return kind === "ok" ? { kind, context: owner, appUserId: owner.actorAppUserId,
            user: { id: owner.authenticatedAuthUserId }, sink: new NextResponse(null) } : { kind };
        },
        sinkJson: (_sink, body, init) => NextResponse.json(body, init),
        resolveAuthorizedAccount: blocked("resolveAuthorizedAccount"),
      };
      if (/\/account-scope(?:\.ts)?$/.test(id)) return {
        inAccountScope: (context, callback) => { calls.scope++; assert.equal(context, owner); return callback(); },
      };
      if (/\/affiliate-workspace-db(?:\.ts)?$/.test(id)) return new Proxy({}, {
        get(_target, key) {
          return key === "affiliateWorkspaceEnabled" ? async context => {
            calls.feature++; assert.equal(context, owner); return true;
          } : blocked(`${id}.${String(key)}`);
        },
      });
      if (/\/artifact-http(?:\.ts)?$/.test(id)) return {
        artifactAccessFailure: status => NextResponse.json({ error: status }, { status: status === "no_session" ? 401 : 403 }),
      };
      return blocked(id);
    },
  }, { filename: `app/api/admin/${name}/route.ts` });
  const request = (headers = {}, urlOrigin = site) => {
    const req = new NextRequest(`${urlOrigin}/api/admin/${name}`, {
      method, headers: { host: new URL(urlOrigin).host, "content-type": "application/json", ...headers },
      body: '{"action":"must-not-run"}',
    });
    const read = label => { calls.body++; return fail(`request.${label}`); };
    for (const method of ["json", "formData", "text", "arrayBuffer", "blob"])
      Object.defineProperty(req, method, { value: () => read(method) });
    // Marketing reads the stream directly rather than calling json().
    Object.defineProperty(req, "body", { get: () => read("body") });
    return req;
  };
  return { route: exports, method, request, effects, calls };
}

const invalidOrigins = [
  ["missing Origin", {}],
  ["opaque null Origin", { origin: "null" }],
  ["empty Origin", { origin: "" }],
  ["external Origin", { origin: "https://external.example" }],
  ["lookalike canonical host", { origin: "https://www.bizuminer.com.br.external.example" }],
  ["spoofed approved forwarding headers", { origin: "https://external.example", host: "external.example",
    forwarded: 'for=192.0.2.1;host="www.bizuminer.com.br";proto=https', "x-forwarded-host": "www.bizuminer.com.br", "x-forwarded-proto": "https" }],
  ["Origin matches only attacker Host/Forwarded", { origin: "https://external.example", host: "external.example",
    forwarded: "for=192.0.2.1;host=external.example;proto=https", "x-forwarded-host": "external.example", "x-forwarded-proto": "https" }],
  ["cross-site even with canonical Origin", { origin: site, "sec-fetch-site": "cross-site" }],
];
for (const name of routes) {
  test(`${name}: all invalid origins return 403 before body, DAL, dispatch or HTTP`, async () => {
    for (const [scenario, headers] of invalidOrigins) {
      const h = fixture(name);
      const response = await h.route[h.method](h.request(headers));
      assert.equal(response.status, 403, `${name}: ${scenario}`);
      assert.equal(h.calls.auth, 1, "existing authentication still executes");
      assert.equal(h.calls.guard, 1, "403 must come through the real shared origin guard");
      assert.equal(h.calls.body, 0, scenario);
      assert.deepEqual(h.effects, [], scenario);
    }
  });
  test(`${name}: unauthenticated/forbidden requests preserve auth rejection before origin or effects`, async () => {
    for (const kind of ["no_session", "forbidden"]) {
      const h = fixture(name, kind);
      const response = await h.route[h.method](h.request({ origin: site }));
      assert.ok([401, 403].includes(response.status));
      assert.equal(h.calls.auth, 1); assert.equal(h.calls.guard, 0); assert.equal(h.calls.body, 0);
      assert.deepEqual(h.effects, []);
    }
  });
}
