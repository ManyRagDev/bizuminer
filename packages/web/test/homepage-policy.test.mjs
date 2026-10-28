import assert from "node:assert/strict";
import test from "node:test";
import { composeHomepage, homepageClarityBlockers, homepageFamily } from "../lib/homepage-policy.ts";
import { isHomepageSelectionQuery } from "../lib/deal-query.ts";
import { parseHomepageEngagement, engagementRates, isKnownAutomation } from "../lib/homepage-engagement.ts";
import { issueHomepageEngagementTicket, verifyHomepageEngagementTicket } from "../lib/homepage-engagement-token.ts";
import { publishedEditorialStateKey } from "../lib/editorial-selection.ts";
const now = new Date("2026-10-27T03:00:00Z");
const evidence = { priceType: "exact", variantIdentity: { state: "source_verified", key: "unit" }, packageContents: ["Uma unidade"], packageQuantity: 1 };
function item(id, changes = {}) {
  return { id, title: `Produto ${id}`, marketplace: "shopee", category: "Casa", priceCents: 2500,
    curationStatus: "approved", evidenceFingerprint: "same", evidenceObservedAt: now.toISOString(), lastSeenAt: now.toISOString(),
    imageUrl: "https://example.test/image.jpg", assessment: null, offerEvidence: structuredClone(evidence), ...changes };
}
const ids = result => result.selected.map(entry => entry.candidate.id);

test("clareza é requisito e não pode ser compensada por estrelas, vendas ou desconto", () => {
  const unclear = item("unclear", { ratingStar: 5, salesCount: 999999, discountPercent: 99, offerEvidence: {} });
  assert.ok(homepageClarityBlockers(unclear).length);
  assert.deepEqual(ids(composeHomepage([unclear], now)), []);
  for (const changes of [{ packageContents: [] }, { packageQuantity: 0 }, { priceType: "range" }, { variantIdentity: { state: "inferred", key: "unit" } }]) {
    assert.ok(homepageClarityBlockers(item("invalid", { offerEvidence: { ...evidence, ...changes } })).length);
  }
});
test("não aplicável precisa vir explícito da fonte; uma avaliação existente continua sujeita à rubrica", () => {
  assert.deepEqual(homepageClarityBlockers(item("na", { offerEvidence: { ...evidence, packageContents: [], fieldStates: { packageContents: "not_applicable" } } })), []);
  assert.deepEqual(ids(composeHomepage([item("review", { assessment: { dimensions: {}, criticalDoubts: [] } })], now)), []);
});
test("famílias não monopolizam a primeira janela e hero atende necessidades diferentes", () => {
  const pool = Array.from({ length: 8 }, (_, i) => item(`audio${i}`, { title: `Fone de ouvido ${i}`, ratingStar: 5 }))
    .concat(Array.from({ length: 15 }, (_, i) => item(`other${i}`, { title: `Produto independente ${i}`, category: i % 2 ? "Casa" : "Ferramentas", marketplace: i % 2 ? "shopee" : "aliexpress" })));
  const result = composeHomepage(pool, now);
  assert.equal(result.selected.slice(0, 12).filter(e => homepageFamily(e.candidate) === "audio").length, 2);
  assert.equal(result.heroes.filter(e => homepageFamily(e.candidate) === "audio").length, 1);
  assert.equal(new Set(result.selected.slice(0, 12).map(e => e.candidate.marketplace)).size, 2);
  assert.equal(new Set(result.heroes.map(e => homepageFamily(e.candidate))).size, 3);
});
test("escassez publica menos itens; desconhecidos não são agrupados artificialmente", () => {
  const audio = Array.from({ length: 10 }, (_, i) => item(`a${i}`, { title: `Fone de ouvido ${i}` }));
  assert.equal(composeHomepage(audio, now).selected.length, 2);
  assert.equal(composeHomepage([item("x"), item("y"), item("z")], now).selected.length, 3);
  assert.deepEqual(composeHomepage([], now), { selected: [], heroes: [] });
});
test("recaptura e ordem de entrada não mudam a seleção; não há mutação", () => {
  const pool = Array.from({ length: 30 }, (_, i) => item(`p${i}`, { marketplace: i % 2 ? "shopee" : "aliexpress", category: `Categoria ${i % 4}` }));
  const before = structuredClone(pool), first = composeHomepage(pool, now);
  assert.deepEqual(ids(composeHomepage([...pool].reverse(), now)), ids(first));
  const previous = { productIds: ids(first), heroProductIds: first.heroes.map(e => e.candidate.id), seenProductIds: ids(first), renewAfter: new Date(+now + 86400000).toISOString() };
  assert.deepEqual(ids(composeHomepage(pool.map(p => ({ ...p, evidenceObservedAt: new Date(+now + 1000).toISOString() })), new Date(+now + 1000), previous)), ids(first));
  assert.deepEqual(pool, before);
});
test("invalidação remove imediatamente e não recaptura novidade", () => {
  const pool = Array.from({ length: 30 }, (_, i) => item(`p${i}`));
  const first = composeHomepage(pool, now);
  const previous = { productIds: ids(first), heroProductIds: first.heroes.map(e => e.candidate.id), seenProductIds: pool.map(p => p.id), renewAfter: new Date(+now + 86400000).toISOString() };
  const invalid = previous.productIds[0];
  const next = composeHomepage(pool.map(p => p.id === invalid ? { ...p, curationStatus: "rejected" } : p), now, previous);
  assert.ok(!ids(next).includes(invalid));
  assert.deepEqual(ids(next).slice(0, 23), previous.productIds.slice(1));
});
test("edição manual preserva a ordem explícita da grade e continua limitando repetição", () => {
  const pool = [item("best", { ratingStar: 5 }), item("first"), item("second")];
  const positions = new Map([["first", 0], ["second", 1], ["best", 2]]);
  assert.deepEqual(ids(composeHomepage(pool, now, undefined, positions)), ["first", "second", "best"]);
  assert.equal(composeHomepage(pool, now, undefined, positions).heroes[0].candidate.id, "best");
});
test("filtros e ordens explícitas consultam catálogo; offset sozinho pagina a edição", () => {
  assert.equal(isHomepageSelectionQuery({}), true);
  assert.equal(isHomepageSelectionQuery({ offset: 24 }), true);
  for (const query of [{ category: "Casa" }, { search: "fone" }, { marketplace: "shopee" }, { sort: "price" }, { sort: "recent" }, { minRating: 4 }, { minDiscount: 20 }, { freshness: "7d" }, { hasHistory: true }, { priceBand: "under_100" }]) assert.equal(isHomepageSelectionQuery(query), false);
});
test("renovação diária limita descoberta a um quarto, mesmo com muitos candidatos pontuando mais", () => {
  const old = Array.from({ length: 24 }, (_, i) => item(`old${i}`));
  const first = composeHomepage(old, now);
  const previous = { productIds: ids(first), heroProductIds: first.heroes.map(e => e.candidate.id), seenProductIds: ids(first), renewAfter: now.toISOString() };
  const newcomers = Array.from({ length: 30 }, (_, i) => item(`new${i}`, { ratingStar: 5, offerEvidence: { ...evidence, reviewCount: 100 } }));
  const next = composeHomepage([...old, ...newcomers], now, previous);
  assert.equal(next.selected.length, 24);
  assert.equal(ids(next).filter(id => id.startsWith("new")).length, 6);
});
test("produto já apresentado pode voltar quando suas evidências melhoram; recaptura isolada não basta", () => {
  const old = Array.from({ length: 24 }, (_, i) => item(`old${i}`));
  const first = composeHomepage(old, now), returner = item("returner", { ratingStar: 5 });
  const previous = { productIds: ids(first), heroProductIds: first.heroes.map(e => e.candidate.id), seenProductIds: [...ids(first), "returner"], renewAfter: now.toISOString() };
  assert.ok(ids(composeHomepage([...old, returner], now, previous)).includes("returner"));
  assert.ok(!ids(composeHomepage([...old, item("returner")], now, previous)).includes("returner"));
});
test("visitas administrativas não recebem ticket e não é possível trocar edição, visita ou prazo", () => {
  const editionId = "00000000-0000-4000-8000-000000000001", key = "isolated-test-key";
  assert.equal(issueHomepageEngagementTicket(editionId, false, +now, key), null);
  const ticket = issueHomepageEngagementTicket(editionId, true, +now, key);
  assert.ok(verifyHomepageEngagementTicket(ticket.token, editionId, ticket.viewId, +now, key));
  assert.equal(verifyHomepageEngagementTicket(ticket.token, editionId, "another-view", +now, key), false);
  assert.equal(verifyHomepageEngagementTicket(ticket.token, "another-edition", ticket.viewId, +now, key), false);
  assert.equal(verifyHomepageEngagementTicket(ticket.token, editionId, ticket.viewId, +now + 2 * 3600000, key), false);
  assert.equal(verifyHomepageEngagementTicket(ticket.token + "x", editionId, ticket.viewId, +now, key), false);
});
test("a verificação de versão transmite uma assinatura compacta, não o catálogo completo", () => {
  const selection = { mode: "catalog", products: Array.from({ length: 24 }, (_, i) => item(`p${i}`, { title: "Um título longo ".repeat(20) })), heroProductIds: ["p0"], heroValidUntil: now.toISOString() };
  const key = publishedEditorialStateKey(selection);
  assert.ok(key.length < 100);
  assert.ok(!key.includes("Um título"));
  assert.notEqual(publishedEditorialStateKey({ ...selection, products: [] }), key);
});
test("telemetria valida limites, não aceita posição inventada e reconhece automação conhecida", () => {
  const payload = { editionId: "00000000-0000-4000-8000-000000000001", viewId: "00000000-0000-4000-8000-000000000002", events: [{ productId: "p1", surface: "grid", position: 0, event: "impression" }] };
  assert.deepEqual(parseHomepageEngagement(payload), payload);
  for (const change of [{ editionId: "bad" }, { events: Array(51).fill(payload.events[0]) }, { events: [{ ...payload.events[0], position: 24 }] }, { events: [{ ...payload.events[0], surface: "hero", position: 3 }] }, { events: [{ ...payload.events[0], event: "purchase" }] }]) assert.equal(parseHomepageEngagement({ ...payload, ...change }), null);
  assert.equal(engagementRates({ impressions: 49, details: 4, favorites: 1, outbound: 2 }), null);
  assert.equal(engagementRates({ impressions: 100, details: 40, favorites: 10, outbound: 20 }).outbound, 0.2);
  assert.ok(isKnownAutomation("WhatsApp/2.0"));
  assert.ok(!isKnownAutomation("Mozilla/5.0 Chrome/130"));
});
