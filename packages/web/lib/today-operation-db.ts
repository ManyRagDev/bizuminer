import { db } from "./db.ts";
import { describeTodayOperations, evaluateStoreHealth, type StoreHealth } from "./today-operation.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import type { StoredCaptureBatch } from "./capture-batch-db.ts";

export async function readStoresHealth(context: AccountContext, sqlFactory: typeof db = db): Promise<StoreHealth[]> {
  const { tenantId } = context;
  return withAccountDb(context, async tx => {
    const [{ now }] = await tx<{ now: Date }[]>`select now()`;
    const rows = await tx<{
      marketplace: string;
      last_capture_at: Date | string | null;
      fresh_count: number;
      fresh_approved_count: number;
    }[]>`
      with market_stats as (
        select
          p.marketplace,
          max(o.observed_at) as last_capture_at,
          count(distinct o.product_id) filter (where o.observed_at >= now() - interval '3 hours')::int as fresh_count,
          count(distinct o.product_id) filter (where o.observed_at >= now() - interval '3 hours' and c.status = 'approved')::int as fresh_approved_count
        from garimpa.product p
        join garimpa.price_observation o on o.product_id = p.id and o.tenant_id = p.tenant_id
        left join garimpa.product_curation c on c.product_id = p.id and c.tenant_id = p.tenant_id
        where p.tenant_id = ${tenantId}
          and p.marketplace in ('mercadolivre', 'shopee', 'amazon')
        group by p.marketplace
      )
      select
        m.marketplace,
        s.last_capture_at,
        coalesce(s.fresh_count, 0)::int as fresh_count,
        coalesce(s.fresh_approved_count, 0)::int as fresh_approved_count
      from (values ('shopee'), ('mercadolivre'), ('amazon')) as m(marketplace)
      left join market_stats s on s.marketplace = m.marketplace
    `;

    return rows.map(r => evaluateStoreHealth(r.marketplace, r.last_capture_at, r.fresh_count, r.fresh_approved_count, now));
  }, sqlFactory);
}

export async function readTodayOperations(context: AccountContext, sqlFactory: typeof db = db) {
  const { tenantId } = context;
  return withAccountDb(context, async tx => {
    const [[{ now }], [batch], [triage], runs] = await Promise.all([
      tx<{ now: Date }[]>`select now()`,
      tx<Pick<StoredCaptureBatch, "status" | "started_at" | "finished_at" | "metadata" | "requested_marketplaces">[]>`
        select status,started_at,finished_at,metadata,requested_marketplaces
        from garimpa.capture_batch where tenant_id=${tenantId}
        order by started_at desc,id desc limit 1`,
      tx<{ status: string; started_at: Date; finished_at: Date | null }[]>`
        select status,started_at,finished_at from garimpa.triage_run
        where tenant_id=${tenantId} and nullif(metadata->>'captureBatchId','') is null
        order by started_at desc,id desc limit 1`,
      tx<{ marketplace: string; monitoring: boolean }[]>`
        select distinct marketplace,coalesce(parameters->>'captureMode'='monitoring',false) as monitoring
        from garimpa.capture_run where tenant_id=${tenantId} and status='running'
          and started_at>=now()-interval '30 minutes' and nullif(parameters->>'operationBatchId','') is null
        order by marketplace,monitoring`,
    ]);
    return describeTodayOperations(batch ?? null, triage ?? null, runs, now);
  }, sqlFactory);
}
