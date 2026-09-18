import test from "node:test";
import assert from "node:assert/strict";

import { groupAdminRuns, runExecutionId, toAdminRun } from "../lib/admin-run-groups.ts";

function source(overrides = {}) {
  return {
    id: "run-1",
    marketplace: "aliexpress",
    status: "ok",
    started_at: "2026-09-05T16:04:10.000Z",
    finished_at: "2026-09-05T16:04:12.000Z",
    items_captured: 8,
    items_new: 8,
    price_changes: 0,
    error: null,
    collector_run_id: "sweep-aliexpress-123:casa",
    observation_count: 8,
    parameters: {
      capturePlanId: "category-first-v1",
      captureQueryId: "casa",
      captureMode: "directed",
      targetCategory: "Casa",
      keyword: "organizador para casa",
      itemsSeen: 12,
      itemsSkippedByPolicy: 4,
    },
    ...overrides,
  };
}

test("agrupa filhos históricos pelo prefixo exato do collector_run_id", () => {
  const first = toAdminRun(source());
  const second = toAdminRun(source({
    id: "run-2",
    started_at: "2026-09-05T16:04:13.000Z",
    finished_at: "2026-09-05T16:04:16.000Z",
    collector_run_id: "sweep-aliexpress-123:audio",
    items_captured: 9,
    items_new: 5,
    price_changes: 2,
    observation_count: 9,
    parameters: { capturePlanId: "category-first-v1", captureQueryId: "audio", captureMode: "directed" },
  }));

  assert.equal(runExecutionId(first), "sweep-aliexpress-123");
  const groups = groupAdminRuns([second, first]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].searchCount, 2);
  assert.equal(groups[0].itemsCaptured, 17);
  assert.equal(groups[0].itemsNew, 13);
  assert.equal(groups[0].priceChanges, 2);
  assert.deepEqual(groups[0].children.map((run) => run.id), ["run-1", "run-2"]);
});

test("captureExecutionId explícito prevalece e não mistura execuções do mesmo plano", () => {
  const first = toAdminRun(source({
    execution_id: "exec-a",
    collector_run_id: "formato-novo-sem-sufixo",
  }));
  const second = toAdminRun(source({
    id: "run-2",
    execution_id: "exec-b",
    collector_run_id: "formato-novo-sem-sufixo",
  }));

  assert.equal(groupAdminRuns([first, second]).length, 2);
});

test("rodagem avulsa permanece isolada e não agrupa por horário", () => {
  const first = toAdminRun(source({ id: "single-a", collector_run_id: "legacy", parameters: {} }));
  const second = toAdminRun(source({ id: "single-b", collector_run_id: "legacy", parameters: {} }));

  assert.equal(groupAdminRuns([first, second]).length, 2);
});

test("status pai distingue execução parcial e preserva detalhes operacionais", () => {
  const ok = toAdminRun(source({ execution_id: "exec-a" }));
  const failed = toAdminRun(source({
    id: "run-2",
    status: "error",
    execution_id: "exec-a",
    error: "zero itens recebidos da fonte",
    collector_run_id: "sweep-aliexpress-123:audio",
    items_captured: 0,
    items_new: 0,
    observation_count: 0,
    parameters: {
      capturePlanId: "category-first-v1",
      captureQueryId: "audio",
      saturationDetected: true,
      pagesRead: 1,
    },
  }));

  const [group] = groupAdminRuns([ok, failed]);
  assert.equal(group.status, "partial");
  assert.equal(group.searchCount, 2);
  assert.equal(group.saturatedQueries, 1);
  assert.equal(group.children[1].pagesRead, 1);
  assert.equal(group.children[1].error, "zero itens recebidos da fonte");
});
