import assert from "node:assert/strict";
import test from "node:test";
import {
  editorialGroupIdFor,
  editorialGroupsFor,
  GROUP_REPRESENTATIVE_LIMIT,
  matchesEditorialGroup,
  selectRepresentatives,
} from "../lib/editorial-groups.ts";

const base = {
  tenantId: "local",
  marketplace: "aliexpress",
  status: "pending",
  observedAt: "2026-09-03T12:00:00.000Z",
  priceCents: 5000,
  ratingStar: null,
  salesLabel: null,
  salesCount: null,
  observationCount: 1,
  lowestVerified: false,
};

function product(over) {
  return { ...base, ...over };
}

const manoplas = { key: "manoplas_moto", label: "Manoplas para moto", method: "title-keywords", version: "v1" };

test("produtos da mesma família formam um grupo por tenant", () => {
  const overview = editorialGroupsFor([
    product({ productId: "p1", family: manoplas }),
    product({ productId: "p2", family: manoplas }),
    product({ productId: "p3", family: manoplas, status: "approved" }),
  ]);
  assert.equal(overview.groups.length, 1);
  assert.equal(overview.singularProductIds.length, 0);
  const group = overview.groups[0];
  assert.equal(group.tenantId, "local");
  assert.equal(group.familyKey, "manoplas_moto");
  assert.equal(group.memberCount, 3);
  assert.equal(group.memberProductIds.length, 3);
  assert.ok(group.groupId.startsWith("grp_"));
  assert.equal(group.groupId.length, "grp_".length + 16);
  assert.equal(group.groupId, editorialGroupIdFor("local", "manoplas_moto", "title-keywords", "v1"));
});

test("id de grupo enviado pelo cliente só vale para o tenant e família canônicos", () => {
  const groupId = editorialGroupIdFor("local", manoplas.key, manoplas.method, manoplas.version);
  assert.equal(matchesEditorialGroup(groupId, "local", manoplas), true);
  assert.equal(matchesEditorialGroup(groupId, "afiliado-x", manoplas), false);
  assert.equal(matchesEditorialGroup("grp_0000000000000000", "local", manoplas), false);
  assert.equal(matchesEditorialGroup(groupId, "local", null), false);
});

test("grupo nunca cruza tenants: mesmas famílias em tenants diferentes são grupos distintos", () => {
  const overview = editorialGroupsFor([
    product({ productId: "a1", family: manoplas }),
    product({ productId: "a2", family: manoplas }),
    product({ productId: "b1", tenantId: "afiliado-x", family: manoplas }),
  ]);
  assert.equal(overview.groups.length, 2);
  const tenantIds = new Set(overview.groups.map((g) => g.tenantId));
  assert.deepEqual([...tenantIds].sort(), ["afiliado-x", "local"]);
  for (const group of overview.groups) {
    assert.equal(group.memberProductIds.every((id) => id.startsWith(group.tenantId === "local" ? "a" : "b")), true);
  }
});

test("produto sem família reconhecida é singular, nunca balde outros", () => {
  const overview = editorialGroupsFor([
    product({ productId: "p1", family: manoplas }),
    product({ productId: "x1", family: null }),
    product({ productId: "x2", family: null }),
  ]);
  assert.equal(overview.groups.length, 1);
  assert.deepEqual(overview.singularProductIds, ["x1", "x2"]);
});

test("grupo com todos os membros decididos está resolvido", () => {
  const overview = editorialGroupsFor([
    product({ productId: "p1", family: manoplas, status: "approved" }),
    product({ productId: "p2", family: manoplas, status: "rejected" }),
  ]);
  assert.equal(overview.groups[0].state, "resolved");
});

test("representantes limitados e ordenados por evidência", () => {
  const members = [
    product({ productId: "weak", ratingStar: 3, salesCount: 2, observationCount: 1 }),
    product({ productId: "strong", ratingStar: 4.8, salesCount: 500, observationCount: 5, lowestVerified: true }),
    product({ productId: "medium", ratingStar: 4.1, salesCount: 100, observationCount: 2 }),
  ];
  const reps = selectRepresentatives(members);
  assert.equal(reps.length, 3);
  assert.equal(reps[0], "strong");
  const limited = selectRepresentatives(
    [...members, product({ productId: "extra1" }), product({ productId: "extra2" })],
    GROUP_REPRESENTATIVE_LIMIT,
  );
  assert.equal(limited.length, GROUP_REPRESENTATIVE_LIMIT);
});

test("M4-E: representantes promovem diversidade de marketplaces mantendo boa evidência", () => {
  const members = [
    product({ productId: "shopee_1", marketplace: "shopee", ratingStar: 4.8, salesCount: 500, observationCount: 5 }),
    product({ productId: "shopee_2", marketplace: "shopee", ratingStar: 4.8, salesCount: 480, observationCount: 5 }),
    product({ productId: "ali_1", marketplace: "aliexpress", ratingStar: 4.7, salesCount: 450, observationCount: 4 }),
    product({ productId: "ml_1", marketplace: "mercadolivre", ratingStar: 4.6, salesCount: 400, observationCount: 4 }),
  ];
  const reps = selectRepresentatives(members, 3);
  assert.equal(reps.length, 3);
  // O mais forte da Shopee entra primeiro
  assert.equal(reps[0], "shopee_1");
  // O segundo e terceiro representam marketplaces diferentes (Ali e ML) em vez de monopolizar pela Shopee
  assert.ok(reps.includes("ali_1"));
  assert.ok(reps.includes("ml_1"));
});

test("M4-E: editorialGroupsFor calcula marketplaceDistribution, priceRange e groupingReason", () => {
  const overview = editorialGroupsFor([
    product({ productId: "p1", family: manoplas, marketplace: "shopee", priceCents: 4500 }),
    product({ productId: "p2", family: manoplas, marketplace: "shopee", priceCents: 6000 }),
    product({ productId: "p3", family: manoplas, marketplace: "mercadolivre", priceCents: 5200 }),
  ]);
  assert.equal(overview.groups.length, 1);
  const group = overview.groups[0];
  assert.deepEqual(group.marketplaceDistribution, { shopee: 2, mercadolivre: 1 });
  assert.deepEqual(group.priceRange, { minCents: 4500, maxCents: 6000 });
  assert.equal(group.groupingReason, "Palavras-chave do título (title-keywords v1)");
});

