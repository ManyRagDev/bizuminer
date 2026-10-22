import { scopedTenantId } from "./account-scope.ts";
import { db } from "./db.ts";

export type CaptureBatchStatus = "running" | "ok" | "partial" | "error";
export type CapturePhase =
  | "queued"
  | "capturing"
  | "awaiting_browser"
  | "triaging"
  | "finished";
export type CaptureStoreStatus =
  | CaptureBatchStatus
  | "waiting"
  | "awaiting_browser";
export interface BatchTriageSummary {
  processed: number;
  approved: number;
  held: number;
  rejected: number;
  annotatedPending: number;
  triageRunId?: string;
}
export interface BatchExecution {
  version: 1;
  phase: CapturePhase;
  executor: "local" | "github";
  mlConsent: boolean;
  deadline: string;
  workerId?: string;
  error?: string;
  browser?: {
    ownerAppUserId: string;
    requestId?: string;
    fingerprint?: string;
    captureRunId?: string;
    importedCount?: number;
    skipped?: boolean;
  };
  stores: Record<string, { status: CaptureStoreStatus; error?: string }>;
  triage?: BatchTriageSummary;
}
export interface CaptureBatch {
  id: string;
  tenant_id: string;
  requested_marketplaces: string[];
  pages: number;
  status: CaptureBatchStatus;
  started_at: Date | string;
  finished_at: Date | string | null;
  phase: CapturePhase;
  error?: string;
  triage?: BatchTriageSummary;
  browser?: {
    importedCount: number;
    canContinue: boolean;
    canResume: boolean;
    deadline: string;
  };
  marketplaces: Array<{
    marketplace: string;
    status: CaptureStoreStatus;
    error?: string;
    runs: number;
  }>;
}
export interface StoredCaptureBatch
  extends Omit<
    CaptureBatch,
    "phase" | "error" | "triage" | "marketplaces" | "browser"
  > {
  metadata: { execution?: BatchExecution; [key: string]: unknown };
}

/** Short, atomic updates only. No transaction is held during a marketplace/AI call. */
export class CaptureBatchStore {
  private readonly sqlFactory: typeof db;
  constructor(sqlFactory: typeof db = db) {
    this.sqlFactory = sqlFactory;
  }

  private async query<T>(
    tenantId: string,
    run: (sql: ReturnType<typeof db>) => Promise<T>,
  ): Promise<T> {
    const sql = this.sqlFactory();
    try {
      if (typeof (sql as any).begin === "function") {
        return await (sql as any).begin(async (tx: any) => {
          await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
          return await run(tx);
        });
      }
      return await run(sql);
    } finally {
      if (typeof (sql as any).end === "function") {
        await (sql as any).end();
      }
    }
  }

  async expire(tenantId = scopedTenantId()): Promise<string[]> {
    return this.query(tenantId, async (tx) => {
      const expired = await tx<{ id: string }[]>`
        update garimpa.capture_batch set status='error',finished_at=now(),
          metadata=jsonb_set(metadata,'{execution}',coalesce(metadata->'execution','{}'::jsonb)
            || '{"phase":"finished","error":"execution_timeout"}'::jsonb)
        where tenant_id=${tenantId} and status='running'
          and case when metadata->'execution'->>'version'='1'
            then (metadata->'execution'->>'deadline')::timestamptz < now()
            else started_at < now()-interval '2 hours' end
        returning id
      `;
      for (const row of expired) {
        await tx`update garimpa.capture_run set status='error',finished_at=now(),error='capture_batch_timeout'
        where tenant_id=${tenantId} and status='running' and parameters->>'operationBatchId'=${row.id}`;
        await tx`update garimpa.triage_run set status='error',finished_at=now(),error_message='capture_batch_timeout'
        where tenant_id=${tenantId} and status='running' and metadata->>'captureBatchId'=${row.id}`;
      }
      return expired.map((row) => row.id);
    });
  }

  async create(
    tenantId: string,
    marketplaces: string[],
    pages: number,
    executor: BatchExecution["executor"],
    mlConsent: boolean,
    browserOwnerAppUserId?: string,
  ): Promise<StoredCaptureBatch> {
    await this.expire(tenantId);
    return this.query(tenantId, async (sql) => {
      const execution: BatchExecution = {
        version: 1,
        phase: "queued",
        executor,
        mlConsent,
        browser:
          mlConsent &&
          marketplaces.includes("mercadolivre") &&
          browserOwnerAppUserId
            ? { ownerAppUserId: browserOwnerAppUserId }
            : undefined,
        deadline: new Date(Date.now() + 15 * 60_000).toISOString(),
        stores: Object.fromEntries(
          marketplaces.map((m) => [m, { status: "waiting" as const }]),
        ),
      };
      const [batch] = await sql<StoredCaptureBatch[]>`
        insert into garimpa.capture_batch(tenant_id,requested_marketplaces,pages,metadata)
        values(${tenantId},${marketplaces},${pages},${sql.json({ execution: { ...execution, triage: execution.triage ? { ...execution.triage } : undefined } })}) returning *
      `;
      return batch;
    });
  }

  async read(
    id?: string,
    tenantId = scopedTenantId(),
  ): Promise<StoredCaptureBatch | null> {
    return this.query(tenantId, async (sql) => {
      const rows = await sql<
        StoredCaptureBatch[]
      >`select * from garimpa.capture_batch
        where tenant_id=${tenantId} and (${id ?? null}::uuid is null or id=${id ?? null}::uuid)
        order by started_at desc limit 1`;
      return rows[0] ?? null;
    });
  }

  async publicStatus(
    id?: string,
    tenantId = scopedTenantId(),
  ): Promise<CaptureBatch | null> {
    await this.expire(tenantId);
    const batch = await this.read(id, tenantId);
    if (!batch) return null;
    return this.query(tenantId, async (sql) => {
      const counts = await sql<
        { marketplace: string; runs: number }[]
      >`select marketplace,count(*)::int as runs
        from garimpa.capture_run where tenant_id=${tenantId} and parameters->>'operationBatchId'=${batch.id}
        group by marketplace`;
      const execution = batch.metadata.execution;
      return {
        id: batch.id,
        tenant_id: batch.tenant_id,
        requested_marketplaces: batch.requested_marketplaces,
        pages: batch.pages,
        status: batch.status,
        started_at: batch.started_at,
        finished_at: batch.finished_at,
        phase:
          batch.status === "running"
            ? (execution?.phase ?? "capturing")
            : "finished",
        error: execution?.error,
        triage: execution?.triage,
        browser: execution?.browser
          ? {
              importedCount: execution.browser.importedCount ?? 0,
              canContinue:
                batch.status === "running" &&
                execution.phase === "awaiting_browser",
              canResume:
                batch.status === "running" &&
                execution.phase === "queued" &&
                !!(execution.browser.requestId || execution.browser.skipped),
              deadline: execution.deadline,
            }
          : undefined,
        marketplaces: batch.requested_marketplaces.map((marketplace) => ({
          marketplace,
          status:
            execution?.stores?.[marketplace]?.status ??
            (batch.status === "running" ? "running" : "error"),
          error: execution?.stores?.[marketplace]?.error,
          runs:
            counts.find((row) => row.marketplace === marketplace)?.runs ?? 0,
        })),
      };
    });
  }

  async claim(
    id: string,
    workerId: string,
    tenantId = scopedTenantId(),
  ): Promise<StoredCaptureBatch | null> {
    return this.query(tenantId, async (sql) => {
      const [batch] = await sql<
        StoredCaptureBatch[]
      >`update garimpa.capture_batch
        set metadata=jsonb_set(metadata,'{execution}',metadata->'execution' || ${sql.json(
          {
            workerId,
            phase: "capturing",
            deadline: new Date(Date.now() + 55 * 60_000).toISOString(),
          },
        )}::jsonb)
        where id=${id} and tenant_id=${tenantId} and status='running'
          and metadata->'execution'->>'version'='1' and metadata->'execution'->>'phase'='queued'
          and (metadata->'execution'->>'deadline')::timestamptz>now()
        returning *`;
      return batch ?? null;
    });
  }

  async update(
    id: string,
    workerId: string,
    execution: BatchExecution,
    status: CaptureBatchStatus = "running",
    tenantId = scopedTenantId(),
  ): Promise<void> {
    await this.query(tenantId, async (sql) => {
      const rows = await sql<{ id: string }[]>`update garimpa.capture_batch
        set metadata=jsonb_set(metadata,'{execution}',${sql.json({ ...execution, triage: execution.triage ? { ...execution.triage } : undefined })}::jsonb),status=${status},
          finished_at=case when ${status}='running' then null else now() end
        where id=${id} and tenant_id=${tenantId} and status='running'
          and metadata->'execution'->>'workerId'=${workerId}
          and (metadata->'execution'->>'deadline')::timestamptz>now() returning id`;
      if (rows.length !== 1) throw new Error("capture_batch_ownership_lost");
    });
  }

  async dispatchFailed(id: string, tenantId = scopedTenantId()): Promise<void> {
    await this.query(tenantId, async (sql) => {
      await sql`update garimpa.capture_batch set status='error',finished_at=now(),
        metadata=jsonb_set(metadata,'{execution}',metadata->'execution'
          || '{"phase":"finished","error":"dispatch_failed"}'::jsonb)
        where id=${id} and tenant_id=${tenantId} and status='running'
          and metadata->'execution'->>'phase'='queued'`;
    });
  }

  async settleStore(
    id: string,
    marketplace: string,
    failed: boolean,
    tenantId = scopedTenantId(),
  ): Promise<CaptureBatchStatus> {
    return this.query(tenantId, async (sql) => {
      if (failed)
        await sql`update garimpa.capture_run set status='error',finished_at=now(),error='capture_executor_failed'
        where tenant_id=${tenantId} and marketplace=${marketplace} and status='running'
          and parameters->>'operationBatchId'=${id}`;
      const [row] = await sql<
        { total: number; ok: number; active: number }[]
      >`select count(*)::int as total,
        count(*) filter(where status='ok')::int as ok,count(*) filter(where status='running')::int as active
        from garimpa.capture_run where tenant_id=${tenantId} and marketplace=${marketplace}
          and parameters->>'operationBatchId'=${id}`;
      if (!failed && row.total > 0 && row.ok === row.total && row.active === 0)
        return "ok";
      return row.ok > 0 ? "partial" : "error";
    });
  }

  async failTriage(id: string, tenantId = scopedTenantId()): Promise<void> {
    await this.query(tenantId, async (sql) => {
      await sql`update garimpa.triage_run set status='error',finished_at=now(),error_message='capture_batch_triage_failed'
        where tenant_id=${tenantId} and status='running' and metadata->>'captureBatchId'=${id}`;
    });
  }
}

export const captureBatches = new CaptureBatchStore();
export const captureBatchStatus = (id: string, tenantId = scopedTenantId()) =>
  captureBatches.publicStatus(id, tenantId);
export const latestCaptureBatch = (tenantId = scopedTenantId()) =>
  captureBatches.publicStatus(undefined, tenantId);
