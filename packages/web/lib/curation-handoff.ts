import { db } from "./db.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { readPautaProgress } from "./pauta-db.ts";

/** Counts describe this account's persisted facts; viewing them never dispatches providers. */
export async function readCurationHandoff(account: AccountContext, factory: typeof db = db) {
  const [capture, whatsapp, stories] = await Promise.all([
    withAccountDb(account, async tx => {
      const [row] = await tx<{ running: number; incomplete: number; prepared: number }[]>`
        select (select count(*)::int from garimpa.capture_batch where tenant_id=${account.tenantId} and status='running') as running,
          count(distinct b.id)::int as incomplete,count(*)::int as prepared
        from garimpa.capture_prepared_offer s join garimpa.capture_run r on r.tenant_id=s.tenant_id and r.id=s.capture_run_id
        join garimpa.capture_batch b on b.tenant_id=r.tenant_id and b.id::text=r.parameters->>'operationBatchId'
        where s.tenant_id=${account.tenantId} and b.status in ('partial','error')
          and r.parameters->>'publishedAt' is null
          and (s.payload->>'observedAt')::timestamptz>=now()-interval '48 hours'`;
      return row;
    }, factory).catch(() => null),
    readPautaProgress(account, "whatsapp",undefined, factory).catch(() => null),
    readPautaProgress(account, "stories",undefined, factory).catch(() => null),
  ]);
  return {
    runningCaptures: capture?.running ?? 0,
    incompleteCaptures: capture?.incomplete ?? 0,
    preparedOffers: capture?.prepared ?? 0,
    captureStatusAvailable: capture !== null,
    pautaCount: whatsapp && stories ? whatsapp.count + stories.count : null,
  };
}
