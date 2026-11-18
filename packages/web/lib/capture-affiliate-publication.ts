import { ensureShopeeAffiliateLinks } from "../../persistence/src/shopee-links.ts";
import { ensureAliExpressPublications } from "../../persistence/src/aliexpress-links.ts";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { linkBrowserAliExpress } from "./browser-affiliate-links.ts";
import { db } from "./db.ts";

/** Affiliate work is authorized by the durable, committed operation and never publishes staged facts. */
export async function publishCaptureAffiliateLinks(tenantId: string, marketplace: string, batchId: string): Promise<{ ok: boolean; error?: string }> {
  const sql = db();
  let browserRunId: string | undefined;
  let singleProductTrial = false;
  try {
    const batch = await withMonitoringDb(sql, tenantId, async tx => {
      const [row] = await tx<{ metadata: any; requested_marketplaces: string[] }[]>`
        select metadata,requested_marketplaces from garimpa.capture_batch where tenant_id=${tenantId} and id=${batchId}::uuid`;
      return row;
    });
    if (!(batch?.metadata.publication?.publishedAt || batch?.metadata.publicationSources?.[marketplace]?.publishedAt)
      || !batch.requested_marketplaces.includes(marketplace))
      return { ok: false, error: "capture_not_published" };
    if (batch.metadata.execution?.browser?.marketplace === marketplace) browserRunId = batch.metadata.execution.browser.captureRunId;
    singleProductTrial = batch.metadata.execution?.trial?.mode === "single_product";
  } finally { await sql.end(); }
  const context = { signal: AbortSignal.timeout(4 * 60_000), runId: batchId, log: () => {} };
  if (marketplace === "shopee") {
    const result = await ensureShopeeAffiliateLinks({ connectionString: process.env.DATABASE_URL!, tenantId, captureBatchId: batchId, singleProductTrial }, context);
    return result.failed ? { ok: false, error: "affiliate_links_pending" } : { ok: true };
  }
  if (marketplace === "aliexpress") {
    if (browserRunId) {
      const result = await linkBrowserAliExpress(tenantId, browserRunId);
      return result.failed ? { ok: false, error: "affiliate_links_pending" } : { ok: true };
    }
    const result = await ensureAliExpressPublications({ connectionString: process.env.DATABASE_URL!, tenantId, captureBatchId: batchId }, context);
    return result.skippedWithoutLink ? { ok: false, error: "affiliate_links_pending" } : { ok: true };
  }
  return { ok: true };
}
