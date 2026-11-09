import { db } from "./db.ts";
import { describeTodayOperations } from "./today-operation.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import type { StoredCaptureBatch } from "./capture-batch-db.ts";

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
