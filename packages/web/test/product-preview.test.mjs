import assert from "node:assert/strict";
import test from "node:test";
import { productPreview } from "../lib/product-preview.ts";
import { serveProductPreview } from "../lib/product-preview-response.ts";
import { createPreviewWarmer } from "../lib/product-preview-warmup.ts";

const now = new Date("2026-10-23T12:00:00Z");
const product = {
  id: "product-a", slug: "shp-123", title: "Oferta de teste", marketplace: "shopee",
  priceCents: 15990, originalPriceCents: 19990, imageUrl: "https://cf.shopee.com.br/photo.jpg",
  evidenceObservedAt: "2026-10-23T10:00:00Z", previousMinPriceCents: 17990,
  observationCount: 20, historyDays: 10, lowestVerified: true,
};
const ready = (ttl = 300, age = 0) => new Response("complete png", { headers: {
  "X-BizuMiner-Preview": "ready", "X-BizuMiner-Preview-Ttl": String(ttl), Age: String(age),
} });
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("same offer yields one URL; visible changes, evidence and freshness change the revision", () => {
  const first = productPreview(product, now);
  assert.equal(first.path, productPreview({ ...product, evidenceObservedAt: new Date(product.evidenceObservedAt) }, now).path);
  assert.equal(first.path, productPreview(product, new Date(now.getTime() + 60_000)).path);
  for (const patch of [
    { priceCents: 14990 }, { originalPriceCents: null }, { imageUrl: "https://cf.shopee.com.br/new.jpg" },
    { title: "Outro título" }, { lowestVerified: false }, { evidenceObservedAt: "2026-10-23T11:00:00Z" },
  ]) assert.notEqual(productPreview({ ...product, ...patch }, now).path, first.path);
  const boundary = new Date(Date.parse(product.evidenceObservedAt) + 48 * 3_600_000);
  assert.equal(productPreview(product, new Date(boundary.getTime() - 10_000)).cacheSeconds, 10);
  assert.equal(productPreview(product, boundary).cacheSeconds, 0);
  assert.equal(productPreview(product, boundary).stale, false);
  assert.equal(productPreview(product, new Date(boundary.getTime() + 1)).stale, true);
  assert.notEqual(productPreview(product, new Date(boundary.getTime() + 1)).path, first.path);
});

test("legacy URLs and private selection hints resolve to the current public image before rendering", async () => {
  let renders = 0, reads = 0;
  const deps = { loadProduct: async () => { reads++; return product; }, render: async () => { renders++; return ready(); } };
  const expected = productPreview(product, now).path;
  for (const query of ["", "?cf449800edbd911b", "?v=outdated", `?v=${productPreview(product, now).version}&extra=1`]) {
    const result = await serveProductPreview(new Request(`https://www.bizuminer.com.br/bizu/shp-123/opengraph-image${query}`), product.slug, deps, now);
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), expected);
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
  assert.equal(reads, 4); assert.equal(renders, 0);
  const result = await serveProductPreview(new Request(`https://www.bizuminer.com.br${expected}`), product.slug, deps, now);
  assert.equal(result.status, 200); assert.equal(renders, 1);
  assert.equal(result.headers.get("vercel-cdn-cache-control"), "public, s-maxage=300");
  assert.equal(result.headers.get("access-control-allow-origin"), "*");
});

test("revocation, suspension or expiry returning no public product cannot reuse an old revision", async () => {
  const url = `https://www.bizuminer.com.br${productPreview(product, now).path}`;
  const result = await serveProductPreview(new Request(url), product.slug, {
    loadProduct: async () => null, render: async () => { throw new Error("must not render"); },
  }, now);
  assert.equal(result.status, 404);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("vercel-cdn-cache-control"), null);
});

test("photo failure does not cache an incomplete card; freshness deadline limits the CDN TTL", async () => {
  const url = `https://www.bizuminer.com.br${productPreview(product, now).path}`;
  const response = await serveProductPreview(new Request(url), product.slug, {
    loadProduct: async () => product,
    render: async () => new Response("fallback", { headers: { "X-BizuMiner-Preview": "fallback" } }),
  }, now);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("X-BizuMiner-Preview-Ttl"), "0");
  const justBefore = new Date(Date.parse(product.evidenceObservedAt) + 48 * 3_600_000 - 7000);
  const fresh = await serveProductPreview(new Request(url), product.slug, {
    loadProduct: async () => product, render: async () => ready(),
  }, justBefore);
  assert.equal(fresh.headers.get("vercel-cdn-cache-control"), "public, s-maxage=7");
});

test("warmup bounds concurrency, deduplicates repeated polling and prioritizes the selected product", async () => {
  const started = [], finishes = [];
  const warmer = createPreviewWarmer({ fetcher: async (url, options) => {
    assert.equal(options.credentials, "omit");
    started.push(url);
    return await new Promise((resolve) => finishes.push(() => resolve(ready())));
  } });
  const a = warmer.warm("a"), b = warmer.warm("b"), c = warmer.warm("c"), d = warmer.warm("d");
  assert.equal(warmer.warm("a"), a);
  assert.equal(warmer.warm("d", true), d);
  assert.deepEqual(started, ["a", "b"]);
  finishes[0](); await a; await nextTurn();
  assert.deepEqual(started, ["a", "b", "d"]);
  finishes[1](); await b; await nextTurn();
  assert.deepEqual(started, ["a", "b", "d", "c"]);
  finishes[2](); finishes[3]();
  assert.deepEqual(await Promise.all([a, b, c, d]), [true, true, true, true]);
  await warmer.warm("a"); assert.equal(started.length, 4);
  warmer.dispose();
});

test("warmup waits for the whole image, retries failure, and respects the age of cached responses", async () => {
  let time = 0, calls = 0, complete;
  const warmer = createPreviewWarmer({ now: () => time, fetcher: async () => {
    calls++;
    if (calls === 1) return new Response("unavailable", { status: 503 });
    const response = ready(300, 290);
    response.arrayBuffer = () => new Promise((resolve) => { complete = resolve; });
    return response;
  } });
  assert.equal(await warmer.warm("a"), false);
  const pending = warmer.warm("a"); await nextTurn();
  let settled = false; pending.then(() => { settled = true; });
  await nextTurn(); assert.equal(settled, false);
  complete(new ArrayBuffer(0)); assert.equal(await pending, true);
  time = 9000; await warmer.warm("a"); assert.equal(calls, 2);
  time = 10001; const refresh = warmer.warm("a"); await nextTurn();
  assert.equal(calls, 3); complete(new ArrayBuffer(0)); await refresh;
  warmer.dispose();
});

test("unmount cancels downloads and queued work, with no new requests afterwards", async () => {
  let calls = 0;
  const warmer = createPreviewWarmer({ concurrency: 1, fetcher: async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } });
  const a = warmer.warm("a"), b = warmer.warm("b");
  warmer.dispose();
  assert.deepEqual(await Promise.all([a, b]), [false, false]);
  assert.equal(await warmer.warm("c"), false);
  assert.equal(calls, 1);
});
