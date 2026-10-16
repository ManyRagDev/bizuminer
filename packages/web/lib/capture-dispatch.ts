import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

export function captureExecutor(): "local" | "github" {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL
    ? "local"
    : "github";
}

/** Keep the local child alive after the request, but await spawn/error before returning HTTP 202. */
export async function dispatchCaptureBatch(id: string, tenantId: string): Promise<void> {
  // Current adapters use the house's configured credentials. Do not dispatch
  // another account until its own credential resolution is implemented.
  if (tenantId !== 'local') throw new Error('capture_account_credentials_required');
  if (captureExecutor() === "local") {
    const script = [
      path.resolve(process.cwd(), "bin/run-capture-batch.ts"),
      path.resolve(process.cwd(), "packages/web/bin/run-capture-batch.ts"),
    ].find(existsSync);
    if (!script) throw new Error("local_worker_missing");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", script, "--batch", id],
        {
          env: process.env,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        },
      );
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }
  const token = process.env.GITHUB_ACTIONS_WRITE_TOKEN;
  if (!token) throw new Error("github_token_not_configured");
  const response = await fetch(
    "https://api.github.com/repos/ManyRagDev/bizuminer/actions/workflows/capture-offers.yml/dispatches",
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.GITHUB_CAPTURE_REF || "main",
        inputs: { batch_id: id },
      }),
    },
  );
  if (!response.ok) throw new Error(`github_dispatch_http_${response.status}`);
}
