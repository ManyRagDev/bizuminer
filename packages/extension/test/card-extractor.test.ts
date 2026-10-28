import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractCard } from "../src/content/card-extractor.ts";

const CARD = `
<div class="poly-card poly-card--grid-card">
  <a href="https://www.mercadolivre.com.br/p/MLB123456789?wid=MLB123456789#deal_print_id=xyz"
     class="poly-component__title">Fone Bluetooth &amp; Ouvido Sem Fio</a>
  <div class="poly-price__current">
    <span class="andes-money-amount" aria-label="137 reais">R$ 137</span>
  </div>
  <div class="andes-money-amount andes-money-amount--previous" aria-label="Antes: 269 reais">R$ 269</div>
  <img src="https://http2.mlstatic.com/D_ABC-N_123-X.jpg" alt="" />
</div>
`;

describe("extractCard", () => {
  it("extrai externalId, título (decodificado), URL real e preço", () => {
    const card = extractCard(CARD);
    assert.ok(card);
    assert.equal(card.externalId, "MLB123456789");
    assert.equal(card.title, "Fone Bluetooth & Ouvido Sem Fio");
    assert.equal(card.productUrl, "https://www.mercadolivre.com.br/p/MLB123456789?wid=MLB123456789");
    assert.equal(card.priceCents, 13700);
    assert.equal(card.originalPriceCents, 26900);
    assert.equal(card.imageUrl, "https://http2.mlstatic.com/D_ABC-N_123-X.jpg");
  });

  it("limpa query/fragment do href real (não reconstrói permalink)", () => {
    const card = extractCard(CARD)!;
    assert.ok(card.productUrl.includes("wid=MLB123456789"));
    assert.ok(!card.productUrl.includes("#"));
  });

  it("devolve null quando não há preço (card incompleto)", () => {
    const html = CARD.replace("aria-label=\"137 reais\"", "");
    assert.equal(extractCard(html), null);
  });

  it("devolve null quando não há título/href", () => {
    const html = CARD.replace(/<a[^>]*poly-component__title[^>]*>/, "<a href=\"https://x.com\" class=\"poly-component__title\">");
    assert.equal(extractCard(html), null);
  });

  it("ignora preço original que não é maior que o atual", () => {
    const html = CARD.replace("aria-label=\"Antes: 269 reais\"", "aria-label=\"Antes: 100 reais\"");
    const card = extractCard(html)!;
    assert.equal(card.originalPriceCents, undefined);
  });

  it("transporta preço a partir de com sua natureza explícita", () => {
    const html = CARD.replace("aria-label=\"137 reais\"", "aria-label=\"A partir de 137 reais\"");
    assert.equal(extractCard(html)?.priceType, "from");
    assert.equal(extractCard(html)?.currency, "BRL");
  });
});

it("não corta título longo e recusa excesso em vez de truncar", () => {
  const title = "Transmissor ".repeat(35) + "Bluetooth 5.3 USB-C 2 unidades";
  assert.equal(extractCard(CARD.replace("Fone Bluetooth &amp; Ouvido Sem Fio",title))?.title,title);
  assert.equal(extractCard(CARD.replace("Fone Bluetooth &amp; Ouvido Sem Fio","x".repeat(2001))),null);
});
it("catálogo sem anúncio identificado não vira captura de vendedor desconhecido", () => {
  assert.equal(extractCard(CARD.replace("?wid=MLB123456789#deal_print_id=xyz", "")),null);
});
