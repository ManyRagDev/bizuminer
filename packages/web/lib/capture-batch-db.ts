import { scopedTenantId } from "./account-scope.ts";
import { db } from "./db.ts";
import type { CaptureDiagnostic } from "../../persistence/src/capture-diagnostic.ts";

export type CaptureBatchStatus = "running" | "ok" | "partial" | "error";
export type CapturePhase =
  | "queued"
  | "capturing"
  | "awaiting_browser"
  | "retry_wait"
  | "awaiting_authorization"
  | "awaiting_reconciliation"
  | "publishing"
  | "affiliating"
  | "triaging"
  | "finished";
export type CaptureStoreStatus =
  | CaptureBatchStatus
  | "waiting"
  | "awaiting_browser";
export interface BatchTriageSummary {
  mode?: "attribute_queue";
  processed: number;
  approved: number;
  held: number;
  rejected: number;
  annotatedPending: number;
  triageRunId?: string;
}
export type BatchCaptureTrial = { mode: "single_product"; version: 1 };
export type BatchFailureKind = "transient" | "rate_limit" | "quota" | "credential" | "permanent";
export type TrialFailureError = "step_timeout" | "step_exit_failed" | "spawn_failed" | "step_aborted" | "capture_cli_failed";
export type TrialStepDiagnostic = Partial<CaptureDiagnostic> & {
  exitCode?: number | null;
  signal?: "SIGKILL" | "SIGTERM" | "SIGABRT" | "SIGSEGV" | null;
  stderrBytes?: number;
  durationMs?: number;
};
export type TrialFailure = {
  stage: "capture" | "publish" | "affiliate" | "triage" | "worker";
  phase: CapturePhase;
  at: string;
  error: TrialFailureError;
  failureKind?: BatchFailureKind;
  diagnostic?: TrialStepDiagnostic;
};

/** Server opt-in only. A configured trial must never silently become a normal capture. */
export function captureTrialForTenant(tenantId: string, env: NodeJS.ProcessEnv = process.env): BatchCaptureTrial | undefined {
  if (!env.CAPTURE_TRIAL_MODE) return undefined;
  const tenants = (env.CAPTURE_TRIAL_TENANTS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (env.CAPTURE_TRIAL_MODE !== "single_product" || !tenants.length
    || tenants.some(value => !/^[a-z0-9._-]{1,64}$/.test(value)) || !tenants.includes(tenantId))
    throw new Error("capture_trial_not_authorized");
  return { mode: "single_product", version: 1 };
}
export interface BatchExecution {
  version: 1;
  phase: CapturePhase;
  executor: "local" | "github" | "durable";
  requestId?: string;
  nextAttemptAt?: string;
  attempts?: number;
  publishedAt?: string;
  publishedSources?: string[];
  affiliated?: string[];
  affiliateFailures?: Record<string, string>;
  mlConsent: boolean;
  deadline: string;
  workerId?: string;
  error?: string;
  planMode?: "departments" | "keywords";
  sortOrder?: "sales" | "default" | "discount";
  pageSize?: number;
  trial?: BatchCaptureTrial;
  trialCaptureAttempted?: boolean;
  trialAffiliateAttempted?: boolean;
  trialTriageAttempted?: boolean;
  trialFailure?: TrialFailure;
  browser?: {
    ownerAppUserId: string;
    marketplace?: "mercadolivre" | "amazon" | "aliexpress";
    requestId?: string;
    fingerprint?: string;
    captureRunId?: string;
    importedCount?: number;
    skipped?: boolean;
  };
  stores: Record<string, { status: CaptureStoreStatus; error?: string;waitKind?:"retry_wait"|"awaiting_authorization"|"awaiting_reconciliation";nextAttemptAt?:string }>;
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
  planMode?: "departments" | "keywords";
  sortOrder?: "sales" | "default" | "discount";
  pageSize?: number;
  error?: string;
  nextAttemptAt?: string;
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
    affiliateError?: string;
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
          and metadata#>>'{execution,executor}' is distinct from 'durable'
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
    options?: {
      planMode?: "departments" | "keywords";
      sortOrder?: "sales" | "default" | "discount";
      pageSize?: number;
      requestId?: string;
      trial?: BatchCaptureTrial;
    },
  ): Promise<StoredCaptureBatch> {
    const trial = captureTrialForTenant(tenantId);
    if (options?.trial && JSON.stringify(options.trial) !== JSON.stringify(trial)) throw new Error("capture_trial_not_authorized");
    if (trial) {
      if (marketplaces.length !== 1 || marketplaces[0] !== "shopee") throw new Error("capture_trial_marketplace_invalid");
      if (executor !== "durable") throw new Error("capture_trial_executor_invalid");
      pages = 1;
      options = { ...options, trial, planMode: "keywords", pageSize: 10, sortOrder: "sales" };
    }
    if (options?.requestId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(options.requestId)) throw new Error("invalid_capture_request_id");
    await this.expire(tenantId);
    return this.query(tenantId, async (sql) => {
        // Serializes the logical request, including retries after a committed response was lost.
        if (options?.requestId) {
          await sql`select pg_advisory_xact_lock(hashtextextended(${`capture-request:${tenantId}:${options.requestId}`},0))`;
          const [existing] = await sql<StoredCaptureBatch[]>`select * from garimpa.capture_batch
            where tenant_id=${tenantId} and metadata#>>'{execution,requestId}'=${options.requestId}`;
          if (existing) {
            const e = existing.metadata.execution!;
            if (JSON.stringify([...existing.requested_marketplaces].sort()) !== JSON.stringify([...marketplaces].sort())
              || existing.pages !== pages || e.mlConsent !== mlConsent
              || e.planMode !== (options.planMode ?? "departments") || e.sortOrder !== (options.sortOrder ?? "sales")
              || e.pageSize !== (options.pageSize ?? 20)
              || JSON.stringify(e.trial) !== JSON.stringify(trial)) throw new Error("capture_request_conflict");
            return existing;
          }
        }
        const timeoutMinutes =
          (options?.planMode ?? "departments") === "departments"
            ? (marketplaces.length > 1 ? 45 : 30)
            : 20;
        const execution: BatchExecution = {
          version: 1,
          phase: "queued",
          executor,
          requestId: options?.requestId,
          mlConsent,
          planMode: options?.planMode ?? "departments",
          sortOrder: options?.sortOrder ?? "sales",
          pageSize: options?.pageSize ?? 20,
          trial,
          browser:
            mlConsent &&
            marketplaces.includes("mercadolivre") &&
            browserOwnerAppUserId
              ? { ownerAppUserId: browserOwnerAppUserId }
              : undefined,
          deadline: new Date(Date.now() + timeoutMinutes * 60_000).toISOString(),
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
        planMode: execution?.planMode,
        sortOrder: execution?.sortOrder,
        pageSize: execution?.pageSize,
        error: execution?.error,
        nextAttemptAt: execution?.nextAttemptAt,
        triage: execution?.triage,
        browser: execution?.browser
          ? {
              importedCount: execution.browser.importedCount ?? 0,
              canContinue:
                batch.status === "running" &&
                (execution.phase === "awaiting_browser" || execution.phase === "retry_wait"
                  && execution.stores?.[execution.browser.marketplace ?? "mercadolivre"]?.status === "awaiting_browser"),
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
          affiliateError: execution?.affiliateFailures?.[marketplace],
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
          and (metadata#>>'{execution,nextAttemptAt}' is null or (metadata#>>'{execution,nextAttemptAt}')::timestamptz<=now())
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
          and metadata->'execution'->>'phase'='queued'
          and metadata#>>'{execution,executor}' is distinct from 'durable'`;
    });
  }


  async resolveWait(id:string,tenantId:string,action:"retry"|"cancel"):Promise<void> {
    await this.query(tenantId,async sql => {
      const [batch]=await sql<StoredCaptureBatch[]>`select * from garimpa.capture_batch
        where id=${id} and tenant_id=${tenantId} and status='running' for update`;
      if (!batch) throw new Error("capture_batch_not_waiting");
      const execution=batch.metadata.execution!;
      if (action === "retry" && execution.trial && execution.trialCaptureAttempted)
        throw new Error("capture_result_reconciliation_required");
      if (!["awaiting_authorization","awaiting_reconciliation","retry_wait","awaiting_browser"].includes(execution.phase))
        throw new Error("capture_batch_not_waiting");
      if(action==="retry" && execution.phase!=="awaiting_authorization" && execution.phase!=="retry_wait")
        throw new Error("capture_result_reconciliation_required");
      if(action==='retry' && execution.phase==='awaiting_authorization') {
        execution.stores=Object.fromEntries(Object.entries(execution.stores).map(([marketplace,state])=>{
          if(state.waitKind!=='awaiting_authorization') return [marketplace,state];
          const {waitKind:_wait,...rest}=state;return [marketplace,rest];
        }));
      }
      await sql`update garimpa.capture_batch set
        status=${action==='cancel'?'error':'running'},finished_at=case when ${action==='cancel'} then now() else null end,
        metadata=jsonb_set(metadata,'{execution}',(${sql.json(execution as any)}::jsonb-'workerId'-'nextAttemptAt') ||
          jsonb_build_object('phase',${action==='cancel'?'finished':'queued'}::text,'error',${action==='cancel'?'cancelled_by_user':null}::text,
            'deadline',now()+interval '55 minutes')) where id=${id} and tenant_id=${tenantId}`;
    });
  }

  /** Explicit local retry of a known CLI failure, preserving successful query checkpoints. */
  async resumeLocalShopee(id: string, tenantId: string): Promise<void> {
    if (captureTrialForTenant(tenantId)) throw new Error("capture_result_reconciliation_required");
    await this.query(tenantId, async sql => {
      const [batch] = await sql<StoredCaptureBatch[]>`select * from garimpa.capture_batch
        where id=${id} and tenant_id=${tenantId} and status in ('partial','error')
          and started_at>=now()-interval '48 hours' for update`;
      const execution = batch?.metadata.execution;
      if (!batch || !execution || execution.executor !== "local" || execution.phase !== "finished"
        || batch.requested_marketplaces.length !== 1 || batch.requested_marketplaces[0] !== "shopee"
        || execution.trial || execution.trialCaptureAttempted || execution.trialAffiliateAttempted || execution.trialTriageAttempted
        || execution.publishedAt || execution.publishedSources?.length
        || batch.metadata.publication || batch.metadata.publicationSources
        || execution.affiliated?.length || Object.keys(execution.affiliateFailures ?? {}).length
        || execution.stores.shopee?.error !== "step_exit_failed")
        throw new Error("capture_batch_not_resumable");
      const [runs] = await sql<{ failed: number; active: number; published: number; uncertain: number }[]>`
        select count(*) filter(where status='error' and finished_at is not null)::int as failed,
          count(*) filter(where status='running' or finished_at is null)::int as active,
          count(*) filter(where error='capture_executor_failed')::int as uncertain,
          count(*) filter(where parameters->>'publishedAt' is not null)::int as published
        from garimpa.capture_run where tenant_id=${tenantId} and marketplace='shopee'
          and parameters->>'operationBatchId'=${id}`;
      if (!runs?.failed || runs.active || runs.published || runs.uncertain) throw new Error("capture_batch_not_resumable");
      // Never carry an old worker lease or a terminal source state into the new claim.
      delete execution.workerId;
      delete execution.error;
      delete execution.nextAttemptAt;
      delete execution.triage;
      execution.phase = "queued";
      execution.deadline = new Date(Date.now() + 55 * 60_000).toISOString();
      execution.stores = { shopee: { status: "waiting" } };
      await sql`update garimpa.capture_batch set status='running',finished_at=null,
        metadata=jsonb_set(metadata,'{execution}',${sql.json(execution as any)}::jsonb)
        where id=${id} and tenant_id=${tenantId}`;
    });
  }

  async deferDispatch(id:string,tenantId:string):Promise<void> {
    await this.query(tenantId, async sql => {
      await sql`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution}',metadata->'execution'
        || jsonb_build_object('phase','retry_wait','error','executor_start_unconfirmed','nextAttemptAt',now()+interval '1 minute'))
        where id=${id} and tenant_id=${tenantId} and status='running'
          and metadata#>>'{execution,executor}'='durable' and metadata#>>'{execution,phase}'='queued'`;
    });
  }

  /** Called after LISTEN is registered and at persisted due times, never on a periodic idle scan. */
  async recover(tenantId: string): Promise<void> {
    await this.query(tenantId, async sql => {
      // A killed capture may already have called a provider. Fence that source
      // for reconciliation while leaving independent stores eligible to run.
      await sql`update garimpa.capture_batch b set metadata=jsonb_set(b.metadata,'{execution}',
        ((b.metadata->'execution')-'workerId') || jsonb_build_object('phase','queued','error','capture_result_unknown',
          'deadline',now()+interval '55 minutes','stores',(
            select coalesce(jsonb_object_agg(entry.key,case when entry.value->>'status'='running'
              then entry.value || jsonb_build_object('status','waiting','waitKind','awaiting_reconciliation','error','capture_result_unknown')
              else entry.value end),'{}'::jsonb)
            from jsonb_each(coalesce(b.metadata#>'{execution,stores}','{}'::jsonb)) entry)))
        where b.tenant_id=${tenantId} and b.status='running' and b.metadata#>>'{execution,executor}'='durable'
          and b.metadata#>>'{execution,phase}'='capturing' and (b.metadata#>>'{execution,deadline}')::timestamptz<=now()
          and exists(select 1 from jsonb_each(coalesce(b.metadata#>'{execution,stores}','{}'::jsonb)) entry where entry.value->>'status'='running')
          and coalesce(b.metadata#>>'{execution,trial,mode}','')<>'single_product'`;
      // Publication is idempotent; a lost paid AI or affiliate result is not.
      await sql`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution}',
        ((metadata->'execution') - 'workerId') || jsonb_build_object(
          'phase', case when metadata#>>'{execution,phase}' in ('triaging','affiliating')
            or (metadata#>>'{execution,trial,mode}'='single_product' and metadata#>>'{execution,phase}'='capturing'
              and metadata#>>'{execution,trialCaptureAttempted}'='true') then 'awaiting_reconciliation' else 'queued' end,
          'error', case when metadata#>>'{execution,phase}' in ('triaging','affiliating')
            or (metadata#>>'{execution,trial,mode}'='single_product' and metadata#>>'{execution,trialCaptureAttempted}'='true')
            then 'external_result_unknown' else 'worker_interrupted' end,
          'deadline', now()+interval '55 minutes'))
        where tenant_id=${tenantId} and status='running' and metadata#>>'{execution,executor}'='durable'
          and metadata#>>'{execution,phase}' in ('capturing','publishing','affiliating','triaging')
          and (metadata#>>'{execution,deadline}')::timestamptz<=now()`;
      await sql`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution}',
        ((metadata->'execution') - 'nextAttemptAt') || jsonb_build_object('phase','queued','deadline',now()+interval '55 minutes'))
        where tenant_id=${tenantId} and status='running' and metadata#>>'{execution,executor}'='durable'
          and (metadata#>>'{execution,phase}'='retry_wait' and (metadata#>>'{execution,nextAttemptAt}')::timestamptz<=now()
            or metadata#>>'{execution,phase}'='queued' and (metadata#>>'{execution,deadline}')::timestamptz<=now())`;
    });
  }

  async scheduled(tenantId: string): Promise<Array<{ id: string; phase: string; dueAt: Date; leaseUntil: Date }>> {
    return this.query(tenantId, async sql => sql<{id:string;phase:string;dueAt:Date;leaseUntil:Date}[]>`
      select id,metadata#>>'{execution,phase}' as phase,
        (metadata#>>'{execution,deadline}')::timestamptz as "leaseUntil",
        case when metadata#>>'{execution,phase}'='queued' then coalesce((metadata#>>'{execution,nextAttemptAt}')::timestamptz,now())
          when metadata#>>'{execution,phase}'='retry_wait' then (metadata#>>'{execution,nextAttemptAt}')::timestamptz
          else (metadata#>>'{execution,deadline}')::timestamptz end as "dueAt"
      from garimpa.capture_batch where tenant_id=${tenantId} and status='running'
        and metadata#>>'{execution,executor}'='durable'
        and metadata#>>'{execution,phase}' in ('queued','retry_wait','capturing','publishing','affiliating','triaging')
      order by started_at`);
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
