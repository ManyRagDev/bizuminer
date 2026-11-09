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

test("Achado abre com produto e preço e usa o histórico comparável", () => {
  const copy = buildRelampagoCopy(mockOffer);
  assert.match(copy, /^\*Fone Bluetooth QCY T13 ANC\* por \*R\$ 109\* no Mercado Livre/);
  assert.match(copy, /É o menor preço que registramos em 60 dias\./);
  assert.match(copy, /Ver oferta: https:\/\/www\.bizuminer\.com\.br\/p\/qcy1/);
  assert.match(copy, /#104/);
  assert.doesNotMatch(copy, /urgente|garanta|imperdível|off!/i);
});

test("Com contexto inclui a versão, benefício, conteúdo e ressalva", () => {
  const copy = buildSinceroCopy(mockOffer);
  assert.match(copy, /Bateria de 30h/);
  assert.match(copy, /Opção: Preto/);
  assert.match(copy, /Vem com Fone \+ Estojo \+ Cabo/);
  assert.match(copy, /Cabo de carregamento curto/);
  assert.doesNotMatch(copy, /audita|segurança/i);
});

test("Curto mantém preço, condição e link", () => {
  const copy = buildDiretoCopy({ ...mockOffer, offerConditions: "Preço com cupom FONE10" });
  assert.match(copy, /\*R\$ 109\* no Mercado Livre/);
  assert.match(copy, /Preço com cupom FONE10/);
  assert.match(copy, /Código na bio: #104/);
  assert.doesNotMatch(copy, /menor preço/i);
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

test("generateOfferCopy preserva os três tons", () => {
  assert.equal(generateOfferCopy(mockOffer, "relampago"), buildRelampagoCopy(mockOffer));
  assert.equal(generateOfferCopy(mockOffer, "sincero"), buildSinceroCopy(mockOffer));
  assert.equal(generateOfferCopy(mockOffer, "direto"), buildDiretoCopy(mockOffer));
});

test("extractPautaCopyData converts pauta product into rich whatsapp copy with relampago style", () => {
  const pautaProduct = {
    id: "prod-1",
    slug: "shopee-teclado-mecanico",
    title: "Teclado Mecânico Gamer Switch Red RGB",
    displayTitle: "Teclado Mecânico RGB Switch Red",
    priceCents: 14990,
    previousMinPriceCents: 21990,
    historyDays: 60,
    observationCount: 15,
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
  assert.match(relampagoCopy, /\*Teclado Mecânico RGB Switch Red\* por \*R\$ 149,90\* na Shopee/);
  assert.match(relampagoCopy, /menor preço que registramos em 60 dias/);
  assert.match(relampagoCopy, /Switches hot-swappable e iluminação RGB programável/);
  assert.match(relampagoCopy, /Ver oferta: https:\/\/bizuminer\.com\.br\/p\/tk1/);

  const withoutBenefit = { ...pautaProduct, benefit: undefined };
  const fallbackCopy = generateOfferCopy(extractPautaCopyData(withoutBenefit), "relampago");
  assert.doesNotMatch(fallbackCopy, /Melhor custo-benefício/);
});

test("buildRelampagoCopy does not claim historical low when product has no observation history", () => {
  const newProductWithoutHistory = {
    title: "Mouse Ergonômico Vertical Sem Fio",
    priceCents: 8900,
    previousMinPriceCents: null,
    historyDays: 0,
    observationCount: 1,
    lowestVerified: true, // In database, single observation can evaluate to lowestVerified = true
    marketplace: "mercadolivre",
    shareUrl: "https://bizuminer.com.br/p/mouse-v",
    benefit: "Design vertical anatômico que previne fadiga no punho",
    discountPercent: 10,
  };

  const copy = buildRelampagoCopy(newProductWithoutHistory);
  assert.doesNotMatch(copy, /menor preço/i);
  assert.match(copy, /O anúncio indica 10% de desconto\./);
  assert.match(copy, /Design vertical anatômico/);
  assert.doesNotMatch(buildRelampagoCopy({ ...newProductWithoutHistory, discountPercent: 100 }), /100%/);
});

test("buildRelampagoCopy claims historical low only with solid observation history", () => {
  const productWithRealHistory = {
    title: "Monitor 24 IPS 100Hz",
    priceCents: 49900,
    previousMinPriceCents: null,
    historyDays: 45,
    observationCount: 18,
    lowestVerified: true,
    marketplace: "shopee",
    shareUrl: "https://bizuminer.com.br/p/monitor",
    benefit: "Painel IPS de cores vivas e taxa de 100Hz",
  };

  const copy = buildRelampagoCopy(productWithRealHistory);
  assert.match(copy, /É o menor preço que registramos em 45 dias\./);
});


test("a mensagem da Shopee mostra os dois valores e o aviso de variação em todos os estilos", () => {
  const range = {
    title: "Jogo de ferramentas", marketplace: "shopee", priceType: "range", currency: "BRL",
    priceCents: 2490, priceMinCents: 2490, priceMaxCents: 8490, discountPercent: 90,
    shareUrl: "https://www.bizuminer.com.br/bizu/shp-123",
  };
  for (const tone of ["relampago", "sincero", "direto"]) {
    const copy = generateOfferCopy(range, tone);
    assert.match(copy, /R\$ 24,90 a R\$ 84,90/);
    assert.match(copy, /preço varia conforme a opção/);
    assert.doesNotMatch(copy, /90%|menor preço/);
  }
});
