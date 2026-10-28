import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { collectBrowserOffers } from "../src/content/page-extractor.ts";

function card(href: string, price = "11 reais com 05 centavos") {
  const attr = (value: string) => ({ getAttribute: () => value });
  return {
    textContent:
      "Classificação 4.8 de 5 estrelas. Mais de 50mil produtos vendidos.",
    querySelector(selector: string) {
      if (selector === "a.poly-component__title")
        return { href, textContent: "Produto de valor em promoção" };
      if (selector.startsWith(".poly-price")) return attr(price);
      if (selector.startsWith("[aria-label^")) return attr("Antes: 100 reais");
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}
function extract(cards: ReturnType<typeof card>[]) {
  return vm.runInNewContext(`(${collectBrowserOffers.toString()})()`, {
    URL,
    URLSearchParams,
    location: { href: "https://www.mercadolivre.com.br/ofertas" },
    document: { querySelectorAll: () => cards },
    crypto: { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" },
  });
}
test("anúncio no fragmento wid é preservado sem rastreadores; catálogo sozinho é ignorado", () => {
  const url =
    "https://www.mercadolivre.com.br/produto/p/MLB1234567#tracking_id=omitido&wid=MLB9876543210";
  const result = extract([
    card(url),
    card(url),
    card("https://www.mercadolivre.com.br/p/MLB1111111"),
  ]);
  assert.equal(result.products.length, 1);
  assert.equal(result.ignoredCards, 2);
  const p = result.products[0];
  assert.equal(p.externalId, "MLB9876543210");
  assert.equal(
    p.productUrl,
    "https://www.mercadolivre.com.br/produto/p/MLB1234567?wid=MLB9876543210",
  );
  assert.equal(p.priceCents, 1105);
  assert.equal(p.originalPriceCents, 10000);
  assert.equal(p.salesCount, 50000);
  assert.equal(p.ratingStar, 4.8);
});
test("anúncio direto é aceito e preço não reconhecido não vira oferta", () => {
  const result = extract([
    card("https://produto.mercadolivre.com.br/MLB-9876543210-teste_JM"),
    card(
      "https://produto.mercadolivre.com.br/MLB-1111111111-teste_JM",
      "indisponível",
    ),
  ]);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].externalId, "MLB9876543210");
});

test('DOM title beyond legacy limit is complete and minimum price is explicit', () => {
 const title='Transmissor '.repeat(35)+'USB-C 5.3 2 unidades';
 const source=card('https://produto.mercadolivre.com.br/MLB-9876543210-teste_JM','A partir de 11 reais');const previous=source.querySelector;
 source.querySelector=function(selector:string){return selector==='a.poly-component__title'?{href:'https://produto.mercadolivre.com.br/MLB-9876543210-teste_JM',textContent:title}:previous(selector);};
 const p=extract([source]).products[0];assert.equal(p.title,title);assert.equal(p.currency,'BRL');assert.equal(p.priceType,'from');
});
