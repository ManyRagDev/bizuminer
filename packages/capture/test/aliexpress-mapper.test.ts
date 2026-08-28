/**
 * Testes do mapeamento da AliExpress (M5).
 *
 * O foco é a armadilha de moeda: a resposta traz o mesmo preço em CNY e em
 * BRL, e os campos de nome mais óbvio (`sale_price`, `original_price`) são os
 * em CNY. Ler o campo errado grava preço de yuan rotulado como real — bug
 * silencioso, plausível e corrosivo num produto que promete acompanhar preço.
 * Estes testes existem para que essa troca quebre a build, não a confiança.
 *
 *   node --test --experimental-strip-types test/aliexpress-mapper.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapProductNodes, percentToRate } from "../src/adapters/aliexpress/mapper.ts";

/** Produto real devolvido pela API em 28/08/2026, campos preservados. */
const produtoReal = {
  product_id: "1005012905074760",
  product_title: "Fone de Ouvido Bluetooth HTC com Som Surround Hi-Fi",
  product_detail_url: "https://pt.aliexpress.com/item/1005012905074760.html",
  promotion_link: "https://s.click.aliexpress.com/s/fwx308cRD9Eny963",
  product_main_image_url: "https://ae-pic-a1.aliexpress-media.com/kf/S61e37.jpg",
  // Os pares de moeda, exatamente como a API devolve:
  sale_price: "119.82",
  sale_price_currency: "CNY",
  original_price: "266.26",
  original_price_currency: "CNY",
  target_sale_price: "99.69",
  target_sale_price_currency: "BRL",
  target_original_price: "221.53",
  target_original_price_currency: "BRL",
  discount: "54%",
  commission_rate: "7.0%",
  lastest_volume: 25,
  evaluate_rate: "100.0%",
  first_level_category_name: "Eletrônicos",
  second_level_category_name: "Aparelhos audiovisuais portáteis",
  shop_id: 1105436749,
};

const capturedAt = new Date("2026-08-28T12:00:00Z");

describe("mapProductNodes — moeda", () => {
  it("usa o preço em BRL (target_*), NUNCA o em CNY", () => {
    const { offers } = mapProductNodes([produtoReal], capturedAt, "BRL");
    assert.equal(offers.length, 1);
    const o = offers[0]!;
    // 99.69 BRL = 9969 centavos. Se ler sale_price seria 11982 (CNY).
    assert.equal(o.priceCents, 9969, "leu o campo em CNY em vez do BRL");
    assert.notEqual(o.priceCents, 11982, "gravou yuan como real");
    assert.equal(o.originalPriceCents, 22153);
    assert.notEqual(o.originalPriceCents, 26626, "preço 'de' veio em yuan");
  });

  it("descarta a oferta quando a moeda declarada não é a pedida", () => {
    const emCny = { ...produtoReal, target_sale_price_currency: "CNY" };
    const { offers, skippedByCurrency } = mapProductNodes([emCny], capturedAt, "BRL");
    assert.equal(offers.length, 0, "aceitou oferta em moeda errada");
    assert.equal(skippedByCurrency, 1);
  });

  it("descarta quando a moeda não vem declarada (não presume)", () => {
    const semMoeda = { ...produtoReal, target_sale_price_currency: undefined };
    const { offers, skippedByCurrency } = mapProductNodes([semMoeda], capturedAt, "BRL");
    assert.equal(offers.length, 0);
    assert.equal(skippedByCurrency, 1);
  });

  it("ignora o preço 'de' se ele vier em moeda diferente do preço atual", () => {
    const misto = { ...produtoReal, target_original_price_currency: "CNY" };
    const { offers } = mapProductNodes([misto], capturedAt, "BRL");
    assert.equal(offers[0]!.priceCents, 9969);
    assert.equal(offers[0]!.originalPriceCents, undefined, "misturou moedas no 'de/por'");
  });

  it("ignora preço 'de' menor ou igual ao atual (desconto negativo não existe)", () => {
    const invertido = { ...produtoReal, target_original_price: "50.00" };
    const { offers } = mapProductNodes([invertido], capturedAt, "BRL");
    assert.equal(offers[0]!.originalPriceCents, undefined);
  });
});

describe("mapProductNodes — campos", () => {
  it("prefere o promotion_link ao link cru (o cru não gera comissão)", () => {
    const { offers } = mapProductNodes([produtoReal], capturedAt, "BRL");
    assert.match(offers[0]!.productUrl, /s\.click\.aliexpress\.com/);
  });

  it("cai no detail_url quando não há promotion_link", () => {
    const semPromo = { ...produtoReal, promotion_link: undefined };
    const { offers } = mapProductNodes([semPromo], capturedAt, "BRL");
    assert.match(offers[0]!.productUrl, /pt\.aliexpress\.com\/item/);
  });

  it("NÃO inventa nota em estrelas a partir de evaluate_rate", () => {
    // evaluate_rate é % de avaliações positivas, não média de 0 a 5.
    // Converter seria afirmar o que a loja não afirmou.
    const { offers } = mapProductNodes([produtoReal], capturedAt, "BRL");
    assert.equal(offers[0]!.ratingStar, undefined);
  });

  it("volume de vendas é contagem, não dinheiro (25 vendas, não 2500)", () => {
    const { offers } = mapProductNodes([produtoReal], capturedAt, "BRL");
    assert.equal(offers[0]!.salesCount, 25);
  });

  it("monta a trilha de categoria a partir dos dois níveis", () => {
    const { offers } = mapProductNodes([produtoReal], capturedAt, "BRL");
    assert.deepEqual(offers[0]!.categoryPath, [
      "Eletrônicos",
      "Aparelhos audiovisuais portáteis",
    ]);
  });

  it("descarta nó sem id, título ou url — sem derrubar o lote", () => {
    const ruins = [
      { ...produtoReal, product_id: undefined },
      { ...produtoReal, product_title: "  " },
      { ...produtoReal, promotion_link: undefined, product_detail_url: undefined },
    ];
    const { offers, skipped } = mapProductNodes([...ruins, produtoReal], capturedAt, "BRL");
    assert.equal(skipped, 3);
    assert.equal(offers.length, 1, "uma oferta ruim não pode derrubar as boas");
  });
});

describe("percentToRate", () => {
  it("converte percentual textual em fração", () => {
    assert.equal(percentToRate("54%"), 0.54);
    assert.equal(percentToRate("7.0%"), 0.07);
    assert.equal(percentToRate("100.0%"), 1);
    assert.equal(percentToRate("0%"), 0);
  });

  it("aceita vírgula decimal", () => {
    assert.equal(percentToRate("7,5%"), 0.075);
  });

  it("recusa valores impossíveis e lixo", () => {
    assert.equal(percentToRate("150%"), undefined);
    assert.equal(percentToRate("abc"), undefined);
    assert.equal(percentToRate(undefined), undefined);
    assert.equal(percentToRate(""), undefined);
  });
});
