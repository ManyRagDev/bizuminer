import assert from "node:assert/strict";
import test from "node:test";
import { composeHomepage, HOMEPAGE_RENEWAL_MS } from "../lib/homepage-policy.ts";
import { homepageRenewalReadiness, homepageRefreshExitCode } from "../lib/homepage-renewal.ts";

const now = new Date("2026-11-01T12:00:00Z");
const evidence = { version: 2, currency: "BRL", priceType: "exact", variantIdentity: { state: "source_verified", key: "one" },
  packageContents: ["Uma unidade"], packageQuantity: 1 };
const item = (i, changes = {}) => ({ id: `p${String(i).padStart(3, "0")}`, title: `Produto independente ${i}`, category: "Casa", marketplace: "shopee",
  priceCents: 5000, imageUrl: "https://example.test/product.jpg", curationStatus: "approved", evidenceFingerprint: "same",
  lastSeenAt: now.toISOString(), evidenceObservedAt: now.toISOString(), assessment: null, offerEvidence: evidence, ...changes });
const ids = result => result.selected.map(({ candidate }) => candidate.id);

test("a pauta continua renovando após todos os candidatos já terem aparecido", () => {
  const pool = Array.from({ length: 40 }, (_, i) => item(i));
  const lastFeaturedAt = {};
  const appearances = new Map();
  let previous;
  for (let day = 0; day < 14; day++) {
    const date = new Date(+now + day * HOMEPAGE_RENEWAL_MS);
    const fresh = pool.map(p => ({ ...p, lastSeenAt: date.toISOString(), evidenceObservedAt: date.toISOString() }));
    const result = composeHomepage(fresh, date, previous);
    const chosen = ids(result);
    assert.equal(chosen.length, 24);
    if (previous) {
      const additions = chosen.filter(id => !previous.productIds.includes(id));
      assert.ok(additions.length > 0, `a edição do dia ${day} precisa renovar`);
      assert.ok(additions.length <= 6);
      for (const id of additions) if (lastFeaturedAt[id]) assert.ok(+date - Date.parse(lastFeaturedAt[id]) >= 48 * 3600000);
    }
    for (const id of chosen) { lastFeaturedAt[id] = date.toISOString(); appearances.set(id, (appearances.get(id) ?? 0) + 1); }
    previous = { productIds: chosen, heroProductIds: result.heroes.map(e => e.candidate.id), seenProductIds: Object.keys(lastFeaturedAt),
      lastFeaturedAt: { ...lastFeaturedAt }, renewAfter: new Date(+date + HOMEPAGE_RENEWAL_MS).toISOString() };
  }
  assert.equal(appearances.size, 40);
  assert.ok([...appearances.values()].every(count => count > 1));
});

test("intervalo impede repetição precoce e escassez mantém somente ofertas aptas", () => {
  const pool = Array.from({ length: 24 }, (_, i) => item(i));
  const current = ids(composeHomepage(pool, now));
  const previous = { productIds: current, heroProductIds: [], seenProductIds: [...current, "returner"],
    lastFeaturedAt: { returner: new Date(+now - 24 * 3600000).toISOString() }, renewAfter: now.toISOString() };
  assert.ok(!ids(composeHomepage([...pool, item("returner", { id: "returner" })], now, previous)).includes("returner"));
  assert.deepEqual(ids(composeHomepage(pool, now, previous)), current);
  assert.ok(!ids(composeHomepage([...pool, item(100, { curationStatus: "rejected", ratingStar: 5 })], now, previous)).includes("p100"));
});

test("renovação não troca mérito editorial por um catálogo muito inferior", () => {
  const pool = Array.from({ length: 24 }, (_, i) => item(i, { ratingStar: 5, offerEvidence: { ...evidence, reviewCount: 100 } }));
  const previous = { productIds: ids(composeHomepage(pool, now)), heroProductIds: [], seenProductIds: [], renewAfter: now.toISOString() };
  const result = composeHomepage([...pool, item(100)], now, previous);
  assert.ok(!ids(result).includes("p100"));
});

test("diagnóstico identifica cada lacuna sem transformar aprovação em avaliação completa", () => {
  const ready = item(1), unclear = item(2, { offerEvidence: { version: 2 } }), unpublished = item(3);
  const result = homepageRenewalReadiness([ready, unclear, unpublished], [ready.id, unclear.id], now);
  assert.equal(result.candidates, 3); assert.equal(result.qualified, 1); assert.equal(result.editionCount, 1);
  for (const part of ["configuração", "conteúdo", "quantidade", "preço exato", "reais", "link ativo"]) assert.ok(result.reasons.some(r => r.reason.includes(part)), part);
  assert.equal(unclear.assessment, null);
});

test("bloqueios e falhas da rotina são verificáveis pelo código de saída", () => {
  assert.equal(homepageRefreshExitCode({ ready: true }), 0);
  assert.equal(homepageRefreshExitCode({ ready: true, blocked: "initialization_required" }), 0);
  assert.equal(homepageRefreshExitCode({ ready: true, blocked: "initialization_required" }, true), 1);
  assert.equal(homepageRefreshExitCode({ ready: true, blocked: "no_qualified_products" }), 1);
  assert.equal(homepageRefreshExitCode({ ready: false, blocked: "migration_required" }), 1);
});
