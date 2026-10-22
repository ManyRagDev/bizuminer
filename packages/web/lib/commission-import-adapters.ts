/**
 * Adapters de Importação de Relatórios de Comissões de Afiliados (OS-13 / EP-08B / G-FIN).
 *
 * Fornece normalização e detecção automática de formatos para:
 * - Shopee Affiliate Report
 * - AliExpress Affiliate Report
 * - Mercado Livre Programa de Afiliados
 * - Formato Canônico Interno BizuMiner
 */

import {
  type CanonicalImportRow,
  type ImportPreview,
  type ImportError,
  type ImportRowDecisionDetail,
  type CurrencyTotals,
  calculateCanonicalReportDigest,
  parseCanonicalCommissionCsv,
} from "./commission-import-contract.ts";
import {
  type CommissionState,
  type ConversionStatus,
} from "./commercial-financial-contract.ts";
import { createHash } from "node:crypto";

export type MarketplaceReportFormat =
  | "canonical"
  | "shopee"
  | "aliexpress"
  | "mercadolivre";

/**
 * Função utilitária para dividir linha CSV preservando aspas RFC 4180.
 */
function parseCsvLine(line: string, delimiter = ","): string[] {
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
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/** Header fields have no decimal values; count separators outside quoted cells. */
function detectDelimiter(header: string): string {
  return parseCsvLine(header, ";").length > parseCsvLine(header, ",").length ? ";" : ",";
}

/**
 * Normaliza strings de valor financeiro ("R$ 150,50", "150.50", "150,50", "15050") para centavos inteiros.
 */
export function parseAmountToCents(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/^\$\s*/, "")
    .replace(/\s+/g, "");

  if (!cleaned) return null;

  // Se já for apenas dígitos puros sem separador, mas pode ser centavos ou reais
  // Se contiver vírgula ou ponto decimal:
  if (/^[0-9]+[.,][0-9]{1,2}$/.test(cleaned)) {
    const standardized = cleaned.replace(",", ".");
    const num = Math.round(Number(standardized) * 100);
    return Number.isSafeInteger(num) && num >= 0 ? num : null;
  }

  // Se tiver separador de milhar: ex: 1.250,50 ou 1,250.50
  if (/^[0-9]{1,3}(?:[.,][0-9]{3})+[.,][0-9]{1,2}$/.test(cleaned)) {
    const hasCommaDecimal = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".");
    const normalized = hasCommaDecimal
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
    const num = Math.round(Number(normalized) * 100);
    return Number.isSafeInteger(num) && num >= 0 ? num : null;
  }

  // Se for inteiro simples: trata como reais se não tiver casas, convertendo para centavos
  if (/^[0-9]+$/.test(cleaned)) {
    const num = Number(cleaned);
    return Number.isSafeInteger(num * 100) && num >= 0 ? num * 100 : null;
  }

  return null;
}

/**
 * Normaliza datas para ISO 8601 UTC.
 */
export function parseDateToIso(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Caso ISO direto
  const isoDate = new Date(trimmed);
  const isoParts = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  const calendarValid = isoParts && Number(isoParts[2]) >= 1 && Number(isoParts[2]) <= 12 &&
    Number(isoParts[3]) >= 1 && Number(isoParts[3]) <= new Date(Date.UTC(Number(isoParts[1]), Number(isoParts[2]), 0)).getUTCDate();
  if (!isNaN(isoDate.getTime()) && calendarValid) {
    return isoDate.toISOString();
  }

  // Formato BR: DD/MM/YYYY ou DD/MM/YYYY HH:mm:ss
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]) - 1;
    const year = Number(brMatch[3]);
    const hour = Number(brMatch[4] || 0);
    const minute = Number(brMatch[5] || 0);
    const second = Number(brMatch[6] || 0);
    const d = new Date(Date.UTC(year, month, day, hour, minute, second));
    if (!isNaN(d.getTime()) && d.getUTCFullYear() === year && d.getUTCMonth() === month &&
      d.getUTCDate() === day && d.getUTCHours() === hour && d.getUTCMinutes() === minute &&
      d.getUTCSeconds() === second) return d.toISOString();
  }

  return null;
}

/**
 * Detecta o formato do relatório inspecionando os cabeçalhos.
 */
export function detectReportFormat(csvContent: string): MarketplaceReportFormat {
  const firstLine = csvContent.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const headers = parseCsvLine(firstLine, detectDelimiter(firstLine)).map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "")
  );

  if (headers.includes("externalorderid") && headers.includes("commissioncents")) {
    return "canonical";
  }

  // Shopee patterns
  if (
    (headers.includes("orderid") || headers.includes("iddopedido")) &&
    (headers.includes("estimatedcommission") || headers.includes("comissaoestimada") || headers.includes("comissao"))
  ) {
    return "shopee";
  }

  // AliExpress patterns
  if (
    (headers.includes("ordernumber") || headers.includes("numerodopedido")) &&
    (headers.includes("estimatedcommission") || headers.includes("comissaoestimada") || headers.includes("comissao"))
  ) {
    return "aliexpress";
  }

  // Mercado Livre patterns
  if (
    (headers.includes("idlatransacao") || headers.includes("transactionid") || headers.includes("iddacompra")) &&
    (headers.includes("comissao") || headers.includes("commissionamount") || headers.includes("commission"))
  ) {
    return "mercadolivre";
  }

  // Fallback: se tiver colunas com 'shopee' ou 'shope' no cabeçalho ou valores
  if (firstLine.toLowerCase().includes("shopee")) return "shopee";
  if (firstLine.toLowerCase().includes("aliexpress") || firstLine.toLowerCase().includes("ali_express")) return "aliexpress";
  if (firstLine.toLowerCase().includes("mercadolivre") || firstLine.toLowerCase().includes("mercado livre")) return "mercadolivre";

  return "canonical";
}

/**
 * Normaliza o status do pedido para o contrato canônico.
 */
function normalizeStatus(
  rawStatus: string | undefined | null,
  marketplace: string
): { status: ConversionStatus; commissionState: CommissionState } {
  const s = (rawStatus || "").trim().toLowerCase();

  // Status confirmados / pagos
  if (
    ["confirmed", "completed", "paid", "concluído", "concluido", "pago", "entregue", "finished", "settled"].includes(s)
  ) {
    return { status: "confirmed", commissionState: "confirmed" };
  }

  // Status cancelados / estornados
  if (
    ["rejected", "cancelled", "canceled", "cancelado", "devolvido", "invalid", "invalido", "refunded", "estornado"].includes(s)
  ) {
    const isRefunded = s.includes("refund") || s.includes("estorn") || s.includes("devolv");
    return { status: isRefunded ? "refunded" : "cancelled", commissionState: "reversed" };
  }

  // Padrão: pendente
  return { status: "pending", commissionState: "pending" };
}

/**
 * Parser genérico para relatórios de marketplaces com mapeamento de colunas.
 */
export function parseMarketplaceCommissionReport(
  csvContent: string,
  forcedFormat?: MarketplaceReportFormat
): ImportPreview {
  const format = forcedFormat || detectReportFormat(csvContent);

  if (format === "canonical") {
    return parseCanonicalCommissionCsv(csvContent, false);
  }

  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return parseCanonicalCommissionCsv(csvContent, false);
  }

  const fileDigest = createHash("sha256").update(csvContent).digest("hex");
  const headerLine = lines[0]!;
  const delimiter = detectDelimiter(headerLine);
  const rawHeaders = parseCsvLine(headerLine, delimiter);
  const headers = rawHeaders.map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "")
  );

  const dataLines = lines.slice(1);
  const validRows: CanonicalImportRow[] = [];
  const errors: ImportError[] = [];
  const rowDecisions: ImportRowDecisionDetail[] = [];
  const seenKeys = new Map<string, string>();
  let duplicateCount = 0;
  let reviewRequiredCount = 0;
  let totalOrderValue = 0;
  let totalCommission = 0;
  const totalsByCurrency: Record<string, CurrencyTotals> = {};
  const currencies = new Set<string>();
  const marketplaces = new Set<string>();

  // Mapeamento de índices baseado no formato
  let orderIdIdx = -1;
  let itemIdIdx = -1;
  let dateIdx = -1;
  let orderValIdx = -1;
  let commIdx = -1;
  let currencyIdx = -1;
  let subIdIdx = -1;
  let statusIdx = -1;
  let defaultMarketplace = format;
  let defaultCurrency = "BRL";

  if (format === "shopee") {
    orderIdIdx = headers.findIndex((h) => h.includes("orderid") || h.includes("iddopedido"));
    itemIdIdx = headers.findIndex((h) => h.includes("itemid") || h.includes("iddoproduto") || h.includes("iddoitem"));
    dateIdx = headers.findIndex((h) => h.includes("time") || h.includes("horario") || h.includes("data"));
    orderValIdx = headers.findIndex((h) => h.includes("orderamount") || h.includes("valordopedido") || h.includes("valor"));
    commIdx = headers.findIndex((h) => h.includes("commission") || h.includes("comissao"));
    currencyIdx = headers.findIndex((h) => h.includes("currency") || h.includes("moeda"));
    subIdIdx = headers.findIndex((h) => h.includes("sub") || h.includes("subid"));
    statusIdx = headers.findIndex((h) => h.includes("status"));
    defaultMarketplace = "shopee";
  } else if (format === "aliexpress") {
    orderIdIdx = headers.findIndex((h) => h.includes("ordernumber") || h.includes("numerodopedido") || h.includes("orderid"));
    itemIdIdx = headers.findIndex((h) => h.includes("productid") || h.includes("iddoitem") || h.includes("iddoproduto"));
    dateIdx = headers.findIndex((h) => h.includes("time") || h.includes("date") || h.includes("data"));
    orderValIdx = headers.findIndex((h) => h.includes("paymentamount") || h.includes("valordopedido") || h.includes("orderamount"));
    commIdx = headers.findIndex((h) => h.includes("commission") || h.includes("comissao"));
    currencyIdx = headers.findIndex((h) => h.includes("currency") || h.includes("moeda"));
    subIdIdx = headers.findIndex((h) => h.includes("tracking") || h.includes("subid") || h.includes("sub"));
    statusIdx = headers.findIndex((h) => h.includes("status"));
    defaultMarketplace = "aliexpress";
  } else if (format === "mercadolivre") {
    orderIdIdx = headers.findIndex((h) => h.includes("transactionid") || h.includes("idlatransacao") || h.includes("iddacompra"));
    itemIdIdx = headers.findIndex((h) => h.includes("listingid") || h.includes("publicacao") || h.includes("anuncio"));
    dateIdx = headers.findIndex((h) => h.includes("date") || h.includes("data"));
    orderValIdx = headers.findIndex((h) => h.includes("totalamount") || h.includes("valortotal") || h.includes("valor"));
    commIdx = headers.findIndex((h) => h.includes("commission") || h.includes("comissao"));
    currencyIdx = headers.findIndex((h) => h.includes("currency") || h.includes("moeda"));
    subIdIdx = headers.findIndex((h) => h.includes("subid") || h.includes("campanha") || h.includes("tracking"));
    statusIdx = headers.findIndex((h) => h.includes("status"));
    defaultMarketplace = "mercadolivre";
  }

  // Processar cada linha de dados
  for (let i = 0; i < dataLines.length; i++) {
    const lineNumber = i + 2;
    const lineText = dataLines[i]!;
    const cols = parseCsvLine(lineText, delimiter);

    if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

    const externalOrderId = (orderIdIdx >= 0 ? cols[orderIdIdx] : "")?.trim() || "";
    if (!externalOrderId) {
      errors.push({
        line: lineNumber,
        rawText: lineText,
        reason: "ID de pedido ausente",
      });
      continue;
    }

    const rawComm = commIdx >= 0 ? cols[commIdx] : "";
    const commissionCents = parseAmountToCents(rawComm);
    if (commissionCents === null || commissionCents < 0) {
      errors.push({
        line: lineNumber,
        rawText: lineText,
        reason: `Comissão inválida ou ausente: '${rawComm}'`,
      });
      continue;
    }

    const rawDate = dateIdx >= 0 ? cols[dateIdx] : "";
    const occurredAtIso = parseDateToIso(rawDate);
    if (!occurredAtIso) {
      const reason = `Data inválida ou ausente: '${rawDate}'`;
      errors.push({ line: lineNumber, rawText: lineText, reason });
      rowDecisions.push({ rowNumber: lineNumber, externalOrderId, decision: "rejected", reason });
      continue;
    }

    const rawOrderVal = orderValIdx >= 0 ? cols[orderValIdx] : "";
    const orderValueCents = parseAmountToCents(rawOrderVal);

    const currencyRaw = (currencyIdx >= 0 ? cols[currencyIdx] : "")?.trim().toUpperCase();
    const currency = currencyRaw && /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : defaultCurrency;

    const externalItemId = (itemIdIdx >= 0 ? cols[itemIdIdx] : "")?.trim() || null;
    const subId = (subIdIdx >= 0 ? cols[subIdIdx] : "")?.trim() || null;
    const rawStatus = statusIdx >= 0 ? cols[statusIdx] : "";
    const { status, commissionState } = normalizeStatus(rawStatus, defaultMarketplace);

    const rowObj: CanonicalImportRow = {
      externalOrderId,
      externalItemId,
      occurredAt: occurredAtIso,
      orderValueCents,
      commissionCents,
      currency,
      marketplace: defaultMarketplace,
      subId,
      status,
      commissionState,
      sourceRevision: format,
    };

    // Detecção de duplicata no lote
    const dedupeKey = JSON.stringify([defaultMarketplace, externalOrderId, externalItemId, format]);
    const rowDigest = calculateCanonicalReportDigest([rowObj]);
    if (seenKeys.get(dedupeKey) === rowDigest) {
      duplicateCount++;
      rowDecisions.push({
        rowNumber: lineNumber,
        externalOrderId,
        externalItemId,
        decision: "duplicate",
        reason: "Linha duplicada dentro do mesmo lote",
        row: rowObj,
      });
      continue;
    }

    const identityConflict = seenKeys.has(dedupeKey);
    seenKeys.set(dedupeKey, rowDigest);

    const isSafe = /^[A-Za-z0-9_-]+$/.test(externalOrderId) && !identityConflict;
    if (!isSafe) {
      reviewRequiredCount++;
    }

    const decision = isSafe ? "imported" : "review_required";
    rowDecisions.push({
      rowNumber: lineNumber,
      externalOrderId,
      externalItemId,
      decision,
      reason: isSafe ? undefined : "Identificador exige revisão manual",
      row: rowObj,
    });

    currencies.add(currency);
    marketplaces.add(defaultMarketplace);
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
