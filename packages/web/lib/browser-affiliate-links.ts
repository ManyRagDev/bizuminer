import { AliExpressAdapter } from "../../capture/src/adapters/aliexpress/index.ts";
import { resolveWorkerCredential } from "../../persistence/src/account-credentials.ts";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { db } from "./db.ts";
import { httpsShopUrl } from "./pauta-link.ts";

/** Only publications owned by this worker's account and seen in this exact browser run. */
export async function linkBrowserAliExpress(tenantId: string, runId: string, factory: typeof db = db) {
  const sql = factory();
  try {
    const pending = await withMonitoringDb(sql, tenantId, tx => tx<{
      id: string; external_id: string; affiliate_url: string | null;
    }[]>`select pub.id,p.external_id,pub.affiliate_url
      from garimpa.publication pub
      join garimpa.affiliate_account a on a.id=pub.affiliate_id and a.tenant_id=pub.tenant_id and a.status='active'
      join garimpa.product p on p.id=pub.product_id and p.tenant_id=pub.tenant_id
      where pub.tenant_id=${tenantId} and pub.channel='web' and pub.status='active' and p.marketplace='aliexpress'
        and exists(select 1 from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
          and o.capture_run_id=${runId} and o.capture_source='extension')`);
    const missing = pending.filter(row => !httpsShopUrl(row.affiliate_url, ["s.click.aliexpress.com"]));
    if (!missing.length) return { failed: 0 };
    const credential = await resolveWorkerCredential(sql, tenantId, "aliexpress");
    const adapter = new AliExpressAdapter({ timeoutMs: 8_000 });
    const signal = AbortSignal.timeout(4 * 60_000);
    let failed = 0;
    for (const row of missing) {
      try {
        if (!/^\d{8,20}$/.test(row.external_id)) throw new Error("invalid_product_id");
        const url = await adapter.buildAffiliateLink(credential,
          `https://pt.aliexpress.com/item/${row.external_id}.html`,
          { marketplace: "aliexpress", trackingId: credential.secret.trackingId! },
          { signal, runId, log: () => {} });
        if (!httpsShopUrl(url, ["s.click.aliexpress.com"])) throw new Error("invalid_affiliate_url");
        await withMonitoringDb(sql, tenantId, tx => tx`update garimpa.publication pub
          set affiliate_url=${url},affiliate_url_generated_at=now()
          where pub.id=${row.id} and pub.tenant_id=${tenantId} and pub.status='active'
            and pub.affiliate_url is not distinct from ${row.affiliate_url}
            and exists (select 1 from garimpa.affiliate_account a where a.id=pub.affiliate_id
              and a.tenant_id=pub.tenant_id and a.status='active')`);
      } catch {
        failed++;
      }
    }
    return { failed };
  } finally {
    await sql.end();
  }
}
