/** Reproducible navigation parameters only; never copy tracking or session keys. */
export function sourcePageUrl(page: URL, marketplace: "mercadolivre" | "amazon" | "aliexpress"): string {
  const keys: Record<typeof marketplace, readonly string[]> = {
    mercadolivre: ["q", "search", "page", "wid", "variation"],
    amazon: ["k", "page"],
    aliexpress: ["SearchText", "page", "catId", "sku_id"],
  };
  const result = new URL(page.origin + (page.pathname || "/"));
  for (const key of keys[marketplace]) {
    for (const value of page.searchParams.getAll(key)) {
      if (!value || value.length > 120 || /[@\r\n]/.test(value)) continue;
      if (key === "page" && !/^[1-9]\d{0,4}$/.test(value)) continue;
      if (key === "wid" && !/^MLB\d{6,}$/i.test(value)) continue;
      if (["catId", "sku_id", "variation"].includes(key) && !/^\d{1,24}$/.test(value)) continue;
      if (["q", "search", "k", "SearchText"].includes(key)
        && (/\d{10,}/.test(value) || /(?:bearer|token|session|password|senha)/i.test(value))) continue;
      result.searchParams.append(key, value);
    }
  }
  return result.toString();
}

/** A page marked as a detail page must actually identify this product. */
export function pageObservationMethod(marketplace: "mercadolivre" | "amazon" | "aliexpress",
  page: { kind: string; url: string }, externalId: string): "listing" | "product_page" {
  if (page.kind !== "product") return "listing";
  let url: URL;
  try { url = new URL(page.url); } catch { return "listing"; }
  if (ambiguousSourceIdentity(url,marketplace)) return "listing";
  const id = marketplace === "mercadolivre"
    ? (url.searchParams.get("wid") ?? url.pathname.match(/MLB-?(\d{6,})/i)?.[1]?.replace(/^(\d)/, "MLB$1"))?.toUpperCase()
    : marketplace === "amazon" ? url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase()
      : url.pathname.match(/\/item\/(\d{8,20})\.html$/)?.[1];
  return id === externalId.toUpperCase() ? "product_page" : "listing";
}
/** Conflicting identity parameters cannot safely identify one source option. */
export function ambiguousSourceIdentity(page:URL,marketplace:"mercadolivre"|"amazon"|"aliexpress"):boolean {
  const keys=marketplace==="mercadolivre" ? ["wid","variation"] : marketplace==="aliexpress" ? ["sku_id"] : [];
  return keys.some(key=>new Set(page.searchParams.getAll(key).map(value=>key==="wid" ? value.toUpperCase() : value)).size>1);
}

