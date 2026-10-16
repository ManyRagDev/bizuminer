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
): Promise<boolean> {
  const workerId = randomUUID();
  const batch = await store.claim(id, workerId);
  if (!batch) return false; // Duplicate/late workflow delivery must not repeat capture or paid AI.
  const execution: BatchExecution = batch.metadata.execution!;
  try {
    for (const marketplace of batch.requested_marketplaces) {
      if (
        ["ok", "partial", "error"].includes(
          execution.stores[marketplace]?.status,
        )
      )
        continue;
      execution.stores[marketplace] = { status: "running" };
      await store.update(id, workerId, execution);
      let result: BatchStepResult;
      try {
        if (marketplace === "mercadolivre" && !execution.mlConsent)
          throw new Error("ml_consent_required");
        result = await runStep({
          kind: "capture",
          batchId: id,
          workerId,
          marketplace,
          pages: batch.pages,
          mlConsent: execution.mlConsent,
        });
      } catch {
        result = { ok: false, error: "capture_step_failed" };
      }
      const status = await store.settleStore(id, marketplace, !result.ok);
      // Browser metadata authorizes a contingency, never replaces the automatic attempt.
      // Transport, parser and executor failures do not establish a verification challenge.
      const needsBrowser =
        !result.ok &&
        marketplace === "mercadolivre" &&
        execution.browser &&
        execution.mlConsent &&
        result.error === "ml_access_verification_required";
      execution.stores[marketplace] = {
        status: needsBrowser ? "awaiting_browser" : status,
        error: result.error,
      };
      await store.update(id, workerId, execution);
    }
    const statuses = Object.values(execution.stores).map((step) => step.status);
    if (statuses.includes("awaiting_browser")) {
      execution.phase = "awaiting_browser";
      execution.deadline = new Date(Date.now() + 30 * 60_000).toISOString();
      delete execution.workerId;
      await store.update(id, workerId, execution);
      return true;
    }
    if (statuses.every((status) => status === "error")) {
      execution.phase = "finished";
      execution.error = "capture_failed";
      await store.update(id, workerId, execution, "error");
      return true;
    }
    execution.phase = "triaging";
    await store.update(id, workerId, execution);
    const result = await runStep({
      kind: "triage",
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
    if (execution.error) await store.failTriage(id);
    await store.update(
      id,
      workerId,
      execution,
      !execution.error && statuses.every((status) => status === "ok")
        ? "ok"
        : "partial",
    );
    return true;
  } catch {
    execution.phase = "finished";
    execution.error = "worker_failed";
    try {
      await store.failTriage(id);
    } catch {
      /* Timeout reconciler will retry. */
    }
    try {
      await store.update(id, workerId, execution, "error");
    } catch {
      /* Expiration already owns final status. */
    }
    throw new Error("capture_batch_worker_failed");
  }
}
