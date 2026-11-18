import {
  validateExtensionCapturePayload,
  isExtensionMarketplace,
  type SupportedExtensionMarketplace,
  type ExtensionCaptureProduct,
} from "./extension-contract.ts";
import { base64urlDecode, fnv1a32 } from "./manual-capture.ts";
import { ambiguousSourceIdentity, sourcePageUrl } from "../../capture/src/source-page-url.ts";

export interface BrowserCaptureProduct extends ExtensionCaptureProduct {
  ratingStar?: number;
  salesCount?: number;
  salesLabel?: string;
}
export interface BrowserCapturePayload {
  version: 1;
  requestId: string;
  marketplace: SupportedExtensionMarketplace;
  clientCapturedAt: string;
  page: {
    kind: "offers" | "search" | "category" | "listing" | "product";
    url: string;
  };
  products: BrowserCaptureProduct[];
}
export const validBatchId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

export const browserCaptureDiagnosticReasons = [
  "duplicate_external_id", "product_invalid", "product_id_invalid", "product_title_invalid",
  "product_url_invalid", "product_identity_invalid", "product_price_invalid",
  "product_original_price_invalid", "product_price_range_invalid", "image_url_invalid",
] as const;
export type BrowserCaptureDiagnosticReason = typeof browserCaptureDiagnosticReasons[number];
export interface BrowserCaptureDiagnostics {
  received: number;
  valid: number;
  duplicates: number;
  rejected: number;
  items: Array<{ index: number; externalId?: string; status: "duplicate" | "rejected"; reason: BrowserCaptureDiagnosticReason }>;
}
export class BrowserCaptureValidationError extends Error {
  readonly diagnostics: BrowserCaptureDiagnostics;
  constructor(diagnostics: BrowserCaptureDiagnostics) {
    super(diagnostics.items.find(item => item.status === "rejected")?.reason ?? "product_invalid");
    this.name = "BrowserCaptureValidationError";
    this.diagnostics = diagnostics;
  }
}

function diagnosticExternalId(raw: unknown, marketplace: SupportedExtensionMarketplace): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = (raw as Record<string, unknown>).externalId;
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  if (id.length > 64) return undefined;
  if (marketplace === "mercadolivre") return /^MLB\d{6,}$/.test(id) ? id : undefined;
  if (marketplace === "amazon") return /^[A-Z0-9]{10}$/i.test(id) ? id.toUpperCase() : undefined;
  return /^\d{8,20}$/.test(id) ? id : undefined;
}

/** Map only known validation categories; never serialize arbitrary exception messages. */
function diagnosticReason(error: unknown): BrowserCaptureDiagnosticReason {
  const message = error instanceof Error ? error.message : "";
  if ((browserCaptureDiagnosticReasons as readonly string[]).includes(message)) return message as BrowserCaptureDiagnosticReason;
  if (message.startsWith("product.externalId ")) return "product_id_invalid";
  if (message.startsWith("product.title ")) return "product_title_invalid";
  if (message.startsWith("product.productUrl ")) return "product_url_invalid";
  if (message.startsWith("product.priceCents ")) return "product_price_invalid";
  if (message.startsWith("product.originalPriceCents ")) return "product_original_price_invalid";
  if (message.startsWith("product.priceMaxCents ")) return "product_price_range_invalid";
  return "product_invalid";
}

/** Bounded, normalized public product data only; never cookies, markup or session state. */
export function validateBrowserCaptureWithDiagnostics(raw: unknown): { payload: BrowserCapturePayload; diagnostics: BrowserCaptureDiagnostics } {
  if (!raw || typeof raw !== "object") throw new Error("invalid_payload");
  const p = raw as Record<string, unknown>;
  // Envelope errors apply to the request, not independently to every product.
  if (p.version !== 1) throw new Error("capture_version_invalid");
  if (!validBatchId(p.requestId)) throw new Error("capture_request_id_invalid");
  const marketplace = p.marketplace;
  if (!isExtensionMarketplace(marketplace)) throw new Error("marketplace_not_supported");
  const hostPattern = marketplace === "mercadolivre" ? /(^|\.)mercadolivre\.com\.br$/
    : marketplace === "amazon" ? /(^|\.)amazon\.com\.br$/ : /(^|\.)aliexpress\.com$/;
  if (
    !Array.isArray(p.products) ||
    p.products.length < 1 ||
    p.products.length > 200
  )
    throw new Error("products_count_invalid");
  const time = Date.parse(String(p.clientCapturedAt));
  if (
    !Number.isFinite(time) ||
    time < Date.now() - 30 * 60_000 ||
    time > Date.now() + 60_000
  )
    throw new Error("capture_time_invalid");
  const page = p.page as { kind?: string; url?: string } | undefined;
  let pageUrl: URL;
  try {
    pageUrl = new URL(page?.url ?? "");
  } catch {
    throw new Error("offers_page_required");
  }
  const normalizedPath = pageUrl.pathname.replace(/\/+$/, "");
  const allowedKinds = ["offers", "search", "category", "listing", "product"];
  const blockedPaths = [
    "/gz/",
    "/login",
    "/account-verification",
    "/seguranca",
    "/checkpoint",
    "/ap/signin",
    "/gp/cart",
    "/p/trade",
    "/checkout",
  ];
  const isBlocked = blockedPaths.some((prefix) =>
    normalizedPath.includes(prefix),
  );
  if (
    !allowedKinds.includes(page?.kind ?? "") ||
    ambiguousSourceIdentity(pageUrl, marketplace) ||
    pageUrl.protocol !== "https:" ||
    !hostPattern.test(pageUrl.hostname) ||
    isBlocked ||
    pageUrl.username ||
    pageUrl.password ||
    pageUrl.port ||
    pageUrl.href.length > 2048
  )
    throw new Error("offers_page_required");
  const seen = new Set<string>();
  const products: BrowserCaptureProduct[] = [];
  const diagnostics: BrowserCaptureDiagnostics = { received: p.products.length, valid: 0, duplicates: 0, rejected: 0, items: [] };
  for (const [index, rawProduct] of p.products.entries()) {
    try {
      const item = validateExtensionCapturePayload({
        ...p,
        product: rawProduct,
      }, true).product;
      const u = new URL(item.productUrl);
      if (
        u.protocol !== "https:" ||
        !hostPattern.test(u.hostname) ||
        u.username ||
        u.password ||
        item.productUrl.length > 2048
      )
        throw new Error("product_url_invalid");
      const wid = u.searchParams.get("wid");
      const identity = marketplace === "mercadolivre"
        ? wid ?? u.pathname.match(/MLB-?(\d{6,})/)?.[1]?.replace(/^(\d)/, "MLB$1")
        : marketplace === "amazon"
          ? /^\/dp\/([A-Z0-9]{10})\/?$/i.exec(u.pathname)?.[1]?.toUpperCase()
          : /^\/item\/(\d{8,20})\.html$/.exec(u.pathname)?.[1];
      if (identity !== item.externalId || (marketplace === "mercadolivre" && u.pathname.includes("/p/") && !wid))
        throw new Error("product_identity_invalid");
      if (marketplace !== "mercadolivre" && (u.search || u.hash || u.port)) throw new Error("product_url_invalid");
      if (item.imageUrl) {
        const image = new URL(item.imageUrl);
        if (image.protocol !== "https:" || image.username || image.password) throw new Error("image_url_invalid");
        item.imageUrl = image.origin + image.pathname;
      }
      const extra = rawProduct as Record<string, unknown>;
      const ratingStar =
        typeof extra.ratingStar === "number" &&
        extra.ratingStar > 0 &&
        extra.ratingStar <= 5
          ? extra.ratingStar
          : undefined;
      const salesCount =
        Number.isSafeInteger(extra.salesCount) && Number(extra.salesCount) >= 0
          ? Number(extra.salesCount)
          : undefined;
      const salesLabel =
        typeof extra.salesLabel === "string"
          ? extra.salesLabel.slice(0, 150)
          : undefined;
      if (seen.has(item.externalId)) {
        diagnostics.duplicates++;
        diagnostics.items.push({ index: index + 1, externalId: diagnosticExternalId(item, marketplace), status: "duplicate", reason: "duplicate_external_id" });
        continue;
      }
      seen.add(item.externalId);
      // Keep item identity on catalog URLs, discard marketing/session query values.
      products.push({
        ...item,
        productUrl:
          u.origin + u.pathname + (wid ? `?wid=${encodeURIComponent(wid)}` : ""),
        ratingStar,
        salesCount,
        salesLabel,
      });
    } catch (err) {
      diagnostics.rejected++;
      diagnostics.items.push({ index: index + 1, externalId: diagnosticExternalId(rawProduct, marketplace), status: "rejected", reason: diagnosticReason(err) });
    }
  }
  diagnostics.valid = products.length;
  if (products.length < 1) throw new BrowserCaptureValidationError(diagnostics);
  const payload: BrowserCapturePayload = {
    version: 1,
    requestId: String(p.requestId),
    marketplace,
    clientCapturedAt: new Date(time).toISOString(),
    page: {
      kind:
        (page?.kind as
          | "offers"
          | "search"
          | "category"
          | "listing"
          | "product") ?? "offers",
      url: sourcePageUrl(pageUrl, marketplace),
    },
    products,
  };
  return { payload, diagnostics };
}

/** Compatibility entry point: same normalization and zero-valid-items rejection. */
export function validateBrowserCapture(raw: unknown): BrowserCapturePayload {
  return validateBrowserCaptureWithDiagnostics(raw).payload;
}

export function decodeBrowserCaptureBlock(
  block: string,
): BrowserCapturePayload {
  if (block.length > 1_000_000) throw new Error("block_too_large");
  const [prefix, payload, checksum, extra] = block.trim().split(".");
  if (
    prefix !== "BM2" ||
    !payload ||
    !checksum ||
    extra !== undefined ||
    fnv1a32(payload).toString(16) !== checksum.toLowerCase()
  )
    throw new Error("invalid_capture_block");
  const capture = validateBrowserCapture(JSON.parse(base64urlDecode(payload)));
  if (capture.marketplace !== "mercadolivre") throw new Error("invalid_capture_block");
  return capture;
}
