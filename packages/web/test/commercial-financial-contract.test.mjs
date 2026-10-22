import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCommissionSummary,
  calculateSaaSRevenueSummary,
  calculateOperationalCostsSummary,
  VALID_CONVERSION_SOURCES,
  VALID_VERIFICATION_LEVELS,
  VALID_CONVERSION_STATUSES,
  VALID_COMMISSION_STATES,
  VALID_COST_KINDS,
  VALID_SAAS_REVENUE_STATES,
} from "../lib/commercial-financial-contract.ts";

test("calculateCommissionSummary groups states without multi-counting revenues", () => {
  const entries = [
    {
      id: "1",
      tenantId: "local",
      sourceKey: "ml-ord-1-est",
      amountCents: 1500,
      currency: "BRL",
      state: "estimated",
      occurredAt: "2026-10-14T10:00:00Z",
      sourceRef: "test",
      createdAt: "2026-10-14T10:00:00Z",
    },
    {
      id: "2",
      tenantId: "local",
      sourceKey: "ml-ord-1-pen",
      amountCents: 1500,
      currency: "BRL",
      state: "pending",
      occurredAt: "2026-10-14T11:00:00Z",
      sourceRef: "test",
      createdAt: "2026-10-14T11:00:00Z",
    },
    {
      id: "3",
      tenantId: "local",
      sourceKey: "ml-ord-1-conf",
      amountCents: 1500,
      currency: "BRL",
      state: "confirmed",
      occurredAt: "2026-10-14T12:00:00Z",
      sourceRef: "test",
      createdAt: "2026-10-14T12:00:00Z",
    },
    {
      id: "4",
      tenantId: "local",
      sourceKey: "ml-ord-1-rec",
      amountCents: 1500,
      currency: "BRL",
      state: "received",
      occurredAt: "2026-10-14T13:00:00Z",
      sourceRef: "test",
      createdAt: "2026-10-14T13:00:00Z",
    },
    {
      id: "5",
      tenantId: "local",
      sourceKey: "ml-ord-2-rev",
      amountCents: 500,
      currency: "BRL",
      state: "reversed",
      occurredAt: "2026-10-14T14:00:00Z",
      sourceRef: "test",
      createdAt: "2026-10-14T14:00:00Z",
    },
  ];

  const summary = calculateCommissionSummary(entries, "BRL");

  assert.equal(summary.estimatedCents, 1500);
  assert.equal(summary.pendingCents, 1500);
  assert.equal(summary.confirmedCents, 1500);
  assert.equal(summary.receivedCashCents, 1500);
  assert.equal(summary.reversedCents, 500);
  assert.equal(summary.totalEntriesCount, 5);
});

test("calculateSaaSRevenueSummary tracks billed net and cash received", () => {
  const entries = [
    {
      id: "s1",
      tenantId: "local",
      obligationKey: "sub-oct-2026",
      eventKey: "sub-oct-2026-billed",
      contractRef: "pilot-agreement-v1",
      amountCents: 29900,
      currency: "BRL",
      state: "billed",
      occurredAt: "2026-10-01T00:00:00Z",
      sourceRef: "invoice-01",
      createdAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "s2",
      tenantId: "local",
      obligationKey: "sub-oct-2026",
      eventKey: "sub-oct-2026-received",
      contractRef: "pilot-agreement-v1",
      amountCents: 29900,
      currency: "BRL",
      state: "received",
      occurredAt: "2026-10-02T10:00:00Z",
      sourceRef: "pix-01",
      createdAt: "2026-10-02T10:00:00Z",
    },
    {
      id: "s3",
      tenantId: "local",
      obligationKey: "sub-discount",
      eventKey: "sub-discount-reversed",
      contractRef: "pilot-agreement-v1",
      amountCents: 5000,
      currency: "BRL",
      state: "reversed",
      occurredAt: "2026-10-03T10:00:00Z",
      sourceRef: "adjustment",
      createdAt: "2026-10-03T10:00:00Z",
    },
  ];

  const summary = calculateSaaSRevenueSummary(entries, "BRL");
  assert.equal(summary.billedNetCents, 24900, "billed 29900 - reversed 5000 = 24900");
  assert.equal(summary.receivedCashCents, 29900);
  assert.equal(summary.reversedCents, 5000);
  assert.equal(summary.entriesCount, 3);
});

test("calculateOperationalCostsSummary distinguishes monetary costs from unallocated human seconds", () => {
  const costs = [
    {
      id: "c1",
      tenantId: "local",
      kind: "ai",
      amountCents: 1250,
      currency: "BRL",
      source: "gemini-api",
      periodStart: "2026-10-01T00:00:00Z",
      periodEnd: "2026-10-14T00:00:00Z",
      verification: "invoice",
      createdAt: "2026-10-14T00:00:00Z",
    },
    {
      id: "c2",
      tenantId: "local",
      kind: "human_time",
      durationSeconds: 3600, // 1 hour without tariff
      amountCents: null,
      source: "curation-review",
      periodStart: "2026-10-14T09:00:00Z",
      periodEnd: "2026-10-14T10:00:00Z",
      verification: "operator-log",
      createdAt: "2026-10-14T10:00:00Z",
    },
  ];

  const summary = calculateOperationalCostsSummary(costs, "BRL");
  assert.equal(summary.totalMonetaryCostCents, 1250);
  assert.equal(summary.monetaryCostsByKindCents.ai, 1250);
  assert.equal(summary.monetaryCostsByKindCents.human_time, 0, "não deve fabricar custo monetário zero para horas sem tarifa");
  assert.equal(summary.unallocatedHumanSeconds, 3600, "deve manter 3600 segundos como tempo humano não alocado");
});

test("constants validate valid domain values per C-07", () => {
  assert.deepEqual(VALID_CONVERSION_SOURCES, ["manual", "report", "api"]);
  assert.deepEqual(VALID_VERIFICATION_LEVELS, ["declared", "documented", "provider_confirmed"]);
  assert.deepEqual(VALID_CONVERSION_STATUSES, ["reported", "pending", "confirmed", "cancelled", "refunded"]);
  assert.deepEqual(VALID_COMMISSION_STATES, ["estimated", "pending", "confirmed", "reversed", "received"]);
  assert.deepEqual(VALID_COST_KINDS, ["infrastructure", "ai", "messaging", "creative", "human_time"]);
  assert.deepEqual(VALID_SAAS_REVENUE_STATES, ["billed", "received", "reversed"]);
});
