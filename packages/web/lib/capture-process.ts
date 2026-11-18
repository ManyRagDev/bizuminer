import { spawn } from "node:child_process";

const STDERR_DIAGNOSTIC_LIMIT = 8 * 1024;
const NODE_DIAGNOSTIC_CODES = [
  "ERR_MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_PACKAGE_IMPORT_NOT_DEFINED",
  "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX",
  "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING",
  "ERR_UNKNOWN_FILE_EXTENSION",
  "ERR_INVALID_MODULE_SPECIFIER",
  "ERR_INVALID_PACKAGE_CONFIG",
  "ERR_UNSUPPORTED_DIR_IMPORT",
  "ERR_REQUIRE_ESM",
] as const;

export type CaptureNodeDiagnosticCode = typeof NODE_DIAGNOSTIC_CODES[number];
export interface CaptureProcessResult {
  ok: boolean;
  error?: string;
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderrBytes: number;
  durationMs: number;
  diagnosticCode?: CaptureNodeDiagnosticCode;
}

/** A native-format hint, not authenticated provenance. Never extract messages or filesystem paths. */
function nodeDiagnostic(stderr: Buffer): CaptureNodeDiagnosticCode | undefined {
  const text = stderr.toString("utf8");
  if (!/\nNode\.js v\d+\.\d+\.\d+(?:[-+][\w.-]+)?\r?\n?$/.test(text)) return undefined;
  for (const code of NODE_DIAGNOSTIC_CODES) {
    // Require the error header, an internal Node frame, and the matching native code property
    // in this order. A provider sentence or a JSON payload mentioning a code is insufficient.
    const nativeBlock = new RegExp(
      `(?:^|\\n)(?:Error|TypeError|SyntaxError) \\[${code}\\]:[^\\n]*\\r?\\n`
      + `[\\s\\S]*?\\n[ \\t]+at [^\\n]*node:internal/[^\\n]*\\r?\\n`
      + `[\\s\\S]*?\\n[ \\t]+code: '${code}'[,]?\\r?\\n`
      + `[\\s\\S]*?\\n}\\r?\\n\\r?\\nNode\\.js v\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)?\\r?\\n?$`,
    );
    if (nativeBlock.test(text)) return code;
  }
  return undefined;
}

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
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<CaptureProcessResult> {
  const startedAt = Date.now();
  const durationMs = () => Math.max(0, Date.now() - startedAt);
  if (options.timeoutMs === undefined && !options.signal) throw new Error("capture_process_lifetime_required");
  if (options.signal?.aborted) return {ok:false,error:"step_aborted",output:"",exitCode:null,signal:null,stderrBytes:0,durationMs:durationMs()};
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let stderr = Buffer.alloc(0);
    let stderrBytes = 0;
    let timedOut = false;
    let aborted = false;
    child.stdout.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-64_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes = Math.min(Number.MAX_SAFE_INTEGER, stderrBytes + chunk.byteLength);
      // Copy the retained tail so a small slice cannot retain a larger backing allocation.
      stderr = chunk.byteLength >= STDERR_DIAGNOSTIC_LIMIT
        ? Buffer.from(chunk.subarray(-STDERR_DIAGNOSTIC_LIMIT))
        : Buffer.from(Buffer.concat([stderr, chunk]).subarray(-STDERR_DIAGNOSTIC_LIMIT));
    });
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    const abort = () => { aborted = true; child.kill("SIGKILL"); };
    options.signal?.addEventListener("abort",abort,{once:true});
    const cleanup = () => { clearTimeout(timer);options.signal?.removeEventListener("abort",abort); };
    if(options.signal?.aborted)abort();
    child.once("error", () => {
      cleanup();
      resolve({ ok: false, error: "spawn_failed", output: "", exitCode: null, signal: null, stderrBytes, durationMs: durationMs() });
    });
    child.once("close", (code, signal) => {
      cleanup();
      const diagnosticCode = !timedOut && !aborted && code !== null && code !== 0 ? nodeDiagnostic(stderr) : undefined;
      resolve({
        ok: !timedOut && !aborted && code === 0,
        output,
        exitCode: code,
        signal,
        stderrBytes,
        durationMs: durationMs(),
        ...(diagnosticCode ? { diagnosticCode } : {}),
        error: aborted ? "step_aborted" : timedOut
          ? "step_timeout"
          : code !== 0
            ? "step_exit_failed"
            : undefined,
      });
    });
  });
}


/** Decode the CLI's bounded machine record, never match arbitrary provider messages. */
export function captureProcessRetry(result: { ok: boolean; error?: string; output: string }, marketplace: string):
  { failureKind?: "transient" | "rate_limit" | "quota" | "credential" | "permanent"; retryAfterMs?: number } {
  if (result.ok) return {};
  if (result.error === "spawn_failed" || result.error === "step_timeout") return { failureKind: "transient" };
  const line = result.output.split("\n").findLast(value => value.startsWith("CAPTURE_FAILURE="));
  if (!line) return {};
  try {
    const failure = JSON.parse(line.slice("CAPTURE_FAILURE=".length));
    if (failure.version !== 1 || failure.marketplace !== marketplace
      || !["transient", "rate_limit", "quota", "credential", "permanent"].includes(failure.kind)) return {};
    return { failureKind: failure.kind,
      ...(Number.isFinite(failure.retryAfterMs) && failure.retryAfterMs >= 0 ? { retryAfterMs: failure.retryAfterMs } : {}) };
  } catch { return {}; }
}
