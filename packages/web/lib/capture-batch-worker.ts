import { randomUUID } from "node:crypto";
import {
  captureBatches,
  type BatchExecution,
  type BatchTriageSummary,
  type CaptureBatchStore,
} from "./capture-batch-db.ts";

export interface BatchStepResult {
  ok: boolean;
  error?: string;
  triage?: BatchTriageSummary;
}
export type BatchStepRunner = (step: {
  kind: "capture" | "triage";
  tenantId: string;
  batchId: string;
  workerId: string;
  marketplace?: string;
  pages: number;
  mlConsent: boolean;
}) => Promise<BatchStepResult>;

/** One owner, sequential stores, then batch-scoped triage. Independent of HTTP/browser lifetime. */
export async function executeCaptureBatch(
  id: string,
  runStep: BatchStepRunner,
  store: CaptureBatchStore = captureBatches,
  tenantId = "local",
): Promise<boolean> {
  const workerId = randomUUID();
  const batch = await store.claim(id, workerId, tenantId);
  if (!batch) return false; // Duplicate/late workflow delivery must not repeat capture or paid AI.
  if (batch.tenant_id !== tenantId) throw new Error("capture_batch_tenant_mismatch");
  const execution: BatchExecution = batch.metadata.execution!;
  try {
    for (const marketplace of batch.requested_marketplaces) {
      if (
        ["ok", "partial", "error"].includes(
          execution.stores[marketplace]?.status,
        )
      )
        continue;
      if (marketplace === "mercadolivre") {
        if (execution.browser?.requestId) {
          const status = await store.settleStore(id, marketplace, false, tenantId);
          execution.stores[marketplace] = { status };
          await store.update(id, workerId, execution, "running", tenantId);
          continue;
        }
        if (execution.browser?.skipped) {
          const status = await store.settleStore(id, marketplace, true, tenantId);
          execution.stores[marketplace] = { status, error: "manual_capture_skipped" };
          await store.update(id, workerId, execution, "running", tenantId);
          continue;
        }
        if (execution.browser && execution.mlConsent) {
          execution.stores[marketplace] = {
            status: "awaiting_browser",
            error: "manual_capture_only",
          };
          await store.update(id, workerId, execution, "running", tenantId);
          continue;
        }
        const status = await store.settleStore(id, marketplace, true, tenantId);
        execution.stores[marketplace] = {
          status,
          error: execution.mlConsent ? "manual_capture_only" : "ml_consent_required",
        };
        await store.update(id, workerId, execution, "running", tenantId);
        continue;
      }
      execution.stores[marketplace] = { status: "running" };
      await store.update(id, workerId, execution, "running", tenantId);
      let result: BatchStepResult;
      try {
        result = await runStep({
          kind: "capture",
          tenantId: batch.tenant_id,
          batchId: id,
          workerId,
          marketplace,
          pages: batch.pages,
          mlConsent: execution.mlConsent,
        });
      } catch {
        result = { ok: false, error: "capture_step_failed" };
      }
      const status = await store.settleStore(id, marketplace, !result.ok, tenantId);
      execution.stores[marketplace] = {
        status,
        error: result.error,
      };
      await store.update(id, workerId, execution, "running", tenantId);
    }
    const statuses = Object.values(execution.stores).map((step) => step.status);
    if (statuses.includes("awaiting_browser")) {
      execution.phase = "awaiting_browser";
      execution.deadline = new Date(Date.now() + 30 * 60_000).toISOString();
      delete execution.workerId;
      await store.update(id, workerId, execution, "running", tenantId);
      return true;
    }
    if (statuses.every((status) => status === "error")) {
      execution.phase = "finished";
      execution.error = "capture_failed";
      await store.update(id, workerId, execution, "error", tenantId);
      return true;
    }
    execution.phase = "triaging";
    await store.update(id, workerId, execution, "running", tenantId);
    const result = await runStep({
      kind: "triage",
      tenantId: batch.tenant_id,
      batchId: id,
      workerId,
      pages: batch.pages,
      mlConsent: execution.mlConsent,
    });
    execution.phase = "finished";
    execution.triage = result.triage;
    execution.error =
      result.ok && result.triage
        ? undefined
        : (result.error ?? "triage_failed");
    if (execution.error) await store.failTriage(id, tenantId);
    await store.update(
      id,
      workerId,
      execution,
      !execution.error && statuses.every((status) => status === "ok")
        ? "ok"
        : "partial",
      tenantId,
    );
    return true;
  } catch {
    execution.phase = "finished";
    execution.error = "worker_failed";
    try {
      await store.failTriage(id, tenantId);
    } catch {
      /* Timeout reconciler will retry. */
    }
    try {
      await store.update(id, workerId, execution, "error", tenantId);
    } catch {
      /* Expiration already owns final status. */
    }
    throw new Error("capture_batch_worker_failed");
  }
}
