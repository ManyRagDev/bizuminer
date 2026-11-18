import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { aiCurationReadiness } from "../lib/ai-curation-provider.ts";
import { captureDiagnostic, captureDiagnosticLine, readCaptureDiagnostic } from "../../persistence/src/capture-diagnostic.ts";

const source = ts.transpileModule(readFileSync(new URL("../bin/run-triage.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const batchId = "00000000-0000-4000-a000-000000000001";
const scoped = ["--tenant", "fixture-tenant", "--batch", batchId, "--worker", "fixture-worker"];
const trial = [...scoped, "--trial-single-product", "--limit", "1"];
const ready = Object.freeze({ AI_CURATION_PROVIDER: "openrouter", OPENROUTER_API_KEY: "fixture-openrouter-key",
  AI_CURATION_MODEL: "vendor/fixture-model" });

async function run(args, options = {}) {
  const calls = [], logs = [], exits = [];
  let triageCalls = 0;
  const modules = {
    "../../persistence/src/capture-diagnostic.ts": { captureDiagnostic, captureDiagnosticLine },
    "../lib/ai-curation-provider.ts": { aiCurationReadiness: () => {
      calls.push({ operation: "readiness" }); return aiCurationReadiness(options.env ?? ready);
    } },
    "../lib/curation-db.ts": { runPendingAutomatedTriage: async (tenantId, limit, scope) => {
      calls.push({ operation: "triage", tenantId, limit, scope });
      if (options.triageError !== undefined) throw options.triageError;
      const processed = options.processed?.[triageCalls++] ?? 1;
      return { processed, approved: 0, held: 0, rejected: 0, annotatedPending: processed, triageRunId: "fixture-triage-run" };
    } },
    "../lib/homepage-db.ts": { refreshHomepageAfterChange: async tenantId => calls.push({ operation: "refresh", tenantId }) },
  };
  let error;
  try {
    await vm.runInNewContext(`(async () => {\n${source}\n})()`, {
      exports: {}, Error,
      process: { argv: ["node", "run-triage.ts", ...args], env: {}, exit: code => { exits.push(code); } },
      console: { log: (...values) => logs.push(values.join(" ")), error: (...values) => logs.push(values.map(value => value instanceof Error ? value.message : String(value)).join(" ")) },
      fetch: () => { throw new Error("External calls forbidden"); },
      require(id) { assert.ok(Object.hasOwn(modules, id), `Unexpected dependency ${id}`); return modules[id]; },
    });
  } catch (caught) { error = caught; }
  const summaryLine = logs.find(line => line.startsWith("TRIAGE_SUMMARY="));
  return { calls, logs, exits, error, summary: summaryLine ? JSON.parse(summaryLine.slice("TRIAGE_SUMMARY=".length)) : undefined };
}
test("single-product trial runs one scoped item and one cycle even when drain is requested", async () => {
  for (const args of [trial, [...trial, "--drain"]]) {
    const result = await run(args);
    assert.equal(result.error, undefined); assert.deepEqual(result.exits, [0]);
    const work = result.calls.filter(call => call.operation === "triage");
    assert.equal(work.length, 1, "processed=1 must not cause trial to drain more pending products");
    assert.equal(work[0].tenantId, "fixture-tenant"); assert.equal(work[0].limit, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(work[0].scope)), { captureBatch: { id: batchId, workerId: "fixture-worker" },
      autoPublish: false, autoDismissScore3: false });
    assert.equal(result.summary.processed, 1); assert.equal(result.summary.approved, 0);
    assert.equal(result.calls.filter(call => call.operation === "refresh").length, 0, "trial must not compose or refresh the public homepage");
    assert.doesNotMatch(result.logs.join("\n"), /fixture-openrouter-key|vendor\/fixture-model/);
  }
});
test("trial requires explicit batch, worker and limit one before readiness or triage", async () => {
  for (const args of [
    ["--trial-single-product", "--limit", "1"],
    ["--trial-single-product", "--batch", batchId, "--limit", "1"],
    [...scoped, "--trial-single-product"],
    [...scoped, "--trial-single-product", "--limit", "2"],
    [...scoped, "--trial-single-product", "--limit", "NaN"],
  ]) {
    const result = await run(args);
    assert.match(result.error?.message ?? "", /capture_trial_scope_required|capture_batch_worker_required/);
    assert.deepEqual(result.calls, []); assert.deepEqual(result.exits, []);
  }
});
test("missing AI configuration fails before any triage or homepage work", async () => {
  for (const env of [{}, { AI_CURATION_PROVIDER: "invalid" }, { AI_CURATION_PROVIDER: "openrouter", OPENROUTER_API_KEY: "fixture-key" }]) {
    const result = await run(trial, { env });
    assert.deepEqual(result.exits, [1]); assert.equal(result.summary, undefined);
    assert.deepEqual(result.calls.map(call => call.operation), ["readiness"]);
  }
});
test("normal batch keeps draining with batch scope and its configured limit", async () => {
  const result = await run([...scoped, "--limit", "200"], { processed: [1, 1, 0] });
  assert.equal(result.error, undefined); assert.deepEqual(result.exits, [0]);
  const work = result.calls.filter(call => call.operation === "triage");
  assert.equal(work.length, 3);
  for (const call of work) {
    assert.equal(call.limit, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(call.scope)), { captureBatch: { id: batchId, workerId: "fixture-worker" } });
  }
  assert.equal(result.summary.processed, 2);
  assert.deepEqual(result.calls.filter(call => call.operation === "refresh"), [{ operation: "refresh", tenantId: "fixture-tenant" }]);
});
test("normal drain remains bounded at fifteen cycles while ordinary unscoped CLI runs once", async () => {
  const bounded = await run([...scoped, "--limit", "200"]);
  assert.equal(bounded.calls.filter(call => call.operation === "triage").length, 15);
  assert.equal(bounded.summary.processed, 15);
  const unscoped = await run(["--tenant", "fixture-tenant", "--limit", "50"]);
  const work = unscoped.calls.filter(call => call.operation === "triage");
  assert.equal(work.length, 1); assert.equal(work[0].scope, undefined); assert.equal(work[0].limit, 50);
});
test("CLI failure emits a bounded diagnostic marker without raw SQL, provider messages, paths or secrets", async () => {
  for (const [error, expected] of [
    [Object.assign(new Error("SELECT secret_column FROM private_table; fixture-private-secret"), {
      code: "42501", query: "SELECT fixture-private-secret", table: "private_table", detail: "fixture-private-secret" }),
      { version: 1, phase: "cli", diagnosticCode: "sql_error", sqlState: "42501" }],
    [Object.assign(new Error("Cannot find module /private/fixture-private-secret.ts"), { code: "ERR_MODULE_NOT_FOUND" }),
      { version: 1, phase: "cli", diagnosticCode: "ERR_MODULE_NOT_FOUND" }],
    [Object.assign(new Error("Provider key=fixture-private-secret remaining budget hidden"), { code: "openrouter_budget_exhausted" }),
      { version: 1, phase: "cli", diagnosticCode: "openrouter_budget_exhausted" }],
    [new TypeError("fixture-private-secret in private_table"), { version: 1, phase: "cli", diagnosticCode: "type_error" }],
    [{ message: "fixture-private-secret", code: "private_code", query: "SELECT private_table" },
      { version: 1, phase: "cli", diagnosticCode: "unclassified_error" }],
  ]) {
    const result = await run(trial, { triageError: error });
    assert.deepEqual(result.exits, [1]); assert.equal(result.summary, undefined);
    assert.equal(result.calls.filter(call => call.operation === "triage").length, 1);
    assert.equal(result.calls.filter(call => call.operation === "refresh").length, 0);
    const output = result.logs.join("\n");
    assert.equal(result.logs.filter(line => line.startsWith("CAPTURE_DIAGNOSTIC=")).length, 1);
    assert.deepEqual(readCaptureDiagnostic(output), expected);
    assert.doesNotMatch(output, /fixture-private-secret|private_table|secret_column|SELECT|\/private\//);
  }
});
