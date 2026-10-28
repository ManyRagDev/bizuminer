/** Session-only continuity for a visit to a product; URL remains the source of filters. */
export const CATALOG_RETURN_KEY = "bizuminer:catalog-return:v1";
export type CatalogReturn = { url: string; firstPage: number; lastPage: number; scrollY: number; productSlug: string; savedAt: number };

export function safeCatalogUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://catalog.invalid");
    return url.origin === "https://catalog.invalid" && url.pathname === "/" ? `${url.pathname}${url.search}` : null;
  } catch { return null; }
}

export function parseCatalogReturn(raw: string | null, now = Date.now()): CatalogReturn | null {
  try {
    const value = JSON.parse(raw ?? "null");
    const url = safeCatalogUrl(value?.url);
    if (!url || !Number.isSafeInteger(value.firstPage) || !Number.isSafeInteger(value.lastPage) || value.firstPage < 1 || value.lastPage < value.firstPage || value.lastPage - value.firstPage > 100 || !Number.isFinite(value.scrollY) || value.scrollY < 0 || typeof value.productSlug !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value.productSlug) || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > 30 * 60_000) return null;
    return { ...value, url };
  } catch { return null; }
}
