import { randomUUID } from "node:crypto";
import { CAPTURE_DIAGNOSTIC_CODES, CAPTURE_DIAGNOSTIC_PHASES, CAPTURE_SQL_STATES } from "../../persistence/src/capture-diagnostic.ts";
import {
  captureBatches,
  type BatchExecution,
  type BatchCaptureTrial,
  type BatchFailureKind,
  type TrialFailure,
  type TrialFailureError,
  type TrialStepDiagnostic,
  type BatchTriageSummary,
  type CaptureBatchStore,
} from "./capture-batch-db.ts";

export interface BatchStepResult {
  ok: boolean;
  error?: string;
  triage?: BatchTriageSummary;
  failureKind?: BatchFailureKind;
  retryAfterMs?: number;
  /** Untrusted child boundary; only the sanitized TrialStepDiagnostic is persisted. */
  diagnostic?: unknown;
}
export type BatchStepRunner = (step: {
  kind: "capture" | "publish" | "triage" | "affiliate";
  captureRunId?: string;
  tenantId: string;
  batchId: string;
  workerId: string;
  marketplace?: string;
  pages: number;
  mlConsent: boolean;
  planMode?: "departments" | "keywords";
  sortOrder?: "sales" | "default" | "discount";
  pageSize?: number;
  trial?: BatchCaptureTrial;
}) => Promise<BatchStepResult>;

/** Persist machine codes only; child output/provider messages are never an audit payload. */
function trialFailure(execution: BatchExecution, result?: BatchStepResult): TrialFailure {
  const errors: readonly string[] = ["step_timeout", "step_exit_failed", "spawn_failed", "step_aborted", "capture_cli_failed"];
  const kinds: readonly string[] = ["transient", "rate_limit", "quota", "credential", "permanent"];
  const phase = execution.phase;
  const raw = result?.diagnostic;
  const diagnostic: TrialStepDiagnostic = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const input = raw as Record<string, unknown>;
    if (input.exitCode === null || (typeof input.exitCode === "number" && Number.isInteger(input.exitCode) && input.exitCode >= 0 && input.exitCode <= 255)) diagnostic.exitCode = input.exitCode;
    const signal = (["SIGKILL", "SIGTERM", "SIGABRT", "SIGSEGV"] as const).find(value => value === input.signal);
    if (input.signal === null || signal) diagnostic.signal = input.signal === null ? null : signal;
    const code = CAPTURE_DIAGNOSTIC_CODES.find(value => value === input.diagnosticCode);
    const diagnosticPhase = CAPTURE_DIAGNOSTIC_PHASES.find(value => value === input.phase);
    const sqlState = CAPTURE_SQL_STATES.find(value => value === input.sqlState);
    if (code) diagnostic.diagnosticCode = code;
    if (input.version === 1) diagnostic.version = 1;
    if (diagnosticPhase) diagnostic.phase = diagnosticPhase;
    if (sqlState) diagnostic.sqlState = sqlState;
    if (typeof input.stderrBytes === "number" && Number.isInteger(input.stderrBytes) && input.stderrBytes >= 0 && input.stderrBytes <= 1_073_741_824) diagnostic.stderrBytes = input.stderrBytes;
    if (typeof input.durationMs === "number" && Number.isInteger(input.durationMs) && input.durationMs >= 0 && input.durationMs <= 86_400_000) diagnostic.durationMs = input.durationMs;
  }
  return {
    stage: phase === "capturing" ? "capture" : phase === "publishing" ? "publish"
      : phase === "affiliating" ? "affiliate" : phase === "triaging" ? "triage" : "worker",
    phase,
    at: new Date().toISOString(),
    error: errors.includes(result?.error ?? "") ? result!.error as TrialFailureError : "capture_cli_failed",
    ...(kinds.includes(result?.failureKind ?? "") ? { failureKind: result!.failureKind } : {}),
    ...(Object.keys(diagnostic).length ? { diagnostic } : {}),
  };
}

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
  const deferredStores: Array<{phase:"retry_wait"|"awaiting_authorization"|"awaiting_reconciliation";error:string;nextAttemptAt?:string}> = [];
  delete execution.error;
  delete execution.nextAttemptAt;
  const waitForTrialReconciliation = async (error: string, result?: BatchStepResult) => {
    execution.trialFailure ??= trialFailure(execution, result);
    execution.phase = "awaiting_reconciliation";
    execution.error = error;
    delete execution.workerId;
    await store.update(id, workerId, execution, "running", tenantId);
  };
  const publishSource = async (marketplace: string): Promise<boolean> => {
    if (execution.publishedAt || execution.publishedSources?.includes(marketplace)) return true;
    execution.phase = "publishing";
    await store.update(id, workerId, execution, "running", tenantId);
    const result = await runStep({ kind: "publish", tenantId, batchId: id, workerId, marketplace,
      pages: batch.pages, mlConsent: execution.mlConsent, trial: execution.trial });
    if (!result.ok) {
      if (execution.trial) { await waitForTrialReconciliation("capture_publication_unconfirmed", result); return false; }
      if (execution.executor === "durable" && ["transient", "rate_limit", "quota", "credential"].includes(result.failureKind ?? "")) {
        const phase=result.failureKind==='quota' || result.failureKind==='credential' ? 'awaiting_authorization' : 'retry_wait';
        const nextAttemptAt=phase==='retry_wait' ? new Date(Date.now() + Math.max(result.retryAfterMs ?? 0, 60_000)).toISOString() : undefined;
        execution.stores[marketplace]={status:'ok',error:'capture_publication_unconfirmed',waitKind:phase,...(nextAttemptAt ? {nextAttemptAt} : {})};
        deferredStores.push({phase,error:'capture_publication_unconfirmed',nextAttemptAt});
        execution.phase='capturing';
        await store.update(id, workerId, execution, "running", tenantId);
        return false;
      }
      execution.stores[marketplace]={status:'error',error:'capture_publication_failed'};
      execution.phase='capturing';
      await store.update(id,workerId,execution,'running',tenantId);
      return false;
    }
    execution.stores[marketplace]={status:'ok'};
    execution.publishedSources = [...(execution.publishedSources ?? []), marketplace];
    execution.phase = "capturing";
    await store.update(id, workerId, execution, "running", tenantId);
    return true;
  };
  try {
    if (execution.trial && (execution.trial.mode !== "single_product" || execution.trial.version !== 1
      || batch.requested_marketplaces.length !== 1 || batch.requested_marketplaces[0] !== "shopee"
      || batch.pages !== 1 || execution.pageSize !== 10 || execution.planMode !== "keywords")) {
      await waitForTrialReconciliation("capture_trial_invalid");
      return true;
    }
    for (const marketplace of batch.requested_marketplaces) {
      const waiting=execution.stores[marketplace];
      if(waiting?.waitKind==='awaiting_reconciliation') {
        deferredStores.push({phase:'awaiting_reconciliation',error:waiting.error ?? 'capture_result_unknown'});continue;
      }
      if(waiting?.waitKind==='awaiting_authorization') {
        deferredStores.push({phase:'awaiting_authorization',error:waiting.error ?? 'credential_required'});continue;
      }
      if(waiting?.waitKind==='retry_wait' && waiting.nextAttemptAt
        && Date.parse(waiting.nextAttemptAt)>Date.now()) {
        deferredStores.push({phase:'retry_wait',error:waiting.error ?? 'capture_retry_wait',nextAttemptAt:waiting.nextAttemptAt});continue;
      }
      if (
        ["ok", "partial", "error"].includes(
          execution.stores[marketplace]?.status,
        )
      ) {
        if (execution.stores[marketplace]?.status === "ok" && !await publishSource(marketplace) && execution.trial) return true;
        continue;
      }
      if (marketplace === "mercadolivre") {
        if (execution.browser?.requestId) {
          const status = await store.settleStore(id, marketplace, false, tenantId);
          execution.stores[marketplace] = { status };
          await store.update(id, workerId, execution, "running", tenantId);
          if (status === "ok" && !await publishSource(marketplace) && execution.trial) return true;
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
      if (execution.trial && execution.trialCaptureAttempted) {
        await waitForTrialReconciliation("capture_trial_result_unknown");
        return true;
      }
      if (execution.trial) execution.trialCaptureAttempted = true;
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
          planMode: execution.planMode,
          sortOrder: execution.sortOrder,
          pageSize: execution.pageSize,
          trial: execution.trial,
        });
      } catch {
        result = { ok: false, error: "capture_step_failed" };
      }
      if (!result.ok && execution.trial) {
        await waitForTrialReconciliation("capture_trial_result_unknown", result);
        return true;
      }
      if(!result.ok && execution.executor==='durable' && ['step_timeout','step_aborted','capture_step_failed'].includes(result.error ?? '')) {
        execution.stores[marketplace]={status:'waiting',error:'capture_result_unknown',waitKind:'awaiting_reconciliation'};
        deferredStores.push({phase:'awaiting_reconciliation',error:'capture_result_unknown'});
        await store.update(id,workerId,execution,'running',tenantId);
        continue;
      }
      if (!result.ok && execution.executor === "durable"
        && (result.failureKind === "transient" || result.failureKind === "rate_limit" || result.failureKind === "quota" || result.failureKind === "credential" || result.error === "spawn_failed")) {
        execution.attempts = (execution.attempts ?? 0) + 1;
        const error=result.error ?? result.failureKind ?? "capture_step_failed";
        const phase=result.failureKind === "quota" || result.failureKind === "credential" ? "awaiting_authorization" : "retry_wait";
        const nextAttemptAt=phase === "retry_wait" ? new Date(Date.now() + Math.max(result.retryAfterMs ?? 0,
          Math.min(15 * 60_000, 30_000 * 2 ** Math.min(execution.attempts - 1, 5)))).toISOString() : undefined;
        execution.stores[marketplace] = { status: "waiting", error,waitKind:phase,...(nextAttemptAt ? {nextAttemptAt} : {}) };
        deferredStores.push({phase,error,nextAttemptAt});
        await store.update(id, workerId, execution, "running", tenantId);
        continue;
      }
      const status = await store.settleStore(id, marketplace, !result.ok, tenantId);
      execution.stores[marketplace] = {
        status,
        error: result.error,
      };
      await store.update(id, workerId, execution, "running", tenantId);
      if (status === "ok" && !await publishSource(marketplace) && execution.trial) return true;
    }
    const statuses = Object.values(execution.stores).map((step) => step.status);
    // Staged queries are not live facts. A local partial capture must finish
    // explicitly incomplete instead of reporting a successful, empty triage.
    if (execution.executor === "local" && statuses.includes("partial")
      && statuses.every(status => status === "partial" || status === "error")
      && !execution.publishedAt && !execution.publishedSources?.length) {
      execution.phase = "finished";
      execution.error = "capture_incomplete";
      await store.update(id, workerId, execution, "partial", tenantId);
      return true;
    }
    // A published source can prepare its links even while another source is
    // waiting. Record failures per source so resuming the batch does not
    // silently repeat a provider request that may have consumed quota.
    for (const marketplace of batch.requested_marketplaces.filter(m =>
      (m === "shopee" || m === "aliexpress") && execution.stores[m]?.status === "ok"
      && (execution.publishedAt || execution.publishedSources?.includes(m)))) {
      if (execution.affiliated?.includes(marketplace) || execution.affiliateFailures?.[marketplace]) continue;
      if (execution.trial && execution.trialAffiliateAttempted) {
        await waitForTrialReconciliation("affiliate_trial_result_unknown");
        return true;
      }
      if (execution.trial) execution.trialAffiliateAttempted = true;
      execution.phase = "affiliating";
      await store.update(id,workerId,execution,"running",tenantId);
      const linked = await runStep({kind:"affiliate",tenantId,batchId:id,workerId,marketplace,
        captureRunId:execution.browser?.captureRunId,pages:batch.pages,mlConsent:execution.mlConsent,trial:execution.trial});
      if (!linked.ok && execution.trial) {
        await waitForTrialReconciliation("affiliate_trial_result_unknown", linked);
        return true;
      }
      if (linked.ok) execution.affiliated = [...(execution.affiliated ?? []), marketplace];
      else execution.affiliateFailures = { ...execution.affiliateFailures, [marketplace]: linked.error ?? "affiliate_links_pending" };
      await store.update(id, workerId, execution, "running", tenantId);
    }
    // A browser operation may remain open while a different store is due
    // for an automatic retry. Keep the browser receipt acceptable during
    // that wait instead of postponing the other store indefinitely.
    const scheduledRetry=deferredStores.filter(item=>item.phase==='retry_wait')
      .sort((a,b)=>(a.nextAttemptAt ?? '').localeCompare(b.nextAttemptAt ?? ''))[0];
    if(statuses.includes("awaiting_browser") && scheduledRetry) {
      execution.phase='retry_wait';execution.error=scheduledRetry.error;execution.nextAttemptAt=scheduledRetry.nextAttemptAt;
      delete execution.workerId;
      await store.update(id,workerId,execution,'running',tenantId);
      return true;
    }
    if (statuses.includes("awaiting_browser")) {
      execution.phase = "awaiting_browser";
      execution.deadline = new Date(Date.now() + 30 * 60_000).toISOString();
      delete execution.workerId;
      await store.update(id, workerId, execution, "running", tenantId);
      return true;
    }
    if (deferredStores.length) {
      // All other stores have had a chance to publish before this batch waits.
      // Authorization is never converted into an automatic retry.
      const deferred=deferredStores.filter(item=>item.phase==='retry_wait')
        .sort((a,b)=>(a.nextAttemptAt ?? '').localeCompare(b.nextAttemptAt ?? ''))[0]
        ?? deferredStores.find(item=>item.phase==='awaiting_authorization')
        ?? deferredStores.find(item=>item.phase==='awaiting_reconciliation')!;
      execution.phase=deferred.phase;
      execution.error=deferred.error;
      if(deferred.nextAttemptAt) execution.nextAttemptAt=deferred.nextAttemptAt;
      delete execution.workerId;
      await store.update(id,workerId,execution,"running",tenantId);
      return true;
    }
    if (statuses.every((status) => status === "error")) {
      execution.phase = "finished";
      execution.error = "capture_failed";
      await store.update(id, workerId, execution, "error", tenantId);
      return true;
    }
    if (Object.keys(execution.affiliateFailures ?? {}).length) execution.error = "affiliate_links_pending";
    if (execution.trial && execution.trialTriageAttempted) {
      await waitForTrialReconciliation("triage_trial_result_unknown");
      return true;
    }
    if (execution.trial) execution.trialTriageAttempted = true;
    execution.phase = "triaging";
    const minTriageDeadline = Date.now() + 30 * 60_000;
    if (!execution.deadline || new Date(execution.deadline).getTime() < minTriageDeadline) {
      execution.deadline = new Date(minTriageDeadline).toISOString();
    }
    await store.update(id, workerId, execution, "running", tenantId);
    const result = await runStep({
      kind: "triage",
      tenantId: batch.tenant_id,
      batchId: id,
      workerId,
      pages: batch.pages,
      mlConsent: execution.mlConsent,
      trial: execution.trial,
    });
    if (!result.ok && execution.trial) {
      await waitForTrialReconciliation("triage_trial_result_unknown", result);
      return true;
    }
    if (execution.executor === "durable" && !result.ok && ["step_timeout","step_exit_failed","triage_summary_missing"].includes(result.error ?? "")) {
      execution.phase = "awaiting_reconciliation";
      execution.error = "triage_result_unknown";
      delete execution.workerId;
      await store.update(id,workerId,execution,"running",tenantId);
      return true;
    }
    execution.phase = "finished";
    execution.triage = result.triage;
    execution.error =
      result.ok && result.triage
        ? execution.error
        : (result.error ?? "triage_failed");
    if (!result.ok || !result.triage) await store.failTriage(id, tenantId);
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
    if ((execution.trial && execution.trialCaptureAttempted)
      || (execution.executor === "durable" && ["triaging", "affiliating"].includes(execution.phase))) {
      if (execution.trial) execution.trialFailure ??= trialFailure(execution);
      execution.phase = "awaiting_reconciliation";
      execution.error = "external_result_unknown";
      delete execution.workerId;
      // If the DB is also unavailable, lease recovery preserves this same wait.
      try { await store.update(id,workerId,execution,"running",tenantId); } catch {}
      throw new Error("capture_batch_reconciliation_required");
    }
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
