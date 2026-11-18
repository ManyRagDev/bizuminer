/** Bounded diagnostic vocabulary. Never retain messages, paths, SQL or provider bodies. */
export const CAPTURE_DIAGNOSTIC_CODES = ["sql_error", "ownership_lost", "credential_integrity_failed",
  "account_credentials_missing", "account_suspended", "type_error", "reference_error", "range_error",
  "syntax_error", "unclassified_error", "shopee_graphql_contract_error", "ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX", "ERR_UNKNOWN_FILE_EXTENSION", "ERR_REQUIRE_ESM",
  "ERR_PACKAGE_IMPORT_NOT_DEFINED", "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING", "ERR_INVALID_MODULE_SPECIFIER",
  "ERR_INVALID_PACKAGE_CONFIG", "ERR_UNSUPPORTED_DIR_IMPORT", "openrouter_budget_exhausted",
  "openrouter_authentication_failed", "openrouter_rate_limited", "openrouter_request_blocked",
  "openrouter_unavailable", "openrouter_request_rejected", "openrouter_timeout",
  "openrouter_transport_failed", "openrouter_response_invalid", "openrouter_response_too_large",
  "openrouter_request_too_large"] as const;
export type CaptureDiagnosticCode = typeof CAPTURE_DIAGNOSTIC_CODES[number];
export const CAPTURE_DIAGNOSTIC_PHASES = ["credentials", "initialization", "capture_query", "activity", "cli"] as const;
export const CAPTURE_SQL_STATES = ["42501", "42P01", "42703", "42883", "23503", "23505", "23514", "40001", "40P01", "57014", "08001", "08006", "53300", "57P01"] as const;
export type CaptureDiagnostic = { version: 1; diagnosticCode: typeof CAPTURE_DIAGNOSTIC_CODES[number];
  phase: typeof CAPTURE_DIAGNOSTIC_PHASES[number]; sqlState?: string };
export function sanitizeCaptureDiagnostic(value: unknown): CaptureDiagnostic | undefined {
  if (!value || typeof value !== "object") return;
  const r = value as Record<string, unknown>;
  if (r.version !== 1 || !CAPTURE_DIAGNOSTIC_CODES.includes(r.diagnosticCode as never)
    || !CAPTURE_DIAGNOSTIC_PHASES.includes(r.phase as never)) return;
  return { version: 1, diagnosticCode: r.diagnosticCode as CaptureDiagnostic["diagnosticCode"],
    phase: r.phase as CaptureDiagnostic["phase"],
    ...(CAPTURE_SQL_STATES.includes(r.sqlState as never) ? { sqlState: r.sqlState as string } : {}) };
}
export function captureDiagnostic(error: unknown, phase: CaptureDiagnostic["phase"]): CaptureDiagnostic {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const sqlState = CAPTURE_SQL_STATES.includes(e.code as never) ? e.code as string : undefined;
  const codes: Record<string,string> = { capture_batch_ownership_lost: "ownership_lost",
    credential_integrity_failed: "credential_integrity_failed", account_credentials_missing: "account_credentials_missing",
    account_suspended: "account_suspended", graphql_contract_error: "shopee_graphql_contract_error" };
  const names: Record<string,string> = { TypeError: "type_error", ReferenceError: "reference_error", RangeError: "range_error", SyntaxError: "syntax_error" };
  const diagnosticCode = sqlState ? "sql_error" : CAPTURE_DIAGNOSTIC_CODES.includes(e.code as never) ? e.code as string
    : (Object.hasOwn(codes, String(e.message)) ? codes[String(e.message)] : undefined)
      ?? (Object.hasOwn(names, String(e.name)) ? names[String(e.name)] : undefined) ?? "unclassified_error";
  return { version: 1, phase, diagnosticCode: diagnosticCode as CaptureDiagnostic["diagnosticCode"], ...(sqlState ? { sqlState } : {}) };
}
export function captureDiagnosticLine(diagnostic: CaptureDiagnostic): string {
  return "CAPTURE_DIAGNOSTIC=" + JSON.stringify(sanitizeCaptureDiagnostic(diagnostic));
}
export function readCaptureDiagnostic(output: string): CaptureDiagnostic | undefined {
  const line = output.split("\n").findLast(x => x.startsWith("CAPTURE_DIAGNOSTIC="));
  if (!line || line.length > 1024) return;
  try { return sanitizeCaptureDiagnostic(JSON.parse(line.slice("CAPTURE_DIAGNOSTIC=".length))); } catch { return; }
}
