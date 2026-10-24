import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const preload = readFileSync(new URL("../scripts/dev-version-check.cjs", import.meta.url), "utf8");
const versionUrl = "https://registry.npmjs.org/-/package/next/dist-tags";

function load(fetch) {
  const sandbox = { fetch, URL, Request, AbortSignal };
  vm.runInNewContext(preload, sandbox);
  return sandbox.fetch;
}

test("unavailable version registry cannot block development startup indefinitely", { timeout: 5000 }, async () => {
  const devFetch = load((_input, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  // AbortSignal.timeout itself does not keep Node's event loop alive.
  const keepAlive = setInterval(() => {}, 100);
  try {
    await assert.rejects(devFetch(versionUrl), { name: "TimeoutError" });
  } finally {
    clearInterval(keepAlive);
  }
});

test("application requests retain their original arguments and response", async () => {
  const input = new Request("https://example.test/api/catalog");
  const init = { cache: "no-store", signal: AbortSignal.abort("application cancellation") };
  const expected = Promise.resolve(new Response("catalog"));
  const devFetch = load((actualInput, actualInit) => {
    assert.equal(actualInput, input);
    assert.equal(actualInit, init);
    return expected;
  });
  assert.equal(devFetch(input, init), expected);
});

test("a caller can still cancel the optional version check before its timeout", async () => {
  const reason = new Error("caller cancelled");
  const devFetch = load((_input, { signal }) => {
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason, reason);
    return Promise.reject(signal.reason);
  });
  await assert.rejects(devFetch(new Request(versionUrl, { signal: AbortSignal.abort(reason) })), reason);
});
