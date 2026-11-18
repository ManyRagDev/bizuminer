import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { buildProductOfferQuery, buildGenerateShortLinkMutation, PRODUCT_OFFER_QUERY } from "../src/adapters/shopee/queries.ts";
import { ShopeeAdapter } from "../src/adapters/shopee/index.ts";
import { CaptureError } from "../src/errors.ts";

const ctx = { runId: "synthetic", log: () => {} };
const cred = { marketplace: "shopee", secret: { appId: "app", appSecret: "secret" } };

test("literal ProductOffer preserva seleção, omite null/undefined, mantém zeros e escapa texto", () => {
  const keyword = 'fone "}) { injected } #\\\nç';
  const query = buildProductOfferQuery({ keyword, shopId: 0, productCatId: undefined, sortType: 2, page: 1, limit: 10 });
  assert.ok(query.includes(`keyword: ${JSON.stringify(keyword)}`));
  assert.match(query, /shopId: 0, page: 1, limit: 10, sortType: 2/);
  assert.doesNotMatch(query, /\$|listType:|productCatId:|: null/);
  assert.doesNotMatch(query, /\bprice\b/);
  assert.match(query, /\bpriceMin\b/);
  assert.match(query, /\bpriceMax\b/);
  const selection = (value: string) => value.slice(value.indexOf("nodes {")).replace(/\s+/g, "").replace(/}+$/, "");
  assert.equal(selection(query), selection(PRODUCT_OFFER_QUERY));
  assert.match(buildProductOfferQuery({}), /productOfferV2 \{/);
  assert.doesNotMatch(buildProductOfferQuery({ keyword: null, shopId: undefined }), /keyword:|shopId:/);
  for (const sortType of [1, 2, 3, 4, 5]) assert.ok(buildProductOfferQuery({ keyword: "fone", sortType }).includes(`sortType: ${sortType}`));
  for (const values of [{ sortType: 0 }, { sortType: 6 }, { sortType: 1 }, { productCatId: 100636, listType: 0 }, { limit: NaN }, { shopId: Infinity }, { page: 1.5 }, { limit: "10" }, { page: 2147483648 }, { arbitraryField: 1 }, { keyword: { toString: () => "injection" } }]) {
    assert.throws(() => buildProductOfferQuery(values), { kind: "marketplace_error", message: "graphql_input_invalid" });
  }
});

test("literal shortlink tem input fechado e escapa URL e subIds", () => {
  const originUrl = 'https://shopee.com.br/a?x="} #\n';
  const subIds = ['id"} mutation injected {', "barra\\fim"];
  assert.equal(buildGenerateShortLinkMutation({ originUrl, subIds }),
    `mutation GenerateShortLink { generateShortLink(input: {originUrl: ${JSON.stringify(originUrl)}, subIds: [${subIds.map((value) => JSON.stringify(value)).join(", ")}]}) { shortLink } }`);
  assert.throws(() => buildGenerateShortLinkMutation({ originUrl, subIds: [1 as unknown as string] }), { message: "graphql_input_invalid" });
  assert.throws(() => buildGenerateShortLinkMutation({ originUrl, subIds: Array(6).fill("x") }), { message: "graphql_input_invalid" });
});

test("adapter envia ofertas e shortlink literais com variables vazio e assina o mesmo corpo", async () => {
  const bodies: Array<{ query: string; variables: unknown }> = [];
  const adapter = new ShopeeAdapter({ now: () => 1_700_000_000_000, ratePerSecond: 1000, fetchImpl: async (_url, init) => {
    const serialized = String(init?.body);
    const body = JSON.parse(serialized);
    bodies.push(body);
    assert.deepEqual(body.variables, {});
    const signature = createHash("sha256").update(`app1700000000${serialized}secret`).digest("hex");
    assert.equal(new Headers(init?.headers).get("authorization"), `SHA256 Credential=app, Timestamp=1700000000, Signature=${signature}`);
    return Response.json({ data: body.query.startsWith("mutation")
      ? { generateShortLink: { shortLink: "https://shope.ee/synthetic" } }
      : { productOfferV2: { nodes: [], pageInfo: { hasNextPage: false } } } });
  } });
  await adapter.fetchOffers(cred, { keyword: "fone", pageSize: 10 }, ctx);
  assert.equal(await adapter.buildAffiliateLink(cred, "https://shopee.com.br/a", { marketplace: "shopee", trackingId: "test", subIds: ["publication"] }, ctx), "https://shope.ee/synthetic");
  assert.equal(bodies[0]?.query, buildProductOfferQuery({ keyword: "fone", page: 1, limit: 10, sortType: 2 }));
  assert.equal(bodies[1]?.query, buildGenerateShortLinkMutation({ originUrl: "https://shopee.com.br/a", subIds: ["publication"] }));
});

test("literal não repete nem reduz página diante de erro GraphQL determinístico", async () => {
  let calls = 0;
  const adapter = new ShopeeAdapter({ ratePerSecond: 1000, fetchImpl: async () => {
    calls++;
    return Response.json({ errors: [{ message: "graphql: got null for non-null", extensions: { code: 10000 } }] });
  } });
  await assert.rejects(adapter.fetchOffers(cred, { keyword: "fone", pageSize: 50 }, ctx), (error: unknown) => {
    assert.ok(error instanceof CaptureError);
    assert.equal(error.kind, "marketplace_error");
    assert.equal(error.retryable, false);
    assert.equal(error.message, "graphql_contract_error");
    return true;
  });
  assert.equal(calls, 1);
});
