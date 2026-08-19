/**
 * Testes do adapter de ofertas da página pública /ofertas.
 *
 * O parser é testado contra fixture REAL capturado em 2026-08-18
 * (test/fixtures/ofertas-sample.html, 3 cards recortados do HTML ao vivo).
 * Quando o layout do ML mudar, é este teste que quebra — de propósito.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DEALS_URL,
  MercadoLivreDealsAdapter,
  parseDealsHtml,
} from "../src/adapters/mercadolivre/deals.ts";
import { CaptureError } from "../src/errors.ts";
import type { CaptureContext, Credential } from "../src/types.ts";

const fixture = readFileSync(
  fileURLToPath(new URL("./fixtures/ofertas-sample.html", import.meta.url)),
  "utf8",
);

const ctx: CaptureContext = { runId: "test", log: () => {} };
const cred: Credential = { marketplace: "mercadolivre", secret: {} };

const capturedAt = new Date("2026-08-18T12:00:00Z");

describe("parseDealsHtml (fixture real)", () => {
  const offers = parseDealsHtml(fixture, capturedAt);

  it("extrai as 3 ofertas do fixture", () => {
    assert.equal(offers.length, 3);
  });

  it("usa o href real do card como productUrl, limpo de query/fragment", () => {
    for (const o of offers) {
      assert.ok(o.productUrl.startsWith("https://"), o.productUrl);
      assert.ok(!o.productUrl.includes("?"), `query vazou: ${o.productUrl}`);
      assert.ok(!o.productUrl.includes("#"), `fragment vazou: ${o.productUrl}`);
      assert.ok(/(MLB\d{6,}|\/p\/)/.test(o.productUrl), o.productUrl);
    }
  });

  it("externalId é um MLB válido, mesmo em card de catálogo (wid=)", () => {
    for (const o of offers) {
      assert.match(o.externalId, /^MLB\d{6,}$/);
    }
  });

  it("preço atual vem do poly-price__current, não do 'Antes' nem das parcelas", () => {
    for (const o of offers) {
      assert.ok(o.priceCents > 0);
      if (o.originalPriceCents != null) {
        assert.ok(
          o.priceCents < o.originalPriceCents,
          `atual (${o.priceCents}) deveria ser < anterior (${o.originalPriceCents})`,
        );
      }
    }
  });

  it("desconto declarado bate com a razão entre preços", () => {
    for (const o of offers) {
      if (o.claimedDiscountRate != null) {
        assert.ok(o.claimedDiscountRate > 0 && o.claimedDiscountRate < 1);
        const esperado = 1 - o.priceCents / o.originalPriceCents!;
        assert.ok(Math.abs(o.claimedDiscountRate - esperado) < 1e-9);
      }
    }
  });

  it("grava fonte e momento da captura", () => {
    for (const o of offers) {
      assert.equal(o.source, "http_html");
      assert.equal(o.marketplace, "mercadolivre");
      assert.equal(o.capturedAt, capturedAt);
    }
  });

  it("extrai a nota e o rótulo de vendas do texto acessível do ML", () => {
    assert.equal(offers[0]!.ratingStar, 4.9);
    assert.equal(offers[0]!.salesLabel, "+10mil vendidos");
    assert.equal(offers[0]!.salesCount, 10000);
    assert.ok(!offers.some((o) => /&(?:amp|quot|lt|gt);|&#(?:x[\da-f]+|\d+);/i.test(o.title)));
  });

  it("deixa evidências ausentes como nulas/indefinidas", () => {
    const [offer] = parseDealsHtml(fixture.replace(/Classificação[^<]+/g, "").replace(/\| \+[^<]+ vendidos/g, ""), capturedAt);
    assert.equal(offer?.ratingStar, undefined);
    assert.equal(offer?.salesLabel, undefined);
  });

  it("deduplica por externalId", () => {
    const duplicado = parseDealsHtml(fixture + fixture, capturedAt);
    assert.equal(duplicado.length, 3);
  });

  it("HTML sem cards devolve lista vazia (sem lançar)", () => {
    assert.deepEqual(parseDealsHtml("<html>manutenção</html>"), []);
  });
});

describe("MercadoLivreDealsAdapter", () => {
  const htmlResponse = () =>
    new Response(fixture, { status: 200, headers: { "content-type": "text/html" } });

  const adapter = (responses: Response[]) => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      const r = responses.shift();
      if (!r) throw new Error("fetch inesperado");
      return r;
    };
    return { adapter: new MercadoLivreDealsAdapter({ fetchImpl, ratePerSecond: 1000 }), urls };
  };

  it("capabilities declara offerFeed, linkGeneration e fonte http_html", () => {
    const { adapter: a } = adapter([htmlResponse()]);
    assert.equal(a.capabilities.offerFeed, true);
    assert.equal(a.capabilities.linkGeneration, true);
    assert.equal(a.capabilities.source, "http_html");
  });

  it("fetchOffers busca a página 1 e devolve cursor page:2", async () => {
    const { adapter: a, urls } = adapter([htmlResponse()]);
    const page = await a.fetchOffers(cred, {}, ctx);
    assert.equal(page.offers.length, 3);
    assert.equal(page.nextCursor, "page:2");
    assert.equal(urls[0], DEALS_URL);
  });

  it("cursor page:N vira ?page=N na URL", async () => {
    const { adapter: a, urls } = adapter([htmlResponse()]);
    await a.fetchOffers(cred, { cursor: "page:2" }, ctx);
    assert.equal(urls[0], `${DEALS_URL}?page=2`);
  });

  it("minClaimedDiscount filtra ofertas na memória", async () => {
    const { adapter: a } = adapter([htmlResponse()]);
    const page = await a.fetchOffers(cred, { minClaimedDiscount: 0.99 }, ctx);
    for (const o of page.offers) assert.ok((o.claimedDiscountRate ?? 0) >= 0.99);
  });

  it("primeira página sem ofertas vira erro explícito (layout mudou)", async () => {
    const { adapter: a } = adapter([
      new Response("<html>sem cards</html>", { status: 200 }),
    ]);
    await assert.rejects(
      () => a.fetchOffers(cred, {}, ctx),
      (err: unknown) => err instanceof CaptureError && err.kind === "malformed_response",
    );
  });

  it("validateCredential ok quando a página tem ofertas", async () => {
    const { adapter: a } = adapter([htmlResponse()]);
    const result = await a.validateCredential(cred, ctx);
    assert.equal(result.ok, true);
  });

  it("buildAffiliateLink aplica matt_full sobre o productUrl capturado", async () => {
    const { adapter: a } = adapter([htmlResponse()]);
    const page = await a.fetchOffers(cred, {}, ctx);
    const link = await a.buildAffiliateLink(
      cred,
      page.offers[0]!.productUrl,
      {
        marketplace: "mercadolivre",
        trackingId: "juem4482159_linklab001",
        toolId: "99838509",
        subIds: ["pub-42"],
      },
      ctx,
    );
    const u = new URL(link);
    assert.equal(u.searchParams.get("matt_word"), "juem4482159_linklab001_pub-42");
    assert.equal(u.searchParams.get("matt_tool"), "99838509");
    assert.equal(u.searchParams.get("forceInApp"), "true");
  });
});
