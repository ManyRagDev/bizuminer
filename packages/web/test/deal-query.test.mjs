import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_PAGE_SIZE, catalogStateFromSearchParams, catalogStateToDealQuery, catalogStateToSearchParams, dealQueryFromSearchParams, priceRangeForBand, shouldInterleaveMarketplaces } from "../lib/deal-query.ts";

test("normaliza paginação e ignora opções fora do contrato", () => {
  const query = dealQueryFromSearchParams(new URLSearchParams("limit=999&offset=-2&sort=qualquer&price=x&category=%20Casa%20&q=%20cafeteira%20"));
  assert.equal(query.limit, 24);
  assert.equal(query.offset, 0);
  assert.equal(query.sort, "signal");
  assert.equal(query.priceBand, "all");
  assert.equal(query.category, "Casa");
  assert.equal(query.search, "cafeteira");
});

test("traduz faixas de preço para limites inclusivos consistentes", () => {
  assert.deepEqual(priceRangeForBand("under_100"), { min: null, max: 10_000 });
  assert.deepEqual(priceRangeForBand("100_500"), { min: 10_001, max: 50_000 });
  assert.deepEqual(priceRangeForBand("over_500"), { min: 50_001, max: null });
});

test("restaura página, busca, filtros e ordenação a partir da URL pública", () => {
  const state = catalogStateFromSearchParams(new URLSearchParams("pagina=3&categoria=Casa&preco=100_500&ordem=price&busca=%20cafeteira%20"));
  assert.deepEqual(state, { page: 3, category: "Casa", priceBand: "100_500", sort: "price", search: "cafeteira", marketplace: null });
  assert.deepEqual(catalogStateToDealQuery(state), { limit: CATALOG_PAGE_SIZE, offset: 48, category: "Casa", priceBand: "100_500", sort: "price", search: "cafeteira", marketplace: null });
});

test("mantém a URL curta no estado padrão e serializa apenas o que mudou", () => {
  const defaults = { page: 1, category: null, priceBand: "all", sort: "signal", search: "", marketplace: null };
  assert.equal(catalogStateToSearchParams(defaults).toString(), "");
  assert.equal(catalogStateToSearchParams({ ...defaults, page: 2, search: "fone bluetooth" }).toString(), "pagina=2&busca=fone+bluetooth");
});

test("loja= aceita apenas marketplace conhecido; valor inválido vira 'todas' (não erro)", () => {
  const known = catalogStateFromSearchParams(new URLSearchParams("loja=shopee"));
  assert.equal(known.marketplace, "shopee");
  const unknown = catalogStateFromSearchParams(new URLSearchParams("loja=amazon"));
  assert.equal(unknown.marketplace, null);
});

test("catalogStateToSearchParams inclui loja= só quando marketplace está definido", () => {
  const defaults = { page: 1, category: null, priceBand: "all", sort: "signal", search: "", marketplace: null };
  assert.equal(catalogStateToSearchParams({ ...defaults, marketplace: "shopee" }).toString(), "loja=shopee");
});

test("dealQueryFromSearchParams: marketplace desconhecido normaliza para null", () => {
  assert.equal(dealQueryFromSearchParams(new URLSearchParams("marketplace=amazon")).marketplace, null);
  assert.equal(dealQueryFromSearchParams(new URLSearchParams("marketplace=shopee")).marketplace, "shopee");
});

test("intercala lojas na vitrine curada (padrão) — home sempre mostra as duas", () => {
  assert.equal(shouldInterleaveMarketplaces({}), true, "sem sort explícito o padrão é signal");
  assert.equal(shouldInterleaveMarketplaces({ sort: "signal", marketplace: null }), true);
});

test("NÃO intercala quando a pessoa pediu uma ordenação explícita", () => {
  // Se intercalasse, 'menor preço' poria um item de R$500 acima de um de R$100.
  assert.equal(shouldInterleaveMarketplaces({ sort: "price" }), false);
  assert.equal(shouldInterleaveMarketplaces({ sort: "popularity" }), false);
  assert.equal(shouldInterleaveMarketplaces({ sort: "recent" }), false);
});

test("NÃO intercala quando há filtro de loja (uma partição só)", () => {
  assert.equal(shouldInterleaveMarketplaces({ sort: "signal", marketplace: "shopee" }), false);
  assert.equal(shouldInterleaveMarketplaces({ sort: "signal", marketplace: "mercadolivre" }), false);
});

test("marketplace vazio/espaços conta como ausente (intercala)", () => {
  assert.equal(shouldInterleaveMarketplaces({ sort: "signal", marketplace: "" }), true);
  assert.equal(shouldInterleaveMarketplaces({ sort: "signal", marketplace: "   " }), true);
});
