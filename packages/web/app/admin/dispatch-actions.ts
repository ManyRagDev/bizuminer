"use server";
import { pageAccount } from "../../lib/page-account.ts";

import { revalidatePath } from "next/cache";
import {
  getPageAuth,
  isAffiliate,
  resolveAccountContext,
  type AccountContext,
} from "../../lib/auth.ts";
import { withAccountDb } from "../../lib/tenant-db.ts";
import {
  cancelDispatchJob,
  getDispatchJobById,
} from "../../lib/dispatch-db.ts";
import {
  executeDispatchCycle,
  type DispatchWorkerCycleResult,
} from "../../lib/dispatch-worker.ts";
import type { DistributionAdapter } from "../../lib/dispatch-contract.ts";
import { scheduleAuthorizedDispatch } from "../../lib/dispatch-worker.ts";
import { reconcileDispatchJob } from "../../lib/dispatch-db.ts";

async function getAuthContext(
  requestedAccount?: string,
): Promise<{ context: AccountContext; appUserId: string } | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const context = await pageAccount(requestedAccount);
  if (!context || !context.actorAppUserId) return null;
  return { context, appUserId: context.actorAppUserId };
}

export async function executeDispatchCycleAction(input: {
  tenantId?: string;
  killSwitchActive?: boolean;
}): Promise<
  { ok: true; result: DispatchWorkerCycleResult } | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    // G-CHANNEL is a real external prerequisite. No synthetic adapter touches operational jobs.
    return {
      ok: false,
      error:
        "G-CHANNEL: canal oficial e transporte autorizado ainda não configurados. Nenhum envio foi registrado.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "dispatch_failed",
    };
  }
}

export async function cancelDispatchJobAction(input: {
  jobId: string;
  reason?: string;
  tenantId?: string;
}): Promise<{ ok: true; cancelled: boolean } | { ok: false; error: string }> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await withAccountDb(auth.context, async (sql) => {
      return cancelDispatchJob(sql, auth.context.tenantId, input.jobId, {
        cancelledBy: auth.appUserId,
        note: input.reason,
      });
    });
    revalidatePath("/admin");
    return { ok: true, cancelled: res.cancelled };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "cancel_job_failed",
    };
  }
}

export async function setDispatchControlAction(input: {
  tenantId?: string;
  killSwitch: boolean;
  configuration?: {
    maxPerWindow: number;
    windowSeconds: number;
    cooldownSeconds: number;
    windowAnchor: string;
    channelApprovalRef?: string;
  };
}) {
  const auth = await getAuthContext(input.tenantId);
  if (!auth || auth.context.membershipRole !== "owner")
    return { ok: false as const, error: "owner_required" };
  try {
    await withAccountDb(auth.context, async (tx) => {
      const [prior] = await tx<
        any[]
      >`select configuration from garimpa.dispatch_control where tenant_id=${auth.context.tenantId}`;
      const config = input.configuration ?? prior?.configuration;
      if (!config) throw new Error("explicit_dispatch_policy_required");
      if (
        !Number.isSafeInteger(config.maxPerWindow) ||
        config.maxPerWindow < 1 ||
        !Number.isSafeInteger(config.windowSeconds) ||
        config.windowSeconds < 1 ||
        !Number.isSafeInteger(config.cooldownSeconds) ||
        config.cooldownSeconds < 0 ||
        !Number.isFinite(Date.parse(config.windowAnchor))
      )
        throw new Error("invalid_dispatch_policy");
      await tx`insert into garimpa.dispatch_control(tenant_id,kill_switch,configuration,updated_by) values(${auth.context.tenantId},${input.killSwitch},${tx.json(config)},${auth.appUserId}) on conflict(tenant_id) do update set kill_switch=excluded.kill_switch,configuration=excluded.configuration,updated_by=excluded.updated_by,updated_at=clock_timestamp()`;
    });
    revalidatePath("/admin");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}
export async function getDispatchDeskAction(tenantId?: string) {
  const auth = await getAuthContext(tenantId);
  if (!auth) return { ok: false as const, error: "forbidden" };
  const data = await withAccountDb(auth.context, async (tx) => ({
    jobs: await tx`select id,status,campaign_publication_id,kit_revision_id,destination_id,scheduled_at::text,failure_code,provider_message_id,reconciliation_note from garimpa.dispatch_job where tenant_id=${auth.context.tenantId} order by created_at desc limit 100`,
    controls:
      await tx`select kill_switch,configuration from garimpa.dispatch_control where tenant_id=${auth.context.tenantId}`,
  }));
  return { ok: true as const, data };
}
export async function scheduleDispatchAction(input: {
  tenantId?: string;
  campaignPublicationId: string;
  kitRevisionId: string;
  destinationId: string;
  scheduledAt: string;
  idempotencyKey: string;
}) {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false as const, error: "forbidden" };
  try {
    const job = await scheduleAuthorizedDispatch(auth.context, input);
    revalidatePath("/admin");
    return { ok: true as const, job };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}
export async function reconcileDispatchAction(input: {
  tenantId?: string;
  jobId: string;
  resolvedStatus: "succeeded" | "failed";
  note: string;
  providerMessageId?: string;
  confirmedAt?: string;
}) {
  const auth = await getAuthContext(input.tenantId);
  if (
    !auth ||
    !input.note.trim() ||
    (input.resolvedStatus === "succeeded" && !input.providerMessageId)
  )
    return { ok: false as const, error: "proof_required" };
  try {
    await withAccountDb(auth.context, async (tx) => {
      await reconcileDispatchJob(tx, auth.context.tenantId, {
        jobId: input.jobId,
        resolvedStatus: input.resolvedStatus,
        reconciliationNote: input.note,
        reconciledBy: auth.appUserId,
        providerMessageId: input.providerMessageId,
        confirmedAt: input.confirmedAt,
      });
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}
