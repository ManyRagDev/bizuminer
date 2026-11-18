/** Public historical presentation deliberately has no price or destination. */
export type ArchivedSharedLink = {
  archived: true;
  available: true;
  alias: string;
  bioCode: string;
  slug: string;
  tenantId: string;
  title: string;
  imageUrl: string | null;
  marketplace: "shopee";
};
export type SharedLinkArchive = ArchivedSharedLink | { archived: true; available: false };
export type ArchiveLookupKind = "alias" | "slug" | "bio";
export const ARCHIVE_NOTICE = "Preço atual não confirmado; consulte a loja.";
export const ARCHIVE_DESCRIPTION = `Compartilhado anteriormente. ${ARCHIVE_NOTICE}`;
export const ARCHIVE_NO_STORE = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export function archiveQueryAllowed(query: URLSearchParams | Record<string, unknown>): boolean {
  return query instanceof URLSearchParams
    ? !query.has("c") && !query.has("opcao")
    : !Object.hasOwn(query, "c") && !Object.hasOwn(query, "opcao");
}

export function archiveLookupKey(kind: ArchiveLookupKind, key: string, tenant?: string): string | null {
  if (kind === "alias") return /^[abcdefghjkmnpqrtuvwxyz2346789]{4}$/.test(key) ? key : null;
  if (kind === "bio") return tenant && /^[a-z0-9._-]{1,64}$/.test(tenant) && /^[abcdefghjkmnpqrtuvwxyz2346789]{3}$/i.test(key) ? key.toUpperCase() : null;
  return key.length > 0 && key.length <= 512 && !/[\x00-\x20\x7f/\\?#]/.test(key) && key !== "." && key !== ".." ? key : null;
}

/** A redirect may only preserve an approved HTTPS Shopee affiliate URL. */
export function isArchiveTarget(value: unknown): value is string {
  if (typeof value !== "string" || /[\x00-\x20\x7f\\]/.test(value)
      || !/^https:\/\/(?:[a-z0-9-]+\.)*(?:shopee\.com\.br|shope\.ee)(?:[/?#]|$)/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["shopee.com.br", "shope.ee"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function parseSharedLinkArchive(value: unknown): SharedLinkArchive | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || !("archived" in value) || value.archived !== true || !("available" in value)) throw new Error("Invalid shared-link archive response");
  if (value.available === false) return { archived: true, available: false };
  const row = value as Record<string, unknown>;
  if (row.available !== true || typeof row.alias !== "string" || !archiveLookupKey("alias", row.alias)
      || typeof row.slug !== "string" || !archiveLookupKey("slug", row.slug)
      || typeof row.tenantId !== "string" || typeof row.bioCode !== "string" || !archiveLookupKey("bio", row.bioCode, row.tenantId)
      || row.bioCode !== row.alias.slice(-3).toUpperCase()
      || typeof row.title !== "string" || !row.title.trim() || row.marketplace !== "shopee") throw new Error("Invalid shared-link archive presentation");
  let imageUrl: string | null = null;
  if (typeof row.imageUrl === "string") {
    try { const image = new URL(row.imageUrl); if (image.protocol === "https:" && !image.username && !image.password) imageUrl = image.href; } catch { /* Optional image, text presentation remains available. */ }
  }
  return { archived: true, available: true, alias: row.alias, bioCode: row.bioCode, slug: row.slug, tenantId: row.tenantId, title: row.title, imageUrl, marketplace: "shopee" };
}

export function archiveUnavailable(status = 404): Response {
  return new Response("Link indisponível", { status, headers: ARCHIVE_NO_STORE });
}
export function archiveRedirect(path: string): Response {
  return new Response(null, { status: 302, headers: { ...ARCHIVE_NO_STORE, Location: path } });
}
export function archivePageResponse(record: SharedLinkArchive, query: URLSearchParams, destination: "bizu" | "p" = "bizu"): Response {
  if (!record.available || !archiveQueryAllowed(query)) return archiveUnavailable();
  return archiveRedirect(destination === "p" ? `/p/${encodeURIComponent(record.alias)}` : `/bizu/${encodeURIComponent(record.slug)}`);
}
export async function archiveGoResponse(record: SharedLinkArchive, query: URLSearchParams, readTarget: (slug: string) => Promise<string | null>): Promise<Response> {
  if (!record.available || !archiveQueryAllowed(query)) return archiveUnavailable();
  const target = await readTarget(record.slug);
  return isArchiveTarget(target) ? archiveRedirect(target) : archiveUnavailable();
}
