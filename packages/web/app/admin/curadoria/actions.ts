"use server";
import { pageAccount } from "../../../lib/page-account.ts";
import { accountOperation } from "../../../lib/page-account.ts";
import { scopedTenantId } from "../../../lib/account-scope.ts";

import { revalidatePath } from "next/cache";
import {
  getEditorialSelectionDesk,
  replaceEditorialSelection,
  saveEditorialAssessment,
} from "../../../lib/editorial-selection-db.ts";
import type { EditorialAssessmentInput } from "../../../lib/editorial-selection.ts";
import {
  getPageAuth,
  isAffiliate,
  resolveAppUserId,
  resolveAccountContext,
  type AccountContext,
} from "../../../lib/auth.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import {
  actOnGroup,
  clearDeferredReview,
  deferReview,
  groupMembers,
  reviewProduct,
  runPendingAutomatedTriage,
  undoBulkReview,
  undoReview,
  type CurationQueueProduct,
} from "../../../lib/curation-db.ts";
import {
  defaultDeferredUntil,
  validateCurationDecision,
  validateCurationDeferral,
  validateGroupAction,
  type CurationDecisionInput,
  type GroupActionInput,
} from "../../../lib/curation-contract.ts";
import {
  recordHumanRubricReview,
  getComparisonReviewsSample,
  getRubricPromotionMetrics,
  saveAnalysisAssessment,
  calculateRubricInputDigest,
  loadRubricInput,
  getLatestHumanRubricAssessment,
  ratifyRubricPolicy,
  type ComparisonReviewSampleItem,
  type RubricPromotionMetrics,
} from "../../../lib/rubric-db.ts";
import {
  validateRubricAssessment,
  type RubricAssessment,
  type RubricInputItem,
} from "../../../lib/rubric-contract.ts";
import { evaluateRubricShadowItem } from "../../../lib/ai-curation-service.ts";
import { db } from "../../../lib/db.ts";

export type CurationActionResult =
  | { ok: true; eventId: string; productId: string }
  | { ok: false; error: string };

export type GroupActionResultResponse =
  | { ok: true; bulkActionId: string; affectedCount: number }
  | { ok: false; error: string };

export type DeferralActionResult =
  | { ok: true; productId: string; deferredUntil?: string }
  | { ok: false; error: string };

async function reviewerId(): Promise<string | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  return resolveAppUserId(user.id);
}

export async function reopenHumanReviewAction(productId: string) {
  return accountOperation(async (c) => ({
    assessment: await withAccountDb(c, (tx) =>
      getLatestHumanRubricAssessment(tx, c.tenantId, productId),
    ),
  }));
}

async function getAuthorizedContext(
  requestedAccount?: string,
): Promise<{ context: AccountContext; appUserId: string } | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const context = await pageAccount(requestedAccount);
  if (!context || !context.actorAppUserId) return null;
  return { context, appUserId: context.actorAppUserId };
}

export async function submitCurationDecision(
  input: CurationDecisionInput,
): Promise<CurationActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    const parsed = validateCurationDecision(input);
    if (!parsed.ok) return parsed;

    const result = await reviewProduct(parsed.value, reviewer);
    if (!result) return { ok: false, error: "not_found" };
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, eventId: result.eventId, productId: result.productId };
  });
}

export async function undoCurationDecision(
  productId: string,
  eventId: string,
): Promise<CurationActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(productId) || !/^\d+$/.test(eventId)) {
      return { ok: false, error: "invalid_payload" };
    }

    const undone = await undoReview(productId, eventId, reviewer);
    if (!undone) return { ok: false, error: "undo_conflict" };
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, eventId, productId };
  });
}

/** Adia a revisão de um produto ("Depois" — Rever em 7 dias) (M4-E). */
export async function deferCurationProduct(
  productId: string,
  days = 7,
): Promise<DeferralActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    const deferredUntil =
      days === 7
        ? defaultDeferredUntil()
        : new Date(
            Date.now() + Math.min(Math.max(days, 1), 30) * 86_400_000,
          ).toISOString();

    const parsed = validateCurationDeferral({ productId, deferredUntil });
    if (!parsed.ok) return parsed;

    const ok = await deferReview(parsed.value, reviewer);
    if (!ok) return { ok: false, error: "defer_failed" };

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, productId, deferredUntil };
  });
}

/** Antecipa a volta de um produto adiado (M4-E). */
export async function clearDeferredCurationProduct(
  productId: string,
): Promise<DeferralActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(productId)) {
      return { ok: false, error: "invalid_payload" };
    }

    const ok = await clearDeferredReview(productId, reviewer);
    if (!ok) return { ok: false, error: "clear_failed" };

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, productId };
  });
}

/** Ação em lote sobre grupo editorial (M4-E). */
export async function submitGroupAction(
  input: GroupActionInput,
): Promise<GroupActionResultResponse> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    const parsed = validateGroupAction(input);
    if (!parsed.ok) return parsed;

    try {
      const result = await actOnGroup(parsed.value, reviewer);
      revalidatePath("/");
      revalidatePath("/admin");
      revalidatePath("/admin/curadoria");
      return {
        ok: true,
        bulkActionId: result.bulkActionId,
        affectedCount: result.affectedCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "group_action_error";
      return { ok: false, error: message };
    }
  });
}

/** Desfaz integralmente a última ação em lote (M4-E). */
export async function undoGroupAction(
  bulkActionId: string,
): Promise<{ ok: true; bulkActionId: string } | { ok: false; error: string }> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(bulkActionId)) {
      return { ok: false, error: "invalid_payload" };
    }

    const undone = await undoBulkReview(bulkActionId, reviewer);
    if (!undone) return { ok: false, error: "undo_conflict" };

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, bulkActionId };
  });
}

/** Busca sob demanda todos os membros de um grupo (M4-E). */
export async function fetchGroupMembers(
  groupId: string,
): Promise<
  { ok: true; members: CurationQueueProduct[] } | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^grp_[0-9a-f]{16}$/.test(groupId)) {
      return { ok: false, error: "invalid_group_id" };
    }

    try {
      const members = await groupMembers(groupId);
      return { ok: true, members };
    } catch {
      return { ok: false, error: "fetch_members_failed" };
    }
  });
}

export type AutomatedTriageActionResult =
  | {
      ok: true;
      processed: number;
      approved: number;
      rejected: number;
      held: number;
      annotatedPending: number;
    }
  | { ok: false; error: string };

/** Executa o funil de corte determinístico e triagem com Gemini 2.5 Flash sobre pendentes. */
export async function runAutomatedTriageAction(
  limit = 50,
): Promise<AutomatedTriageActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    try {
      const summary = await runPendingAutomatedTriage(scopedTenantId(), limit);
      revalidatePath("/");
      revalidatePath("/admin");
      revalidatePath("/admin/curadoria");
      return { ok: true, ...summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : "triage_failed";
      return { ok: false, error: message };
    }
  });
}

/** Avaliar e destacar são decisões distintas da aprovação do catálogo. */
export async function saveEditorialAssessmentAction(
  input: EditorialAssessmentInput,
) {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false as const, error: "forbidden" };
    try {
      const result = await saveEditorialAssessment(
        input,
        reviewer,
        scopedTenantId(),
      );
      if (!result.ok) return result;
      const desk = await getEditorialSelectionDesk(scopedTenantId());
      revalidatePath("/admin/curadoria");
      revalidatePath("/");
      revalidatePath("/pauta");
      return {
        ...result,
        candidate:
          desk.candidates.find(
            (candidate) => candidate.id === input.productId,
          ) ?? null,
      };
    } catch {
      return {
        ok: false as const,
        error: "Não foi possível salvar a avaliação. Tente novamente.",
      };
    }
  });
}

export async function replaceEditorialSelectionAction(
  input: Parameters<typeof replaceEditorialSelection>[0],
) {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false as const, error: "forbidden" };
    try {
      const result = await replaceEditorialSelection(
        input,
        reviewer,
        scopedTenantId(),
      );
      if (result.ok) {
        revalidatePath("/");
        revalidatePath("/pauta");
        revalidatePath("/api/deals");
        revalidatePath("/api/pauta");
        revalidatePath("/admin/curadoria");
      }
      return result;
    } catch {
      return {
        ok: false as const,
        error: "Não foi possível ativar a seleção. Tente novamente.",
      };
    }
  });
}

export async function submitHumanRubricReviewAction(input: {
  productId: string;
  assessment: RubricAssessment;
  notes?: string;
  requestId?: string;
  tenantId?: string;
}): Promise<
  | {
      ok: true;
      comparisonReviewId: string | null;
      agreement: boolean;
      disagreementCount: number;
    }
  | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(input.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      const res = await withAccountDb(auth.context, async (tx) => {
        const facts = await loadRubricInput(
          tx,
          auth.context.tenantId,
          input.productId,
        );
        const validated = validateRubricAssessment({
          ...input.assessment,
          policyVersion: "rubric-v2",
          evidenceDigest: calculateRubricInputDigest(facts),
          createdAt: new Date().toISOString(),
        });
        return recordHumanRubricReview(tx, {
          tenantId: auth.context.tenantId,
          productId: input.productId,
          humanAssessment: validated,
          reviewedByAppUserId: auth.appUserId,
          notes: input.notes,
          requestId: input.requestId,
        });
      });
      revalidatePath("/admin/curadoria");
      return {
        ok: true,
        comparisonReviewId: res.comparisonReviewId,
        agreement: res.agreement,
        disagreementCount: res.disagreements.length,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "rubric_review_error",
      };
    }
  });
}

export async function fetchComparisonSampleAction(options?: {
  limit?: number;
  onlyDisagreements?: boolean;
  tenantId?: string;
}): Promise<
  | { ok: true; sample: ComparisonReviewSampleItem[] }
  | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(options?.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      const sample = await withAccountDb(auth.context, async (tx) => {
        return getComparisonReviewsSample(tx, auth.context.tenantId, options);
      });
      return { ok: true, sample };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "fetch_sample_failed",
      };
    }
  });
}

export async function fetchRubricPromotionMetricsAction(
  tenantId = scopedTenantId(),
): Promise<
  { ok: true; metrics: RubricPromotionMetrics } | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      const metrics = await withAccountDb(auth.context, async (tx) => {
        return getRubricPromotionMetrics(tx, auth.context.tenantId);
      });
      return { ok: true, metrics };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "fetch_metrics_failed",
      };
    }
  });
}

export async function runShadowEvaluationAction(input: {
  productId: string;
  item?: RubricInputItem;
  tenantId?: string;
}): Promise<{ ok: true; assessmentId: string } | { ok: false; error: string }> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(input.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      if (!process.env.GEMINI_API_KEY) {
        return { ok: false, error: "gemini_api_key_missing" };
      }
      const item = await withAccountDb(auth.context, (tx) =>
        loadRubricInput(tx, auth.context.tenantId, input.productId),
      );
      const rawResult = await evaluateRubricShadowItem(item);
      const digest = calculateRubricInputDigest(item);
      const aiResult={...rawResult,policyVersion:"rubric-v2",evidenceDigest:digest};
      const assessmentId = await withAccountDb(auth.context, async (tx) => {
        if(calculateRubricInputDigest(await loadRubricInput(tx,auth.context.tenantId,input.productId))!==digest)throw new Error("shadow_facts_changed");
        const id = await saveAnalysisAssessment(tx, {
          tenantId: auth.context.tenantId,
          productId: input.productId,
          rubricVersion: "rubric-v2",
          inputDigest: digest,
          result: aiResult,
          modelVersion: aiResult.modelVersion ?? "gemini-2.5-flash",
          promptVersion: aiResult.promptVersion ?? "rubric-v2-shadow",
          mode: "shadow",
        });
        const [human]=await tx<{id:string;assessment:RubricAssessment;actor_app_user_id:string}[]>`select id,assessment,actor_app_user_id from garimpa.editorial_assessment where tenant_id=${auth.context.tenantId} and product_id=${input.productId} and assessment->>'schemaVersion'='2' order by created_at desc,id desc limit 1`;
        if(human?.assessment.evidenceDigest===digest && human.assessment.policyVersion==='rubric-v2')await recordHumanRubricReview(tx,{tenantId:auth.context.tenantId,productId:input.productId,humanAssessment:human.assessment,reviewedByAppUserId:human.actor_app_user_id,editorialAssessmentId:human.id,requestId:'shadow-compare:'+id});
        return id;
      });
      return { ok: true, assessmentId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "shadow_eval_failed",
      };
    }
  });
}

export async function ratifyRubricPolicyAction(input: {
  rubricVersion?: string;
  reviewIds: string[];
  rationale: string;
  cohort?: string;
  minUnits?: number;
  minAgreementRate?: number;
  tenantId?: string;
}): Promise<
  | { ok: true; decisionId: string; status: "ratified"; agreementRate: number }
  | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(input.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };
    if (auth.context.membershipRole !== "owner") {
      return { ok: false, error: "owner_required" };
    }

    try {
      const res = await withAccountDb(auth.context, async (tx) => {
        return ratifyRubricPolicy(tx, {
          tenantId: auth.context.tenantId,
          rubricVersion: input.rubricVersion ?? "rubric-v2",
          reviewIds: input.reviewIds,
          approvedByAppUserId: auth.appUserId,
          rationale: input.rationale,
          cohort: input.cohort,
          minUnits: input.minUnits,
          minAgreementRate: input.minAgreementRate,
        });
      });
      revalidatePath("/admin/curadoria");
      return {
        ok: true,
        decisionId: res.decisionId,
        status: res.status,
        agreementRate: res.agreementRate,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "ratification_failed",
      };
    }
  });
}

