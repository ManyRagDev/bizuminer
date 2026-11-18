/** Real SQL/RLS in a disposable in-memory PostgreSQL; provider calls are synthetic. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
import { PostgresStore } from "../../packages/persistence/src/pg-store.ts";
import { runCapturePlan, type CapturePlan } from "../../packages/persistence/src/capture-plan.ts";
import { ShopeeAdapter } from "../../packages/capture/src/adapters/shopee/index.ts";
import { publishCaptureSource } from "../../packages/persistence/src/capture-publication.ts";
const require = createRequire(import.meta.url);
const { CaptureBatchStore } = require("../../packages/web/lib/capture-batch-db.ts");
const { executeCaptureBatch } = require("../../packages/web/lib/capture-batch-worker.ts");
function identifiers(base: any): any {
  const sql: any = (parts: any, ...values: any[]) => typeof parts === "string"
    ? { rawFragment: '"' + parts.replaceAll('"', '""') + '"' } : base(parts, ...values);
  sql.json = base.json; sql.begin = (work: any) => base.begin((tx: any) => work(identifiers(tx))); sql.end = base.end;
  return sql;
}
const fx = await commercialFixture();
const batches = new CaptureBatchStore(fx.factory);
const facts = new PostgresStore({ connectionString: "fixture-only", sqlFactory: () => identifiers(fx.factory()) });
const directory = new URL("../../packages/persistence/supabase/migrations/", import.meta.url);
const plan: CapturePlan = { id: "departments-shopee-v1", entries: [1, 2, 3].map(id => ({
  id: `department-${id}`, category: "Casa", mode: "directed", sourceQuery: { kind: "department", categoryId: String(id), order: "sales" },
})) };
const calls: number[] = []; let failing = true; const steps: string[] = [];
const adapter = new ShopeeAdapter({ maxAttempts: 1, ratePerSecond: 100000, fetchImpl: async (_url, init) => {
  const query = JSON.parse(String(init?.body)).query;
  const id = Number(query.match(/productCatId: (\d+)/)?.[1]); calls.push(id);
  if (id === 2 && failing) return Response.json({ errors: [{ message: "System Error", extensions: { code: 10000 } }] });
  return Response.json({ data: { productOfferV2: { nodes: [{ itemId: String(id), shopId: 10, productName: `Item ${id}`,
    productLink: `https://shopee.com.br/p/${id}`, priceMin: "10.00", priceMax: "10.00" }], pageInfo: { hasNextPage: false } } } });
} });
const credential = { marketplace: "shopee", secret: { appId: "synthetic", appSecret: "synthetic" } };
const count = async (table: string) => (await fx.pg.query(`select count(*)::int as n from garimpa.${table}`)).rows[0].n;
const runStep = async (step: any) => {
  steps.push(step.kind);
  if (step.kind === "capture") {
    const summary = await runCapturePlan(adapter, credential, facts, { tenantId: "a", plan, pageSize: 10,
      operationBatchId: step.batchId, operationWorkerId: step.workerId }, { runId: `attempt-${calls.length}`, log: () => {} });
    return summary.queriesFailed ? { ok: false, error: "step_exit_failed", failureKind: summary.failure?.kind } : { ok: true };
  }
  if (step.kind === "publish") await publishCaptureSource(identifiers(fx.factory()), "a", step.batchId, step.workerId, "shopee");
  return step.kind === "triage" ? { ok: true, triage: { mode: "attribute_queue", processed: 3, approved: 0, held: 0, rejected: 0, annotatedPending: 3 } } : { ok: true };
};
try {
  for (const file of (await readdir(directory)).filter(f => /^\d{14}_/.test(f) && f > "20261015040727" && f.endsWith(".sql")).sort())
    await fx.pg.exec(await readFile(new URL(file, directory), "utf8"));
  await fx.pg.exec("insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('a','a','a','A'),('b','b','b','B')");
  const batch = await batches.create("a", ["shopee"], 1, "local", false);
  await executeCaptureBatch(batch.id, runStep, batches, "a");
  assert.deepEqual(calls, [1, 2, 3], "a category failure does not stop the remaining departments");
  assert.equal(await count("capture_prepared_offer"), 2);
  assert.equal(await count("price_observation"), 0, "incomplete source cannot enter the catalogue");
  assert.deepEqual(steps, ["capture"], "incomplete staging is not reported as successful triage");
  assert.equal((await batches.read(batch.id, "a")).metadata.execution.error, "capture_incomplete");
  await assert.rejects(() => batches.resumeLocalShopee(batch.id, "b"), /not_resumable/);
  const pending = await batches.create("a", ["shopee"], 1, "local", false);
  await assert.rejects(() => batches.resumeLocalShopee(batch.id, "a"), /unique/i);
  await fx.pg.query("update garimpa.capture_batch set status='error',finished_at=now() where id=$1", [pending.id]);
  process.env.CAPTURE_TRIAL_MODE = "single_product"; process.env.CAPTURE_TRIAL_TENANTS = "a";
  await assert.rejects(() => batches.resumeLocalShopee(batch.id, "a"), /reconciliation/);
  delete process.env.CAPTURE_TRIAL_MODE; delete process.env.CAPTURE_TRIAL_TENANTS;
  const checkpoint = (await fx.pg.query("select id from garimpa.capture_run where status='ok' order by id")).rows;
  await batches.resumeLocalShopee(batch.id, "a");
  await assert.rejects(() => batches.resumeLocalShopee(batch.id, "a"), /not_resumable/);
  failing = false;
  await executeCaptureBatch(batch.id, runStep, batches, "a");
  assert.deepEqual(calls, [1, 2, 3, 2], "only the failed query calls the provider again");
  assert.equal(await count("capture_run"), 3);
  assert.equal(await count("price_observation"), 3);
  for (const { id } of checkpoint) assert.equal((await fx.pg.query("select status from garimpa.capture_run where id=$1", [id])).rows[0].status, "ok");
  assert.equal((await batches.read(batch.id, "a")).status, "ok");
  assert.equal(await executeCaptureBatch(batch.id, runStep, batches, "a"), false, "duplicate delivery cannot replay providers");
  await assert.rejects(() => batches.resumeLocalShopee(batch.id, "a"), /not_resumable/);
  console.log("PASS partial Shopee -> checkpoint resume -> atomic source publication, affiliate and triage; account/trial/active-batch/replay guards");
  // Unknown process outcomes and old captures require separate reconciliation/new capture.
  for (const [error, old, trial] of [["step_timeout", false, false], ["step_exit_failed", true, false], ["step_exit_failed", false, true]] as const) {
    const blocked = await batches.create("a", ["shopee"], 1, "local", false);
    await fx.pg.query(`update garimpa.capture_batch set status='partial',finished_at=now(),
      started_at=case when $2 then now()-interval '49 hours' else now() end,
      metadata=jsonb_set(metadata,'{execution}',metadata->'execution'||$3::jsonb) where id=$1`,
      [blocked.id, old, JSON.stringify({ phase: "finished", trial: trial ? { mode: "single_product", version: 1 } : undefined, stores: { shopee: { status: "partial", error } } })]);
    await assert.rejects(() => batches.resumeLocalShopee(blocked.id, "a"), /not_resumable/);
  }
  console.log("PASS timeout, expired capture and persisted single-product trial remain non-replayable");
} finally { await facts.close(); await fx.pg.close(); }
