"use server";
import { pageAccount } from "../../../lib/page-account.ts";

import { revalidatePath } from "next/cache";
import {
  getPageAuth,
  isAffiliate,
  resolveAccountContext,
  type AccountContext,
} from "../../../lib/auth.ts";
import {
  createPolicyExperiment,
  approveExperimentMethod,
  assignExperimentUnit,
  recordExperimentEvaluation,
  type ExperimentMethod,
  reviewPolicyExperiment,
  promotePolicyExperiment,
  rollbackPolicyExperiment,
  getExperimentReport,
  exportExperimentMethodologyCsv,
  listPolicyExperiments,
  type CreatePolicyExperimentInput,
} from "../../../lib/experiment-db.ts";

async function getAuthContext(
  requestedAccount?: string,
): Promise<{ context: AccountContext; appUserId: string } | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const context = await pageAccount(requestedAccount);
  if (!context || !context.actorAppUserId) return null;
  return { context, appUserId: context.actorAppUserId };
}

export async function createPolicyExperimentAction(
  input: CreatePolicyExperimentInput,
): Promise<{ ok: true; experimentId: string } | { ok: false; error: string }> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await createPolicyExperiment(auth.context, input);
    revalidatePath("/admin/experimentos");
    return { ok: true, experimentId: res.experimentId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "create_experiment_failed",
    };
  }
}

export async function calculateCohortMetricsAction(input: {
  experimentId: string;
  tenantId?: string;
}): Promise<
  | { ok: true; baselineMetric: any; candidateMetric: any; sampleSize: number }
  | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const report = await getExperimentReport(auth.context, input.experimentId);
    if (!report) return { ok: false, error: "experiment_not_found" };
    return {
      ok: true,
      baselineMetric: report.baselineMetric,
      candidateMetric: report.candidateMetric,
      sampleSize: report.totalSampleSize,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "calculate_metrics_failed",
    };
  }
}

export async function reviewPolicyExperimentAction(input: {
  experimentId: string;
  decision?: "reviewed" | "rejected";
  rationale?: string;
  tenantId?: string;
}): Promise<{ ok: true; reviewed: boolean } | { ok: false; error: string }> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await reviewPolicyExperiment(auth.context, {
      experimentId: input.experimentId,
      reviewNotes: input.rationale,
      decision: input.decision,
    });
    revalidatePath("/admin/experimentos");
    return { ok: true, reviewed: res.reviewed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "review_failed",
    };
  }
}

export async function promotePolicyExperimentAction(input: {
  experimentId: string;
  promotionRationale: string;
  tenantId?: string;
}): Promise<
  | { ok: true; candidateVersion: string; baselineVersion: string }
  | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await promotePolicyExperiment(auth.context, {
      experimentId: input.experimentId,
      promotionRationale: input.promotionRationale,
      promotedBy: auth.appUserId,
    });
    revalidatePath("/admin/experimentos");
    return {
      ok: true,
      candidateVersion: res.candidateVersion,
      baselineVersion: res.baselineVersion,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "promote_failed",
    };
  }
}

export async function rollbackPolicyExperimentAction(input: {
  experimentId: string;
  rollbackRationale: string;
  tenantId?: string;
}): Promise<
  { ok: true; restoredVersion: string } | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await rollbackPolicyExperiment(auth.context, {
      experimentId: input.experimentId,
      rollbackRationale: input.rollbackRationale,
      actor: auth.appUserId,
    });
    revalidatePath("/admin/experimentos");
    return { ok: true, restoredVersion: res.restoredVersion };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "rollback_failed",
    };
  }
}

export async function exportExperimentCsvAction(input: {
  experimentId: string;
  tenantId?: string;
}): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const report = await getExperimentReport(auth.context, input.experimentId);
    if (!report) return { ok: false, error: "not_found" };
    const csv = exportExperimentMethodologyCsv(report);
    return {
      ok: true,
      csv,
      filename: `experiment-${input.experimentId}-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "export_failed",
    };
  }
}

export async function approveMethodAction(input: {
  tenantId?: string;
  experimentId: string;
  method: ExperimentMethod;
}) {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false as const, error: "forbidden" };
  try {
    await approveExperimentMethod(auth.context, input);
    revalidatePath("/admin/experimentos");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}
export async function recordPairAction(input: {
  tenantId?: string;
  experimentId: string;
  productId: string;
  baseline: number;
  candidate: number;
  metric: string;
}) {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false as const, error: "forbidden" };
  try {
    const { assignment } = await assignExperimentUnit(auth.context, {
      experimentId: input.experimentId,
      unitId: input.productId,
    });
    for (const variant of ["baseline", "candidate"] as const)
      await recordExperimentEvaluation(auth.context, {
        experimentId: input.experimentId,
        unitId: input.productId,
        variant,
        output: { [input.metric]: input[variant] },
        inputDigest: assignment.inputDigest,
      });
    revalidatePath("/admin/experimentos");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}

export async function approveCandidateAction(input: {
  tenantId?: string;
  experimentId: string;
  rationale: string;
}) {
  const c = await pageAccount(input.tenantId);
  if (!c) return { ok: false, error: "forbidden" };
  try {
    const { approveExperimentCandidate } =
      await import("../../../lib/experiment-db.ts");
    await approveExperimentCandidate(c, input);
    revalidatePath("/admin/experimentos");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
