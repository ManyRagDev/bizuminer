import { captureProcessFailure, runBoundedCaptureProcess } from "../lib/capture-process.ts";
import { fileURLToPath } from "node:url";
import { executeCaptureBatch } from "../lib/capture-batch-worker.ts";
import { captureBatches } from "../lib/capture-batch-db.ts";
import type { BatchStepRunner } from "../lib/capture-batch-worker.ts";

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
  mercadolivre: "bin/sweep.ts",
};
const runStep: BatchStepRunner = async (step) => {
  if (step.kind === "triage" && !process.env.GEMINI_API_KEY)
    return { ok: false, error: "gemini_key_not_configured" };
  const script =
    step.kind === "triage" ? triageScript : scripts[step.marketplace!];
  if (!script) return { ok: false, error: "unknown_marketplace" };
  const args =
    step.kind === "triage"
      ? ["--limit", "200", "--batch", step.batchId, "--worker", step.workerId]
      : ["--pages", String(step.pages), "--operation-batch", step.batchId];
  // Consent is scoped to this ML child. No flag changes for cron or later operations.
  const env =
    step.marketplace === "mercadolivre" && step.mlConsent
      ? {
          ...process.env,
          ML_AUTOMATED_CAPTURE_ENABLED: "true",
          ML_AUTOMATED_CAPTURE_PRODUCTION: "true",
        }
      : process.env;
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
  const executed = await executeCaptureBatch(id, runStep);
  const batch = executed ? await captureBatches.read(id) : null;
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
