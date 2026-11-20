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

  it("identifica oferta relâmpago e extrai countdown com promotionEndsAt", () => {
    const lightningCard = `
<div class="poly-card poly-card--grid-card">
  <div class="poly-component__highlight-countdown">
    <div class="poly-component__countdown" aria-hidden="true">
      <div class="poly-countdown__block"><span class="poly-countdown__digit poly-countdown__digit--static">0</span><span class="poly-countdown__digit poly-countdown__digit--static">5</span></div>
      <span class="poly-countdown__separator">:</span>
      <div class="poly-countdown__block"><span class="poly-countdown__digit poly-countdown__digit--static">2</span><span class="poly-countdown__digit poly-countdown__digit--static">8</span></div>
      <span class="poly-countdown__separator">:</span>
      <div class="poly-countdown__block"><span class="poly-countdown__digit poly-countdown__digit--static">1</span><span class="poly-countdown__digit poly-countdown__digit--static">4</span></div>
    </div>
  </div>
  <a href="https://www.mercadolivre.com.br/p/MLB123456789?wid=MLB123456789#deal_print_id=xyz"
     class="poly-component__title">Parafusadeira de Impacto 21V</a>
  <div class="poly-price__current">
    <span class="andes-money-amount" aria-label="149 reais">R$ 149</span>
  </div>
</div>
    `;
    const card = extractCard(lightningCard);
    assert.ok(card);
    assert.equal(card.promotionType, "lightning");
    assert.ok(card.promotionEndsAt);
    const endsMs = Date.parse(card.promotionEndsAt);
    assert.ok(Number.isFinite(endsMs));
    // 5h 28m 14s = 19694s
    const diffSec = Math.round((endsMs - Date.now()) / 1000);
    assert.ok(diffSec >= 19690 && diffSec <= 19696);
  });

  it("extrai apenas 1 dígito por roller-container quando o segundo está em animação", () => {
    const animatedLightningCard = `
<div class="poly-card poly-card--grid-card">
  <div class="poly-component__highlight-countdown">
    <div class="poly-component__countdown" aria-hidden="true">
      <div class="poly-countdown__block">
        <div class="poly-countdown__roller-container"><span class="poly-countdown__digit poly-countdown__digit--static">0</span></div>
        <div class="poly-countdown__roller-container"><span class="poly-countdown__digit poly-countdown__digit--static">2</span></div>
      </div>
      <span class="poly-countdown__separator">:</span>
      <div class="poly-countdown__block">
        <div class="poly-countdown__roller-container"><span class="poly-countdown__digit poly-countdown__digit--static">1</span></div>
        <div class="poly-countdown__roller-container"><span class="poly-countdown__digit poly-countdown__digit--static">5</span></div>
      </div>
      <span class="poly-countdown__separator">:</span>
      <div class="poly-countdown__block">
        <div class="poly-countdown__roller-container"><span class="poly-countdown__digit poly-countdown__digit--static">4</span></div>
        <div class="poly-countdown__roller-container">
          <div class="poly-countdown__roller">
            <span class="poly-countdown__digit">8</span>
            <span class="poly-countdown__digit">7</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <a href="https://www.mercadolivre.com.br/p/MLB123456789?wid=MLB123456789"
     class="poly-component__title">Furadeira 21V</a>
  <div class="poly-price__current">
    <span class="andes-money-amount" aria-label="149 reais">R$ 149</span>
  </div>
</div>
    `;
    const card = extractCard(animatedLightningCard);
    assert.ok(card);
    assert.equal(card.promotionType, "lightning");
    assert.ok(card.promotionEndsAt);
    // 2h 15m 48s = 8148s
    const diffSec = Math.round((Date.parse(card.promotionEndsAt) - Date.now()) / 1000);
    assert.ok(diffSec >= 8144 && diffSec <= 8152);
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
