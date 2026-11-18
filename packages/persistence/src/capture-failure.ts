import { CaptureError } from "../../capture/src/errors.ts";

export type CaptureFailureKind = "transient" | "rate_limit" | "quota" | "credential" | "permanent";
export type CaptureFailure = { kind: CaptureFailureKind; retryAfterMs?: number };

/** Machine categories only. Provider prose and credentials never cross the process boundary. */
export function classifyCaptureFailure(error: unknown): CaptureFailure {
  if (error instanceof CaptureError) {
    if (error.kind === "auth") return { kind: "credential" };
    if (error.kind === "rate_limit") return { kind: "rate_limit", retryAfterMs: error.retryAfterMs };
    if (error.kind === "transport" || error.kind === "aborted") return { kind: "transient" };
    return { kind: "permanent" };
  }
  if (error instanceof Error && error.name === "AccountCredentialsError") return { kind: "credential" };
  if (error && typeof error === "object" && "code" in error
    && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "57P01", "57P02", "57P03", "08006", "08001"].includes(String(error.code))) {
    return { kind: "transient" };
  }
  // A cancelled/unknown process outcome cannot safely be replayed as paid work.
  return { kind: "permanent" };
}

export function captureFailureLine(marketplace: string, failure: CaptureFailure): string {
  return `CAPTURE_FAILURE=${JSON.stringify({ version: 1, marketplace, kind: failure.kind,
    ...(Number.isFinite(failure.retryAfterMs) && failure.retryAfterMs! >= 0 ? { retryAfterMs: failure.retryAfterMs } : {}) })}`;
}
