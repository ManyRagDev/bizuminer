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
  buildDepartmentPlan,
  formatDepartmentPlanPreview,
  INITIAL_DEPARTMENTS,
} from "../src/department-plan.ts";
import { runCapturePlan } from "../src/capture-plan.ts";
import { InMemoryStore } from "../src/store.ts";

const ctx: CaptureContext = { runId: "dept-plan-test", log: () => {} };
const cred: Credential = { marketplace: "test", secret: {} };

function offer(id: string): RawOffer {
  return {
    marketplace: "test",
    externalId: id,
    title: `Produto ${id}`,
    productUrl: `https://example.com/p/${id}`,
    priceCents: 2500,
    capturedAt: new Date("2026-11-08T12:00:00Z"),
    source: "official_api",
  };
}

test("buildDepartmentPlan cria 12 recortes para Shopee e AliExpress com IDs oficiais", () => {
  const shopeePlan = buildDepartmentPlan("shopee", { order: "sales" });
  assert.equal(shopeePlan.id, "departments-shopee-v1");
  assert.equal(shopeePlan.entries.length, 12);
  assert.equal(shopeePlan.entries[0]!.sourceQuery?.kind, "department");
  assert.equal(shopeePlan.entries[0]!.sourceQuery?.categoryId, "100636");
  assert.equal(shopeePlan.entries[0]!.sourceQuery?.order, "sales");

  const aliPlan = buildDepartmentPlan("aliexpress", { order: "default" });
  assert.equal(aliPlan.id, "departments-aliexpress-v1");
  assert.equal(aliPlan.entries.length, 12);
  assert.equal(aliPlan.entries[0]!.sourceQuery?.kind, "department");
  assert.equal(aliPlan.entries[0]!.sourceQuery?.categoryId, "15");
  assert.equal(aliPlan.entries[0]!.sourceQuery?.order, "default");
});

test("formatDepartmentPlanPreview formata orçamentos e IDs sem rede", () => {
  const preview = formatDepartmentPlanPreview("shopee", { pages: 2, pageSize: 30, order: "discount" });
  assert.match(preview, /departments-shopee-v1/);
  assert.match(preview, /Ordem: discount/);
  assert.match(preview, /Total de departamentos: 12/);
  assert.match(preview, /Orçamento máximo de consulta: 720 anúncios/);
  assert.match(preview, /100636/);
});

test("runCapturePlan executa entradas com sourceQuery e repassa para a busca", async () => {
  const capturedParams: FetchParams[] = [];
  const adapter: CaptureAdapter = {
    marketplace: "shopee",
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
      capturedParams.push(params);
      const catId = params.sourceQuery?.kind === "department" ? params.sourceQuery.categoryId : "0";
      yield [offer(`item-${catId}`)];
    },
  };

  const plan = buildDepartmentPlan("shopee", {
    departments: [INITIAL_DEPARTMENTS[0]!, INITIAL_DEPARTMENTS[1]!],
    order: "sales",
  });

  const store = new InMemoryStore();
  const summary = await runCapturePlan(
    adapter,
    cred,
    store,
    {
      tenantId: "t1",
      plan,
      maxPagesPerQuery: 1,
      pageSize: 20,
    },
    ctx,
  );

  assert.equal(summary.queriesCompleted, 2);
  assert.equal(summary.itemsNew, 2);
  assert.equal(capturedParams.length, 2);
  assert.equal(capturedParams[0]!.sourceQuery?.categoryId, "100636");
  assert.equal(capturedParams[1]!.sourceQuery?.categoryId, "100010");
  assert.equal(capturedParams[0]!.pageSize, 20);
});
