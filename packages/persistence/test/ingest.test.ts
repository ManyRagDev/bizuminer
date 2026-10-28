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
  OfferEvidence,
  RawOffer,
} from "../../capture/src/types.ts";
import { paginate } from "../../capture/src/types.ts";

const ctx: CaptureContext = { runId: "test", log: () => {} };
const cred: Credential = { marketplace: "mercadolivre", secret: {} };

const discovery = {
  planId: "test-plan",
  queryId: "moto",
  mode: "directed" as const,
  targetCategory: "Auto e moto",
  targetFamily: "manoplas_moto" as const,
  maxNewItems: 8,
  maxNewPerFamily: 2,
  saturationThreshold: 0.6,
  minCandidatesForSaturation: 4,
  stopOnSaturation: true,
};

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
  const evidence: OfferEvidence = {
    version: 1 as const,
    source: {
      marketplace: "mercadolivre", method: "http_html" as const,
      url: "https://www.mercadolivre.com.br/p/MLB1",
      capturedAt: "2026-08-18T12:00:00.000Z",
    },
    variantKey: "one-bag", packageContents: ["1 saco organizador sem cobertor"],
    packageQuantity: 1, dimensions: "60 × 40 × 35 cm", reviewCount: 120,
  };

  it("transporta evidência estruturada até a observação sem inferir campos ausentes", async () => {
    const store = new InMemoryStore();
    await sweep(fakeAdapter([[offer({ offerEvidence: evidence })]]), cred, store, { tenantId: "t1" }, ctx);
    const observation = await store.latestObservation(store.allProducts[0]!.id);
    assert.deepEqual(observation?.offerEvidence, evidence);
    assert.equal(observation?.offerEvidence?.description, undefined);
    assert.equal(observation?.offerEvidence?.positiveReviewRate, undefined);
  });

  it("repetição incompleta da mesma oferta na mesma execução conserva evidência", async () => {
    const store = new InMemoryStore();
    await sweep(fakeAdapter([[offer({ offerEvidence: evidence }), offer({})]]), cred, store, { tenantId: "t1" }, ctx);
    const product = store.allProducts[0]!;
    assert.deepEqual((await store.latestObservation(product.id))?.offerEvidence, evidence);
    assert.equal((await store.priceRange(product.id))?.observations, 1);
  });

  it("mudança de título, URL, imagem ou preço não herda evidência anterior", async () => {
    for (const changed of [
      { title: "Kit com 3 sacos" },
      { productUrl: "https://www.mercadolivre.com.br/p/MLB1?variant=kit" },
      { priceCents: 25000 },
      { imageUrl: "https://example.com/kit-de-tres.jpg" },
    ]) {
      const store = new InMemoryStore();
      await sweep(fakeAdapter([[offer({ offerEvidence: evidence }), offer(changed)]]), cred, store, { tenantId: "t1" }, ctx);
      assert.equal((await store.latestObservation(store.allProducts[0]!.id))?.offerEvidence, undefined);
    }
  });

  it("mudança de categoria na repetição invalida evidência mesmo com título e preço iguais", async () => {
    const store = new InMemoryStore();
    const input = {
      captureRunId: "same-run", tenantId: "t1", marketplace: "mercadolivre", externalId: "MLB1",
      title: "Produto", productUrl: "https://www.mercadolivre.com.br/p/MLB1", priceCents: 10000,
      category: "Casa", observedAt: new Date("2026-08-18T12:00:00Z"),
    };
    const { product } = await store.upsertProductWithObservation({ ...input, offerEvidence: evidence });
    await store.upsertProductWithObservation({ ...input, category: "Tecnologia" });
    assert.equal((await store.latestObservation(product.id))?.offerEvidence, undefined);
  });

  it("nova captura sem evidências preserva desconhecido, sem copiar afirmações antigas", async () => {
    const store = new InMemoryStore();
    await sweep(fakeAdapter([[offer({ offerEvidence: evidence })]]), cred, store, { tenantId: "t1" }, ctx);
    await sweep(fakeAdapter([[offer({})]]), cred, store, { tenantId: "t1" }, ctx);
    assert.equal((await store.latestObservation(store.allProducts[0]!.id))?.offerEvidence, undefined);
    assert.equal((await store.priceRange(store.allProducts[0]!.id))?.observations, 2);
  });

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

  it("persiste a família estruturada (key/label/método/versão) no produto", async () => {
    const store = new InMemoryStore();
    await sweep(
      fakeAdapter([[offer({ externalId: "MLB1", title: "Manopla esportiva para moto" })]]),
      cred,
      store,
      { tenantId: "t1" },
      ctx,
    );
    const product = store.allProducts[0]!;
    assert.deepEqual(product.family, {
      key: "manoplas_moto",
      label: "Manoplas para moto",
      method: "title-keywords",
      version: "v1",
    });

    // Produto reobservado sem pista no novo título conserva a família anterior.
    await sweep(
      fakeAdapter([[offer({ externalId: "MLB1", title: "Título novo sem pista nenhuma" })]]),
      cred,
      store,
      { tenantId: "t1" },
      ctx,
    );
    assert.equal(store.allProducts[0]!.family?.key, "manoplas_moto");
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

  it("limita somente produtos novos da família saturada e reobserva os conhecidos", async () => {
    const store = new InMemoryStore();
    await sweep(
      fakeAdapter([[
        offer({ externalId: "KNOWN", title: "Manopla para moto", priceCents: 10000 }),
      ]]),
      cred,
      store,
      { tenantId: "t1" },
      ctx,
    );

    const summary = await sweep(
      fakeAdapter([[
        offer({ externalId: "KNOWN", title: "Manopla para moto", priceCents: 9000 }),
        offer({ externalId: "NEW1", title: "Manopla esportiva para moto" }),
        offer({ externalId: "NEW2", title: "Manopla universal para moto" }),
        offer({ externalId: "NEW3", title: "Manopla colorida para moto" }),
      ]]),
      cred,
      store,
      { tenantId: "t1", discovery },
      ctx,
    );

    assert.equal(summary.itemsSeen, 4);
    assert.equal(summary.itemsCaptured, 3);
    assert.equal(summary.itemsNew, 2);
    assert.equal(summary.itemsSkippedByPolicy, 1);
    assert.equal(summary.priceChanges, 1);
    const known = store.allProducts.find((product) => product.externalId === "KNOWN")!;
    assert.equal((await store.priceRange(known.id))?.observations, 2);
    assert.equal(store.allRuns.at(-1)?.parameters.itemsSkippedByPolicy, 1);
  });

  it("interrompe páginas seguintes quando uma família domina a amostra", async () => {
    const store = new InMemoryStore();
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      offer({ externalId: `MOTO${index}`, title: `Manopla para moto modelo ${index}` }),
    );
    const secondPage = [offer({ externalId: "CASA1", title: "Organizador para cozinha" })];

    const summary = await sweep(
      fakeAdapter([firstPage, secondPage]),
      cred,
      store,
      { tenantId: "t1", maxPages: 2, discovery },
      ctx,
    );

    assert.equal(summary.pagesRead, 1);
    assert.equal(summary.saturationDetected, true);
    assert.equal(summary.dominantFamily, "manoplas_moto");
    assert.equal(summary.itemsNew, 2);
    assert.equal(summary.itemsSkippedByPolicy, 8);
    assert.equal(store.allProducts.some((product) => product.externalId === "CASA1"), false);
  });

  it("AC-036.6 / AC-028.1: recaptura com mesmo external_id em InMemoryStore preserva a identidade única do produto e atualiza observação", async () => {
    const store = new InMemoryStore();
    const externalId = "RECAPTURE_1";
    // Primeira varredura: cria o produto e a primeira observação de preço (R$ 100)
    await sweep(
      fakeAdapter([[offer({ externalId, title: "Cafeteira Expresso 110V", priceCents: 10000 })]]),
      cred,
      store,
      { tenantId: "t1" },
      ctx,
    );
    assert.equal(store.allProducts.filter((p) => p.externalId === externalId).length, 1);
    const initialProduct = store.allProducts.find((p) => p.externalId === externalId)!;
    const initialObs = await store.latestObservation(initialProduct.id);
    assert.equal(initialObs?.priceCents, 10000);

    // Segunda varredura (recaptura): mesmo externalId com novo preço (R$ 89)
    const sweep2 = await sweep(
      fakeAdapter([[offer({ externalId, title: "Cafeteira Expresso 110V", priceCents: 8900 })]]),
      cred,
      store,
      { tenantId: "t1" },
      ctx,
    );

    // Afirmação: identidade única do produto preservada (exatamente 1 produto)
    const matchingProducts = store.allProducts.filter((p) => p.externalId === externalId);
    assert.equal(matchingProducts.length, 1, "Recaptura com o mesmo external_id deve manter uma única identidade de produto no InMemoryStore");
    assert.equal(matchingProducts[0]!.id, initialProduct.id, "ID do produto deve permanecer inalterado");

    // Afirmação: observação atualizada e contagem de observações incrementada
    const updatedObs = await store.latestObservation(initialProduct.id);
    assert.equal(updatedObs?.priceCents, 8900, "Última observação deve refletir o novo preço");
    assert.equal((await store.priceRange(initialProduct.id))?.observations, 2, "Contagem de observações para o produto deve ser 2");
    assert.equal(sweep2.itemsNew, 0, "Nenhum produto novo deve ser criado na recaptura");
    assert.equal(sweep2.priceChanges, 1, "Mudança de preço deve ser detectada");
  });
});

// Regression: finishing a non-house run must keep its selected tenant under RLS.
it('sweep forwards tenant to capture completion, including an empty source', async()=>{
 const store=new InMemoryStore();
 const original=store.finishCaptureRun.bind(store);
 let completedTenant:string|undefined;
 store.finishCaptureRun=async(id,input)=>{completedTenant=input.tenantId;await original(id,input);};
 await sweep(fakeAdapter([]),cred,store,{tenantId:'tenant_b',maxPages:1},ctx);
 assert.equal(completedTenant,'tenant_b');
});

it('stable sampling preserves each material change at same price and A → B → A', async () => {
 const store=new InMemoryStore();const at=new Date('2026-10-28T00:00Z');
 const input={captureRunId:'r1',tenantId:'tenant_a',marketplace:'shopee',externalId:'facts',title:' Kit\n  USB-C &amp; 2 unidades ',productUrl:'https://shopee.com/facts',priceCents:1000,observedAt:at};
 const evidence={version:2 as const,source:{marketplace:'shopee',method:'official_api' as const,url:input.productUrl,capturedAt:at.toISOString()},currency:'BRL',priceType:'exact' as const,variantIdentity:{state:'source_verified' as const,key:'usb-c'},packageContents:['2 unidades'],originalPriceKind:'source_claimed' as const};
 const {product}=await store.upsertProductWithObservation({...input,offerEvidence:evidence});let run=1;
 const write=async(e:any,delta=60_000)=>store.upsertProductWithObservation({...input,captureRunId:'r'+(++run),observedAt:new Date(at.getTime()+run*delta),offerEvidence:e});
 await write({...evidence,source:{...evidence.source,capturedAt:new Date(at.getTime()+60_000).toISOString()}});
 assert.equal((await store.priceRange(product.id))?.observations,1);
 for(const patch of [{currency:'USD'},{variantIdentity:{state:'source_verified',key:'lightning'}},{packageContents:['1 unidade']},{conditions:{coupon:'X'}},{originalPriceKind:'derived_from_claim'},{priceType:'from'}]) {
  const before=(await store.priceRange(product.id))!.observations;await write({...evidence,...patch});await write(evidence);
  assert.equal((await store.priceRange(product.id))?.observations,before+2);
 }
 await write(evidence,21*60*60_000);assert.equal((await store.priceRange(product.id))?.observations,14);
 assert.equal((await store.latestObservation(product.id))?.titleSnapshot,'Kit USB-C & 2 unidades');assert.equal(store.allProducts[0]!.title,'Kit USB-C & 2 unidades');
 await store.upsertProductWithObservation({...input,tenantId:'tenant_b',offerEvidence:evidence});assert.equal(store.allProducts.length,2);assert.notEqual(store.allProducts[0]!.id,store.allProducts[1]!.id);
});
