import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshotMetadata, CURATION_SNAPSHOT_VERSION } from "../lib/curation-snapshot.ts";
import { curationSignalsFor, curationSignalLabel } from "../lib/curation-signals.ts";

const facts = {
  productId: "prod_1",
  slug: "ml-MLB123",
  marketplace: "mercadolivre",
  externalId: "MLB123",
  title: "Manopla para moto",
  productUrl: "https://www.mercadolivre.com.br/p/MLB123",
  imageUrl: "https://http2.mlstatic.com/manopla.jpg",
  category: "Auto e moto",
  family: { key: "manoplas_moto", label: "Manoplas para moto", method: "title-keywords", version: "v1" },
  statusBefore: "pending",
  priceCents: 5000,
  originalPriceCents: 10000,
  claimedDiscountRate: 0.5,
  ratingStar: 4.6,
  salesLabel: "+1 mil vendidos",
  salesCount: 1000,
  observedAt: "2026-09-03T12:00:00.000Z",
  observationCount: 4,
  historyDays: 9,
  previousMinPriceCents: 4800,
  lowestVerified: false,
  signalsShown: curationSignalsFor({
    observationCount: 4,
    claimedDiscountRate: 0.5,
    category: "Auto e moto",
    ratingStar: 4.6,
  }),
  provenance: {
    presentingCaptureRunId: "run_1",
    presentingMarketplace: "aliexpress",
    planId: "category-first-v1",
    queryId: "auto-suportes",
    mode: "directed",
    targetCategory: "Auto e moto",
    targetFamily: "manoplas_moto",
  },
};

test("snapshot v1 carrega versão e os fatos exibidos pela mesa", () => {
  const metadata = buildSnapshotMetadata(facts, {
    via: "bulk",
    groupId: "grp_1234abcd",
    reviewSessionId: "session_1",
    bulkActionId: "bulk_1",
    policyVersion: "v1",
  });
  assert.equal(metadata.snapshot_version, CURATION_SNAPSHOT_VERSION);
  assert.equal(metadata.snapshot.action.via, "bulk");
  assert.equal(metadata.snapshot.action.groupId, "grp_1234abcd");
  assert.equal(metadata.snapshot.family?.key, "manoplas_moto");
  assert.equal(metadata.snapshot.provenance?.planId, "category-first-v1");
  assert.equal(metadata.snapshot.statusBefore, "pending");
  assert.equal(metadata.snapshot.imageUrl, "https://http2.mlstatic.com/manopla.jpg");
  assert.equal(metadata.snapshot.signalsShown.length, 0);
});

test("sinais objetivos derivam dos mesmos dados mostrados ao curador", () => {
  const ids = curationSignalsFor({ observationCount: 2, claimedDiscountRate: 0.8, category: null, ratingStar: null });
  assert.deepEqual(ids, ["low_history", "high_claimed_discount", "missing_category", "missing_rating"]);
  assert.equal(curationSignalLabel("low_history"), "Pouco histórico para sustentar o desconto");
  assert.equal(curationSignalLabel("high_claimed_discount"), "Desconto muito alto declarado pelo anúncio");
});
