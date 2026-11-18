import { captureProcessRetry, captureProcessFailure, runBoundedCaptureProcess } from "../lib/capture-process.ts";
import { fileURLToPath } from "node:url";
import { executeCaptureBatch } from "../lib/capture-batch-worker.ts";
import { captureBatches } from "../lib/capture-batch-db.ts";
import { classifyCaptureFailure } from "../../persistence/src/capture-failure.ts";
import { publishCaptureSource } from "../../persistence/src/capture-publication.ts";
import { publishCaptureAffiliateLinks } from "../lib/capture-affiliate-publication.ts";
import { db } from "../lib/db.ts";
import type { BatchStepRunner } from "../lib/capture-batch-worker.ts";
import { aiCurationProvider } from "../lib/ai-curation-provider.ts";
import { enqueueAttributeDeltas } from "../lib/curation-attributes-db.ts";
import { readCaptureDiagnostic } from "../../persistence/src/capture-diagnostic.ts";

const tenantIndex = process.argv.indexOf("--tenant");
const tenantId = tenantIndex >= 0 ? process.argv[tenantIndex + 1] : "local";
if (!/^[a-z0-9._-]{1,64}$/.test(tenantId ?? "")) throw new Error("invalid_capture_tenant");
const id = process.argv[process.argv.indexOf("--batch") + 1];
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? ""))
  throw new Error("invalid_batch_id");
const persistenceDir = fileURLToPath(
  new URL("../../persistence/", import.meta.url),
);
const scripts: Record<string, string> = {
  shopee: "bin/sweep-shopee.ts",
  aliexpress: "bin/sweep-aliexpress.ts",
};
const attributeModel = () => {
  const provider = aiCurationProvider();
  const model = provider === "openrouter" ? process.env.AI_CURATION_MODEL : process.env.GEMINI_MODEL || "gemini-2.5-flash";
  return model ? `${provider}:${model}` : null;
};
const runStep: BatchStepRunner = async (step) => {
  if (step.tenantId !== tenantId) return { ok: false, error: "capture_batch_tenant_mismatch" };
  if (step.kind === "publish") {
    const sql = db();
    try {
      if (!step.marketplace) throw new Error("capture_marketplace_missing");
      await publishCaptureSource(sql, tenantId, step.batchId, step.workerId, step.marketplace);
      // The source transaction is already committed. Queue its factual deltas
      // without waiting for other stores or for an external model request.
      // A queue failure cannot turn a committed publication into a failure;
      // the persisted deltas remain available to the projection scheduler.
      try {
        const model = attributeModel();
        if (model) await enqueueAttributeDeltas(sql, tenantId, model);
      } catch { console.error("capture_attribute_queue_deferred"); }
      return {ok:true};
    }
    catch(error) {const failure=classifyCaptureFailure(error);return {ok:false,error:"capture_publication_failed",failureKind:failure.kind,retryAfterMs:failure.retryAfterMs};}
    finally { await sql.end(); }
  }
  if (step.kind === "affiliate") {
    return publishCaptureAffiliateLinks(tenantId, step.marketplace!, step.batchId);
  }
  if (step.kind === "triage") {
    const model = attributeModel();
    if (!model) return { ok: false, error: "ai_curation_model_missing" };
    const sql = db();
    try {
      const queued = await enqueueAttributeDeltas(sql, tenantId, model);
      return { ok: true, triage: { mode: "attribute_queue", processed: queued, approved: 0, rejected: 0, held: 0, annotatedPending: queued } };
    } catch { return { ok: false, error: "attribute_queue_unavailable" }; }
    finally { await sql.end(); }
  }
  if (step.marketplace === "mercadolivre") return { ok: false, error: "manual_capture_only" };
  const script = scripts[step.marketplace!];
  if (!script) return { ok: false, error: "unknown_marketplace" };
  const args = ["--pages", String(step.pages), "--operation-batch", step.batchId, "--worker", step.workerId, "--tenant", step.tenantId];
  if (step.kind === "capture") {
    if (step.planMode) args.push("--plan", step.planMode);
    if (step.sortOrder) args.push("--order", step.sortOrder);
    if (step.pageSize) args.push("--page-size", String(step.pageSize));
  }
  if (step.trial) args.push("--trial-single-product");
  const env = process.env;
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["--experimental-strip-types", script, ...args],
    {
      cwd: persistenceDir,
      env,
      timeoutMs: 12 * 60_000,
    },
  );
  if (!result.ok) return {
    ok: false,
    diagnostic: {
      ...readCaptureDiagnostic(result.output),
      ...(result.diagnosticCode ? { diagnosticCode: result.diagnosticCode } : {}),
      exitCode: result.exitCode,
      signal: result.signal === null || result.signal === "SIGKILL" || result.signal === "SIGTERM"
        || result.signal === "SIGABRT" || result.signal === "SIGSEGV" ? result.signal : undefined,
      stderrBytes: result.stderrBytes, durationMs: result.durationMs,
    },
    ...captureProcessRetry(result, step.marketplace!),
    error: captureProcessFailure(result, step.marketplace!),
  };
  return { ok: true };
};

try {
  const executed = await executeCaptureBatch(id, runStep, captureBatches, tenantId);
  const batch = executed ? await captureBatches.read(id, tenantId) : null;
  console.log(JSON.stringify({ batchId: id, executed, status: batch?.status }));
  // Apenas status 'error' falha o processo. Status 'partial' representa sucesso parcial legítimo com itens capturados e triados.
  if (
    executed &&
    batch?.status === "error" &&
    batch?.metadata.execution?.phase !== "awaiting_browser"
  )
    process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({ batchId: id, error: "capture_batch_worker_failed" }),
  );
  process.exitCode = 1;
}
