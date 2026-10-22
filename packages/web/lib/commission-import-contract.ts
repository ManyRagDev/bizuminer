/**
 * Contrato canônico para importação e conciliação de relatórios de comissão (EP-08B / C-07 / G-FIN).
 *
 * Implementa o parser canônico interno estrito, cálculo de digest invariante a reordenação
 * e sem colisão de representação, validação estrita de linhas, relatório de inconsistências
 * e agregação de totais por moeda para preparação do ledger idempotente.
 */

import { createHash } from "node:crypto";
import {
  VALID_COMMISSION_STATES,
  VALID_CONVERSION_STATUSES,
  type CommissionState,
  type ConversionStatus,
} from "./commercial-financial-contract.ts";
import {
  detectReportFormat,
  parseMarketplaceCommissionReport,
  type MarketplaceReportFormat,
} from "./commission-import-adapters.ts";

export {
  detectReportFormat,
  parseMarketplaceCommissionReport,
  type MarketplaceReportFormat,
};

export interface CanonicalImportRow {
  readonly externalOrderId: string;
  readonly externalItemId?: string | null;
  readonly occurredAt: string;
  readonly orderValueCents?: number | null;
  readonly commissionCents: number;
  readonly currency: string;
  readonly marketplace: string;
  readonly subId?: string | null;
  readonly status: ConversionStatus;
  readonly commissionState: CommissionState;
  readonly sourceRevision?: string;
}

export interface ImportError {
  readonly line: number;
  readonly rawText: string;
  readonly reason: string;
}

export interface CurrencyTotals {
  orderValueCents: number;
  commissionCents: number;
}

export interface ImportRowDecisionDetail {
  readonly rowNumber: number;
  readonly externalOrderId: string;
  readonly externalItemId?: string | null;
  readonly decision: "imported" | "review_required" | "rejected" | "duplicate";
  readonly reason?: string;
  readonly row?: CanonicalImportRow;
}

export interface ImportPreview {
  readonly fileDigest: string;
  readonly canonicalDigest: string;
  readonly totalLines: number;
  readonly validRowsCount: number;
  readonly errorRowsCount: number;
  readonly reviewRequiredCount: number;
  readonly duplicateCount: number;
  readonly totalOrderValueCents: number;
  readonly totalCommissionCents: number;
  readonly totalsByCurrency: Record<string, CurrencyTotals>;
  readonly currencies: readonly string[];
  readonly marketplaces: readonly string[];
  readonly validRows: readonly CanonicalImportRow[];
  readonly errors: readonly ImportError[];
  readonly rowDecisions: readonly ImportRowDecisionDetail[];
}

/**
 * Calcula o digest canônico invariante à ordem das linhas para garantir idempotência.
 * Usa serialização JSON estruturada para evitar colisões de representação quando
 * campos contêm delimitadores (ex.: externalOrderId com dois pontos).
 */
export function calculateCanonicalReportDigest(rows: readonly CanonicalImportRow[]): string {
  const normalized = rows
    .map((r) =>
      JSON.stringify([
        r.marketplace.trim().toLowerCase(),
        r.externalOrderId.trim(),
        r.externalItemId?.trim() ?? null,
        new Date(r.occurredAt).toISOString(),
        r.orderValueCents ?? null,
        r.commissionCents,
        r.currency.toUpperCase(),
        r.subId?.trim() ?? null,
        r.status,
        r.commissionState,
        r.sourceRevision ?? null,
      ])
    )
    .sort()
    .join("\n");

  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Parser de linha CSV com suporte a campos entre aspas (RFC 4180 básico).
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Valida estritamente inteiro não negativo em centavos. Rejeita números truncados,
 * strings com sufixos/prefixos alfanuméricos e valores negativos.
 */
function parseStrictNonNegativeInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0) return null;
  return num;
}

/**
 * Valida se um identificador de pedido é seguro contra injeção e não genérico.
 * Identificadores agregados ou genéricos (UNKNOWN, NONE, N/A, com espaços ou curtos)
 * exigem revisão manual mandatória antes de confirmação.
 */
export function isSafeOrderId(id: string): boolean {
  const trimmed = id.trim();
  if (trimmed.length < 3) return false;
  if (/\s/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === "unknown" ||
    lower === "null" ||
    lower === "none" ||
    lower === "n/a" ||
    lower.startsWith("agg-") ||
    lower.startsWith("aggregate") ||
    lower.startsWith("agg:")
  ) {
    return false;
  }
  return true;
}

/**
 * Trata injeção de fórmulas em planilhas (CSV Injection).
 * Prefixar com apóstrofo (') valores que iniciam com =, +, -, @, \t, \r
 * e envolver em aspas com escape de aspas duplas caso contenha delimitadores.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const formulaTriggers = ["=", "+", "-", "@", "\t", "\r"];
  let safe = str;
  if (formulaTriggers.some((t) => str.startsWith(t))) {
    safe = "'" + str;
  }
  if (safe.includes('"') || safe.includes(",") || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatCsvRow(cells: readonly unknown[]): string {
  return cells.map(sanitizeCsvCell).join(",");
}

/**
 * Exporta dados financeiros para CSV garantindo higienização de injeção de fórmulas.
 */
export function exportFinancialLedgerCsv(
  conversions: readonly {
    marketplace: string;
    occurredAt: string;
    orderValueCents?: number | null;
    currency: string;
    verification: string;
    status: string;
    externalOrderId?: string | null;
  }[],
  commissions: readonly {
    sourceKey: string;
    amountCents: number;
    currency: string;
    state: string;
    occurredAt: string;
    sourceRef: string;
    predecessorId?: string | null;
  }[],
): string {
  const lines: string[] = [];
  lines.push("type,identifier,marketplace,occurredAt,amountCents,currency,state_or_status,verification_or_sourceRef");
  for (const c of conversions) {
    lines.push(
      formatCsvRow([
        "conversion",
        c.externalOrderId ?? "",
        c.marketplace,
        c.occurredAt,
        c.orderValueCents ?? "",
        c.currency,
        c.status,
        c.verification,
      ])
    );
  }
  for (const entry of commissions) {
    lines.push(
      formatCsvRow([
        "commission",
        entry.sourceKey,
        "",
        entry.occurredAt,
        entry.amountCents,
        entry.currency,
        entry.state,
        entry.sourceRef,
      ])
    );
  }
  return lines.join("\n");
}

/**
 * Faz o parsing estrito de um CSV canônico de comissão.
 * Cabeçalho e dados esperados com exatamente 10 colunas:
 * externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
 */
export function parseCanonicalCommissionCsv(
  csvContent: string,
  allowMarketplaceFallback = true
): ImportPreview {
  if (allowMarketplaceFallback) {
    const detected = detectReportFormat(csvContent);
    if (detected !== "canonical") {
      return parseMarketplaceCommissionReport(csvContent, detected);
    }
  }

  const fileDigest = createHash("sha256").update(csvContent).digest("hex");
  const rawLines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return {
      fileDigest,
      canonicalDigest: createHash("sha256").update("").digest("hex"),
      totalLines: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      reviewRequiredCount: 0,
      duplicateCount: 0,
      totalOrderValueCents: 0,
      totalCommissionCents: 0,
      totalsByCurrency: {},
      currencies: [],
      marketplaces: [],
      validRows: [],
      errors: [],
      rowDecisions: [],
    };
  }

  const validRows: CanonicalImportRow[] = [];
  const errors: ImportError[] = [];
  const rowDecisions: ImportRowDecisionDetail[] = [];
  const currencies = new Set<string>();
  const marketplaces = new Set<string>();
  const totalsByCurrency: Record<string, CurrencyTotals> = {};
  const seenKeys = new Map<string,string>();
  let totalOrderValue = 0;
  let totalCommission = 0;
  let reviewRequiredCount = 0;
  let duplicateCount = 0;

  // Detecta se a primeira linha é cabeçalho
  const headerParts = parseCsvLine(rawLines[0]!).map((p) => p.toLowerCase());
  const hasHeader =
    headerParts.length >= 2 &&
    (headerParts.includes("externalorderid") ||
      headerParts.includes("order") ||
      headerParts.includes("commissioncents") ||
      headerParts.includes("commission"));
  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
  const lineOffset = hasHeader ? 2 : 1;

  for (let i = 0; i < dataLines.length; i++) {
    const lineNumber = i + lineOffset;
    const line = dataLines[i]!;
    const parts = parseCsvLine(line);

    if (parts.length < 10) {
      const reason = `Número insuficiente de colunas (esperado 10 colunas canônicas, encontrado ${parts.length})`;
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId: parts[0] || "",
        externalItemId: parts[1] || null,
        decision: "rejected",
        reason,
      });
      continue;
    }

    const [
      externalOrderId,
      externalItemId,
      occurredAtRaw,
      orderValueRaw,
      commissionRaw,
      currencyRaw,
      marketplaceRaw,
      subIdRaw,
      statusRaw,
      commissionStateRaw,
      sourceRevisionRaw,
    ] = parts;

    if (!externalOrderId || externalOrderId.length === 0) {
      const reason = "externalOrderId ausente ou vazio";
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId: "",
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }

    if (!occurredAtRaw || occurredAtRaw.length === 0) {
      const reason = "occurredAt ausente ou vazio";
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }
    const date = new Date(occurredAtRaw);
    if (isNaN(date.getTime())) {
      const reason = `Data inválida: '${occurredAtRaw}'`;
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }

    if (!commissionRaw || commissionRaw.length === 0) {
      const reason = "commissionCents ausente ou vazio";
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }
    const commissionCents = parseStrictNonNegativeInteger(commissionRaw);
    if (commissionCents === null) {
      const reason = `Valor de comissão inválido (deve ser inteiro não negativo em centavos): '${commissionRaw}'`;
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }

    let orderValueCents: number | null = null;
    if (orderValueRaw && orderValueRaw !== "null" && orderValueRaw !== "") {
      orderValueCents = parseStrictNonNegativeInteger(orderValueRaw);
      if (orderValueCents === null) {
        const reason = `Valor do pedido inválido (deve ser inteiro não negativo em centavos): '${orderValueRaw}'`;
        errors.push({
          line: lineNumber,
          rawText: line,
          reason,
        });
        rowDecisions.push({
          rowNumber: lineNumber,
          externalOrderId,
          externalItemId: externalItemId || null,
          decision: "rejected",
          reason,
        });
        continue;
      }
    }

    if (!currencyRaw || !/^[A-Z]{3}$/.test(currencyRaw.toUpperCase())) {
      const reason = `Moeda inválida ou ausente (esperado código ISO 3 letras): '${currencyRaw}'`;
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }
    const currency = currencyRaw.toUpperCase();

    if (!marketplaceRaw || marketplaceRaw.length === 0) {
      const reason = "marketplace ausente ou vazio";
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }
    const marketplace = marketplaceRaw.toLowerCase();

    if (!statusRaw || !(VALID_CONVERSION_STATUSES as readonly string[]).includes(statusRaw.toLowerCase())) {
      const reason = `Status de conversão inválido ou inexistente: '${statusRaw}'`;
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }
    const status = statusRaw.toLowerCase() as ConversionStatus;

    if (!commissionStateRaw || !(VALID_COMMISSION_STATES as readonly string[]).includes(commissionStateRaw.toLowerCase())) {
      const reason = `Estado de comissão inválido ou inexistente: '${commissionStateRaw}'`;
      errors.push({
        line: lineNumber,
        rawText: line,
        reason,
      });
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "rejected",
        reason,
      });
      continue;
    }
    const commissionState = commissionStateRaw.toLowerCase() as CommissionState;

    const rowObj: CanonicalImportRow = {
      externalOrderId,
      externalItemId: externalItemId || null,
      occurredAt: date.toISOString(),
      orderValueCents,
      commissionCents,
      currency,
      marketplace,
      subId: subIdRaw || null,
      status,
      commissionState,
      ...(sourceRevisionRaw?.trim() ? {sourceRevision:sourceRevisionRaw.trim()} : {}),
    };

    // Detecção de duplicata dentro do mesmo arquivo sem colisão de delimitador (CF-09)
    const dedupeKey = JSON.stringify([marketplace,externalOrderId,externalItemId||null,sourceRevisionRaw?.trim()??null]);
    const rowDigest=calculateCanonicalReportDigest([rowObj]);
    if (seenKeys.get(dedupeKey)===rowDigest) {
      duplicateCount++;
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId: externalItemId || null,
        decision: "duplicate",
        reason: "Linha duplicada dentro do mesmo lote",
        row: rowObj,
      });
      continue; // Não soma duplicatas
    }
    const identityConflict=seenKeys.has(dedupeKey);
    seenKeys.set(dedupeKey,rowDigest);

    // Validação de identificador seguro
    const safe = isSafeOrderId(externalOrderId) && !identityConflict;
    if (!safe) {
      reviewRequiredCount++;
    }

    const decision = safe ? "imported" : "review_required";
    rowDecisions.push({
      rowNumber: lineNumber,
      externalOrderId,
      externalItemId: externalItemId || null,
      decision,
      reason: safe ? undefined : "Identificador inseguro ou agregado; revisão manual requerida",
      row: rowObj,
    });

    currencies.add(currency);
    marketplaces.add(marketplace);
    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = { orderValueCents: 0, commissionCents: 0 };
    }
    if (orderValueCents !== null) {
      totalsByCurrency[currency]!.orderValueCents += orderValueCents;
      totalOrderValue += orderValueCents;
    }
    totalsByCurrency[currency]!.commissionCents += commissionCents;
    totalCommission += commissionCents;

    validRows.push(rowObj);
  }

  const canonicalDigest = calculateCanonicalReportDigest(validRows);

  return {
    fileDigest,
    canonicalDigest,
    totalLines: dataLines.length,
    validRowsCount: validRows.length,
    errorRowsCount: errors.length,
    reviewRequiredCount,
    duplicateCount,
    totalOrderValueCents: totalOrderValue,
    totalCommissionCents: totalCommission,
    totalsByCurrency,
    currencies: Array.from(currencies).sort(),
    marketplaces: Array.from(marketplaces).sort(),
    validRows,
    errors,
    rowDecisions,
  };
}
