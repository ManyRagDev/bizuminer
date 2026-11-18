/** One-time, explicit migration of the eight exported shares. No live catalog writes. */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { Sql } from "postgres";

export const SHARED_LINK_SNAPSHOT_SHA256 = "41b6a5f602dac20189b7efd8716b436fcc1f7039782a6a9e775ce8219124741d";
export const SHARED_LINK_ALIASES = ["4bzr", "4jt3", "ptej", "zpd7", "bjjj", "autk", "bnfx", "k7e3"] as const;
export const SHARED_LINK_ARCHIVE_MAX_BYTES = 1024 * 1024;
const TABLES = ["garimpa.short_link", "garimpa.publication", "garimpa.product", "source.latest_price_evidence"] as const;
type SourceRow = Record<string, unknown>;
export class SharedLinkImportError extends Error {
  constructor(code: string) { super(code); this.name = "SharedLinkImportError"; }
}
function fail(code: string): never { throw new SharedLinkImportError(code); }
function object(value: unknown): SourceRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_snapshot_object");
  return value as SourceRow;
}
function field(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail("invalid_snapshot_field");
  return value;
}
function key(value: unknown): string {
  const result = field(value);
  if (!/^[a-zA-Z0-9._:-]+$/.test(result)) fail("invalid_snapshot_identifier");
  return result;
}
/** Preserve the exact exported URL, without visiting or regenerating it. */
export function isArchivedShopeeDestination(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  // Match the database authority grammar too: URL normalizes an explicit :443 away.
  if (!/^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*(shopee\.com\.br|shope\.ee)([/?#]|$)/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["shopee.com.br", "shope.ee"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
function image(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = field(value, 4096);
  try {
    const url = new URL(result);
    if (url.protocol !== "https:" || url.username || url.password || url.port || /[\s\\]/.test(result)) fail("invalid_snapshot_image");
  } catch { fail("invalid_snapshot_image"); }
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }

export interface SharedLinkArchiveRow {
  alias: string;
  bio_code: string;
  slug: string;
  tenant_id: string;
  affiliate_id: string;
  title: string;
  image_url: string | null;
  marketplace: "shopee";
  affiliate_url: string;
  provenance: SourceRow;
  snapshot_sha256: string;
  record_sha256: string;
}
export interface SharedLinkArchivePlan {
  tenantId: string;
  affiliateId: string;
  snapshotSha256: string;
  rows: SharedLinkArchiveRow[];
}
export interface SharedLinkArchiveScope {
  tenantId: string;
  affiliateId: string;
  /** Library-only test seam. The CLI never accepts a hash override. */
  expectedSha256?: string;
}
function validateScope(tenantId: string, affiliateId: string): void {
  if (!/^[a-z0-9._-]{1,64}$/.test(tenantId) || !/^[a-zA-Z0-9._:-]{1,200}$/.test(affiliateId)) fail("invalid_import_scope");
}

export function prepareSharedLinkArchive(compressed: Uint8Array, scope: SharedLinkArchiveScope): SharedLinkArchivePlan {
  validateScope(scope.tenantId, scope.affiliateId);
  if (compressed.length > SHARED_LINK_ARCHIVE_MAX_BYTES) fail("snapshot_too_large");
  const snapshotSha256 = sha256(compressed);
  const expected = scope.expectedSha256 ?? SHARED_LINK_SNAPSHOT_SHA256;
  if (!/^[a-f0-9]{64}$/.test(expected) || snapshotSha256 !== expected) fail("snapshot_hash_mismatch");
  let raw: unknown;
  try {
    const bytes = gunzipSync(compressed, { maxOutputLength: SHARED_LINK_ARCHIVE_MAX_BYTES });
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail("invalid_snapshot_archive"); }
  const snapshot = object(raw);
  if (Object.keys(snapshot).length !== TABLES.length || TABLES.some(name => !Object.hasOwn(snapshot, name))) fail("unexpected_snapshot_tables");
  const [links, publications, products, evidence] = TABLES.map(name => {
    const rows = snapshot[name];
    if (!Array.isArray(rows) || rows.length !== 8) fail("snapshot_requires_eight_rows_per_table");
    return rows.map(value => {
      const row = object(value);
      if (row.tenant_id !== scope.tenantId) fail("snapshot_tenant_mismatch");
      return row;
    });
  }) as [SourceRow[], SourceRow[], SourceRow[], SourceRow[]];
  function unique(rows: SourceRow[], column: string): Map<string, SourceRow> {
    const map = new Map(rows.map(row => [key(row[column]), row]));
    if (map.size !== 8) fail("duplicate_snapshot_identity");
    return map;
  }
  const byAlias = unique(links, "code");
  if (SHARED_LINK_ALIASES.some(alias => !byAlias.has(alias))) fail("snapshot_alias_allowlist_mismatch");
  const bySlug = unique(publications, "slug");
  unique(publications, "id");
  unique(publications, "product_id");
  const byProduct = unique(products, "id");
  const byEvidence = unique(evidence, "product_id");
  unique(evidence, "id");
  const usedSlugs = new Set<string>();
  const rows = SHARED_LINK_ALIASES.map(alias => {
    const link = byAlias.get(alias)!;
    const slug = key(link.slug);
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug) || usedSlugs.has(slug)) fail("invalid_snapshot_slug");
    usedSlugs.add(slug);
    const publication = bySlug.get(slug);
    if (!publication || publication.affiliate_id !== scope.affiliateId || publication.channel !== "web"
      || !["active", "expired"].includes(publication.status as string)) fail("snapshot_publication_mismatch");
    const product = byProduct.get(key(publication.product_id));
    if (!product || product.marketplace !== "shopee") fail("snapshot_product_mismatch");
    const observation = byEvidence.get(key(product.id));
    if (!observation) fail("snapshot_evidence_mismatch");
    if (!isArchivedShopeeDestination(publication.affiliate_url)) fail("invalid_snapshot_destination");
    // Full exported objects remain private provenance, never live FKs or public prices.
    const provenance = { format: "shared-links-source-snapshot-v1", historicalOnly: true,
      shortLink: link, publication, product, latestPriceEvidence: observation };
    const base = { alias, bio_code: alias.slice(-3).toUpperCase(), slug, tenant_id: scope.tenantId,
      affiliate_id: scope.affiliateId, title: field(product.title, 1000), image_url: image(product.image_url),
      marketplace: "shopee" as const, affiliate_url: publication.affiliate_url, provenance, snapshot_sha256: snapshotSha256 };
    return { ...base, record_sha256: sha256(canonical(base)) };
  });
  return { tenantId: scope.tenantId, affiliateId: scope.affiliateId, snapshotSha256, rows };
}

/** Only an operator-provisioned connection may call this; runtime has no write grant. */
export async function importSharedLinkArchive(sql: Sql, plan: SharedLinkArchivePlan): Promise<{ inserted: number; replayed: number }> {
  validateScope(plan.tenantId, plan.affiliateId);
  if (plan.rows.length !== 8 || new Set(plan.rows.map(row => row.alias)).size !== 8
    || SHARED_LINK_ALIASES.some(alias => !plan.rows.some(row => row.alias === alias))) fail("invalid_import_plan");
  for (const row of plan.rows) {
    const { record_sha256, ...base } = row;
    if (row.tenant_id !== plan.tenantId || row.affiliate_id !== plan.affiliateId || row.snapshot_sha256 !== plan.snapshotSha256
      || record_sha256 !== sha256(canonical(base))) fail("invalid_import_plan");
  }
  return sql.begin(async tx => {
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='30s'`;
    await tx`select pg_advisory_xact_lock(hashtextextended('garimpa:shared-link-namespace',0))`;
    const [account] = await tx`select id from garimpa.affiliate_account
      where tenant_id=${plan.tenantId} and id=${plan.affiliateId} for share`;
    if (!account) fail("destination_account_mismatch");
    let inserted = 0, replayed = 0;
    for (const row of plan.rows) {
      const [existing] = await tx`select record_sha256,snapshot_sha256,tenant_id,affiliate_id from garimpa.shared_link_archive where alias=${row.alias} for update`;
      if (existing) {
        if (existing.record_sha256 !== row.record_sha256 || existing.snapshot_sha256 !== row.snapshot_sha256
          || existing.tenant_id !== row.tenant_id || existing.affiliate_id !== row.affiliate_id) fail("archive_import_collision");
        // A revoked share stays revoked on replay. No UPDATE of imported data.
        replayed++;
        continue;
      }
      await tx`insert into garimpa.shared_link_archive
        (alias,bio_code,slug,tenant_id,affiliate_id,title,image_url,marketplace,affiliate_url,provenance,snapshot_sha256,record_sha256,status)
        values (${row.alias},${row.bio_code},${row.slug},${row.tenant_id},${row.affiliate_id},${row.title},${row.image_url},
          ${row.marketplace},${row.affiliate_url},${tx.json(row.provenance as any)},${row.snapshot_sha256},${row.record_sha256},'active')`;
      inserted++;
    }
    return { inserted, replayed };
  });
}
