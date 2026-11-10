import assert from "node:assert/strict";
import test from "node:test";
import { composeLivePauta } from "../lib/pauta-policy.ts";

const now = new Date("2026-11-08T15:00:00Z");
const observed = hours => new Date(+now - hours * 3_600_000).toISOString();
const policy = { limit: 2, familyLimit: 1, repeatHours: 72, improvementPercent: 5 };
const offer = (id, fields = {}) => ({
  id, title: `Produto ${id}`, marketplace: "mercadolivre",
  priceCents: 9900, priceType: "exact", currency: "BRL",
  imageUrl: "https://http2.mlstatic.com/photo.jpg", lastSeenAt: observed(2), evidenceObservedAt: observed(2),
  curationStatus: "approved", offerEvidence: {}, assessment: null, triageScore: 4,
  shareTarget: { kind: "pauta", token: "fixture" }, ...fields,
});
const select = (items, exposures = new Map(), manual = null) =>
  composeLivePauta(items, policy, exposures, now, manual, new Set());

test("seleciona oferta sem publicação e equilibra mérito e recência", () => {
  const better = offer("melhor-ontem", { triageScore: 5, evidenceObservedAt: observed(30) });
  const recent = offer("recente");
  const older = offer("bom-ontem", { evidenceObservedAt: observed(30), discountPercent: 98 });
  const result = select([older, recent, better]);
  assert.deepEqual(result.selected.map(p => p.id), ["melhor-ontem", "recente"]);
  assert.match(result.reasonsById.get(older.id)[0], /abaixo do corte/);
});

test("recusa oferta vencida, pendente, sem link ou com condição de preço sem confirmação", () => {
  const result = select([
    offer("antiga", { evidenceObservedAt: observed(49) }),
    offer("pendente", { curationStatus: "pending" }),
    offer("link", { shareTarget: null }),
    offer("faixa", { priceType: "range" }),
    offer("cupom", { offerEvidence: { conditions: { coupon: "TESTE" } } }),
  ]);
  assert.equal(result.selected.length, 0);
  assert.match(result.reasonsById.get("antiga")[0], /48 horas/);
  assert.match(result.reasonsById.get("pendente")[0], /aprovação/);
  assert.match(result.reasonsById.get("link")[0], /link de afiliado/);
  assert.match(result.reasonsById.get("faixa")[0], /preço exato/);
  assert.match(result.reasonsById.get("cupom")[0], /condições/);
});

test("respeita seleção manual e intervalo de divulgação do canal", () => {
  const previous = { productId: "a", priceCents: 9900, optionKey: "conferida", confirmedAt: observed(5) };
  const exposures = new Map([["a", previous]]);
  assert.equal(select([offer("a")], exposures).selected.length, 0);
  assert.equal(select([offer("a", { priceCents: 8900 })], exposures).selected.length, 0);
  assert.equal(select([offer("a", { priceCents: 8900, offerOptionKey: "conferida" })], exposures).selected.length, 1);
  assert.equal(select([offer("a", { priceCents: 8900, offerOptionKey: "outra" })], exposures).selected.length, 0);
  assert.deepEqual(select([offer("a"), offer("b")], new Map(), ["b"]).selected.map(p => p.id), ["b"]);
});

test("reserva espaço para lojas elegíveis na pauta automática sem alterar a ordem manual", () => {
  const ml = [offer("ml1", { triageScore: 5 }), offer("ml2", { triageScore: 5 })];
  const shopee = offer("shopee", { marketplace: "shopee", triageScore: 3 });
  assert.deepEqual(select([...ml, shopee]).selected.map(p => p.id), ["ml1", "shopee"]);
  assert.deepEqual(select([...ml, shopee], new Map(), ["ml2", "ml1", "shopee"]).selected.map(p => p.id), ["ml2", "ml1"]);
});

test("admite somente faixa Shopee em reais com ambos os limites válidos e link", () => {
  const range = offer("kit", { marketplace: "shopee", priceType: "range", priceMinCents: 9900, priceMaxCents: 12900,
    offerEvidence: { priceMinCents: 9900, priceMaxCents: 12900 } });
  assert.equal(select([range]).selected.length, 1);
  assert.equal(select([{ ...range, priceMaxCents: undefined }]).selected.length, 0);
  assert.equal(select([{ ...range, currency: "USD" }]).selected.length, 0);
  assert.equal(select([{ ...range, shareTarget: null }]).selected.length, 0);
  assert.equal(select([{ ...range, offerEvidence: { ...range.offerEvidence, conditions: { coupon: "TESTE" } } }]).selected.length, 0);
});

test("exige conferência manual para AliExpress mesmo se o anúncio informar um preço único", () => {
  const ali = offer("ali", { marketplace: "aliexpress", offerOptionKey: "option" });
  assert.match(select([ali]).reasonsById.get("ali")[0], /Confirme manualmente/);
  assert.equal(select([{ ...ali, offerEvidence: { verification: { method: "editorial_confirmation" } } }]).selected.length, 1);
});

test("limita repetição de bolsas/câmeras e diversifica categorias e lojas na pauta de 12 itens", () => {
  const fullPolicy = { limit: 6, familyLimit: 1, repeatHours: 72, improvementPercent: 5 };
  const bags = Array.from({ length: 5 }, (_, i) => offer(`bag-${i}`, {
    marketplace: "shopee",
    title: `Bolsa Feminina Ombro Transversal ${i}`,
    category: "Moda",
    triageScore: 5,
    evidenceObservedAt: observed(0.1),
  }));
  const cameras = Array.from({ length: 4 }, (_, i) => offer(`cam-${i}`, {
    marketplace: "mercadolivre",
    title: `Câmera Segurança Wifi Ip Externa ${i}`,
    category: "Tecnologia",
    triageScore: 5,
    evidenceObservedAt: observed(0.2),
  }));
  const diverse = [
    offer("tool-1", { marketplace: "shopee", title: "Parafusadeira Sem Fio 21V", category: "Ferramentas", triageScore: 5, evidenceObservedAt: observed(1) }),
    offer("home-1", { marketplace: "shopee", title: "Jogo de Lençol Casal 400 Fios", category: "Casa", triageScore: 5, evidenceObservedAt: observed(1) }),
    offer("beauty-1", { marketplace: "mercadolivre", title: "Secador de Cabelo Profissional", category: "Beleza", triageScore: 5, evidenceObservedAt: observed(1) }),
    offer("toy-1", { marketplace: "shopee", title: "Blocos de Montar Educativos", category: "Brinquedos", triageScore: 5, evidenceObservedAt: observed(1) }),
  ];
  const result = composeLivePauta([...bags, ...cameras, ...diverse], fullPolicy, new Map(), now, null, new Set());
  assert.equal(result.selected.length, 6);
  const selectedBags = result.selected.filter(p => p.id.startsWith("bag-"));
  const selectedCams = result.selected.filter(p => p.id.startsWith("cam-"));
  assert.equal(selectedBags.length, 1, "Apenas 1 bolsa/mochila deve entrar quando familyLimit=1");
  assert.equal(selectedCams.length, 1, "Apenas 1 câmera de segurança deve entrar quando familyLimit=1");
});

test("teto por loja impede que rodagem recente de um marketplace monopolize a pauta inteira", () => {
  const pauta12Policy = { limit: 12, familyLimit: 1, repeatHours: 72, improvementPercent: 5 };
  // Shopee acabou de rodar: 15 itens fresquíssimos (há 5 minutos) com nota 5
  const freshShopee = Array.from({ length: 15 }, (_, i) => offer(`shp-${i}`, {
    marketplace: "shopee",
    title: `Produto Shopee Exclusivo ${i}`,
    category: `CatShopee${i}`,
    triageScore: 5,
    evidenceObservedAt: observed(0.08), // 5 min atrás
  }));
  // Amazon tem 6 itens capturados há 2 horas
  const amazonItems = Array.from({ length: 6 }, (_, i) => offer(`amz-${i}`, {
    marketplace: "amazon",
    title: `Produto Amazon Prime ${i}`,
    category: `CatAmz${i}`,
    triageScore: 4,
    evidenceObservedAt: observed(2),
  }));
  // Mercado Livre tem 6 itens capturados há 3 horas
  const mlItems = Array.from({ length: 6 }, (_, i) => offer(`ml-${i}`, {
    marketplace: "mercadolivre",
    title: `Produto Mercado Livre Full ${i}`,
    category: `CatML${i}`,
    triageScore: 4,
    evidenceObservedAt: observed(3),
  }));

  const result = composeLivePauta([...freshShopee, ...amazonItems, ...mlItems], pauta12Policy, new Map(), now, null, new Set());
  assert.equal(result.selected.length, 12);
  const shopeeCount = result.selected.filter(p => p.marketplace === "shopee").length;
  const amazonCount = result.selected.filter(p => p.marketplace === "amazon").length;
  const mlCount = result.selected.filter(p => p.marketplace === "mercadolivre").length;

  // Com 3 lojas ativas em 12 vagas, a Shopee não pode canibalizar e pegar mais de 5 vagas
  assert.ok(shopeeCount <= 5, `Shopee pegou ${shopeeCount}, mas deveria ter teto de no máximo 5`);
  assert.ok(amazonCount >= 3, `Amazon precisa ter pelo menos 3 vagas (teve ${amazonCount})`);
  assert.ok(mlCount >= 3, `Mercado Livre precisa ter pelo menos 3 vagas (teve ${mlCount})`);
});
