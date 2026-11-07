import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRelampagoCopy,
  buildSinceroCopy,
  buildDiretoCopy,
  buildPostSparkPrompt,
  generateOfferCopy,
  extractPautaCopyData,
} from "../lib/copy-styles.ts";

const mockOffer = {
  title: "Fone Bluetooth QCY T13 Cancelamento de Ruído",
  displayTitle: "Fone Bluetooth QCY T13 ANC",
  benefit: "Bateria de 30h e isolamento acústico excelente para a faixa",
  caveat: "Cabo de carregamento curto",
  priceCents: 10900,
  previousMinPriceCents: 18900,
  historyDays: 60,
  observationCount: 22,
  lowestVerified: true,
  marketplace: "mercadolivre",
  shareUrl: "https://www.bizuminer.com.br/p/qcy1",
  bioCode: "#104",
  offerOptionLabel: "Preto",
  purchaseContents: "Fone + Estojo + Cabo",
};

test("buildRelampagoCopy generates high urgency copy with discount and bio code", () => {
  const copy = buildRelampagoCopy(mockOffer);
  assert.match(copy, /QUEDA REAL DE 42%!/);
  assert.match(copy, /De ~R\$ 189~ por \*R\$ 109\*/);
  assert.match(copy, /https:\/\/www\.bizuminer\.com\.br\/p\/qcy1/);
  assert.match(copy, /#104/);
});

test("buildSinceroCopy includes benefit, caveat and audit proof", () => {
  const copy = buildSinceroCopy(mockOffer);
  assert.match(copy, /Bizu verificado/);
  assert.match(copy, /Ponto forte/);
  assert.match(copy, /A ressalva/);
  assert.match(copy, /Auditado em 22 coletas/);
  assert.match(copy, /#104/);
});

test("buildDiretoCopy generates short clean copy", () => {
  const copy = buildDiretoCopy(mockOffer);
  assert.match(copy, /⚡ \*Fone Bluetooth QCY T13 ANC\*/);
  assert.match(copy, /De ~R\$ 189~ por \*R\$ 109\*/);
  assert.match(copy, /Bio: \*#104\*/);
});

test("buildPostSparkPrompt generates static post prompt with format match signal", () => {
  const prompt = buildPostSparkPrompt(mockOffer, "static");
  assert.match(prompt, /Post estático em imagem única/);
  assert.match(prompt, /glass-veil/);
  assert.match(prompt, /CTA: Acesse o link na bio \(Código #104\)/);
  assert.match(prompt, /Fonte: https:\/\/www\.bizuminer\.com\.br\/p\/qcy1/);
});

test("buildPostSparkPrompt generates carousel prompt with 5 slides matching PostSpark parser", () => {
  const prompt = buildPostSparkPrompt(mockOffer, "carousel");
  assert.match(prompt, /Carrossel em 5 slides/);
  assert.match(prompt, /data-punch/);
  assert.match(prompt, /Slide 1\/5/);
  assert.match(prompt, /Slide 5\/5/);
  assert.match(prompt, /CTA: Acesse o link na bio \(Código #104\)/);
});

test("generateOfferCopy switches tones correctly", () => {
  const relampago = generateOfferCopy(mockOffer, "relampago");
  assert.match(relampago, /QUEDA REAL/);

  const sincero = generateOfferCopy(mockOffer, "sincero");
  assert.match(sincero, /Bizu verificado/);

  const direto = generateOfferCopy(mockOffer, "direto");
  assert.match(direto, /⚡/);
});

test("extractPautaCopyData converts pauta product into rich whatsapp copy with relampago style", () => {
  const pautaProduct = {
    id: "prod-1",
    slug: "shopee-teclado-mecanico",
    title: "Teclado Mecânico Gamer Switch Red RGB",
    displayTitle: "Teclado Mecânico RGB Switch Red",
    priceCents: 14990,
    previousMinPriceCents: 21990,
    lowestVerified: true,
    marketplace: "shopee",
    shareUrl: "https://bizuminer.com.br/p/tk1",
    bioCode: "#105",
    benefit: "Switches hot-swappable e iluminação RGB programável",
    caveat: "Cabo fixo, não é removível",
    editorialRationale: "Melhor custo-benefício mecânico da categoria",
    editorialPurchaseContents: "Teclado + Removedor de teclas",
    offerOptionLabel: "Switch Red",
  };

  const copyData = extractPautaCopyData(pautaProduct);
  assert.equal(copyData.title, pautaProduct.title);
  assert.equal(copyData.displayTitle, pautaProduct.displayTitle);
  assert.equal(copyData.benefit, pautaProduct.benefit);
  assert.equal(copyData.bioCode, "#105");

  const relampagoCopy = generateOfferCopy(copyData, "relampago");
  assert.match(relampagoCopy, /🔥 \*QUEDA REAL DE 32%!\*/);
  assert.match(relampagoCopy, /\*Teclado Mecânico RGB Switch Red\*/);
  assert.match(relampagoCopy, /💥 De ~R\$ 219,90~ por \*R\$ 149,90\* na Shopee/);
  assert.match(relampagoCopy, /✓ Menor preço dos últimos 60 dias no monitoramento/);
  assert.match(relampagoCopy, /⚡ Switches hot-swappable e iluminação RGB programável/);
  assert.match(relampagoCopy, /🛒 \*Garanta aqui:\* https:\/\/bizuminer\.com\.br\/p\/tk1/);
  assert.match(relampagoCopy, /\(Código na Bio: \*#105\*\)/);

  // Fallback to editorialRationale when benefit is absent
  const withoutBenefit = { ...pautaProduct, benefit: undefined };
  const fallbackCopy = generateOfferCopy(extractPautaCopyData(withoutBenefit), "relampago");
  assert.match(fallbackCopy, /⚡ Melhor custo-benefício mecânico da categoria/);
});
