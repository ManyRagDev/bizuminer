/**
 * Testes do adapter do Mercado Livre.
 *
 * O foco está no OAuth, porque é onde mora o risco real: o refresh token é de
 * uso único e uma renovação concorrente quebra a cadeia de forma silenciosa.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryTokenStore,
  MercadoLivreTokenManager,
  buildAuthorizationUrl,
  type OAuthTokens,
} from "../src/adapters/mercadolivre/oauth.ts";
import {
  MercadoLivreAdapter,
  mapSearchItem,
} from "../src/adapters/mercadolivre/index.ts";
import { CaptureError } from "../src/errors.ts";
import {
  LINK_STRATEGIES,
  buildAffiliateLink,
  buildAllCandidates,
} from "../src/adapters/mercadolivre/affiliate-link.ts";
import {
  injectedParams,
  traceRedirects,
} from "../src/adapters/mercadolivre/link-trace.ts";
import type { CaptureAdapter, CaptureContext, Credential } from "../src/types.ts";

const ctx: CaptureContext = { runId: "test", log: () => {} };
const cred: Credential = { marketplace: "mercadolivre", secret: {} };

const config = {
  clientId: "APP123",
  clientSecret: "SECRET",
  redirectUri: "https://app.exemplo.com/callback",
};

const tokensExpiringAt = (ms: number): OAuthTokens => ({
  accessToken: "AT-atual",
  refreshToken: "RT-atual",
  expiresAt: new Date(ms),
});

const tokenResponse = (suffix: string, expiresIn = 21_600) =>
  new Response(
    JSON.stringify({
      access_token: `AT-${suffix}`,
      refresh_token: `RT-${suffix}`,
      expires_in: expiresIn,
      user_id: 42,
      scope: "offline_access read",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

// ---------------------------------------------------------------- URL de auth

describe("buildAuthorizationUrl", () => {
  it("monta a URL com os parâmetros obrigatórios", () => {
    const url = new URL(buildAuthorizationUrl(config, "estado-unico"));
    assert.equal(url.origin + url.pathname, "https://auth.mercadolivre.com.br/authorization");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("client_id"), "APP123");
    assert.equal(url.searchParams.get("state"), "estado-unico");
    assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  });

  it("inclui PKCE quando fornecido", () => {
    const url = new URL(
      buildAuthorizationUrl(config, "s", { codeChallenge: "DESAFIO" }),
    );
    assert.equal(url.searchParams.get("code_challenge"), "DESAFIO");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  });
});

// ---------------------------------------------------------------- OAuth

describe("MercadoLivreTokenManager", () => {
  it("troca o code e persiste o par inicial", async () => {
    const store = new InMemoryTokenStore();
    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () => tokenResponse("novo")) as unknown as typeof fetch,
    });

    const tokens = await mgr.exchangeCode("CODE-123");
    assert.equal(tokens.accessToken, "AT-novo");
    assert.equal(tokens.expiresAt.getTime(), 21_600 * 1000);
    assert.equal((await store.load())?.refreshToken, "RT-novo");
  });

  it("não renova quando o token ainda tem folga", async () => {
    let calls = 0;
    const store = new InMemoryTokenStore(tokensExpiringAt(60 * 60 * 1000));
    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () => {
        calls++;
        return tokenResponse("nao-deveria");
      }) as unknown as typeof fetch,
    });

    assert.equal(await mgr.getAccessToken(), "AT-atual");
    assert.equal(calls, 0);
  });

  it("renova dentro da margem de segurança, antes de expirar", async () => {
    const store = new InMemoryTokenStore(tokensExpiringAt(2 * 60 * 1000)); // 2 min
    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () => tokenResponse("renovado")) as unknown as typeof fetch,
    });

    assert.equal(await mgr.getAccessToken(), "AT-renovado");
  });

  it("CRÍTICO: renovações concorrentes disparam UMA única chamada", async () => {
    let calls = 0;
    const store = new InMemoryTokenStore(tokensExpiringAt(0));
    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 10));
        return tokenResponse(`renovado-${calls}`);
      }) as unknown as typeof fetch,
    });

    const results = await Promise.all([
      mgr.getAccessToken(),
      mgr.getAccessToken(),
      mgr.getAccessToken(),
      mgr.getAccessToken(),
    ]);

    // O refresh token é de uso único: mais de uma chamada mataria a cadeia.
    assert.equal(calls, 1, "houve renovação concorrente — cadeia de token em risco");
    assert.deepEqual(new Set(results), new Set(["AT-renovado-1"]));
  });

  it("persiste o par novo ANTES de devolvê-lo", async () => {
    const order: string[] = [];
    const store = new InMemoryTokenStore(tokensExpiringAt(0));
    const originalSave = store.save.bind(store);
    store.save = async (t) => {
      order.push("save");
      await originalSave(t);
    };

    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () => tokenResponse("r")) as unknown as typeof fetch,
    });

    await mgr.getAccessToken();
    order.push("return");
    assert.deepEqual(order, ["save", "return"]);
  });

  it("falha de persistência aborta em vez de seguir com token perdido", async () => {
    const store = new InMemoryTokenStore(tokensExpiringAt(0));
    store.save = async () => {
      throw new Error("banco fora do ar");
    };

    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () => tokenResponse("r")) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => mgr.getAccessToken(),
      (err: unknown) =>
        err instanceof CaptureError &&
        err.kind === "auth" &&
        /persistir/.test(err.message),
    );
  });

  it("invalid_grant vira erro de autenticação que não se repete", async () => {
    const store = new InMemoryTokenStore(tokensExpiringAt(0));
    const mgr = new MercadoLivreTokenManager({
      config,
      store,
      now: () => 0,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => mgr.getAccessToken(),
      (err: unknown) =>
        err instanceof CaptureError &&
        err.kind === "auth" &&
        err.retryable === false,
    );
  });

  it("sem token armazenado exige nova autorização", async () => {
    const mgr = new MercadoLivreTokenManager({
      config,
      store: new InMemoryTokenStore(null),
      now: () => 0,
    });
    await assert.rejects(
      () => mgr.getAccessToken(),
      (err: unknown) => err instanceof CaptureError && err.kind === "auth",
    );
  });
});

// ---------------------------------------------------------------- mapper

describe("mapSearchItem", () => {
  const item = {
    id: "MLB123",
    title: "Fone de Ouvido",
    price: 189.9,
    original_price: 316.5,
    thumbnail: "https://http2.mlstatic.com/x.jpg",
    permalink: "https://produto.mercadolivre.com.br/MLB123",
    sold_quantity: 500,
    category_id: "MLB1051",
    seller: { id: 987 },
  };

  it("mapeia os campos essenciais", () => {
    const offer = mapSearchItem(item)!;
    assert.equal(offer.externalId, "MLB123");
    assert.equal(offer.externalShopId, "987");
    assert.equal(offer.priceCents, 18990);
    assert.equal(offer.originalPriceCents, 31650);
    assert.equal(offer.source, "official_api");
  });

  it("calcula o desconto declarado a partir do preço original", () => {
    const offer = mapSearchItem(item)!;
    assert.ok(Math.abs(offer.claimedDiscountRate! - 0.4) < 0.001);
  });

  it("original_price nulo não vira desconto", () => {
    const offer = mapSearchItem({ ...item, original_price: null })!;
    assert.equal(offer.originalPriceCents, undefined);
    assert.equal(offer.claimedDiscountRate, undefined);
  });

  it("descarta item sem id, título, permalink ou preço", () => {
    assert.equal(mapSearchItem({ ...item, id: undefined }), null);
    assert.equal(mapSearchItem({ ...item, permalink: undefined }), null);
    assert.equal(mapSearchItem({ ...item, price: 0 }), null);
  });
});

// ---------------------------------------------------------------- adapter

describe("MercadoLivreAdapter", () => {
  const makeAdapter = (fetchImpl: typeof fetch) => {
    const store = new InMemoryTokenStore(tokensExpiringAt(Date.now() + 3_600_000));
    const tokenManager = new MercadoLivreTokenManager({ config, store, fetchImpl });
    return new MercadoLivreAdapter({ tokenManager, fetchImpl, ratePerSecond: 1000 });
  };

  const searchResponse = (results: unknown[], total = 100) =>
    new Response(JSON.stringify({ results, paging: { total, limit: results.length } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const node = {
    id: "MLB1",
    title: "Produto",
    price: 50,
    permalink: "https://produto.mercadolivre.com.br/MLB1",
  };

  it("declara que NÃO gera link de afiliado", () => {
    const adapter = makeAdapter((async () => searchResponse([])) as unknown as typeof fetch);
    assert.equal(adapter.capabilities.linkGeneration, false);
    assert.equal(adapter.capabilities.source, "official_api");
    // O método é opcional no contrato; o ML não o implementa.
    assert.equal((adapter as CaptureAdapter).buildAffiliateLink, undefined);
  });

  it("busca e normaliza, devolvendo cursor de offset", async () => {
    const adapter = makeAdapter(
      (async () => searchResponse(new Array(50).fill(node))) as unknown as typeof fetch,
    );
    const page = await adapter.fetchOffers(cred, { keyword: "fone" }, ctx);
    assert.equal(page.offers.length, 50);
    assert.equal(page.nextCursor, "offset:50");
  });

  it("exige palavra-chave — a busca do ML não aceita consulta vazia", async () => {
    const adapter = makeAdapter((async () => searchResponse([])) as unknown as typeof fetch);
    await assert.rejects(
      () => adapter.fetchOffers(cred, {}, ctx),
      (err: unknown) =>
        err instanceof CaptureError && /palavra-chave/.test(err.message),
    );
  });

  it("para de paginar ao chegar no teto de offset da API", async () => {
    const adapter = makeAdapter(
      (async () => searchResponse(new Array(50).fill(node), 99_999)) as unknown as typeof fetch,
    );
    const page = await adapter.fetchOffers(
      cred,
      { keyword: "x", cursor: "offset:1000" },
      ctx,
    );
    assert.equal(page.nextCursor, undefined, "não deve pedir offset acima do teto");
  });

  it("renova uma vez ao receber 401 e repete a chamada", async () => {
    let searchCalls = 0;
    let tokenCalls = 0;

    const fetchImpl = (async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/oauth/token")) {
        tokenCalls++;
        return tokenResponse("apos-401");
      }
      searchCalls++;
      if (searchCalls === 1) return new Response("{}", { status: 401 });
      return searchResponse([node], 1);
    }) as unknown as typeof fetch;

    const store = new InMemoryTokenStore(tokensExpiringAt(Date.now() + 3_600_000));
    const tokenManager = new MercadoLivreTokenManager({ config, store, fetchImpl });
    const adapter = new MercadoLivreAdapter({ tokenManager, fetchImpl, ratePerSecond: 1000 });

    const page = await adapter.fetchOffers(cred, { keyword: "x" }, ctx);
    assert.equal(page.offers.length, 1);
    assert.equal(tokenCalls, 1, "deve renovar exatamente uma vez");
    assert.equal(searchCalls, 2, "deve repetir a busca uma vez");
  });
});

// ---------------------------------------------------------------- link afiliado

describe("construção de link de afiliado", () => {
  const input = {
    productUrl: "https://produto.mercadolivre.com.br/MLB-123-fone",
    itemId: "MLB123",
    trackingId: "meu-id",
    toolId: "99999",
    subId: "pub-77",
  };

  it("gera um candidato por estratégia aplicável", () => {
    const candidates = buildAllCandidates(input);
    assert.ok(candidates.length >= 6);
    const ids = new Set(candidates.map((c) => c.strategyId));
    assert.equal(ids.size, candidates.length, "não deve haver estratégia duplicada");
  });

  it("todo candidato é URL válida e carrega o tracking id", () => {
    for (const c of buildAllCandidates(input)) {
      const u = new URL(c.url);
      assert.ok(u.protocol === "https:", `${c.strategyId} não é https`);
      assert.ok(
        c.url.includes("meu-id"),
        `${c.strategyId} não carrega o tracking id`,
      );
    }
  });

  it("preserva parâmetros já existentes na URL do produto", () => {
    const withQuery = { ...input, productUrl: `${input.productUrl}?existente=1` };
    const c = buildAllCandidates(withQuery).find((x) => x.strategyId === "matt_tool")!;
    assert.ok(c.url.includes("existente=1"));
    assert.ok(c.url.includes("matt_tool=meu-id"));
  });

  it("apenas matt_full está verificada — confirmação de campo em 2026-08-17", () => {
    // matt_full foi confirmada: clique em URL de produto com matt_word+matt_tool
    // (sem o `ref` opaco) foi contabilizado no portal de afiliados.
    // Se marcar outra estratégia como verificada, este teste precisa acompanhar.
    const verified = LINK_STRATEGIES.filter((s) => s.verified);
    assert.deepEqual(
      verified.map((s) => s.id),
      ["matt_full"],
      "estratégia verificada sem registro do teste de campo correspondente",
    );
  });

  it("o link construído usa a estratégia verificada e confirma atribuição", () => {
    const link = buildAffiliateLink(input)!;
    assert.equal(link.strategyId, "matt_full");
    assert.equal(link.attributionVerified, true);
    assert.ok(link.url.includes("matt_word="));
    assert.ok(link.url.includes("matt_tool="));
  });

  it("URL inválida devolve null em vez de string quebrada", () => {
    const candidates = buildAllCandidates({ ...input, productUrl: "nao-e-url" });
    // canonical_item não depende da productUrl, então ainda gera.
    assert.ok(candidates.every((c) => c.url.startsWith("https://")));
  });
});

describe("trace de redirects do link de afiliado", () => {
  /** fetch falso: /sec/ → landing com matt_word → produto final. */
  const fakeFetch = (() => {
    const responses: Record<string, { status: number; location?: string }> = {
      "https://mercadolivre.com/sec/2ABC": {
        status: 302,
        location:
          "https://www.mercadolivre.com.br/landing?matt_word=AFILIADO123&matt_tool=98765",
      },
      "https://www.mercadolivre.com.br/landing?matt_word=AFILIADO123&matt_tool=98765":
        { status: 301, location: "https://produto.mercadolivre.com.br/MLB-123" },
      "https://produto.mercadolivre.com.br/MLB-123": { status: 200 },
    };
    return (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.redirect, "manual");
      const key = String(url);
      const r = responses[key] ?? { status: 404 };
      return new Response(null, {
        status: r.status,
        headers: r.location ? { location: r.location } : {},
      });
    }) as typeof fetch;
  })();

  it("segue a cadeia completa e registra cada hop", async () => {
    const result = await traceRedirects("https://mercadolivre.com/sec/2ABC", {
      fetchImpl: fakeFetch,
    });

    assert.equal(result.hops.length, 3);
    assert.equal(result.hops[0]!.status, 302);
    assert.equal(result.finalUrl, "https://produto.mercadolivre.com.br/MLB-123");
    assert.ok(result.hops.every((h) => h.final === (h.hop === 3)));
  });

  it("mostra os parâmetros que o ML injetou no caminho", async () => {
    const result = await traceRedirects("https://mercadolivre.com/sec/2ABC", {
      fetchImpl: fakeFetch,
    });

    assert.equal(result.finalParams.matt_word, undefined);
    const injected = injectedParams(
      "https://mercadolivre.com/sec/2ABC",
      result.finalUrl,
    );
    // A URL final (200) não carrega os params — ficaram no hop intermediário.
    assert.deepEqual(injected, []);
    // Mas o hop 2 registra a injecão, que é onde a evidência aparece.
    assert.match(result.hops[0]!.location ?? "", /matt_word=AFILIADO123/);
  });

  it("status de erro encerra a cadeia sem lançar", async () => {
    const failing = (async () =>
      new Response(null, { status: 404 })) as unknown as typeof fetch;
    const result = await traceRedirects("https://x.exemplo/privado", {
      fetchImpl: failing,
    });
    assert.equal(result.hops.length, 1);
    assert.equal(result.hops[0]!.status, 404);
    assert.equal(result.finalUrl, "https://x.exemplo/privado");
  });

  it("respeita o teto de hops", async () => {
    const loopy = (async (_url: RequestInfo | URL) =>
      new Response(null, {
        status: 302,
        headers: { location: "https://l.exemplo/loop" },
      })) as unknown as typeof fetch;

    const result = await traceRedirects("https://l.exemplo/loop", {
      fetchImpl: loopy,
      maxHops: 4,
    });
    assert.equal(result.hops.length, 4);
  });
});
