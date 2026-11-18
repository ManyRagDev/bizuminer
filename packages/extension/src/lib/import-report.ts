/** Safe, bounded receipts. Counts describe this request, never inferred historical losses. */
export const IMPORT_REASON_LABELS = {
  duplicate_external_id: "Identificador repetido nesta leitura",
  product_invalid: "Dados do produto incompletos",
  product_id_invalid: "Identificador do produto inválido",
  product_title_invalid: "Nome do produto ausente ou inválido",
  product_url_invalid: "Endereço do produto inválido",
  product_identity_invalid: "Endereço e identificador não correspondem",
  product_price_invalid: "Preço ausente ou inválido",
  product_original_price_invalid: "Preço de referência inválido",
  product_price_range_invalid: "Faixa de preço inválida",
  image_url_invalid: "Endereço da imagem inválido",
} as const;
export type ImportReason = keyof typeof IMPORT_REASON_LABELS | "unknown_reason";
export interface ImportDiagnosticItem {
  index: number;
  externalId?: string;
  status: "duplicate" | "rejected";
  reason: ImportReason;
}
export interface ImportDiagnostics {
  received: number;
  valid: number;
  duplicates: number;
  rejected: number;
  items: ImportDiagnosticItem[];
}
export interface ImportReport {
  requestId: string;
  at: number;
  ok: boolean;
  capturedAt?: string;
  preparedVersion?: string;
  importedCount?: number;
  alreadyRecordedCount?: number;
  duplicate?: boolean;
  error?: string;
  diagnostics?: ImportDiagnostics;
}
const MAX_ITEMS = 200;
export function collectionMetadata(value: unknown): { capturedAt?: string; preparedVersion?: string } {
  const raw = record(value);
  if (!raw) return {};
  const result: { capturedAt?: string; preparedVersion?: string } = {};
  if (typeof raw.capturedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.capturedAt)
    && Number.isFinite(Date.parse(raw.capturedAt))
    && new Date(raw.capturedAt).toISOString().replace(".000Z", "Z") === raw.capturedAt.replace(".000Z", "Z")) result.capturedAt = raw.capturedAt;
  if (typeof raw.preparedVersion === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(raw.preparedVersion)) result.preparedVersion = raw.preparedVersion;
  return result;
}
export function formatCollectionDetails(value: unknown): string[] {
  const metadata = collectionMetadata(value);
  return [
    metadata.capturedAt ? `Coleta: ${new Date(metadata.capturedAt).toLocaleString("pt-BR")}` : "Coleta: horário não registrado",
    metadata.preparedVersion ? `Versão da coleta: ${metadata.preparedVersion}` : "Versão da coleta: versão não registrada; leitura anterior",
  ];
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_ITEMS;
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function safeId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64
    && (/^MLB\d{6,}$/.test(value) || /^[A-Z0-9]{10}$/.test(value) || /^\d{8,20}$/.test(value));
}
function diagnostics(value: unknown): ImportDiagnostics | undefined {
  const d = record(value);
  if (!d || !count(d.received) || !count(d.valid) || !count(d.duplicates) || !count(d.rejected)
    || d.received !== d.valid + d.duplicates + d.rejected || !Array.isArray(d.items)
    || d.items.length !== d.duplicates + d.rejected || d.items.length > MAX_ITEMS) return undefined;
  const items: ImportDiagnosticItem[] = [];
  const indices = new Set<number>();
  for (const raw of d.items) {
    const item = record(raw);
    if (!item || !count(item.index) || item.index < 1 || item.index > d.received || indices.has(item.index)
      || item.status !== "duplicate" && item.status !== "rejected") return undefined;
    indices.add(item.index);
    const reason = typeof item.reason === "string" && Object.hasOwn(IMPORT_REASON_LABELS, item.reason)
      ? item.reason as keyof typeof IMPORT_REASON_LABELS : "unknown_reason";
    items.push({ index: item.index, status: item.status, reason,
      ...(safeId(item.externalId) ? { externalId: item.externalId } : {}) });
  }
  if (items.filter(item => item.status === "duplicate").length !== d.duplicates
    || items.filter(item => item.status === "rejected").length !== d.rejected) return undefined;
  return { received: d.received, valid: d.valid, duplicates: d.duplicates, rejected: d.rejected,
    items: items.sort((a, b) => a.index - b.index) };
}
const SAFE_ERRORS = new Set(["invalid_payload", "no_valid_products", "network", "timeout", "invalid_response", "not_paired",
  "unauthorized", "forbidden", "device_revoked", "account_suspended", "capture_expired", "retry_limit", "session_changed",
  "marketplace_capture_unavailable", "browser_capture_forbidden", "request_failed", "storage_or_network"]);

export function sanitizeImportReport(value: unknown): ImportReport | null {
  const raw = record(value);
  if (!raw || typeof raw.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.requestId)
    || !Number.isSafeInteger(raw.at) || Number(raw.at) < 0 || !Number.isFinite(new Date(Number(raw.at)).getTime())
    || typeof raw.ok !== "boolean") return null;
  const result: ImportReport = { requestId: raw.requestId, at: Number(raw.at), ok: raw.ok, ...collectionMetadata(raw) };
  const detail = diagnostics(raw.diagnostics);
  if (detail) result.diagnostics = detail;
  if (count(raw.importedCount) && (!detail || raw.importedCount <= detail.valid)) result.importedCount = raw.importedCount;
  if (detail && result.importedCount !== undefined && count(raw.alreadyRecordedCount)
    && raw.alreadyRecordedCount + result.importedCount === detail.valid) result.alreadyRecordedCount = raw.alreadyRecordedCount;
  if (typeof raw.duplicate === "boolean") result.duplicate = raw.duplicate;
  if (typeof raw.error === "string") result.error = SAFE_ERRORS.has(raw.error) ? raw.error : "request_failed";
  return result;
}
export interface ImportReportView {
  heading: string;
  timestamp: number;
  timing: string[];
  counts: string[];
  explanation: string;
  reasons: string[];
  items: string[];
}
export function formatImportReport(value: unknown): ImportReportView | null {
  const report = sanitizeImportReport(value);
  if (!report) return null;
  const d = report.diagnostics;
  const number = (value: number | undefined) => value === undefined ? "informação indisponível" : String(value);
  const grouped = new Map<string, { count: number; label: string }>();
  const reasonLabel = (reason: ImportReason) => reason === "unknown_reason" ? "Motivo não informado pelo servidor" : IMPORT_REASON_LABELS[reason];
  for (const item of d?.items ?? []) {
    const key = `${item.status}:${item.reason}`;
    const current = grouped.get(key);
    grouped.set(key, { count: (current?.count ?? 0) + 1,
      label: `${item.status === "duplicate" ? "Duplicados" : "Rejeitados"} — ${reasonLabel(item.reason)}` });
  }
  return {
    heading: report.ok ? "Última importação confirmada" : "Última tentativa de importação",
    timestamp: report.at,
    timing: [...formatCollectionDetails(report), `${report.ok ? "Confirmação" : "Tentativa de envio"}: ${new Date(report.at).toLocaleString("pt-BR")}`],
    counts: [
      `Recebidos pelo servidor: ${number(d?.received)}`,
      `Válidos únicos: ${number(d?.valid)}`,
      `Duplicados nesta leitura: ${number(d?.duplicates)}`,
      `Rejeitados na validação: ${number(d?.rejected)}`,
      `Novas observações registradas: ${number(report.importedCount)}`,
      `Já registrados, sem nova observação: ${number(report.alreadyRecordedCount)}`,
    ],
    explanation: d
      ? "Duplicados são repetições dentro desta leitura. Já registrados são itens válidos que não criaram nova observação. Os motivos abaixo pertencem somente a esta solicitação."
      : "O servidor não forneceu um detalhamento válido desta solicitação. Não é possível atribuir a diferença a duplicação, rejeição ou histórico.",
    reasons: [...grouped.values()].map(group => `${group.label}: ${group.count}`),
    items: (d?.items ?? []).map(item => `Item ${item.index}${item.externalId ? ` · ${item.externalId}` : ""}: ${item.status === "duplicate" ? "duplicado" : "rejeitado"} — ${reasonLabel(item.reason)}.`),
  };
}
