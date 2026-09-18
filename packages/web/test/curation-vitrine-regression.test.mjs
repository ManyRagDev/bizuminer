import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_EVIDENCE_TTL_DAYS, isPublicCatalogEligible } from "../lib/catalog-policy.ts";
import { CURATION_STATUSES } from "../lib/curation-contract.ts";
import { stateAfterDecision } from "../lib/curation-transition.ts";

/**
 * Predicado canônico da vitrine conforme implementado em packages/web/lib/db.ts:
 * "and pc.status = 'approved'" + validade de evidência de sete dias.
 */
function isVitrineVisible(status) {
  return isPublicCatalogEligible(status, "2026-09-05T12:00:00.000Z", new Date("2026-09-06T12:00:00.000Z"));
}

test("M4-E Vitrine: Isolamento editorial estrito de statuses", () => {
  // 1. statuses possíveis
  assert.deepEqual(CURATION_STATUSES, ["legacy_visible", "pending", "approved", "rejected", "held"]);

  // 2. Vitrine só aceita approved
  assert.equal(isVitrineVisible("approved"), true);
  assert.equal(isVitrineVisible("legacy_visible"), false);
  assert.equal(isVitrineVisible("pending"), false);
  assert.equal(isVitrineVisible("held"), false);
  assert.equal(isVitrineVisible("rejected"), false);
});

test("catálogo: evidência vence após sete dias e uma reobservação renova", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(PRODUCT_EVIDENCE_TTL_DAYS, 7);
  assert.equal(isPublicCatalogEligible("approved", "2026-09-01T12:00:00.000Z", now), true);
  assert.equal(isPublicCatalogEligible("approved", "2026-09-01T11:59:59.999Z", now), false);
  assert.equal(isPublicCatalogEligible("approved", "2026-09-08T11:00:00.000Z", now), true);
});

test("M4-E Vitrine: Ação em massa com saturação não vaza produtos retidos para a vitrine", () => {
  // Simulação de catálogo com 5 produtos
  const catalog = [
    { id: "p1", title: "Item 1", status: "pending" },
    { id: "p2", title: "Item 2", status: "pending" },
    { id: "p3", title: "Item 3", status: "pending" },
    { id: "p4", title: "Item 4", status: "pending" },
    { id: "p5", title: "Item 5", status: "pending" },
  ];

  // Antes de qualquer ação: nenhum pendente aparece na vitrine
  const initialVitrine = catalog.filter((p) => isVitrineVisible(p.status));
  assert.equal(initialVitrine.length, 0);

  // Ação de grupo M4-E:
  // p1 aprovado como representante
  // p2 a p5 retidos por saturação de família
  const updatedCatalog = catalog.map((p) => {
    if (p.id === "p1") {
      const trans = stateAfterDecision({ status: "approved", reasonCode: null, reasonDetail: null });
      return { ...p, status: trans.status };
    } else {
      const trans = stateAfterDecision({ status: "held", reasonCode: "family_saturation", reasonDetail: null });
      return { ...p, status: trans.status };
    }
  });

  // Após ação: apenas p1 aparece na vitrine; os retidos por saturação ficam estritamente ocultos
  const finalVitrine = updatedCatalog.filter((p) => isVitrineVisible(p.status));
  assert.equal(finalVitrine.length, 1);
  assert.equal(finalVitrine[0].id, "p1");
  assert.equal(finalVitrine[0].status, "approved");

  const nonVisible = updatedCatalog.filter((p) => !isVitrineVisible(p.status));
  assert.equal(nonVisible.length, 4);
  for (const item of nonVisible) {
    assert.equal(item.status, "held");
  }
});

test("M4-E Vitrine: Rejeição em lote mantém itens fora da vitrine", () => {
  const products = [
    { id: "r1", status: "pending" },
    { id: "r2", status: "pending" },
  ];

  const rejected = products.map((p) => {
    const trans = stateAfterDecision({ status: "rejected", reasonCode: "low_utility", reasonDetail: null });
    return { ...p, status: trans.status };
  });

  const vitrine = rejected.filter((p) => isVitrineVisible(p.status));
  assert.equal(vitrine.length, 0);
});
