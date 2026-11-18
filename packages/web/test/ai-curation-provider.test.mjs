import test from "node:test";
import assert from "node:assert/strict";
import {
  aiCurationReadiness, AICurationProviderError, evaluateOpenRouterBatch,
  OPENROUTER_CURATION_ENDPOINT, OPENROUTER_CURATION_MAX_BYTES,
} from "../lib/ai-curation-provider.ts";
import { evaluateProductsBatch } from "../lib/ai-curation-service.ts";

const env = { AI_CURATION_PROVIDER: "openrouter", OPENROUTER_API_KEY: "synthetic-secret", AI_CURATION_MODEL: "test/model", AI_CURATION_MAX_OUTPUT_TOKENS: "1024", GEMINI_API_KEY: "must-not-fallback" };
const input = (id = "product-1") => ({ productId: id, title: "Organizador", category: "Casa", priceFormatted: "R$ 30,00" });
const item = (id = "product-1") => ({ productId: id, desirabilityScore: 4, hasMisleadingClaim: false, isAdultOrUnsafe: false, editorialCategory: "utilidade_pratica", catalogCategory: "Casa", publicBenefit: "Organiza objetos.", justification: "Útil para a rotina." });
const envelope = (items = [item()]) => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ items }) } }] });
const response = (value = envelope()) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
function isError(code, kind, status) {
  return (error) => {
    assert.ok(error instanceof AICurationProviderError);
    assert.equal(error.message, code);
    assert.equal(error.code, code);
    if (kind) assert.equal(error.kind, kind);
    if (status) assert.equal(error.status, status);
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify(error).includes("synthetic-secret"));
    return true;
  };
}

test("production requires an explicit operation mode and test calls reserve before sending", async () => {
  const { evaluateOpenRouterAttributes } = await import("../lib/ai-curation-provider.ts");
  assert.equal(aiCurationReadiness({ ...env, NODE_ENV: "production" }).ready, false);
  for (const cap of ["0", "21", "20 ", "invalid"])
    assert.equal(aiCurationReadiness({ ...env, AI_CURATION_CALL_LIMIT: cap }).ready, false);
  const limited = { ...env, NODE_ENV: "production", AI_CURATION_CALL_LIMIT: "20" };
  assert.equal(aiCurationReadiness(limited).ready, true);
  let calls = 0;
  for (const [run, kind] of [[evaluateOpenRouterBatch, "legacy"], [evaluateOpenRouterAttributes, "attributes"]]) {
    for (const result of ["limit_reached", "not_configured"]) {
      await assert.rejects(run([input()], "instruction", { env: limited,
        reserveCall: async (fingerprint, requestId, model, actualKind) => {
          assert.match(fingerprint, /^[a-f0-9]{64}$/);assert.ok(!fingerprint.includes("secret"));
          assert.match(requestId, /^[a-f0-9-]{36}$/);assert.equal(model,env.AI_CURATION_MODEL);assert.equal(actualKind,kind);
          return result;
        },fetch: async () => { calls++;return response(); } }),
        isError(result === "limit_reached" ? "ai_curation_call_limit_reached" : "ai_curation_call_budget_not_configured"));
    }
    await assert.rejects(run([input()], "instruction", { env: limited,
      reserveCall: async () => {throw new Error("private-db-error");},fetch:async()=>{calls++;return response();} }),
      isError("ai_curation_call_budget_unavailable"));
  }
  assert.equal(calls,0);
  let reserved = false;
  await assert.rejects(evaluateOpenRouterBatch([input()], "instruction", {env:limited,
    reserveCall:async()=>{reserved=true;return "reserved";},fetch:async()=>{assert.ok(reserved);calls++;return new Response('{"error":{"message":"API key expired"}}',{status:401});}}),
    isError("openrouter_authentication_failed","credential",401));
  assert.equal(calls,1);assert.ok(reserved,"failed provider attempts retain their reservation");
});

test("normal platform operation is production-only and leaves the test budget untouched", async () => {
  assert.equal(aiCurationReadiness({...env, NODE_ENV:"development",AI_CURATION_CALL_LIMIT:"platform"}).ready,false);
  const production={...env,NODE_ENV:"production",AI_CURATION_CALL_LIMIT:"platform"};
  assert.equal(aiCurationReadiness(production).ready,true);
  let calls=0;
  const result=await evaluateOpenRouterBatch([input()],"instruction",{env:production,
    reserveCall:async()=>{throw new Error("must not consume test budget");},
    fetch:async()=>{calls++;return response();}});
  assert.equal(calls,1);assert.deepEqual(result,[item()]);
});

test("readiness is local, explicit and closed for unknown provider, missing credentials/model and invalid token limits", () => {
  assert.deepEqual(aiCurationReadiness({}), { ready: false, error: "gemini_key_missing" });
  assert.deepEqual(aiCurationReadiness({ GEMINI_API_KEY: "test" }), { ready: true });
  assert.deepEqual(aiCurationReadiness(env), { ready: true });
  for (const patch of [
    { AI_CURATION_PROVIDER: "unknown" }, { AI_CURATION_PROVIDER: "" },
    { OPENROUTER_API_KEY: "" }, { OPENROUTER_API_KEY: "bad\nkey" },
    { AI_CURATION_MODEL: "" }, { AI_CURATION_MODEL: "guessed" }, { AI_CURATION_MODEL: "openrouter/auto" },
    { AI_CURATION_MODEL: "test/model\n" },
    ...["0", "8193", "-1", "1.5", " 1024", "NaN", ""].map((value) => ({ AI_CURATION_MAX_OUTPUT_TOKENS: value })),
  ]) assert.equal(aiCurationReadiness({ ...env, ...patch }).ready, false);
  assert.equal(aiCurationReadiness({ ...env, AI_CURATION_MAX_OUTPUT_TOKENS: undefined }).ready, true);
});

test("explicit OpenRouter uses fixed endpoint, strict schema, bounded tokens and no fallback; shared service returns validated items", async () => {
  let calls = 0;
  const result = await evaluateProductsBatch([input()], { providerOptions: { env, fetch: async (url, init) => {
    calls++;
    assert.equal(url, OPENROUTER_CURATION_ENDPOINT);
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, "Bearer synthetic-secret");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "test/model");
    assert.equal(body.max_tokens, 1024);
    assert.equal(body.stream, false);
    assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false });
    assert.equal(body.models, undefined);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.match(body.messages[0].content, /curador especialista/);
    assert.match(body.messages[1].content, /product-1/);
    return response();
  } } });
  assert.deepEqual(result, [item()]);
  assert.equal(calls, 1);
});

test("unknown provider and invalid batch/request fail without any transport", async () => {
  let calls = 0;
  const fetch = async () => { calls++; return response(); };
  await assert.rejects(evaluateProductsBatch([input()], { providerOptions: { env: { ...env, AI_CURATION_PROVIDER: "unknown" }, fetch } }), isError("ai_curation_provider_invalid"));
  await assert.rejects(evaluateProductsBatch([input()], { providerOptions: { env: { ...env, OPENROUTER_API_KEY: "" }, fetch } }), isError("openrouter_key_missing_or_invalid", "credential"));
  for (const batchSize of [0, -1, 26, 0.5, NaN]) {
    await assert.rejects(evaluateProductsBatch([input()], { batchSize, providerOptions: { env, fetch } }), isError("openrouter_batch_invalid"));
  }
  await assert.rejects(evaluateOpenRouterBatch([input(), input()], "system", { env, fetch }), isError("openrouter_batch_invalid"));
  await assert.rejects(evaluateOpenRouterBatch([input()], "x".repeat(33 * 1024), { env, fetch }), isError("openrouter_request_too_large"));
  assert.equal(calls, 0);
});

for (const [status, message, code, kind] of [
  [400, "synthetic-secret invalid payload", "openrouter_request_rejected", "permanent"],
  [401, "synthetic-secret invalid key", "openrouter_authentication_failed", "credential"],
  [402, "synthetic-secret credits", "openrouter_budget_exhausted", "quota"],
  [403, "Budget limit exceeded (weekly limit) synthetic-secret", "openrouter_budget_exhausted", "quota"],
  [403, "synthetic-secret moderation", "openrouter_request_blocked", "permanent"],
  [404, "synthetic-secret model missing", "openrouter_request_rejected", "permanent"],
  [429, "synthetic-secret rate limited", "openrouter_rate_limited", "rate_limit"],
  [503, "synthetic-secret overloaded", "openrouter_unavailable", "transient"],
]) test(`HTTP ${status} ${kind}: one attempt, sanitized exception propagated by service`, async () => {
  let calls = 0;
  await assert.rejects(evaluateProductsBatch([input()], { providerOptions: { env, fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message } }), { status });
  } } }), isError(code, kind, status));
  assert.equal(calls, 1);
});

test("schema, completeness, refusals and truncation fail closed, never silently dropping products", async () => {
  const invalid = [
    { error: { message: "secret" } }, { choices: [] },
    { choices: [{ finish_reason: "length", message: { content: JSON.stringify({ items: [item()] }) } }] },
    { choices: [{ finish_reason: "content_filter", message: { content: "" } }] },
    { choices: [{ finish_reason: "stop", message: { refusal: "secret", content: JSON.stringify({ items: [item()] }) } }] },
    { choices: [{ finish_reason: "stop", message: { content: "not JSON secret" } }] },
    envelope([]), envelope([item("unknown")]), envelope([item(), item()]),
    ...[
      { desirabilityScore: 6 }, { desirabilityScore: 2.5 }, { hasMisleadingClaim: "false" },
      { editorialCategory: "invented" }, { catalogCategory: "invented" }, { unexpected: "field" },
      { publicBenefit: "x".repeat(121) }, { justification: "x".repeat(151) }, { justification: " " },
      { publicBenefit: undefined },
    ].map((patch) => envelope([{ ...item(), ...patch }])),
  ];
  for (const value of invalid) {
    await assert.rejects(evaluateProductsBatch([input()], { providerOptions: { env, fetch: async () => response(value) } }), isError("openrouter_response_invalid"));
  }
  await assert.rejects(evaluateOpenRouterBatch([input(), input("product-2")], "system", { env, fetch: async () => response(envelope([item(), item()])) }), isError("openrouter_response_invalid"));
  await assert.rejects(evaluateOpenRouterBatch([input()], "system", { env, fetch: async () => new Response("not JSON") }), isError("openrouter_response_invalid"));
});

test("403 structured key/workspace/guardrail limits classify as quota without exposing budget metadata", async () => {
  for (const limit_source of ["openrouter_key_limit", "openrouter_workspace_budget", "openrouter_guardrail_budget"]) {
    await assert.rejects(evaluateOpenRouterBatch([input()], "system", { env, fetch: async () => new Response(JSON.stringify({ error: {
      code: 403, message: "synthetic-secret", metadata: { limit_source, spend_usd: 1, limit_usd: 1 },
    } }), { status: 403 }) }), isError("openrouter_budget_exhausted", "quota", 403));
  }
});

test("second chunk failure rejects the operation instead of returning first chunk as complete", async () => {
  let calls = 0;
  await assert.rejects(evaluateProductsBatch([input(), input("product-2")], { batchSize: 1, providerOptions: { env, fetch: async () => {
    calls++;
    return calls === 1 ? response() : new Response("budget", { status: 402 });
  } } }), isError("openrouter_budget_exhausted", "quota"));
  assert.equal(calls, 2);
});

test("timeout bounds both stalled transport and response body; network errors never leak details", async () => {
  for (const fetch of [
    async () => new Promise(() => {}),
    async () => new Response(new ReadableStream({ start() {} })),
  ]) await assert.rejects(evaluateOpenRouterBatch([input()], "system", { env, timeoutMs: 10, fetch }), isError("openrouter_timeout", "transient"));
  await assert.rejects(evaluateOpenRouterBatch([input()], "system", { env, fetch: async () => { throw new Error("synthetic-secret request details"); } }), isError("openrouter_transport_failed", "transient"));
});

test("response body is bounded even without content-length, with cancellation", async () => {
  let cancelled = false;
  await assert.rejects(evaluateOpenRouterBatch([input()], "system", { env, fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(OPENROUTER_CURATION_MAX_BYTES + 1)); },
    cancel() { cancelled = true; },
  })) }), isError("openrouter_response_too_large"));
  assert.equal(cancelled, true);
  await assert.rejects(evaluateOpenRouterBatch([input()], "system", { env, fetch: async () => new Response("x", { headers: { "content-length": String(OPENROUTER_CURATION_MAX_BYTES + 1) } }) }), isError("openrouter_response_too_large"));
});
