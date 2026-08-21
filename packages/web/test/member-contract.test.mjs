import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedProfileCategories,
  movementLabel,
  parseFavoriteBulkPayload,
  parseFavoritePayload,
  parseProfilePayload,
  parseWatchPayload,
  validUserId,
  watchMovement,
} from "../lib/member-contract.ts";

const brl = (cents) => `R$ ${(cents / 100).toFixed(2)}`;

test("validUserId aceita só UUID", () => {
  assert.equal(validUserId("0d539916-c495-41ea-b569-a3b3f714d3e1"), true);
  assert.equal(validUserId("not-a-uuid"), false);
  assert.equal(validUserId(""), false);
  assert.equal(validUserId(undefined), false);
  assert.equal(validUserId(42), false);
});

test("parseFavoritePayload valida produto e flag", () => {
  assert.deepEqual(parseFavoritePayload({ productId: "abc", saved: true }), { productId: "abc", saved: true });
  assert.equal(parseFavoritePayload({ productId: "abc" }), null);
  assert.equal(parseFavoritePayload({ productId: "", saved: true }), null);
  assert.equal(parseFavoritePayload({ productId: "a b", saved: true }), null);
  assert.equal(parseFavoritePayload(null), null);
  assert.equal(parseFavoritePayload("texto"), null);
});

test("parseFavoriteBulkPayload deduplica e descarta inválidos em silêncio", () => {
  const parsed = parseFavoriteBulkPayload({ productIds: ["a", "a", "b", "", 3, "c d"] });
  assert.deepEqual(parsed, { productIds: ["a", "b"] });
  assert.equal(parseFavoriteBulkPayload({ productIds: "a" }), null);
});

test("parseFavoriteBulkPayload limita o lote a 200 ids", () => {
  const ids = Array.from({ length: 300 }, (_, index) => `produto-${index}`);
  const parsed = parseFavoriteBulkPayload({ productIds: ids });
  assert.equal(parsed.productIds.length, 200);
});

test("parseWatchPayload aceita alvo opcional e rejeita alvo inválido", () => {
  assert.deepEqual(parseWatchPayload({ productId: "abc" }), { productId: "abc", targetPriceCents: null });
  assert.deepEqual(parseWatchPayload({ productId: "abc", targetPriceCents: 9900 }), { productId: "abc", targetPriceCents: 9900 });
  assert.equal(parseWatchPayload({ productId: "abc", targetPriceCents: 0 }), null);
  assert.equal(parseWatchPayload({ productId: "abc", targetPriceCents: 12.5 }), null);
  assert.equal(parseWatchPayload({ productId: "abc", targetPriceCents: 200_000_000 }), null);
});

test("parseProfilePayload filtra categorias fora do catálogo real", () => {
  const parsed = parseProfilePayload(
    { preferredCategories: ["tech", "inventada", "casa", "tech"], priceBand: "under_100" },
    ["tech", "casa", "beleza"],
  );
  assert.deepEqual(parsed, { preferredCategories: ["tech", "casa"], priceBand: "under_100" });
  assert.equal(parseProfilePayload({ preferredCategories: [], priceBand: "gratis" }, ["tech"]), null);
  assert.equal(parseProfilePayload({ preferredCategories: "tech", priceBand: "all" }, ["tech"]), null);
});

test("allowedProfileCategories soma catálogo e escolhas já gravadas, sem duplicar", () => {
  assert.deepEqual(
    allowedProfileCategories(["Casa", "Fitness"], ["Moda", "Casa"]),
    ["Casa", "Fitness", "Moda"],
  );
  assert.deepEqual(allowedProfileCategories([], ["Moda"]), ["Moda"]);
  assert.deepEqual(allowedProfileCategories(["Casa"], []), ["Casa"]);
});

// Defeito real de 19/08: uma varredura de 1 página tirou "Moda" e "Ferramentas"
// da lista corrente, e salvar o perfil apagava as duas em silêncio.
test("categoria fora da varredura atual sobrevive ao salvamento do perfil", () => {
  const catalogoInteiro = ["Beleza", "Casa", "Ferramentas", "Fitness", "Moda", "Suplementos", "Tecnologia"];
  const varreduraCurta = ["Beleza", "Casa", "Fitness", "Suplementos", "Tecnologia"];

  // Como era: validar contra a varredura corrente descartava as ausentes.
  assert.deepEqual(
    parseProfilePayload({ preferredCategories: ["Moda", "Casa", "Ferramentas"], priceBand: "all" }, varreduraCurta),
    { preferredCategories: ["Casa"], priceBand: "all" },
  );

  // Como ficou: o catálogo inteiro é a referência, nada é perdido.
  assert.deepEqual(
    parseProfilePayload(
      { preferredCategories: ["Moda", "Casa", "Ferramentas"], priceBand: "all" },
      allowedProfileCategories(catalogoInteiro, []),
    ),
    { preferredCategories: ["Moda", "Casa", "Ferramentas"], priceBand: "all" },
  );

  // E uma preferência já gravada resiste mesmo se sumir do catálogo inteiro.
  assert.deepEqual(
    parseProfilePayload(
      { preferredCategories: ["Descontinuada"], priceBand: "all" },
      allowedProfileCategories(varreduraCurta, ["Descontinuada"]),
    ),
    { preferredCategories: ["Descontinuada"], priceBand: "all" },
  );
});

test("watchMovement deriva queda, alta, estabilidade e ausência de registro", () => {
  assert.deepEqual(watchMovement(10000, 6800), { state: "down", deltaCents: 3200, percent: 32 });
  assert.deepEqual(watchMovement(10000, 11500), { state: "up", deltaCents: 1500, percent: 15 });
  assert.deepEqual(watchMovement(10000, 10000), { state: "same" });
  assert.deepEqual(watchMovement(10000, null), { state: "unknown" });
  assert.deepEqual(watchMovement(0, 5000), { state: "unknown" });
});

test("movementLabel fala em linguagem literal", () => {
  assert.equal(movementLabel(watchMovement(10000, 6800), brl, "14/08"), "caiu R$ 32.00 desde 14/08");
  assert.equal(movementLabel(watchMovement(10000, 11500), brl, "14/08"), "subiu R$ 15.00 desde 14/08");
  assert.equal(movementLabel(watchMovement(10000, 10000), brl, "14/08"), "preço igual ao do dia em que você marcou (14/08)");
  assert.equal(movementLabel(watchMovement(10000, null), brl, "14/08"), "sem registro de preço desde a marcação");
});
