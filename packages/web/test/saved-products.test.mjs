import assert from "node:assert/strict";
import test from "node:test";
import { mergeSavedProducts, normalizeSavedState, readSavedState, unionSavedIds, writeSavedState } from "../lib/saved-products.ts";

const product = (id, priceCents = 1000) => ({
  id,
  slug: `produto-${id}`,
  title: `Produto ${id}`,
  priceCents,
  originalPriceCents: null,
  previousMinPriceCents: null,
  discountPercent: null,
  imageUrl: null,
  ratingStar: null,
  salesLabel: null,
  salesCount: null,
  evidenceObservedAt: null,
  observationCount: 1,
  historyDays: 0,
  lowestVerified: false,
  category: null,
});

test("normaliza IDs repetidos e descarta snapshots inválidos", () => {
  assert.deepEqual(normalizeSavedState(["a", "a", 2], [product("a"), { id: "x" }]), {
    ids: ["a"],
    products: [product("a")],
  });
});

test("produto visível atualiza o snapshot salvo sem alterar a ordem", () => {
  assert.deepEqual(
    mergeSavedProducts(["b", "a"], [product("a"), product("b")], [product("a", 750)]),
    [product("b"), product("a", 750)],
  );
});

test("leitura corrompida degrada para estado vazio e escrita preserva somente IDs permitidos", () => {
  const data = new Map([["bizuminer:salvos", "{"]]);
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  assert.deepEqual(readSavedState(storage), { ids: [], products: [] });
  writeSavedState(storage, { ids: ["a"], products: [product("a"), product("b")] });
  assert.deepEqual(readSavedState(storage), { ids: ["a"], products: [product("a")] });
});

test("unionSavedIds deduplica local + conta preservando a ordem e descartando inválidos", () => {
  assert.deepEqual(unionSavedIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(unionSavedIds([], ["c"]), ["c"]);
  assert.deepEqual(unionSavedIds(["a"], []), ["a"]);
  assert.deepEqual(unionSavedIds(["a", "", 3, "a"], ["b"]), ["a", "b"]);
  assert.deepEqual(unionSavedIds(["b"], ["a", "b"]), ["b", "a"]);
  assert.deepEqual(unionSavedIds(), []);
});
