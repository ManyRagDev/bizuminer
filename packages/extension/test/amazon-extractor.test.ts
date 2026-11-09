import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmazonPrice,
  extractAsinFromUrl,
  extractAmazonProductHtml,
  extractAmazonCardHtml,
} from "../src/content/amazon-extractor.ts";

const PDP_HTML = `
<html>
<head><title>Echo Dot 5ª Geração</title></head>
<body>
  <input type="hidden" id="ASIN" value="B08N5WRWNW" />
  <span id="productTitle">   Echo Dot 5ª geração Smart Speaker com Alexa Cor Preta   </span>
  <div id="corePriceDisplay_desktop_feature_div">
    <div class="priceToPay">
      <span class="a-offscreen">R$ 399,00</span>
    </div>
    <div class="basisPrice">
      <span class="a-offscreen">R$ 429,00</span>
    </div>
  </div>
  <div id="imgTagWrapperId">
    <img id="landingImage" src="https://m.media-amazon.com/images/I/71C355VsmUL._AC_SX679_.jpg" />
  </div>
</body>
</html>
`;

const CARD_HTML = `
<div data-asin="B09SWW583J" class="s-result-item">
  <h2><a class="a-link-normal"><span>Kindle 11ª Geração Cor Preta 16GB</span></a></h2>
  <div class="a-price">
    <span class="a-offscreen">R$ 499,90</span>
  </div>
  <div class="a-text-price">
    <span class="a-offscreen">R$ 549,00</span>
  </div>
  <img class="s-image" src="https://m.media-amazon.com/images/I/61b3A1P2y+L._AC_UY218_.jpg" />
</div>
`;

describe("amazon-extractor: parseAmazonPrice", () => {
  it("converte valores em formato brasileiro com centavos", () => {
    assert.equal(parseAmazonPrice("R$ 149,90"), 14990);
    assert.equal(parseAmazonPrice("R$1.499,00"), 149900);
    assert.equal(parseAmazonPrice("29,99"), 2999);
  });

  it("converte valores inteiros sem centavos", () => {
    assert.equal(parseAmazonPrice("399"), 39900);
    assert.equal(parseAmazonPrice("R$ 1.200"), 120000);
  });

  it("devolve null para valores inválidos ou vazios", () => {
    assert.equal(parseAmazonPrice(""), null);
    assert.equal(parseAmazonPrice(null), null);
    assert.equal(parseAmazonPrice(undefined), null);
    assert.equal(parseAmazonPrice("grátis"), null);
  });
});

describe("amazon-extractor: extractAsinFromUrl", () => {
  it("extrai ASIN de URLs padrão /dp/ e /gp/product/", () => {
    assert.equal(extractAsinFromUrl("https://www.amazon.com.br/dp/B08N5WRWNW"), "B08N5WRWNW");
    assert.equal(extractAsinFromUrl("https://www.amazon.com.br/Echo-Dot/dp/B08N5WRWNW?ref_=ast_sto_dp"), "B08N5WRWNW");
    assert.equal(extractAsinFromUrl("https://www.amazon.com.br/gp/product/B09SWW583J"), "B09SWW583J");
  });

  it("rejeita URLs de busca ou sem ASIN", () => {
    assert.equal(extractAsinFromUrl("https://www.amazon.com.br/s?k=echo"), null);
    assert.equal(extractAsinFromUrl("https://www.amazon.com.br/deals"), null);
  });
});

describe("amazon-extractor: extractAmazonProductHtml", () => {
  it("extrai produto completo a partir do PDP", () => {
    const product = extractAmazonProductHtml(PDP_HTML, "https://www.amazon.com.br/dp/B08N5WRWNW");
    assert.ok(product);
    assert.equal(product.externalId, "B08N5WRWNW");
    assert.equal(product.title, "Echo Dot 5ª geração Smart Speaker com Alexa Cor Preta");
    assert.equal(product.productUrl, "https://www.amazon.com.br/dp/B08N5WRWNW");
    assert.equal(product.priceCents, 39900);
    assert.equal(product.originalPriceCents, 42900);
    assert.equal(product.currency, "BRL");
    assert.equal(product.priceType, "exact");
    assert.equal(product.marketplace, "amazon");
    assert.equal(product.imageUrl, "https://m.media-amazon.com/images/I/71C355VsmUL._AC_SX679_.jpg");
  });

  it("ignora originalPriceCents quando não é maior que o preço atual", () => {
    const htmlNoDiscount = PDP_HTML.replace("R$ 429,00", "R$ 350,00");
    const product = extractAmazonProductHtml(htmlNoDiscount, "https://www.amazon.com.br/dp/B08N5WRWNW");
    assert.ok(product);
    assert.equal(product.originalPriceCents, undefined);
  });
});

describe("amazon-extractor: extractAmazonCardHtml", () => {
  it("extrai anúncio a partir do card de busca", () => {
    const card = extractAmazonCardHtml(CARD_HTML);
    assert.ok(card);
    assert.equal(card.externalId, "B09SWW583J");
    assert.equal(card.title, "Kindle 11ª Geração Cor Preta 16GB");
    assert.equal(card.productUrl, "https://www.amazon.com.br/dp/B09SWW583J");
    assert.equal(card.priceCents, 49990);
    assert.equal(card.originalPriceCents, 54900);
    assert.equal(card.marketplace, "amazon");
    assert.equal(card.imageUrl, "https://m.media-amazon.com/images/I/61b3A1P2y+L._AC_UY218_.jpg");
  });
});
