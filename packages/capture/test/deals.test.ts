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

  it("usa o href real e preserva o anúncio de catálogo, removendo tracking", () => {
    for (const o of offers) {
      assert.ok(o.productUrl.startsWith("https://"), o.productUrl);
      assert.ok(!o.productUrl.includes("#"), `fragment vazou: ${o.productUrl}`);
      assert.ok(/(MLB\d{6,}|\/p\/)/.test(o.productUrl), o.productUrl);
      const url = new URL(o.productUrl);
      if (url.pathname.includes("/p/")) assert.equal(url.searchParams.get("wid"), o.externalId);
      else assert.equal(url.search, "");
      assert.ok([...url.searchParams.keys()].every((key) => key === "wid"));
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

  it("não apresenta nota zero como avaliação de compradores", () => {
    const [offer] = parseDealsHtml(fixture.replace(/Classificação\s+[0-5](?:[.,]\d+)?\s+de\s+5\s+estrelas/g, "Classificação 0 de 5 estrelas"), capturedAt);
    assert.equal(offer?.ratingStar, undefined);
  });

  it("deduplica por externalId", () => {
    const duplicado = parseDealsHtml(fixture + fixture, capturedAt);
    assert.equal(duplicado.length, 3);
  });

  it("HTML sem cards devolve lista vazia (sem lançar)", () => {
    assert.deepEqual(parseDealsHtml("<html>manutenção</html>"), []);
  });

  it("identifica anúncio no fragmento, filtros e link direto sem usar o ID de catálogo", () => {
    const card = (href: string) => `<div class="poly-card poly-card--grid-card"><a href="${href}" class="poly-component__title">Oferta</a><div class="poly-price__current"><span aria-label="11 reais"></span></div></div>`;
    for (const href of [
      "https://www.mercadolivre.com.br/nome/p/MLB12345678#polycard_client=offers&wid=MLB9876543210&position=1",
      "https://www.mercadolivre.com.br/nome/p/MLB12345678?pdp_filters=item_id%3AMLB9876543210&position=1",
    ]) {
      const [offer] = parseDealsHtml(card(href));
      assert.equal(offer?.externalId, "MLB9876543210");
      assert.equal(offer?.productUrl, "https://www.mercadolivre.com.br/nome/p/MLB12345678?wid=MLB9876543210");
    }
    const [direct] = parseDealsHtml(card("https://produto.mercadolivre.com.br/MLB-9876543210-nome-_JM#tracking=1"));
    assert.equal(direct?.externalId, "MLB9876543210");
    assert.equal(direct?.productUrl, "https://produto.mercadolivre.com.br/MLB-9876543210-nome-_JM");
    assert.deepEqual(parseDealsHtml(card("https://www.mercadolivre.com.br/nome/p/MLB12345678")), []);
    assert.deepEqual(parseDealsHtml(card("https://example.com/MLB9876543210")), []);
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

  it("verificação de conta com HTTP 200 é erro de acesso, sem retry ou hipótese de layout", async () => {
    const response = new Response("<html>Olá! Para continuar, acesse sua conta</html>", { status: 200 });
    Object.defineProperty(response, "url", { value: "https://www.mercadolivre.com.br/gz/account-verification?go=private" });
    const { adapter: a, urls } = adapter([response]);
    await assert.rejects(() => a.fetchOffers(cred, {}, ctx), (err: unknown) => err instanceof CaptureError && err.kind === "auth" && !err.retryable && !err.message.includes("private"));
    assert.equal(urls.length, 1);
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
