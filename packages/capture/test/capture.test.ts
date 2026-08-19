/**
 * Testes da camada de captura.
 *
 * Nenhum toca a rede: o cliente HTTP é injetado. Isso permite rodar em CI,
 * testar caminhos de erro que a API real raramente produz sob demanda, e
 * verificar a assinatura sem precisar de credencial válida.
 *
 *   node --test --experimental-strip-types test/capture.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { toCents, toRate, fromEpochSeconds } from "../src/money.ts";
import { TokenBucket, withRetry } from "../src/rate-limit.ts";
import { CaptureError } from "../src/errors.ts";
import { mapProductNode, mapProductNodes } from "../src/adapters/shopee/mapper.ts";
import { ShopeeClient } from "../src/adapters/shopee/client.ts";
import { ShopeeAdapter } from "../src/adapters/shopee/index.ts";
import type { CaptureContext, Credential } from "../src/types.ts";

const ctx: CaptureContext = { runId: "test", log: () => {} };
const cred: Credential = {
  marketplace: "shopee",
  secret: { appId: "APP123", appSecret: "SECRET456" },
};

// ---------------------------------------------------------------- dinheiro

describe("toCents", () => {
  it("converte sem erro de ponto flutuante", () => {
    // 29.90 * 100 === 2989.9999999999995 em float. Deve dar 2990.
    assert.equal(toCents(29.9), 2990);
    assert.equal(toCents("29.90"), 2990);
    assert.equal(toCents("29,90"), 2990);
  });

  it("entende separador de milhar nos dois formatos", () => {
    assert.equal(toCents("1.234,56"), 123456);
    assert.equal(toCents("1,234.56"), 123456);
    assert.equal(toCents("1234"), 123400);
  });

  it("arredonda o terceiro decimal", () => {
    assert.equal(toCents("10.005"), 1001);
    assert.equal(toCents("10.004"), 1000);
  });

  it("devolve undefined em vez de lançar", () => {
    assert.equal(toCents(null), undefined);
    assert.equal(toCents(""), undefined);
    assert.equal(toCents("abc"), undefined);
    assert.equal(toCents(NaN), undefined);
  });
});

describe("toRate", () => {
  it("normaliza fração e percentual", () => {
    assert.equal(toRate(0.15), 0.15);
    assert.equal(toRate(15), 0.15);
    assert.equal(toRate("0.07"), 0.07);
  });

  it("rejeita valores impossíveis", () => {
    assert.equal(toRate(150), undefined);
    assert.equal(toRate(-1), undefined);
  });
});

describe("fromEpochSeconds", () => {
  it("converte segundos e trata zero como ausência", () => {
    assert.equal(fromEpochSeconds(1_700_000_000)?.getUTCFullYear(), 2023);
    assert.equal(fromEpochSeconds(0), undefined);
    assert.equal(fromEpochSeconds(null), undefined);
  });
});

// ---------------------------------------------------------------- mapper

describe("mapProductNode", () => {
  const base = {
    itemId: 12345,
    shopId: 999,
    productName: "Fone Bluetooth",
    productLink: "https://shopee.com.br/product/999/12345",
    price: "189.90",
    priceDiscountRate: 0.4,
    commissionRate: 0.08,
  };

  it("mapeia os campos essenciais", () => {
    const offer = mapProductNode(base)!;
    assert.equal(offer.externalId, "12345");
    assert.equal(offer.externalShopId, "999");
    assert.equal(offer.priceCents, 18990);
    assert.equal(offer.claimedDiscountRate, 0.4);
    assert.equal(offer.source, "official_api");
  });

  it("deriva o preço original a partir do desconto declarado", () => {
    const offer = mapProductNode(base)!;
    // 189,90 com 40% de desconto => 316,50
    assert.equal(offer.originalPriceCents, 31650);
  });

  it("descarta nó sem identidade, preço ou URL", () => {
    assert.equal(mapProductNode({ ...base, itemId: undefined }), null);
    assert.equal(mapProductNode({ ...base, productName: "  " }), null);
    assert.equal(mapProductNode({ ...base, price: "0" }), null);
    assert.equal(
      mapProductNode({ ...base, productLink: undefined, offerLink: undefined }),
      null,
    );
  });

  it("sobrevive a campos desconhecidos ou ausentes", () => {
    const offer = mapProductNode({
      itemId: 1,
      productName: "X",
      productLink: "https://x",
      price: 10,
      campoNovoQueAShopeeInventou: true,
    } as never)!;
    assert.equal(offer.priceCents, 1000);
    assert.equal(offer.commissionRate, undefined);
  });

  it("conta descartes em lote sem interromper o resto", () => {
    const { offers, skipped } = mapProductNodes([base, { itemId: 1 }, base]);
    assert.equal(offers.length, 2);
    assert.equal(skipped, 1);
  });
});

// ---------------------------------------------------------------- assinatura

describe("assinatura HMAC da Shopee", () => {
  it("segue o formato AppId + Timestamp + Payload + Secret", () => {
    const client = new ShopeeClient();
    const payload = '{"query":"{ x }","variables":{}}';
    const ts = 1_700_000_000;

    const header = client.buildAuthHeader(
      { appId: "APP123", appSecret: "SECRET456" },
      payload,
      ts,
    );

    const expected = createHash("sha256")
      .update(`APP123${ts}${payload}SECRET456`, "utf8")
      .digest("hex");

    assert.equal(
      header,
      `SHA256 Credential=APP123, Timestamp=${ts}, Signature=${expected}`,
    );
  });

  it("muda quando o corpo muda", () => {
    const client = new ShopeeClient();
    const a = client.buildAuthHeader({ appId: "A", appSecret: "S" }, "{}", 1);
    const b = client.buildAuthHeader({ appId: "A", appSecret: "S" }, "{ }", 1);
    assert.notEqual(a, b);
  });
});

// ---------------------------------------------------------------- erros

describe("tratamento de erro do cliente", () => {
  const fakeFetch = (status: number, body: unknown): typeof fetch =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

  it("reconhece o código 10030 como limite de taxa", async () => {
    const client = new ShopeeClient({
      fetchImpl: fakeFetch(200, { errors: [{ extensions: { code: 10030 } }] }),
      ratePerSecond: 1000,
    });

    await assert.rejects(
      () => client.request({ appId: "a", appSecret: "b" }, "{ x }", {}, ctx),
      (err: unknown) =>
        err instanceof CaptureError &&
        err.kind === "rate_limit" &&
        err.retryable === true,
    );
  });

  it("trata 401 como credencial inválida e não repete", async () => {
    let calls = 0;
    const client = new ShopeeClient({
      ratePerSecond: 1000,
      fetchImpl: (async () => {
        calls++;
        return new Response("{}", { status: 401 });
      }) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => client.request({ appId: "a", appSecret: "b" }, "{ x }", {}, ctx),
      (err: unknown) =>
        err instanceof CaptureError &&
        err.kind === "auth" &&
        err.needsOperatorAttention === true,
    );
    assert.equal(calls, 1, "credencial inválida não deve ser repetida");
  });

  it("erro de GraphQL com 200 não passa despercebido", async () => {
    const client = new ShopeeClient({
      ratePerSecond: 1000,
      fetchImpl: fakeFetch(200, { errors: [{ message: "campo inválido" }] }),
    });

    await assert.rejects(
      () => client.request({ appId: "a", appSecret: "b" }, "{ x }", {}, ctx),
      (err: unknown) =>
        err instanceof CaptureError && err.kind === "marketplace_error",
    );
  });
});

// ---------------------------------------------------------------- retry

describe("withRetry", () => {
  it("repete erro passível de retentativa e devolve o resultado", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new CaptureError({
            kind: "rate_limit",
            marketplace: "shopee",
            message: "limite",
            retryAfterMs: 1,
          });
        }
        return "ok";
      },
      { baseDelayMs: 1, random: () => 0 },
    );

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });

  it("não repete erro de credencial", async () => {
    let attempts = 0;
    await assert.rejects(() =>
      withRetry(
        async () => {
          attempts++;
          throw new CaptureError({ kind: "auth", marketplace: "shopee", message: "x" });
        },
        { baseDelayMs: 1, random: () => 0 },
      ),
    );
    assert.equal(attempts, 1);
  });

  it("aplica jitter — o atraso não é determinístico entre execuções", async () => {
    const delays: number[] = [];
    await assert.rejects(() =>
      withRetry(
        async () => {
          throw new CaptureError({ kind: "transport", marketplace: "s", message: "x" });
        },
        {
          maxAttempts: 4,
          baseDelayMs: 100,
          random: () => 0.5,
          onRetry: ({ delayMs }) => delays.push(delayMs),
        },
      ),
    );
    // metade do teto exponencial: 50, 100, 200
    assert.deepEqual(delays, [50, 100, 200]);
  });
});

// ---------------------------------------------------------------- token bucket

describe("TokenBucket", () => {
  it("libera até o limite de rajada e depois espaça", () => {
    let now = 0;
    const bucket = new TokenBucket(2, 2, () => now);
    assert.equal(Math.floor(bucket.available), 2);
    now += 1000;
    assert.equal(Math.floor(bucket.available), 2, "não acumula além da rajada");
  });
});

// ---------------------------------------------------------------- adapter

describe("ShopeeAdapter", () => {
  const okResponse = (nodes: unknown[], hasNextPage = false) =>
    (async () =>
      new Response(
        JSON.stringify({
          data: { productOfferV2: { nodes, pageInfo: { hasNextPage } } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

  const node = {
    itemId: 1,
    shopId: 2,
    productName: "Produto",
    productLink: "https://shopee.com.br/p/1",
    price: "50.00",
    priceDiscountRate: 0.5,
  };

  it("declara que usa API oficial, não scraping", () => {
    const adapter = new ShopeeAdapter();
    assert.equal(adapter.capabilities.source, "official_api");
  });

  it("devolve ofertas normalizadas e cursor da próxima página", async () => {
    const adapter = new ShopeeAdapter({
      ratePerSecond: 1000,
      fetchImpl: okResponse([node], true),
    });

    const page = await adapter.fetchOffers(cred, {}, ctx);
    assert.equal(page.offers.length, 1);
    assert.equal(page.offers[0]!.priceCents, 5000);
    assert.equal(page.nextCursor, "page:2");
  });

  it("aplica filtro de desconto mínimo", async () => {
    const adapter = new ShopeeAdapter({
      ratePerSecond: 1000,
      fetchImpl: okResponse([node, { ...node, itemId: 2, priceDiscountRate: 0.1 }]),
    });

    const page = await adapter.fetchOffers(cred, { minClaimedDiscount: 0.3 }, ctx);
    assert.equal(page.offers.length, 1);
    assert.equal(page.offers[0]!.externalId, "1");
  });

  it("rejeita credencial incompleta sem vazar o segredo na mensagem", async () => {
    const adapter = new ShopeeAdapter({ ratePerSecond: 1000 });
    await assert.rejects(
      () =>
        adapter.fetchOffers(
          { marketplace: "shopee", secret: { appId: "so-o-id" } },
          {},
          ctx,
        ),
      (err: unknown) => {
        assert.ok(err instanceof CaptureError);
        assert.equal(err.kind, "auth");
        assert.match(err.message, /appSecret/);
        assert.doesNotMatch(err.message, /so-o-id/);
        return true;
      },
    );
  });

  it("streamOffers percorre as páginas e para no fim", async () => {
    let call = 0;
    const adapter = new ShopeeAdapter({
      ratePerSecond: 1000,
      fetchImpl: (async () => {
        call++;
        return new Response(
          JSON.stringify({
            data: {
              productOfferV2: {
                nodes: [{ ...node, itemId: call }],
                pageInfo: { hasNextPage: call < 3 },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    const seen: string[] = [];
    for await (const batch of adapter.streamOffers(cred, {}, ctx)) {
      for (const o of batch) seen.push(o.externalId);
    }

    assert.deepEqual(seen, ["1", "2", "3"]);
  });
});
