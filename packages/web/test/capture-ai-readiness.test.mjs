import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server.js";
import { aiCurationReadiness } from "../lib/ai-curation-provider.ts";
import { adminMutationOrigin } from "../lib/admin-request-origin.ts";
import { batchCapturePlan } from "../lib/batch-capture-plan.ts";

const context = Object.freeze({ tenantId: "fixture-tenant", affiliateId: "fixture-affiliate", actor: "human",
  actorAppUserId: "fixture-user", authenticatedAuthUserId: "fixture-auth", membershipRole: "owner", requestId: "fixture-request" });
const source = ts.transpileModule(readFileSync(new URL("../app/api/admin/rodagem/lote/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(env, options = {}) {
  const calls = [];
  const batch = { id: "00000000-0000-4000-a000-000000000001", status: "running", metadata: { execution: { phase: "queued" } } };
  const modules = {
    "next/server": { NextRequest },
    "../../../../../lib/admin-request-origin.ts": {
      adminMutationOrigin: request => adminMutationOrigin(request, { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://app.example.test" }),
    },
    "../../../../../lib/ai-curation-provider.ts": {
      aiCurationReadiness: () => { calls.push("readiness"); return aiCurationReadiness(env); },
    },
    "../../../../../lib/account-scope.ts": { inAccountScope: (received, work) => { assert.equal(received, context); return work(); } },
    "../../../../../lib/api-auth": {
      checkAffiliateUser: async () => ({ kind: options.auth ?? "ok", context, appUserId: context.actorAppUserId, sink: {} }),
      sinkJson: (_sink, body, init) => Response.json(body, init),
    },
    "../../../../../lib/batch-capture-plan": { batchCapturePlan },
    "../../../../../lib/capture-dispatch": {
      captureExecutor: () => options.executor ?? "local",
      prepareAccountCapture: async (received, marketplaces) => {
        assert.equal(received, context); calls.push("prepare");
        return options.disabled ? { enabled: [], skipped: [{ marketplace: "shopee", reason: "capture_disabled" }] }
          : { enabled: marketplaces, skipped: [] };
      },
      dispatchCaptureBatch: async (id, received) => { assert.equal(id, batch.id); assert.equal(received, context); calls.push("dispatch"); },
    },
    "../../../../../lib/capture-batch-db": { captureBatches: {
      create: async (tenantId, marketplaces) => {
        assert.equal(tenantId, context.tenantId); assert.deepEqual([...marketplaces], ["shopee"]); calls.push("create"); return batch;
      },
      publicStatus: async () => { calls.push("status"); return batch; },
      resolveWait: async (id, tenantId, action) => {
        assert.equal(id, batch.id); assert.equal(tenantId, context.tenantId); calls.push(`resolve:${action}`);
        if (options.notWaiting) throw new Error("capture_batch_not_waiting");
      },
      dispatchFailed: async () => { throw new Error("Unexpected failure mutation"); },
    } },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, Response, Error,
    process: { env: { DATABASE_URL: "fixture-only", ...(options.githubToken ? { GITHUB_ACTIONS_WRITE_TOKEN: "fixture-token" } : {}) } },
    fetch: () => { throw new Error("External calls are forbidden"); },
    require(id) { assert.ok(Object.hasOwn(modules, id), `Unexpected dependency ${id}`); return modules[id]; },
  });
  async function post(body = { marketplaces: ["shopee"] }, origin = "https://app.example.test") {
    const response = await exports.POST(new NextRequest("https://app.example.test/api/admin/rodagem/lote", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    return { response, body: await response.json() };
  }
  return { post, calls };
}

test("capture does not depend on AI provider readiness and rejects missing durable executor", async () => {
  for (const env of [{}, { AI_CURATION_PROVIDER: "unknown" }, { AI_CURATION_PROVIDER: "openrouter", OPENROUTER_API_KEY: "fixture-openrouter-key", AI_CURATION_MODEL: "vendor/fixture-model" }, { GEMINI_API_KEY: "fixture-gemini-key" }]) {
    const { post, calls } = fixture(env);
    const result = await post({ marketplaces: ["shopee"], tenantId: "forged-tenant" });
    assert.equal(result.response.status, 202);
    assert.deepEqual(calls, ["prepare", "create", "dispatch", "status"]);
  }
});
test("account/source and existing request gates execute in order without querying AI readiness", async () => {
  for (const [options, body, origin, status, expectedCalls] of [
    [{ disabled: true }, undefined, undefined, 409, ["prepare"]],
    [{ auth: "no_session" }, undefined, undefined, 401, []],
    [{ auth: "forbidden" }, undefined, undefined, 403, []],
    [{}, undefined, "https://foreign.example.test", 403, []],
    [{}, { marketplaces: ["mercadolivre"] }, undefined, 409, []],
  ]) {
    const { post, calls } = fixture({}, options);
    assert.equal((await post(body, origin)).response.status, status);
    assert.deepEqual(calls, expectedCalls);
  }
});
test("deprecated github executor refuses with durable_capture_executor_not_configured even if github token exists", async () => {
  for (const githubToken of [false, true]) {
    const { post, calls } = fixture({}, { executor: "github", githubToken });
    const result = await post();
    assert.equal(result.response.status, 503);
    assert.deepEqual(calls, ["prepare"]);
    assert.equal(result.body.error, "durable_capture_executor_not_configured");
  }
});
test("retry preserves batch-id and waiting-state gates before dispatch even without AI configuration", async () => {
  for (const [batchId, options, status, expected] of [
    ["invalid-id", {}, 400, []],
    ["00000000-0000-4000-a000-000000000001", { notWaiting: true }, 409, ["resolve:retry"]],
    ["00000000-0000-4000-a000-000000000001", {}, 200, ["resolve:retry", "dispatch", "status"]],
  ]) {
    const { post, calls } = fixture({}, options);
    assert.equal((await post({ action: "retry", batchId })).response.status, status);
    assert.deepEqual(calls, expected);
  }
});
test("cancel remains available without AI credentials and never dispatches work", async () => {
  const { post, calls } = fixture({});
  const result = await post({ action: "cancel", batchId: "00000000-0000-4000-a000-000000000001" });
  assert.equal(result.response.status, 200);
  assert.deepEqual(calls, ["resolve:cancel", "status"]);
});
