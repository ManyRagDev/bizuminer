import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCanonicalCommissionCsv,
  calculateCanonicalReportDigest,
} from "../lib/commission-import-contract.ts";

test("parseCanonicalCommissionCsv parses valid lines and totals", () => {
  const csv = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-123,item-1,2026-10-14T10:00:00Z,10000,500,BRL,shopee,sub-a,confirmed,confirmed
ord-124,item-2,2026-10-14T11:00:00Z,25000,1250,BRL,mercadolivre,sub-b,confirmed,confirmed`;

  const preview = parseCanonicalCommissionCsv(csv);
  assert.equal(preview.totalLines, 2);
  assert.equal(preview.validRowsCount, 2);
  assert.equal(preview.errorRowsCount, 0);
  assert.equal(preview.totalOrderValueCents, 35000);
  assert.equal(preview.totalCommissionCents, 1750);
  assert.deepEqual(preview.currencies, ["BRL"]);
  assert.deepEqual(preview.marketplaces, ["mercadolivre", "shopee"]);
  assert.equal(preview.totalsByCurrency.BRL?.commissionCents, 1750);
});

test("parseCanonicalCommissionCsv catches malformed rows without crashing", () => {
  const csv = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-ok,,2026-10-14T10:00:00Z,5000,250,BRL,shopee,,confirmed,confirmed
,item-bad,2026-10-14T10:00:00Z,5000,250,BRL,shopee,,confirmed,confirmed
ord-bad-date,,not-a-date,5000,250,BRL,shopee,,confirmed,confirmed
ord-bad-cents,,2026-10-14T10:00:00Z,not-cents,250,BRL,shopee,,confirmed,confirmed
ord-bad-comm,,2026-10-14T10:00:00Z,5000,not-cents,BRL,shopee,,confirmed,confirmed
ord-trunc-comm,,2026-10-14T10:00:00Z,5000,12abc,BRL,shopee,,confirmed,confirmed
ord-trunc-order,,2026-10-14T10:00:00Z,100x,500,BRL,shopee,,confirmed,confirmed
ord-neg-comm,,2026-10-14T10:00:00Z,5000,-500,BRL,shopee,,confirmed,confirmed
ord-bad-status,,2026-10-14T10:00:00Z,5000,500,BRL,shopee,,nonsense,nonsense
short-line,item`;

  const preview = parseCanonicalCommissionCsv(csv);
  assert.equal(preview.validRowsCount, 1);
  assert.equal(preview.errorRowsCount, 9);
  assert.equal(preview.validRows[0].externalOrderId, "ord-ok");
});

test("calculateCanonicalReportDigest is invariant to row reordering (idempotency guarantee)", () => {
  const csv1 = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-123,item-1,2026-10-14T10:00:00Z,10000,500,BRL,shopee,sub-a,confirmed,confirmed
ord-124,item-2,2026-10-14T11:00:00Z,25000,1250,BRL,mercadolivre,sub-b,confirmed,confirmed`;

  const csv2 = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-124,item-2,2026-10-14T11:00:00Z,25000,1250,BRL,mercadolivre,sub-b,confirmed,confirmed
ord-123,item-1,2026-10-14T10:00:00Z,10000,500,BRL,shopee,sub-a,confirmed,confirmed`;

  const preview1 = parseCanonicalCommissionCsv(csv1);
  const preview2 = parseCanonicalCommissionCsv(csv2);

  // File digests differ because raw order is different
  assert.notEqual(preview1.fileDigest, preview2.fileDigest);
  // Canonical digests MUST match
  assert.equal(preview1.canonicalDigest, preview2.canonicalDigest);
});

test("calculateCanonicalReportDigest prevents representation collisions with colons", () => {
  const r1 = {
    externalOrderId: "a:b",
    externalItemId: "c",
    occurredAt: "2026-10-14T10:00:00Z",
    orderValueCents: 1000,
    commissionCents: 100,
    currency: "BRL",
    marketplace: "shopee",
    subId: null,
    status: "confirmed",
    commissionState: "confirmed",
  };
  const r2 = {
    ...r1,
    externalOrderId: "a",
    externalItemId: "b:c",
  };

  assert.notEqual(
    calculateCanonicalReportDigest([r1]),
    calculateCanonicalReportDigest([r2]),
    "Different order/item splits must produce different digests",
  );
});
