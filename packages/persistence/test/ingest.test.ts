/**
 * Testes do serviço de ingestão: fixture → store, contadores e capture_run.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sweep } from "../src/ingest.ts";
import { InMemoryStore } from "../src/store.ts";
import type {
  CaptureAdapter,
  CaptureContext,
  Credential,
  FetchParams,
  OfferPage,
  RawOffer,
} from "../../capture/src/types.ts";
import { paginate } from "../../capture/src/types.ts";

const ctx: CaptureContext = { runId: "test", log: () => {} };
const cred: Credential = { marketplace: "mercadolivre", secret: {} };

const offer = (over: Partial<RawOffer>): RawOffer => ({
  marketplace: "mercadolivre",
  externalId: "MLB1",
  title: "Produto",
  productUrl: "https://www.mercadolivre.com.br/p/MLB1",
  priceCents: 10000,
  capturedAt: new Date("2026-08-18T12:00:00Z"),
  source: "http_html",
  ...over,
});

function fakeAdapter(pages: RawOffer[][], marketplace = "mercadolivre"): CaptureAdapter {
  return {
    marketplace,
    capabilities: {
      search: false,
      offerFeed: true,
      linkGeneration: false,
      conversionReport: false,
      source: "http_html",
    },
    validateCredential: async () => ({ ok: true, checkedAt: new Date() }),
    fetchOffers: async (_c: Credential, params: FetchParams): Promise<OfferPage> => {
      const idx = params.cursor ? Number(params.cursor) : 0;
      const page = pages[idx];
      if (!page) return { offers: [] };
      return {
        offers: page,
        nextCursor: idx + 1 < pages.length ? String(idx + 1) : undefined,
      };
    },
    async *streamOffers(c, p, x) {
      yield* paginate(this, c, p, x, p.maxPages);
    },
  };
}

describe("sweep", () => {
  it("persiste produtos e observações, conta novos e mudanças de preço", async () => {
    const store = new InMemoryStore();
    const adapter = fakeAdapter([
      [offer({ externalId: "MLB1", priceCents: 10000 }), offer({ externalId: "MLB2", priceCents: 5000 })],
    ]);

    const s1 = await sweep(adapter, cred, store, { tenantId: "t1" }, ctx);
    assert.equal(s1.itemsCaptured, 2);
    assert.match(s1.runId, /^r\d+$/);
    assert.equal(s1.itemsNew, 2);
    assert.equal(s1.priceChanges, 0);

    // Segunda varredura: mesmos produtos, MLB1 mudou de preço.
    const adapter2 = fakeAdapter([
      [offer({ externalId: "MLB1", priceCents: 9000 }), offer({ externalId: "MLB2", priceCents: 5000 })],
    ]);
    const s2 = await sweep(adapter2, cred, store, { tenantId: "t1" }, ctx);
    assert.equal(s2.itemsNew, 0);
    assert.equal(s2.priceChanges, 1);

    assert.equal(store.allProducts.length, 2);
    const range = await store.priceRange(store.allProducts[0]!.id);
    assert.ok(range);
    assert.equal(range.observations, 2);
    assert.equal(range.minCents, 9000);
    assert.equal(range.maxCents, 10000);
  });

  it("registra capture_run ok com contadores", async () => {
    const store = new InMemoryStore();
    await sweep(fakeAdapter([[offer({})]]), cred, store, { tenantId: "t1" }, ctx);
    assert.equal(store.allRuns.length, 1);
    const run = store.allRuns[0]!;
    assert.equal(run.status, "ok");
    assert.equal(run.itemsCaptured, 1);
    assert.equal(run.itemsNew, 1);
    assert.equal(run.collectorRunId, "test");
    assert.equal(run.parameters.maxPages, undefined);
  });

  it("mantém uma observação por produto dentro da mesma execução", async () => {
    const store = new InMemoryStore();
    await sweep(fakeAdapter([[
      offer({ externalId: "MLB1", priceCents: 10000 }),
      offer({ externalId: "MLB1", priceCents: 9500 }),
    ]]), cred, store, { tenantId: "t1" }, ctx);

    const product = store.allProducts[0]!;
    const range = await store.priceRange(product.id);
    assert.equal(range?.observations, 1);
    assert.equal(range?.minCents, 9500);
    assert.equal(product.lastCaptureRunId, store.allRuns[0]!.id);
  });

  it("respeita e registra o teto de páginas da execução", async () => {
    const store = new InMemoryStore();
    const adapter = fakeAdapter([[offer({ externalId: "MLB1" })], [offer({ externalId: "MLB2" })]]);
    const summary = await sweep(adapter, cred, store, { tenantId: "t1", maxPages: 1 }, ctx);
    assert.equal(summary.itemsCaptured, 1);
    assert.equal(store.allRuns[0]!.parameters.maxPages, 1);
  });

  it("zero itens vira capture_run de erro (scraper quebrou em silêncio)", async () => {
    const store = new InMemoryStore();
    await sweep(fakeAdapter([[]]), cred, store, { tenantId: "t1" }, ctx);
    const run = store.allRuns[0]!;
    assert.equal(run.status, "error");
    assert.match(run.error ?? "", /zero itens/);
  });

  it("exceção do adapter registra capture_run de erro e propaga", async () => {
    const store = new InMemoryStore();
    const adapter = fakeAdapter([[offer({})]]);
    const broken: CaptureAdapter = {
      ...adapter,
      fetchOffers: async () => {
        throw new Error("HTTP 403");
      },
    };
    await assert.rejects(() => sweep(broken, cred, store, { tenantId: "t1" }, ctx), /HTTP 403/);
    const run = store.allRuns[0]!;
    assert.equal(run.status, "error");
    assert.match(run.error ?? "", /HTTP 403/);
  });
});
