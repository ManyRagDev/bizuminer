import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_PAGE_SIZE, catalogStateFromSearchParams, catalogStateToDealQuery, catalogStateToSearchParams, dealQueryFromSearchParams, priceRangeForBand } from "../lib/deal-query.ts";

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
  assert.deepEqual(state, { page: 3, category: "Casa", priceBand: "100_500", sort: "price", search: "cafeteira" });
  assert.deepEqual(catalogStateToDealQuery(state), { limit: CATALOG_PAGE_SIZE, offset: 48, category: "Casa", priceBand: "100_500", sort: "price", search: "cafeteira" });
});

test("mantém a URL curta no estado padrão e serializa apenas o que mudou", () => {
  const defaults = { page: 1, category: null, priceBand: "all", sort: "signal", search: "" };
  assert.equal(catalogStateToSearchParams(defaults).toString(), "");
  assert.equal(catalogStateToSearchParams({ ...defaults, page: 2, search: "fone bluetooth" }).toString(), "pagina=2&busca=fone+bluetooth");
});
