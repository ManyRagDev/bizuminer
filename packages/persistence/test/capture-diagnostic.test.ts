import assert from "node:assert/strict";
import test from "node:test";
import { captureDiagnostic, captureDiagnosticLine, readCaptureDiagnostic, sanitizeCaptureDiagnostic } from "../src/capture-diagnostic.ts";

test("known SQLSTATE is retained while SQL, relation names and credential-bearing fields are removed", () => {
  for (const code of ["42501", "42P01", "42703", "23505", "40001", "08006"]) {
    const error = Object.assign(new Error("private-marker SELECT secret_column FROM secret_table"), {
      code, detail: "private-marker", query: "SELECT private-marker", table: "secret_table", schema: "private_schema",
      parameters: ["private-marker"], cause: { password: "private-marker" },
    });
    const diagnostic = captureDiagnostic(error, "capture_query");
    assert.deepEqual(diagnostic, { version: 1, phase: "capture_query", diagnosticCode: "sql_error", sqlState: code });
    assert.deepEqual(readCaptureDiagnostic(captureDiagnosticLine(diagnostic)), diagnostic);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private-marker|SELECT|secret_column|secret_table|private_schema/);
  }
});
test("recognized Node, provider and error names remain actionable without copying raw messages", () => {
  for (const code of ["ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX",
    "ERR_UNKNOWN_FILE_EXTENSION", "ERR_REQUIRE_ESM", "openrouter_budget_exhausted", "openrouter_authentication_failed",
    "openrouter_rate_limited", "openrouter_timeout", "openrouter_response_invalid"]) {
    const diagnostic = captureDiagnostic({ code, message: "private-marker", stack: "/private/file.ts", response: { key: "private-marker" } }, "cli");
    assert.equal(diagnostic.diagnosticCode, code);
    assert.deepEqual(Object.keys(diagnostic).sort(), ["diagnosticCode", "phase", "version"]);
    assert.doesNotMatch(captureDiagnosticLine(diagnostic), /private-marker|\/private/);
  }
  for (const [error, code] of [[new TypeError("private-marker"), "type_error"],
    [new ReferenceError("private-marker"), "reference_error"], [new RangeError("private-marker"), "range_error"],
    [new SyntaxError("private-marker"), "syntax_error"]] as const) {
    assert.equal(captureDiagnostic(error, "initialization").diagnosticCode, code);
  }
  for (const [message, diagnosticCode] of [["capture_batch_ownership_lost", "ownership_lost"],
    ["credential_integrity_failed", "credential_integrity_failed"], ["account_credentials_missing", "account_credentials_missing"],
    ["account_suspended", "account_suspended"]] as const) {
    assert.equal(captureDiagnostic(new Error(message), "credentials").diagnosticCode, diagnosticCode);
  }
});
test("unknown errors and SQLSTATE values never propagate their strings or object payloads", () => {
  for (const error of [undefined, null, "private-marker", 42, [],
    { code: "99999", message: "private-marker", name: "PrivateError", query: "private-marker" },
    { message: "constructor" }, { message: "__proto__" }, { name: "toString" }, { name: "constructor" },
    { code: "ERR_PRIVATE_MARKER", message: "credential_integrity_failed private-marker" },
    { message: "openrouter_budget_exhausted private-marker", name: "PrivateError" }]) {
    assert.deepEqual(captureDiagnostic(error, "activity"), { version: 1, phase: "activity", diagnosticCode: "unclassified_error" });
  }
});
test("sanitizer whitelists version, phase, code and SQLSTATE and removes all additional fields", () => {
  const good = { version: 1, phase: "cli", diagnosticCode: "sql_error", sqlState: "42501" };
  assert.deepEqual(sanitizeCaptureDiagnostic({ ...good, message: "private-marker", query: "private-marker", table: "private-marker" }), good);
  for (const invalid of [null, "private-marker", {}, { ...good, version: 2 }, { ...good, version: "1" },
    { ...good, phase: "private-marker" }, { ...good, diagnosticCode: "private-marker" }, { ...good, diagnosticCode: "ERR_PRIVATE_MARKER" }]) {
    assert.equal(sanitizeCaptureDiagnostic(invalid), undefined);
  }
  assert.deepEqual(sanitizeCaptureDiagnostic({ ...good, sqlState: "99999" }), { version: 1, phase: "cli", diagnosticCode: "sql_error" });
  assert.deepEqual(sanitizeCaptureDiagnostic({ ...good, sqlState: "42501 private-marker" }), { version: 1, phase: "cli", diagnosticCode: "sql_error" });
});
test("stdout parser chooses the last exact marker, ignores unrelated output and rejects malformed or oversized lines", () => {
  const first = captureDiagnosticLine(captureDiagnostic(new TypeError("private-marker"), "cli"));
  const last = captureDiagnosticLine(captureDiagnostic({ code: "42501" }, "capture_query"));
  assert.equal(readCaptureDiagnostic(`noise\n${first}\nother log\n${last}\n`)?.sqlState, "42501");
  for (const output of ["", "CAPTURE_DIAGNOSTIC=not-json", "CAPTURE_DIAGNOSTIC=null", `prefix ${last}`, ` ${last}`,
    "CAPTURE_DIAGNOSTIC=" + JSON.stringify({ version: 1, phase: "unknown", diagnosticCode: "sql_error" }),
    `${first}\nCAPTURE_DIAGNOSTIC={`, `${last}${" ".repeat(1025)}`]) {
    assert.equal(readCaptureDiagnostic(output), undefined);
  }
  const padded = last + " ".repeat(1024 - last.length);
  assert.equal(padded.length, 1024); assert.equal(readCaptureDiagnostic(padded)?.sqlState, "42501");
  assert.equal(readCaptureDiagnostic(padded + " "), undefined);
  const extras = "CAPTURE_DIAGNOSTIC=" + JSON.stringify({ version: 1, diagnosticCode: "sql_error", phase: "cli", query: "private-marker" });
  assert.doesNotMatch(JSON.stringify(readCaptureDiagnostic(extras)), /private-marker|query/);
});
