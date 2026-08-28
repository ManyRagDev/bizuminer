/**
 * Testes dos primitivos de assinatura da AliExpress (M5).
 *
 * O que estes testes protegem: as duas peças determinísticas que, se
 * estiverem erradas, fazem TODA variante da espiga (`bin/aliexpress-probe.ts`)
 * falhar com "assinatura inválida" — mandando o depurador atrás do algoritmo
 * de hash, que não é o culpado. Removem esse confundidor antes de a espiga
 * rodar contra a API real.
 *
 *   node --test --experimental-strip-types test/aliexpress-signing.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  baseString,
  datetimeGmt8,
  signHmacSha256,
  signMd5Wrapped,
} from "../src/adapters/aliexpress/signing.ts";

describe("datetimeGmt8", () => {
  it("converte UTC para o horário de parede em GMT+8", () => {
    assert.equal(
      datetimeGmt8(new Date("2026-08-27T00:00:00Z")),
      "2026-08-27 08:00:00",
    );
  });

  it("vira o dia quando GMT+8 cruza a meia-noite", () => {
    // 20:00Z + 8h = 04:00 do dia SEGUINTE em Pequim.
    assert.equal(
      datetimeGmt8(new Date("2026-08-27T20:00:00Z")),
      "2026-08-28 04:00:00",
    );
  });

  it("vira o ano na virada", () => {
    assert.equal(
      datetimeGmt8(new Date("2026-12-31T16:00:00Z")),
      "2027-01-01 00:00:00",
    );
  });

  it("preenche mês, dia e hora com zero à esquerda (formato de largura fixa)", () => {
    const out = datetimeGmt8(new Date("2026-01-02T01:02:03Z"));
    assert.equal(out, "2026-01-02 09:02:03");
    assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("não usa o fuso local da máquina (mesmo instante, mesmo resultado)", () => {
    // Se a implementação usasse getHours() em vez de getUTCHours(), este
    // teste passaria só na máquina de quem escreveu.
    const instant = new Date("2026-06-15T12:00:00Z");
    assert.equal(datetimeGmt8(instant), "2026-06-15 20:00:00");
  });
});

describe("baseString", () => {
  it("ordena as chaves por ASCII e concatena k+v sem separador", () => {
    assert.equal(baseString({ b: "2", a: "1", c: "3" }), "a1b2c3");
  });

  it("ordena por ASCII, não alfabeticamente com locale", () => {
    // Maiúsculas vêm antes de minúsculas em ASCII.
    assert.equal(baseString({ a: "1", A: "2" }), "A2a1");
  });

  it("prefixa o caminho quando informado (gateway /rest)", () => {
    assert.equal(
      baseString({ b: "2", a: "1" }, "/aliexpress/affiliate/product/query"),
      "/aliexpress/affiliate/product/querya1b2",
    );
  });

  it("valor vazio entra na base como chave sem valor (não some)", () => {
    assert.equal(baseString({ a: "", b: "1" }), "ab1");
  });

  it("objeto vazio com prefixo devolve só o prefixo", () => {
    assert.equal(baseString({}, "/x"), "/x");
  });
});

describe("variantes de assinatura", () => {
  it("MD5 envolvido é determinístico e hexadecimal maiúsculo", () => {
    const a = signMd5Wrapped("a1b2", "segredo");
    assert.equal(a, signMd5Wrapped("a1b2", "segredo"));
    assert.match(a, /^[0-9A-F]{32}$/);
  });

  it("HMAC-SHA256 é determinístico e hexadecimal maiúsculo", () => {
    const a = signHmacSha256("a1b2", "segredo");
    assert.equal(a, signHmacSha256("a1b2", "segredo"));
    assert.match(a, /^[0-9A-F]{64}$/);
  });

  it("as duas variantes produzem resultados distintos para a mesma entrada", () => {
    // Trava o motivo de a espiga testar ambas: não são intercambiáveis.
    assert.notEqual(signMd5Wrapped("a1b2", "s"), signHmacSha256("a1b2", "s"));
  });

  it("MD5 envolvido não é o mesmo que MD5 da base pura", () => {
    // O segredo envolvendo a base é a peculiaridade do TOP; se alguém
    // "simplificar" para MD5(base), este teste quebra.
    const puro = createHash("md5").update("a1b2", "utf8").digest("hex").toUpperCase();
    assert.notEqual(signMd5Wrapped("a1b2", "s"), puro);
  });

  it("segredo diferente muda a assinatura (o segredo entra de fato)", () => {
    assert.notEqual(signHmacSha256("a1b2", "s1"), signHmacSha256("a1b2", "s2"));
    assert.notEqual(signMd5Wrapped("a1b2", "s1"), signMd5Wrapped("a1b2", "s2"));
  });
});
