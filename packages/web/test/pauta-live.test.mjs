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
  shareTarget: { kind: "marketplace", url: "https://produto.mercadolivre.com.br/MLB-123456789" }, ...fields,
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
