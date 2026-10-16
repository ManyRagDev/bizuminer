import { spawn } from "node:child_process";

/** Only the ML CLI's typed failure can request browser verification. Never inspect vendor prose. */
export function captureProcessFailure(
  result: { ok: boolean; error?: string; output: string },
  marketplace: string,
): string | undefined {
  if (result.ok) return undefined;
  if (marketplace !== "mercadolivre" || result.error !== "step_exit_failed")
    return result.error;
  const line = result.output.split("\n").findLast((item) => item.startsWith("CAPTURE_FAILURE="));
  if (line) {
    try {
      const failure = JSON.parse(line.slice("CAPTURE_FAILURE=".length));
      if (failure.version === 1 && failure.marketplace === "mercadolivre" && failure.kind === "auth")
        return "ml_access_verification_required";
    } catch { /* Invalid/missing machine output remains an executor failure. */ }
  }
  return result.error;
}

/** Bounded child lifetime, including asynchronous ENOENT. Never prints child output or credentials. */
export async function runBoundedCaptureProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
  },
): Promise<{ ok: boolean; error?: string; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-64_000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "spawn_failed", output: "" });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        output,
        error: timedOut
          ? "step_timeout"
          : code !== 0
            ? "step_exit_failed"
            : undefined,
      });
    });
  });
}
