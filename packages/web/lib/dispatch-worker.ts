/** Orchestrator owns short transactions. No TransactionSql may surround provider I/O. */
import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";
import { lockedKit, validateStored } from "./commercial-workflow.ts";
import { resolveActiveEntitlement } from "./saas-entitlement-db.ts";
import {
  leaseNextEligibleJob,
  markIoStarted,
  finalizeJobSuccess,
  finalizeJobFailure,
  finalizeJobUnknown,
  scheduleDispatchJob,
} from "./dispatch-db.ts";
import type {
  DispatchJob,
  DistributionAdapter,
  DistributionAdapterResult,
} from "./dispatch-contract.ts";
export interface ProcessDispatchJobOptions {
  workerToken: string;
  leaseDurationSeconds?: number;
  maxAttempts?: number;
  killSwitchActive?: boolean;
}
export interface DispatchWorkerCycleResult {
  jobProcessed: boolean;
  jobId?: string;
  status?: string;
  error?: string;
  preDispatchBlocked?: boolean;
}
export interface DispatchRuntime {
  factory: typeof db;
  origin: string;
  validateCredential: (secretRef: string, tenantId: string) => Promise<boolean>;
}
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export async function dispatchPreflight(
  tx: any,
  c: AccountContext,
  j: Pick<
    DispatchJob,
    "campaignPublicationId" | "kitRevisionId" | "destinationId"
  >,
  channel?: string,
) {
  await resolveActiveEntitlement(tx, c.tenantId);
  const [p] =
    await tx`select * from garimpa.campaign_publication where id=${j.campaignPublicationId} and tenant_id=${c.tenantId} for update`;
  if (
    !p ||
    p.status !== "ready" ||
    p.kit_revision_id !== j.kitRevisionId ||
    p.destination_id !== j.destinationId
  )
    throw new Error("PUBLICATION_NOT_READY_OR_CHANGED");
  const [d] =
    await tx`select * from garimpa.destination where id=${j.destinationId} and tenant_id=${c.tenantId} for update`;
  if (
    !d ||
    d.status !== "active" ||
    !["scheduled", "integrated"].includes(d.automation_mode) ||
    !d.external_target_ref ||
    !d.secret_ref ||
    d.channel !== p.channel ||
    (channel && d.channel !== channel)
  )
    throw new Error("DESTINATION_NOT_AUTHORIZED");
  const [secret] =
    await tx`select id from garimpa.affiliate_secret where tenant_id=${c.tenantId} and marketplace=${d.channel} and secret_id=${d.secret_ref} and status='active' for share`;
  if (!secret) throw new Error("CREDENTIAL_REVOKED");
  const [k] =
    await tx`select version from garimpa.commercial_kit where id=${p.kit_id} and tenant_id=${c.tenantId}`;
  const kit = await lockedKit(tx, c.tenantId, p.kit_id, k?.version);
  if (kit.status !== "approved" || kit.revision_id !== j.kitRevisionId)
    throw new Error("KIT_REVISION_SUPERSEDED");
  const validation = await validateStored(tx, c, kit);
  if (validation.errors.length)
    throw new Error("FACTS_CHANGED:" + validation.errors.join(","));
  const [link] =
    await tx`select * from garimpa.campaign_link where publication_id=${p.id} and tenant_id=${c.tenantId} and monetization_status='valid' and revoked_at is null`;
  if (!link || !kit.materials[0]?.shortCopy?.trim())
    throw new Error("LINK_OR_MATERIAL_ABSENT");
  const [o] =
    await tx`select audience_key from garimpa.opportunity where id=${kit.opportunity_id} and tenant_id=${c.tenantId}`;
  if (!o?.audience_key) throw new Error("AUDIENCE_REQUIRED");
  return {
    publication: p,
    destination: d,
    kit,
    link,
    audience: o.audience_key,
  };
}
export async function reserveDispatch(
  tx: any,
  c: AccountContext,
  jobId: string,
  facts: any,
  at: Date,
) {
  const [control] =
    await tx`select * from garimpa.dispatch_control where tenant_id=${c.tenantId} for update`;
  if (!control || control.kill_switch) throw new Error("KILL_SWITCH_ACTIVE");
  const cfg = control.configuration;
  if (
    !integer(cfg?.maxPerWindow) ||
    !integer(cfg?.windowSeconds) ||
    !Number.isSafeInteger(cfg?.cooldownSeconds) ||
    cfg.cooldownSeconds < 0 ||
    !Number.isFinite(Date.parse(cfg.windowAnchor))
  )
    throw new Error("DISPATCH_POLICY_REQUIRED");
  const epoch = Date.parse(cfg.windowAnchor),
    span = cfg.windowSeconds * 1000,
    start = new Date(epoch + Math.floor((at.getTime() - epoch) / span) * span),
    end = new Date(start.getTime() + span);
  const [prior] =
    await tx`select * from garimpa.dispatch_reservation where tenant_id=${c.tenantId} and job_id=${jobId} for update`;
  if (prior && ["started", "sent", "unknown"].includes(prior.state))
    throw new Error("RECONCILIATION_REQUIRED");
  const [count] =
    await tx`select count(*)::int as n from garimpa.dispatch_reservation where tenant_id=${c.tenantId} and channel=${facts.destination.channel} and window_start=${start.toISOString()} and window_end=${end.toISOString()} and state<>'released' and job_id<>${jobId}`;
  if (count.n >= cfg.maxPerWindow) throw new Error("DISPATCH_QUOTA_EXCEEDED");
  const [last] =
    await tx`select p.id from garimpa.campaign_publication p join garimpa.commercial_kit k on k.id=p.kit_id and k.tenant_id=p.tenant_id join garimpa.opportunity o on o.id=k.opportunity_id and o.tenant_id=k.tenant_id where p.tenant_id=${c.tenantId} and p.status='published_confirmed' and p.channel=${facts.destination.channel} and o.audience_key=${facts.audience} and p.published_at>${new Date(at.getTime() - cfg.cooldownSeconds * 1000).toISOString()} limit 1`;
  const [held] =
    await tx`select id from garimpa.dispatch_reservation where tenant_id=${c.tenantId} and audience_key=${facts.audience} and channel=${facts.destination.channel} and job_id<>${jobId} and state in ('reserved','started','sent','unknown') and created_at>${new Date(at.getTime() - cfg.cooldownSeconds * 1000).toISOString()} limit 1`;
  if (last || held) throw new Error("AUDIENCE_COOLDOWN");
  await tx`insert into garimpa.dispatch_reservation(tenant_id,job_id,audience_key,channel,window_start,window_end,state) values(${c.tenantId},${jobId},${facts.audience},${facts.destination.channel},${start.toISOString()},${end.toISOString()},'reserved') on conflict(tenant_id,job_id) do update set state='reserved',window_start=excluded.window_start,window_end=excluded.window_end`;
}
export async function scheduleAuthorizedDispatch(
  c: AccountContext,
  i: {
    campaignPublicationId: string;
    kitRevisionId: string;
    destinationId: string;
    scheduledAt: string;
    idempotencyKey: string;
  },
  f: typeof db = db,
) {
  if (!Number.isFinite(Date.parse(i.scheduledAt)))
    throw new Error("scheduled_at_invalid");
  return withAccountDb(
    c,
    async (tx) => {
      const facts = await dispatchPreflight(tx, c, i),
        job = await scheduleDispatchJob(tx, { tenantId: c.tenantId, ...i });
      await reserveDispatch(tx, c, job.id, facts, new Date(i.scheduledAt));
      return job;
    },
    f,
  );
}
export async function executeDispatchCycle(
  runtime: DispatchRuntime,
  c: AccountContext,
  adapter: DistributionAdapter,
  o: ProcessDispatchJobOptions,
): Promise<DispatchWorkerCycleResult> {
  if (!runtime?.factory || !runtime.validateCredential)
    throw new Error("transaction_bound_dispatch_unsupported");
  const origin = new URL(runtime.origin);
  if (!["https:", "http:"].includes(origin.protocol) || origin.pathname !== "/")
    throw new Error("invalid_origin");
  const transaction = <T>(work: (tx: any) => Promise<T>) =>
    withAccountDb(c, work, runtime.factory);
  const job = await transaction((tx) =>
    leaseNextEligibleJob(
      tx,
      c.tenantId,
      o.workerToken,
      o.leaseDurationSeconds ?? 60,
    ),
  );
  if (!job) return { jobProcessed: false };
  let payload: any;
  try {
    const d = await transaction(
      async (tx) =>
        (await dispatchPreflight(tx, c, job, adapter.channel)).destination,
    );
    if (!(await runtime.validateCredential(d.secret_ref, c.tenantId)))
      throw new Error("CREDENTIAL_REVOKED");
    if (!(await adapter.validateDestination(d.external_target_ref)).valid)
      throw new Error("DESTINATION_INVALID");
    payload = await transaction(async (tx) => {
      const facts = await dispatchPreflight(tx, c, job, adapter.channel);
      if (
        facts.destination.secret_ref !== d.secret_ref ||
        facts.destination.external_target_ref !== d.external_target_ref
      )
        throw new Error("DESTINATION_CHANGED");
      await reserveDispatch(tx, c, job.id, facts, new Date());
      if (o.killSwitchActive) throw new Error("KILL_SWITCH_ACTIVE");
      if (!(await markIoStarted(tx, c.tenantId, job.id, o.workerToken)))
        throw new Error("LEASE_NOT_HELD_OR_CANCELLED");
      await tx`update garimpa.dispatch_reservation set state='started' where tenant_id=${c.tenantId} and job_id=${job.id}`;
      return {
        destination: {
          id: d.id,
          targetRef: d.external_target_ref,
          secretRef: d.secret_ref,
        },
        text: facts.kit.materials[0].shortCopy,
        link: new URL("/p/" + facts.link.code, origin).toString(),
        idempotencyKey: job.idempotencyKey,
      };
    }); // Committed marker before transport; crash now must become unknown.
  } catch (e) {
    try {
      await transaction(async (tx) => {
        await finalizeJobFailure(tx, c.tenantId, job.id, o.workerToken, {
          retryable: false,
          code: String(e),
        });
        await tx`update garimpa.dispatch_reservation set state='released' where tenant_id=${c.tenantId} and job_id=${job.id} and state='reserved'`;
      });
    } catch {}
    return {
      jobProcessed: true,
      jobId: job.id,
      status: "blocked",
      preDispatchBlocked: true,
      error: String(e),
    };
  }
  let result: DistributionAdapterResult;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = Math.max(
      1,
      Math.min(30000, Date.parse(job.leaseUntil!) - Date.now() - 1000),
    );
    result = await Promise.race([
      adapter.sendApprovedRevision({ ...payload, signal: controller.signal }),
      new Promise<DistributionAdapterResult>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({
            kind: "unknown",
            attemptId: job.id,
            reason: "TRANSPORT_DEADLINE_EXCEEDED",
          });
        }, deadline);
      }),
    ]);
  } catch (e) {
    result = { kind: "unknown", attemptId: job.id, reason: String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
  try {
    return await transaction(async (tx) => {
      if (result.kind === "sent") {
        if (
          !result.providerMessageId ||
          !Number.isFinite(Date.parse(result.confirmedAt))
        )
          throw new Error("INVALID_PROVIDER_PROOF");
        await finalizeJobSuccess(tx, c.tenantId, job.id, o.workerToken, result);
        await tx`update garimpa.campaign_publication set status='published_confirmed',published_at=${result.confirmedAt} where id=${job.campaignPublicationId} and tenant_id=${c.tenantId} and kit_revision_id=${job.kitRevisionId}`;
        await tx`update garimpa.dispatch_reservation set state='sent' where tenant_id=${c.tenantId} and job_id=${job.id}`;
        return { jobProcessed: true, jobId: job.id, status: "succeeded" };
      }
      if (result.kind === "rejected") {
        const retry = result.retryable && job.attempt < (o.maxAttempts ?? 3);
        await finalizeJobFailure(tx, c.tenantId, job.id, o.workerToken, {
          retryable: retry,
          code: result.code,
          nextAttemptAt: retry
            ? new Date(
                Date.now() + Math.max(1, result.retryAfterSeconds ?? 60) * 1000,
              ).toISOString()
            : undefined,
        });
        await tx`update garimpa.dispatch_reservation set state='released' where tenant_id=${c.tenantId} and job_id=${job.id}`;
        return {
          jobProcessed: true,
          jobId: job.id,
          status: retry ? "queued" : "failed",
        };
      }
      await finalizeJobUnknown(
        tx,
        c.tenantId,
        job.id,
        o.workerToken,
        result.reason,
      );
      await tx`update garimpa.dispatch_reservation set state='unknown' where tenant_id=${c.tenantId} and job_id=${job.id}`;
      return { jobProcessed: true, jobId: job.id, status: "unknown" };
    });
  } catch (e) {
    try {
      await transaction(async (tx) => {
        await finalizeJobUnknown(
          tx,
          c.tenantId,
          job.id,
          o.workerToken,
          String(e),
        );
        await tx`update garimpa.dispatch_reservation set state='unknown' where tenant_id=${c.tenantId} and job_id=${job.id}`;
      });
    } catch {}
    return {
      jobProcessed: true,
      jobId: job.id,
      status: "unknown",
      error: String(e),
    };
  }
}
