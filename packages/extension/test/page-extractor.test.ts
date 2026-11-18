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

test("extração funciona em páginas de busca e categorias além de /ofertas", () => {
  const searchResult = vm.runInNewContext(`(${collectBrowserOffers.toString()})()`, {
    URL,
    URLSearchParams,
    location: { href: "https://lista.mercadolivre.com.br/teclado-mecanico" },
    document: { querySelectorAll: () => [card("https://produto.mercadolivre.com.br/MLB-999888777-teclado_JM", "199 reais")] },
    crypto: { randomUUID: () => "uuid-search" },
  });
  assert.equal(searchResult.products.length, 1);
  assert.equal(searchResult.page.kind, "search");
  assert.equal(searchResult.products[0].externalId, "MLB999888777");

  const categoryResult = vm.runInNewContext(`(${collectBrowserOffers.toString()})()`, {
    URL,
    URLSearchParams,
    location: { href: "https://www.mercadolivre.com.br/c/informatica" },
    document: { querySelectorAll: () => [card("https://produto.mercadolivre.com.br/MLB-111222333-mouse_JM", "89 reais")] },
    crypto: { randomUUID: () => "uuid-cat" },
  });
  assert.equal(categoryResult.products.length, 1);
  assert.equal(categoryResult.page.kind, "category");
  assert.equal(categoryResult.products[0].externalId, "MLB111222333");
});

test("em página de produto (PDP) do Mercado Livre captura apenas o anúncio vigente e ignora carrossel de relacionados", () => {
  const pdpResult = vm.runInNewContext(`(${collectBrowserOffers.toString()})()`, {
    URL,
    URLSearchParams,
    location: {
      href: "https://www.mercadolivre.com.br/samsung-smart-tv-43-qled/p/MLB63467528?wid=MLB7479165346&matt_word=bizu",
    },
    document: {
      querySelector(selector: string) {
        if (selector === "h1.ui-pdp-title") return { textContent: "Samsung Smart TV 43 QLED Full HD" };
        if (selector.startsWith(".ui-pdp-price__second-line")) {
          return { getAttribute: () => "1.599 reais com 90 centavos", querySelector: () => ({ getAttribute: () => "1.599 reais com 90 centavos" }) };
        }
        if (selector.startsWith(".ui-pdp-price__original-value")) {
          return { getAttribute: () => "Antes: 2.199 reais" };
        }
        if (selector.startsWith("img.ui-pdp-image")) {
          return { src: "https://http2.mlstatic.com/D_NQ_NP_2X_12345-MLB.webp" };
        }
        if (selector === ".ui-pdp-subtitle") {
          return { textContent: "Novo | +10 mil vendidos" };
        }
        if (selector === ".ui-pdp-review__rating") {
          return { textContent: "4.9" };
        }
        return null;
      },
      querySelectorAll(selector: string) {
        if (selector === "script") return [];
        if (selector.startsWith(".poly-card")) {
          return [
            card("https://produto.mercadolivre.com.br/MLB-1111111111-relacionado1_JM", "50 reais"),
            card("https://produto.mercadolivre.com.br/MLB-2222222222-relacionado2_JM", "60 reais"),
          ];
        }
        return [];
      },
    },
    crypto: { randomUUID: () => "123e4567-e89b-42d3-a456-426614174099" },
  });
  assert.equal(pdpResult.page.kind, "product");
  assert.equal(pdpResult.page.url, "https://www.mercadolivre.com.br/samsung-smart-tv-43-qled/p/MLB63467528?wid=MLB7479165346");
  assert.equal(pdpResult.products.length, 1);
  assert.equal(pdpResult.ignoredCards, 0);
  const p = pdpResult.products[0];
  assert.equal(p.externalId, "MLB7479165346");
  assert.equal(p.title, "Samsung Smart TV 43 QLED Full HD");
  assert.equal(p.productUrl, "https://www.mercadolivre.com.br/samsung-smart-tv-43-qled/p/MLB63467528?wid=MLB7479165346");
  assert.equal(p.priceCents, 159990);
  assert.equal(p.originalPriceCents, 219900);
  assert.equal(p.ratingStar, 4.9);
  assert.equal(p.salesCount, 10000);
});
