import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSER_MAX_SELECTION,
  composeLot,
  composeMessage,
  composeOpener,
  composeSingle,
  directLink,
  formatBRL,
} from "../lib/composer.ts";

const BASE = "https://bizuminer.com.br";

const verified = {
  slug: "ml-MLB11111111",
  title: "Lavadora De Alta Pressão Wap 4100",
  priceCents: 148900,
  previousMinPriceCents: 148900,
  observationCount: 6,
  historyDays: 9,
  lowestVerified: true,
};

const drop = {
  slug: "ml-MLB00000001",
  title: "Monitor LG UltraGear 27",
  priceCents: 144900,
  previousMinPriceCents: 148000,
  observationCount: 4,
  historyDays: 8,
  lowestVerified: false,
};

const fresh = {
  slug: "ml-MLB33333333",
  title: "Secador Philco 2200W",
  priceCents: 18990,
  previousMinPriceCents: null,
  observationCount: 1,
  historyDays: 0,
  lowestVerified: false,
};

test("mensagem única contém abertura, título, preço, link e rodapé", () => {
  const message = composeSingle(verified, BASE);
  assert.ok(message.includes("menor preço"));
  assert.ok(message.includes("Lavadora De Alta Pressão Wap 4100"));
  assert.ok(message.includes("R$ 1.489"));
  assert.ok(message.includes(`${BASE}/bizu/ml-MLB11111111?direto=1`));
  assert.ok(message.includes("link de afiliado"));
});

test("directLink aponta para a página de passagem com direto=1", () => {
  assert.equal(directLink(BASE, "ml-MLB11111111"), `${BASE}/bizu/ml-MLB11111111?direto=1`);
});

test("tom de queda usa o percentual real do histórico", () => {
  const message = composeSingle(drop, BASE);
  assert.match(message, /caiu 2%/);
  assert.ok(message.includes("do menor que eu tinha anotado"));
});

test("produto sem histórico usa a variante de descoberta, sem inventar queda", () => {
  const message = composeSingle(fresh, BASE);
  assert.ok(!message.includes("caiu"));
  assert.ok(!message.includes("menor preço"));
});

test("rotação é determinística: mesmo slug gera a mesma mensagem", () => {
  const a = composeSingle(verified, BASE);
  const b = composeSingle(verified, BASE);
  assert.equal(a, b);
});

test("lote numera os produtos e inclui os links", () => {
  const message = composeLot([verified, drop], BASE);
  assert.ok(message.startsWith("bizus de hoje:"));
  assert.ok(message.includes("1. Lavadora De Alta Pressão Wap 4100"));
  assert.ok(message.includes("2. Monitor LG UltraGear 27"));
  assert.ok(message.includes(`${BASE}/bizu/ml-MLB11111111?direto=1`));
  assert.ok(message.includes(`${BASE}/bizu/ml-MLB00000001?direto=1`));
  assert.ok(message.includes("link de afiliado"));
});

test("composeMessage: 1 produto vira mensagem única, 2+ vira lote", () => {
  assert.equal(composeMessage([verified], "whatsapp", BASE), composeSingle(verified, BASE));
  assert.equal(composeMessage([verified, drop], "telegram", BASE), composeLot([verified, drop], BASE));
});

test("composeMessage sem produtos devolve string vazia", () => {
  assert.equal(composeMessage([], "whatsapp", BASE), "");
});

test("composeMessage respeita o teto de seleção do lote", () => {
  const many = Array.from({ length: COMPOSER_MAX_SELECTION + 2 }, (_, i) => ({
    ...fresh,
    slug: `ml-MLB${i}`,
  }));
  const message = composeMessage(many, "whatsapp", BASE);
  assert.ok(!message.includes(`${COMPOSER_MAX_SELECTION + 1}.`));
});

test("destino não altera o texto nesta versão (publicação real é D-5)", () => {
  assert.equal(
    composeMessage([verified, drop], "whatsapp", BASE),
    composeMessage([verified, drop], "telegram", BASE),
  );
});

test("formata preço em pt-BR sem decimais quando inteiro e com decimais quando não", () => {
  assert.equal(formatBRL(148900), "R$ 1.489");
  assert.equal(formatBRL(43746), "R$ 437,46");
  assert.equal(formatBRL(990), "R$ 9,90");
});

test("composeOpener com queda zero não fabrica percentual", () => {
  const flat = {
    slug: "ml-MLB44444444",
    title: "Produto Estável",
    priceCents: 10000,
    previousMinPriceCents: 10000,
    observationCount: 3,
    historyDays: 7,
    lowestVerified: false,
  };
  const opener = composeOpener(flat);
  assert.ok(!opener.includes("caiu 0%"));
});
