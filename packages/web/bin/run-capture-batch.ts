import { captureProcessFailure, runBoundedCaptureProcess } from "../lib/capture-process.ts";
import { fileURLToPath } from "node:url";
import { executeCaptureBatch } from "../lib/capture-batch-worker.ts";
import { captureBatches } from "../lib/capture-batch-db.ts";
import type { BatchStepRunner } from "../lib/capture-batch-worker.ts";

const tenantIndex = process.argv.indexOf("--tenant");
const tenantId = tenantIndex >= 0 ? process.argv[tenantIndex + 1] : "local";
if (!/^[a-z0-9._-]{1,64}$/.test(tenantId ?? "")) throw new Error("invalid_capture_tenant");
const id = process.argv[process.argv.indexOf("--batch") + 1];
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? ""))
  throw new Error("invalid_batch_id");
const persistenceDir = fileURLToPath(
  new URL("../../persistence/", import.meta.url),
);
const triageScript = fileURLToPath(new URL("./run-triage.ts", import.meta.url));
const scripts: Record<string, string> = {
  shopee: "bin/sweep-shopee.ts",
  aliexpress: "bin/sweep-aliexpress.ts",
};
const runStep: BatchStepRunner = async (step) => {
  if (step.tenantId !== tenantId) return { ok: false, error: "capture_batch_tenant_mismatch" };
  if (step.marketplace === "mercadolivre") return { ok: false, error: "manual_capture_only" };
  if (step.kind === "triage" && !process.env.GEMINI_API_KEY)
    return { ok: false, error: "gemini_key_not_configured" };
  const script =
    step.kind === "triage" ? triageScript : scripts[step.marketplace!];
  if (!script) return { ok: false, error: "unknown_marketplace" };
  const args =
    step.kind === "triage"
      ? ["--limit", "200", "--batch", step.batchId, "--worker", step.workerId, "--tenant", step.tenantId]
      : ["--pages", String(step.pages), "--operation-batch", step.batchId, "--tenant", step.tenantId];
  const env = process.env;
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["--experimental-strip-types", script, ...args],
    {
      cwd: persistenceDir,
      env,
      timeoutMs: step.kind === "triage" ? 10 * 60_000 : 12 * 60_000,
    },
  );
  if (!result.ok) return {
    ok: false,
    error: step.kind === "capture"
      ? captureProcessFailure(result, step.marketplace!)
      : result.error,
  };
  if (step.kind === "capture") return { ok: true };
  try {
    const line = result.output
      .split("\n")
      .findLast((item) => item.startsWith("TRIAGE_SUMMARY="));
    if (!line) throw new Error("missing_summary");
    return {
      ok: true,
      triage: JSON.parse(line.slice("TRIAGE_SUMMARY=".length)),
    };
  } catch {
    return { ok: false, error: "triage_summary_missing" };
  }
};

try {
  const executed = await executeCaptureBatch(id, runStep, captureBatches, tenantId);
  const batch = executed ? await captureBatches.read(id, tenantId) : null;
  console.log(JSON.stringify({ batchId: id, executed, status: batch?.status }));
  if (
    executed &&
    batch?.status !== "ok" &&
    batch?.metadata.execution?.phase !== "awaiting_browser"
  )
    process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({ batchId: id, error: "capture_batch_worker_failed" }),
  );
  process.exitCode = 1;
}
