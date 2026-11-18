import assert from "node:assert/strict";
import test from "node:test";
import { formatImportReport, sanitizeImportReport, type ImportReport } from "../src/lib/import-report.ts";

function receipt(): ImportReport {
  return {
    requestId: "00000000-0000-4000-a000-000000000001", at: 1_794_500_000_000, ok: true,
    importedCount: 35, alreadyRecordedCount: 0,
    diagnostics: { received: 53, valid: 35, duplicates: 10, rejected: 8,
      items: [
        ...Array.from({ length: 10 }, (_, n) => ({ index: 36 + n, externalId: `MLB10000${n}`,
          status: "duplicate" as const, reason: "duplicate_external_id" as const })),
        ...Array.from({ length: 8 }, (_, n) => ({ index: 46 + n, externalId: `MLB20000${n}`,
          status: "rejected" as const, reason: n < 5 ? "product_price_invalid" as const : "product_title_invalid" as const })),
      ] },
  };
}
test("53 received and 35 valid explicitly explain ten in-request duplicates and eight rejected items", () => {
  const view = formatImportReport(receipt())!;
  assert.deepEqual(view.counts, ["Recebidos pelo servidor: 53", "Válidos únicos: 35", "Duplicados nesta leitura: 10",
    "Rejeitados na validação: 8", "Novas observações registradas: 35", "Já registrados, sem nova observação: 0"]);
  assert.equal(view.items.length, 18);
  assert.ok(view.items[0]!.startsWith("Item 36 · MLB100000: duplicado"));
  assert.ok(view.items[17]!.startsWith("Item 53 · MLB200007: rejeitado"));
  assert.deepEqual(view.reasons, ["Duplicados — Identificador repetido nesta leitura: 10",
    "Rejeitados — Preço ausente ou inválido: 5", "Rejeitados — Nome do produto ausente ou inválido: 3"]);
  assert.doesNotMatch(JSON.stringify(view), /18.*histórico|35 produtos novos/);
});
test("new observations, previously recorded valid items and payload duplicates remain separate", () => {
  const mixed = receipt(); mixed.importedCount = 20; mixed.alreadyRecordedCount = 15;
  const view = formatImportReport(mixed)!;
  assert.equal(view.counts[2], "Duplicados nesta leitura: 10");
  assert.equal(view.counts[4], "Novas observações registradas: 20");
  assert.equal(view.counts[5], "Já registrados, sem nova observação: 15");
});
test("replay reports zero new observations without claiming a new product or inventing a historical reason", () => {
  const replay = receipt(); replay.importedCount = 0; replay.alreadyRecordedCount = 35; replay.duplicate = true;
  const view = formatImportReport(replay)!;
  assert.equal(view.heading, "Última importação confirmada");
  assert.equal(view.counts[4], "Novas observações registradas: 0");
  assert.equal(view.counts[5], "Já registrados, sem nova observação: 35");
  assert.equal(view.counts[2], "Duplicados nesta leitura: 10");
  assert.doesNotMatch(JSON.stringify(view), /mesma solicitação|produtos novos/);
});
test("legacy response preserves its explicit imported count and labels missing diagnostics unavailable", () => {
  const legacy = { requestId: "legacy-1", at: 1000, ok: true, importedCount: 35 };
  const view = formatImportReport(legacy)!;
  assert.equal(view.counts.filter(line => line.includes("informação indisponível")).length, 5);
  assert.equal(view.counts[4], "Novas observações registradas: 35");
  assert.equal(view.items.length, 0); assert.equal(view.reasons.length, 0);
  assert.match(view.explanation, /Não é possível atribuir a diferença/);
  assert.ok(!view.counts.some(line => line.endsWith(": 0")));
});
test("all-invalid rejection still shows the per-item receipt and never invents imported zero", () => {
  const invalid = { requestId: "invalid-1", at: 1000, ok: false, error: "invalid_payload",
    diagnostics: { received: 2, valid: 0, duplicates: 0, rejected: 2, items: [
      { index: 1, status: "rejected", reason: "product_id_invalid" },
      { index: 2, status: "rejected", reason: "product_url_invalid" },
    ] } };
  const view = formatImportReport(invalid)!;
  assert.equal(view.heading, "Última tentativa de importação");
  assert.equal(view.counts[3], "Rejeitados na validação: 2");
  assert.equal(view.counts[4], "Novas observações registradas: informação indisponível");
  assert.equal(view.items.length, 2);
});
test("inconsistent totals, indexes and numeric types do not become an authoritative explanation", () => {
  const variants: Array<(value: any) => void> = [
    value => { value.diagnostics.received = 54; },
    value => { value.diagnostics.valid = "35"; },
    value => { value.diagnostics.items.pop(); },
    value => { value.diagnostics.items[1].index = value.diagnostics.items[0].index; },
    value => { value.diagnostics.items[0].index = 0; },
    value => { value.diagnostics.items[0].index = 201; },
    value => { value.diagnostics.items[0].status = "valid"; },
    value => { value.diagnostics.received = 1000; },
  ];
  for (const alter of variants) {
    const data = receipt(); alter(data);
    assert.equal(sanitizeImportReport(data)!.diagnostics, undefined);
    assert.match(formatImportReport(data)!.counts[0]!, /informação indisponível/);
  }
  const wrongReplay = receipt(); wrongReplay.alreadyRecordedCount = 35;
  assert.equal(sanitizeImportReport(wrongReplay)!.alreadyRecordedCount, undefined);
  const impossibleNew = receipt(); impossibleNew.importedCount = 50;
  assert.equal(sanitizeImportReport(impossibleNew)!.importedCount, undefined);
});
test("receipt storage and display discard titles, URLs, arbitrary errors and unsafe external identifiers", () => {
  const data: any = receipt();
  data.secret = "private-session-value";
  data.error = "https://example.invalid/?token=private-session-value";
  data.diagnostics.items[0].externalId = '<img src="https://example.invalid/?token=private-session-value">';
  data.diagnostics.items[0].reason = "private-session-value";
  data.diagnostics.items[0].title = "private-session-value";
  data.diagnostics.items[1].externalId = "bm_ext_private-session-value";
  const safe = sanitizeImportReport(data)!;
  const encoded = JSON.stringify([safe, formatImportReport(data)]);
  assert.equal(safe.error, "request_failed");
  assert.equal(safe.diagnostics!.items[0]!.reason, "unknown_reason");
  assert.equal(safe.diagnostics!.items[0]!.externalId, undefined);
  assert.equal(safe.diagnostics!.items[1]!.externalId, undefined);
  assert.doesNotMatch(encoded, /private-session-value|https:|<img|token=/);
  assert.ok(formatImportReport(data)!.items[0]!.includes("Motivo não informado pelo servidor"));
});
test("invalid receipt identity or timestamp cannot survive as a persisted UI report", () => {
  for (const value of [null, {}, { ...receipt(), requestId: "https://invalid/?secret=1" },
    { ...receipt(), at: Number.NaN }, { ...receipt(), at: -1 }, { ...receipt(), at: Number.MAX_SAFE_INTEGER },
    { ...receipt(), ok: "true" }]) assert.equal(sanitizeImportReport(value), null);
});
test("collection time and collector version survive reopening without becoming confirmation time", () => {
  const capturedAt = "2026-11-12T17:38:46Z";
  const at = Date.parse("2026-11-12T18:06:04Z");
  const original = { ...receipt(), at, capturedAt, preparedVersion: "0.3.6" };
  const reopened = sanitizeImportReport(JSON.parse(JSON.stringify(sanitizeImportReport(original))))!;
  assert.equal(reopened.capturedAt, capturedAt);
  assert.equal(reopened.at, at);
  assert.equal(reopened.preparedVersion, "0.3.6");
  const view = formatImportReport(reopened)!;
  assert.deepEqual(view.timing, [`Coleta: ${new Date(capturedAt).toLocaleString("pt-BR")}`,
    "Versão da coleta: 0.3.6", `Confirmação: ${new Date(at).toLocaleString("pt-BR")}`]);
  assert.match(formatImportReport({ ...original, ok: false })!.timing[2]!, /^Tentativa de envio:/);
});
test("legacy collection metadata stays unknown and unsafe metadata is omitted", () => {
  const legacy = { ...receipt(), capturedAt: "2026-11-12T17:38:46.000Z" };
  const view = formatImportReport(legacy)!;
  assert.equal(view.timing[1], "Versão da coleta: versão não registrada; leitura anterior");
  assert.equal(sanitizeImportReport(legacy)!.preparedVersion, undefined);
  assert.equal(formatImportReport(receipt())!.timing[0], "Coleta: horário não registrado");
  for (const capturedAt of ["2026-02-30T12:00:00Z", "not-a-date", "https://secret.test/?token=x", 123]) {
    assert.equal(sanitizeImportReport({ ...receipt(), capturedAt })!.capturedAt, undefined);
  }
  for (const preparedVersion of [null, "0.3.6<script>", "https://secret.test/?token=x", 0.36]) {
    const safe = sanitizeImportReport({ ...receipt(), preparedVersion })!;
    assert.equal(safe.preparedVersion, undefined);
    assert.doesNotMatch(JSON.stringify(formatImportReport(safe)), /script|secret\.test/);
  }
});
