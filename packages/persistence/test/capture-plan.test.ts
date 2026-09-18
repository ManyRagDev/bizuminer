import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  CaptureAdapter,
  CaptureContext,
  Credential,
  FetchParams,
  RawOffer,
} from "../../capture/src/types.ts";
import {
  CATEGORY_FIRST_PLAN,
  entriesForMode,
  runCapturePlan,
  type CapturePlan,
} from "../src/capture-plan.ts";
import { InMemoryStore } from "../src/store.ts";

const ctx: CaptureContext = { runId: "plan-test", log: () => {} };
const cred: Credential = { marketplace: "test", secret: {} };

function offer(keyword: string): RawOffer {
  return {
    marketplace: "test",
    externalId: keyword,
    title: keyword,
    productUrl: `https://example.com/${encodeURIComponent(keyword)}`,
    priceCents: 1000,
    capturedAt: new Date("2026-09-03T12:00:00Z"),
    source: "official_api",
  };
}

function searchableAdapter(): CaptureAdapter {
  return {
    marketplace: "test",
    capabilities: {
      search: true,
      offerFeed: true,
      linkGeneration: false,
      conversionReport: false,
      source: "official_api",
    },
    validateCredential: async () => ({ ok: true, checkedAt: new Date() }),
    fetchOffers: async () => ({ offers: [] }),
    async *streamOffers(_cred: Credential, params: FetchParams) {
      yield [offer(params.keyword ?? "sem-termo")];
    },
  };
}

test("plano padrão mantém proporção 80/20 e não usa achadinhos", () => {
  assert.equal(entriesForMode(CATEGORY_FIRST_PLAN, "directed").length, 8);
  assert.equal(entriesForMode(CATEGORY_FIRST_PLAN, "exploratory").length, 2);
  assert.equal(CATEGORY_FIRST_PLAN.entries.some((entry) => /achadinhos/i.test(entry.keyword)), false);
});

test("executor cria uma rodagem auditável para cada intenção", async () => {
  const plan: CapturePlan = {
    id: "test-plan",
    entries: [
      { id: "casa", mode: "directed", category: "Casa", keyword: "organizador" },
      { id: "audio", mode: "directed", category: "Tecnologia", keyword: "fone bluetooth" },
    ],
  };
  const store = new InMemoryStore();
  const summary = await runCapturePlan(
    searchableAdapter(),
    cred,
    store,
    { tenantId: "t1", plan, maxPagesPerQuery: 1 },
    ctx,
  );

  assert.equal(summary.queriesCompleted, 2);
  assert.equal(summary.itemsNew, 2);
  assert.equal(store.allRuns.length, 2);
  assert.deepEqual(store.allRuns.map((run) => run.parameters.captureQueryId), ["casa", "audio"]);
  assert.deepEqual(store.allRuns.map((run) => run.parameters.captureExecutionId), ["plan-test", "plan-test"]);
});

test("consulta vazia continua sendo falha explícita no resumo do plano", async () => {
  const adapter = searchableAdapter();
  const empty: CaptureAdapter = {
    ...adapter,
    async *streamOffers() {
      yield [];
    },
  };
  const plan: CapturePlan = {
    id: "empty-plan",
    entries: [{ id: "empty", mode: "directed", category: "Casa", keyword: "sem resultado" }],
  };
  const summary = await runCapturePlan(empty, cred, new InMemoryStore(), { tenantId: "t1", plan }, ctx);

  assert.equal(summary.queriesCompleted, 0);
  assert.equal(summary.queriesFailed, 1);
});
