import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server.js";

const batchId = "10000000-0000-4000-8000-000000000001";
const context = { tenantId: "account-a" };
const source = ts.transpileModule(readFileSync(new URL("../app/api/admin/rodagem/lote/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(options = {}) {
  const calls = [];
  const exports = {};
  const batch = { id: batchId, status: options.afterDispatchStatus ?? "running" };
  vm.runInNewContext(source, { exports, Response, NextRequest, process: { env: {} }, require(id) {
    if (id === "next/server") return { NextRequest };
    if (id.includes("admin-request-origin")) return { adminMutationOrigin: () => true };
    if (id.includes("account-scope")) return { inAccountScope: (_context, work) => work() };
    if (id.includes("batch-capture-plan")) return { batchCapturePlan: () => assert.fail("resume must not start another capture plan") };
    if (id.includes("api-auth")) return {
      checkAffiliateUser: async () => ({ kind: options.auth ?? "ok", context }),
      sinkJson: (_sink, data, init) => Response.json(data, init),
    };
    if (id.includes("capture-dispatch")) return {
      captureExecutor: () => options.executor ?? "local",
      prepareAccountCapture: async owner => { assert.equal(owner, context); calls.push("preflight"); return { enabled: options.disabled ? [] : ["shopee"], skipped: [] }; },
      dispatchCaptureBatch: async (id, owner) => { assert.equal(id, batchId); assert.equal(owner, context); calls.push("dispatch"); if (options.dispatchFails) throw Error("spawn"); },
    };
    if (id.includes("capture-batch-db")) return { captureBatches: {
      resumeLocalShopee: async (id, tenant) => { assert.equal(id, batchId); assert.equal(tenant, context.tenantId); calls.push("resume"); if (options.resumeError) throw options.resumeError; },
      dispatchFailed: async () => { calls.push("dispatch-failed"); },
      publicStatus: async () => { calls.push("read"); return batch; },
      create: async () => { calls.push("create"); throw Error("resume must never create another batch"); },
    } };
    throw Error(`unexpected dependency ${id}`);
  } });
  return { calls, run: () => exports.POST(new NextRequest("http://localhost:3100/api/admin/rodagem/lote", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume", batchId }),
  })) };
}
test("resume dispatches the owned existing batch and returns its status", async () => {
  const f = fixture(); const response = await f.run();
  assert.equal(response.status, 202); assert.equal((await response.json()).batch.id, batchId);
  assert.deepEqual(f.calls, ["preflight", "resume", "dispatch", "read"]);
});
test("resume rejection cannot fall through to creating another batch", async () => {
  for (const [error, expected] of [[Error("capture_batch_not_resumable"), "capture_batch_not_resumable"], [{ code: "23505" }, "batch_in_progress"]]) {
    const f = fixture({ resumeError: error }); const response = await f.run();
    assert.equal(response.status, 409); assert.equal((await response.json()).error, expected);
    assert.deepEqual(f.calls, ["preflight", "resume"]);
  }
});
test("resume respects auth, local executor and credential gates", async () => {
  for (const options of [{ auth: "no_session" }, { auth: "forbidden" }, { executor: "durable" }, { disabled: true }]) {
    const f = fixture(options); const response = await f.run();
    assert.ok([401, 403, 409].includes(response.status));
    assert.ok(!f.calls.includes("resume") && !f.calls.includes("dispatch") && !f.calls.includes("create"));
  }
});
test("failed dispatch reports failure unless the existing worker already claimed the batch", async () => {
  for (const status of ["error", "running"]) {
    const f = fixture({ dispatchFails: true, afterDispatchStatus: status }); const response = await f.run();
    assert.equal(response.status, status === "running" ? 202 : 502);
    assert.equal((await response.json()).ok, status === "running");
    assert.deepEqual(f.calls, ["preflight", "resume", "dispatch", "dispatch-failed", "read"]);
  }
});
