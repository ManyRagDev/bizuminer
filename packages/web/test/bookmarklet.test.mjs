import assert from "node:assert/strict";
import test from "node:test";
import {
  bookmarkletCompiles,
  bookmarkletHref,
  bookmarkletSource,
  BOOKMARKLET_VERSION,
} from "../lib/bookmarklet.ts";

// Guarda do incidente 25/08/2026: bookmarklet quebrado ao arrastar porque o
// href tinha aspas duplas e quebras de linha (React bloqueia javascript: em
// clique; o href precisa ser arrastável/copiável em uma linha e só aspas simples).

test("bookmarklet compila como JavaScript válido", () => {
  assert.equal(bookmarkletCompiles(), true);
  assert.equal(bookmarkletCompiles({ endpoint: "https://www.bizuminer.com.br/api/capture", token: "tok123" }), true);
});

test("bookmarklet é de uma linha (arrastável/copiável)", () => {
  assert.ok(!/\n/.test(bookmarkletSource()), "não pode ter quebra de linha no href");
});

test("bookmarklet não tem aspas duplas (não quebra o atributo href)", () => {
  assert.ok(!/"/.test(bookmarkletSource()), "só aspas simples no código gerado");
});

test("bookmarkletHref começa com javascript:", () => {
  assert.ok(bookmarkletHref().startsWith("javascript:"));
});

test("bookmarklet contém as peças essenciais do bloco BM1", () => {
  const source = bookmarkletSource();
  assert.ok(source.includes("fnv1a32"), "checksum FNV-1a presente");
  assert.ok(source.includes("b64url"), "base64url presente");
  assert.ok(source.includes("BM1."), "prefixo do bloco presente");
  assert.ok(source.includes("og:price:amount"), "leitura de preço presente");
});

test("bookmarklet injeta endpoint e token quando configurado", () => {
  const source = bookmarkletSource({ endpoint: "https://www.bizuminer.com.br/api/capture", token: "tok123" });
  assert.ok(source.includes("https://www.bizuminer.com.br/api/capture"), "endpoint presente");
  assert.ok(source.includes("tok123"), "token presente");
  assert.ok(source.includes("fetch(ENDPOINT"), "envio direto via fetch presente");
});

test("bookmarklet sem token gera fallback de bloco (envio desativado)", () => {
  const source = bookmarkletSource();
  assert.ok(source.includes("copyBlock(buildBlock(payload))"), "fallback de copiar bloco presente");
});

test("versão do bookmarklet é exposta para o painel", () => {
  assert.equal(typeof BOOKMARKLET_VERSION, "string");
  assert.ok(BOOKMARKLET_VERSION.length > 0);
});
