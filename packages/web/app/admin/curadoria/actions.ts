"use server";

import { revalidatePath } from "next/cache";
import { getPageAuth, isAdmin, resolveAppUserId } from "../../../lib/auth.ts";
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
  if (!user || !isAdmin(user)) return null;
  return resolveAppUserId(user.id);
}

export async function submitCurationDecision(input: CurationDecisionInput): Promise<CurationActionResult> {
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
}

export async function undoCurationDecision(productId: string, eventId: string): Promise<CurationActionResult> {
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
}

/** Adia a revisão de um produto ("Depois" — Rever em 7 dias) (M4-E). */
export async function deferCurationProduct(
  productId: string,
  days = 7,
): Promise<DeferralActionResult> {
  const reviewer = await reviewerId();
  if (!reviewer) return { ok: false, error: "forbidden" };

  const deferredUntil = days === 7
    ? defaultDeferredUntil()
    : new Date(Date.now() + Math.min(Math.max(days, 1), 30) * 86_400_000).toISOString();

  const parsed = validateCurationDeferral({ productId, deferredUntil });
  if (!parsed.ok) return parsed;

  const ok = await deferReview(parsed.value, reviewer);
  if (!ok) return { ok: false, error: "defer_failed" };

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/curadoria");
  return { ok: true, productId, deferredUntil };
}

/** Antecipa a volta de um produto adiado (M4-E). */
export async function clearDeferredCurationProduct(
  productId: string,
): Promise<DeferralActionResult> {
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
}

/** Ação em lote sobre grupo editorial (M4-E). */
export async function submitGroupAction(
  input: GroupActionInput,
): Promise<GroupActionResultResponse> {
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
}

/** Desfaz integralmente a última ação em lote (M4-E). */
export async function undoGroupAction(
  bulkActionId: string,
): Promise<{ ok: true; bulkActionId: string } | { ok: false; error: string }> {
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
}

/** Busca sob demanda todos os membros de um grupo (M4-E). */
export async function fetchGroupMembers(
  groupId: string,
): Promise<{ ok: true; members: CurationQueueProduct[] } | { ok: false; error: string }> {
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
}

export type AutomatedTriageActionResult =
  | {
      ok: true;
      processed: number;
      rejected: number;
      held: number;
      annotatedPending: number;
    }
  | { ok: false; error: string };

/** Executa o funil de corte determinístico e triagem com Gemini 2.5 Flash sobre pendentes. */
export async function runAutomatedTriageAction(
  limit = 50,
): Promise<AutomatedTriageActionResult> {
  const reviewer = await reviewerId();
  if (!reviewer) return { ok: false, error: "forbidden" };

  try {
    const summary = await runPendingAutomatedTriage("local", limit);
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, ...summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "triage_failed";
    return { ok: false, error: message };
  }
}


