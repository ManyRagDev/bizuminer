import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { decodeManualCaptureBlock } from "../lib/manual-capture.ts";
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

test("bookmarklet não embute credencial nem envia direto", () => {
  const source = bookmarkletSource();
  assert.ok(source.includes("copyBlock(buildBlock(payload))"), "cópia do bloco presente");
  assert.ok(!source.includes("CAPTURE_TOKEN"), "sem token global");
  assert.ok(!source.includes("fetch("), "sem bypass do endpoint autenticado");
});

test("versão do bookmarklet é exposta para o painel", () => {
  assert.equal(typeof BOOKMARKLET_VERSION, "string");
  assert.ok(BOOKMARKLET_VERSION.length > 0);
});

test("bookmarklet preserves full source title, actual listing, currency and lower-bound price into BM1", () => {
  const title = "Transmissor ".repeat(35) + "USB-C | Kit com 2 unidades";
  const page = new URL("https://www.mercadolivre.com.br/transmissor/p/MLB1234567?wid=MLB9876543210");
  const meta = (property, content) => ({ getAttribute: key => key === "property" ? property : key === "content" ? content : null });
  let block;
  vm.runInNewContext(bookmarkletSource(), {
    URL, URLSearchParams, TextEncoder, btoa,
    window: { location: { href: page.href, pathname: page.pathname } },
    document: {
      title,
      querySelectorAll(selector) {
        if (selector === "meta") return [meta("og:title", title)];
        if (selector === "link") return [{ getAttribute: key => key === "rel" ? "canonical" : page.origin + page.pathname }];
        if (selector === ".andes-money-amount") return [{ getAttribute: () => "A partir de 137 reais" }];
        return [];
      },
    },
    navigator: {}, prompt: (_label, value) => { block = value; },
    alert: message => { throw Error(message); },
  });
  const payload = decodeManualCaptureBlock(block);
  assert.equal(payload.t, title);
  assert.equal(payload.i, "MLB9876543210");
  assert.equal(new URL(payload.u).searchParams.get("wid"), payload.i);
  assert.equal(payload.currency, "BRL");
  assert.equal(payload.priceType, "from");
  assert.equal(payload.p, 13700);
});
