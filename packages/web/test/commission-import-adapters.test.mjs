import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectReportFormat,
  parseAmountToCents,
  parseDateToIso,
  parseMarketplaceCommissionReport,
} from "../lib/commission-import-adapters.ts";
import { parseCanonicalCommissionCsv } from "../lib/commission-import-contract.ts";

test("parseAmountToCents handles various currency formats", () => {
  assert.equal(parseAmountToCents("100"), 10000);
  assert.equal(parseAmountToCents("100.50"), 10050);
  assert.equal(parseAmountToCents("100,50"), 10050);
  assert.equal(parseAmountToCents("R$ 1.250,50"), 125050);
  assert.equal(parseAmountToCents("$ 1,250.50"), 125050);
  assert.equal(parseAmountToCents("0,99"), 99);
  assert.equal(parseAmountToCents("invalid"), null);
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents(null), null);
});

test("parseDateToIso handles ISO and Brazilian date formats", () => {
  assert.equal(parseDateToIso("2026-10-15T14:30:00.000Z"), "2026-10-15T14:30:00.000Z");
  assert.equal(parseDateToIso("15/10/2026"), "2026-10-15T00:00:00.000Z");
  assert.equal(parseDateToIso("15/10/2026 14:30:00"), "2026-10-15T14:30:00.000Z");
  assert.equal(parseDateToIso("data-invalida"), null);
});

test("detectReportFormat accurately identifies marketplace formats", () => {
  const canonicalHeader = "externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState";
  const shopeeEnHeader = "Order ID,Item ID,Purchase Time,Order Amount,Estimated Commission,Currency,Sub_id1,Order Status";
  const shopeePtHeader = "ID do pedido,ID do item,Horário do pedido,Valor do pedido,Comissão estimada,Moeda,Sub ID,Status do pedido";
  const aliHeader = "Order Number,Product ID,Order Time,Payment Amount,Estimated Commission,Currency,Tracking ID,Order Status";
  const mlHeader = "Transaction ID,Listing ID,Order Date,Total Amount,Commission Amount,Currency,Sub ID,Status";

  assert.equal(detectReportFormat(canonicalHeader), "canonical");
  assert.equal(detectReportFormat(shopeeEnHeader), "shopee");
  assert.equal(detectReportFormat(shopeePtHeader), "shopee");
  assert.equal(detectReportFormat(aliHeader), "aliexpress");
  assert.equal(detectReportFormat(mlHeader), "mercadolivre");
});

test("parseMarketplaceCommissionReport parses Shopee report format", () => {
  const shopeeCsv = `Order ID,Item ID,Purchase Time,Order Amount,Estimated Commission,Currency,Sub_id1,Order Status
261015SHP001,item-shopee-1,2026-10-15T10:00:00Z,"R$ 150,00","R$ 15,00",BRL,camp-01,Completed
261015SHP002,item-shopee-2,15/10/2026 11:30:00,"R$ 80,50","R$ 8,05",BRL,camp-02,Cancelled`;

  const preview = parseMarketplaceCommissionReport(shopeeCsv);
  assert.equal(preview.validRowsCount, 2);
  assert.equal(preview.errorRowsCount, 0);
  assert.equal(preview.totalOrderValueCents, 23050);
  assert.equal(preview.totalCommissionCents, 2305);
  assert.deepEqual(preview.marketplaces, ["shopee"]);
  assert.equal(preview.validRows[0].externalOrderId, "261015SHP001");
  assert.equal(preview.validRows[0].status, "confirmed");
  assert.equal(preview.validRows[0].commissionState, "confirmed");
  assert.equal(preview.validRows[1].externalOrderId, "261015SHP002");
  assert.equal(preview.validRows[1].status, "cancelled");
  assert.equal(preview.validRows[1].commissionState, "reversed");
});

test("parseMarketplaceCommissionReport parses AliExpress report format", () => {
  const aliCsv = `Order Number,Product ID,Order Time,Payment Amount,Estimated Commission,Currency,Tracking ID,Order Status
ALI-99887766,ali-item-1,2026-10-15T12:00:00Z,45.00,4.50,USD,track-ali,Finished
ALI-99887767,ali-item-2,2026-10-15T13:00:00Z,10.00,1.00,USD,track-ali,Payment Confirmed`;

  const preview = parseMarketplaceCommissionReport(aliCsv);
  assert.equal(preview.validRowsCount, 2);
  assert.equal(preview.errorRowsCount, 0);
  assert.equal(preview.totalOrderValueCents, 5500);
  assert.equal(preview.totalCommissionCents, 550);
  assert.deepEqual(preview.currencies, ["USD"]);
  assert.deepEqual(preview.marketplaces, ["aliexpress"]);
  assert.equal(preview.validRows[0].status, "confirmed");
  assert.equal(preview.validRows[1].status, "pending");
});

test("parseMarketplaceCommissionReport parses Mercado Livre report format", () => {
  const mlCsv = `Transaction ID,Listing ID,Order Date,Total Amount,Commission Amount,Currency,Sub ID,Status
MLB-TRANS-1001,MLB123456,15/10/2026,199.90,19.99,BRL,camp-ml,Paid
MLB-TRANS-1002,MLB123457,15/10/2026,299.00,29.90,BRL,camp-ml,Pending`;

  const preview = parseMarketplaceCommissionReport(mlCsv);
  assert.equal(preview.validRowsCount, 2);
  assert.equal(preview.errorRowsCount, 0);
  assert.equal(preview.totalOrderValueCents, 49890);
  assert.equal(preview.totalCommissionCents, 4989);
  assert.deepEqual(preview.marketplaces, ["mercadolivre"]);
  assert.equal(preview.validRows[0].status, "confirmed");
  assert.equal(preview.validRows[1].status, "pending");
});

test("parseCanonicalCommissionCsv delegates automatically to marketplace adapters when non-canonical CSV is provided", () => {
  const shopeeCsv = `Order ID,Item ID,Purchase Time,Order Amount,Estimated Commission,Currency,Sub_id1,Order Status
261015SHP001,item-shopee-1,2026-10-15T10:00:00Z,"R$ 150,00","R$ 15,00",BRL,camp-01,Completed`;

  const preview = parseCanonicalCommissionCsv(shopeeCsv);
  assert.equal(preview.validRowsCount, 1);
  assert.equal(preview.marketplaces[0], "shopee");
  assert.equal(preview.validRows[0].commissionCents, 1500);
});

test("duplicate rows within the same report batch are detected and deducted", () => {
  const shopeeCsv = `Order ID,Item ID,Purchase Time,Order Amount,Estimated Commission,Currency,Sub_id1,Order Status
DUP001,item-1,2026-10-15T10:00:00Z,"R$ 100,00","R$ 10,00",BRL,camp-01,Completed
DUP001,item-1,2026-10-15T10:00:00Z,"R$ 100,00","R$ 10,00",BRL,camp-01,Completed`;

  const preview = parseMarketplaceCommissionReport(shopeeCsv);
  assert.equal(preview.validRowsCount, 1);
  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.totalCommissionCents, 1000);
});


test("BUG-001: semicolon report preserves decimal comma, currency and status", () => {
  const csv = "Order id;Order time;Order amount;Estimated commission;Currency;Status\nORDER123;2026-10-15;150,50;15,05;BRL;Completed";
  const p = parseCanonicalCommissionCsv(csv);
  assert.equal(p.errorRowsCount, 0);
  assert.deepEqual(p.validRows.map(r => [r.orderValueCents, r.commissionCents, r.currency, r.status]), [[15050,1505,"BRL","confirmed"]]);
});
test("BUG-002: invalid dates are rejected without losing valid rows or digest stability", () => {
  const header = "Order id,Order time,Order amount,Estimated commission,Currency,Status";
  const rows = ["ORDER123,,150.50,15.05,BRL,Completed", "ORDER124,31/02/2026,10.00,1.00,BRL,Completed", "ORDER125,2026-02-31,10.00,1.00,BRL,Completed", "ORDER126,2026-10-15,10.00,1.00,USD,Completed"];
  const p = parseMarketplaceCommissionReport([header,...rows].join("\n"));
  const q = parseMarketplaceCommissionReport([header,...rows.reverse()].join("\n"));
  assert.equal(p.errorRowsCount, 3); assert.equal(p.validRowsCount, 1);
  assert.ok(p.errors.every(e => e.line >= 2 && e.reason.includes("Data")));
  assert.equal(p.canonicalDigest, q.canonicalDigest);
});
test("BUG-003: marketplace header only returns an empty preview through both entrypoints", () => {
  for (const parse of [parseMarketplaceCommissionReport, parseCanonicalCommissionCsv]) {
    const p = parse("Order id,Estimated commission");
    assert.equal(p.validRowsCount,0); assert.equal(p.totalLines,0);
  }
});
