import test from "node:test";
import assert from "node:assert/strict";
import { coverBlockers, selectCoverProduct } from "../lib/home-cover.ts";
import { toVitrineProduct } from "../lib/deal-view.ts";

const now = new Date("2026-10-28T12:00:00Z");
const product = {
  id: "reviewed", slug: "reviewed", title: "Título da fonte",
  displayTitle: "Transmissor para dois fones", titleOrigin: "editorial", editorialRevisionId: "revision",
  coverHeadline: "O mesmo filme. Dois fones.", coverImageApproved: true,
  benefit: "Compartilhe o áudio de uma saída compatível com dois fones.",
  imageUrl: "https://example.test/product.jpg", priceCents: 2500, priceType: "exact", currency: "BRL",
  evidenceObservedAt: now.toISOString(),
};

test("a capa preserva a ordem editorial, ignora inaptos e mostra somente um produto", () => {
  const pool = [{ ...product, id: "unreviewed", coverImageApproved: false }, product, { ...product, id: "third" }];
  assert.equal(selectCoverProduct(pool, now), product);
  assert.equal(selectCoverProduct([], now), null);
  assert.deepEqual(coverBlockers(product, now), []);
});

test("texto bruto, imagem não revisada e ficha invalidada nunca preenchem a capa", () => {
  for (const changes of [
    { titleOrigin: "source" }, { editorialRevisionId: undefined }, { coverHeadline: undefined },
    { coverImageApproved: false }, { coverImageApproved: undefined }, { imageUrl: null },
    { displayTitle: "x".repeat(91) }, { benefit: "x".repeat(161) }, { coverHeadline: "x".repeat(73) },
  ]) assert.equal(selectCoverProduct([{ ...product, ...changes }], now), null);
});

test("preço ambíguo, moeda desconhecida, datas inválidas ou vencidas usam a arte da marca", () => {
  for (const changes of [
    { priceType: "range" }, { priceType: "from" }, { priceType: undefined }, { currency: undefined },
    { priceCents: 0 }, { evidenceObservedAt: null }, { evidenceObservedAt: "invalid" },
    { evidenceObservedAt: new Date(+now + 1).toISOString() },
    { evidenceObservedAt: new Date(+now - 48 * 3600000 - 1).toISOString() },
  ]) assert.equal(selectCoverProduct([{ ...product, ...changes }], now), null);
  assert.equal(selectCoverProduct([{ ...product, evidenceObservedAt: new Date(+now - 48 * 3600000).toISOString() }], now)?.id, product.id);
});

test("a projeção para a vitrine transporta a aprovação da capa sem inventá-la para dados antigos", () => {
  const row = { id: "id", title: "Título", coverHeadline: product.coverHeadline, coverImageApproved: true };
  assert.equal(toVitrineProduct(row).coverHeadline, product.coverHeadline);
  assert.equal(toVitrineProduct(row).coverImageApproved, true);
  assert.equal(toVitrineProduct({ id: "legacy", title: "Bruto" }).coverImageApproved, undefined);
});
