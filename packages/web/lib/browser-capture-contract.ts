import {
  validateExtensionCapturePayload,
  type ExtensionCaptureProduct,
} from "./extension-contract.ts";
import { base64urlDecode, fnv1a32 } from "./manual-capture.ts";

export interface BrowserCaptureProduct extends ExtensionCaptureProduct {
  ratingStar?: number;
  salesCount?: number;
  salesLabel?: string;
}
export interface BrowserCapturePayload {
  version: 1;
  requestId: string;
  marketplace: "mercadolivre";
  clientCapturedAt: string;
  page: { kind: "offers"; url: string };
  products: BrowserCaptureProduct[];
}
export const validBatchId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

/** Bounded, normalized public product data only; never cookies, markup or session state. */
export function validateBrowserCapture(raw: unknown): BrowserCapturePayload {
  if (!raw || typeof raw !== "object") throw new Error("invalid_payload");
  const p = raw as Record<string, unknown>;
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
  if (
    page?.kind !== "offers" ||
    pageUrl.protocol !== "https:" ||
    !/(^|\.)mercadolivre\.com\.br$/.test(pageUrl.hostname) ||
    (!normalizedPath.startsWith("/ofertas") && normalizedPath !== "") ||
    pageUrl.username ||
    pageUrl.password
  )
    throw new Error("offers_page_required");
  const seen = new Set<string>();
  const products: BrowserCaptureProduct[] = [];
  let firstProductError: Error | null = null;
  for (const rawProduct of p.products) {
    try {
      const item = validateExtensionCapturePayload({
        ...p,
        product: rawProduct,
      }).product;
      const u = new URL(item.productUrl);
      if (
        u.protocol !== "https:" ||
        !/(^|\.)mercadolivre\.com\.br$/.test(u.hostname) ||
        u.username ||
        u.password ||
        item.productUrl.length > 2048
      )
        throw new Error("product_url_invalid");
      const identity =
        u.searchParams.get("wid") ??
        u.pathname.match(/MLB-?(\d{6,})/)?.[1]?.replace(/^(\d)/, "MLB$1");
      if (
        identity !== item.externalId ||
        (u.pathname.includes("/p/") && !u.searchParams.get("wid"))
      )
        throw new Error("product_identity_invalid");
      if (
        item.imageUrl &&
        (new URL(item.imageUrl).protocol !== "https:" ||
          !/(^|\.)(mlstatic\.com|mercadolibre\.com|mercadolivre\.com\.br)$/.test(
            new URL(item.imageUrl).hostname,
          ))
      )
        throw new Error("image_url_invalid");
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
      if (seen.has(item.externalId)) continue;
      seen.add(item.externalId);
      // Keep item identity on catalog URLs, discard marketing/session query values.
      const wid = u.searchParams.get("wid");
      products.push({
        ...item,
        productUrl:
          u.origin + u.pathname + (wid ? `?wid=${encodeURIComponent(wid)}` : ""),
        ratingStar,
        salesCount,
        salesLabel,
      });
    } catch (err) {
      if (!firstProductError && err instanceof Error) {
        firstProductError = err;
      }
    }
  }
  if (products.length < 1) {
    if (firstProductError) throw firstProductError;
    throw new Error("products_count_invalid");
  }
  return {
    version: 1,
    requestId: String(p.requestId),
    marketplace: "mercadolivre",
    clientCapturedAt: new Date(time).toISOString(),
    page: { kind: "offers", url: pageUrl.origin + (normalizedPath || "/ofertas") },
    products,
  };
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
  return validateBrowserCapture(JSON.parse(base64urlDecode(payload)));
}
