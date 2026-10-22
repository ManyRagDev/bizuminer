"use server";
import { accountOperation } from "../../../lib/page-account.ts";
import { scopedTenantId } from "../../../lib/account-scope.ts";

import { revalidatePath } from "next/cache";
import { getPageAuth, isAffiliate, resolveAppUserId } from "../../../lib/auth.ts";
import {
  confirmSpotCheck,
  getEditorialGuideline,
  getTriageBatchItems,
  rejectAndLearnSpotCheck,
  saveEditorialGuideline,
  type EditorialGuidelineConfig,
  type TriageBatchItem,
} from "../../../lib/editorial-compass.ts";

export type SaveGuidelineResult =
  | { ok: true; config: EditorialGuidelineConfig }
  | { ok: false; error: string };

export type RejectSpotCheckResult =
  | { ok: true }
  | { ok: false; error: string };

export type ConfirmSpotCheckResult =
  | { ok: true }
  | { ok: false; error: string };

export type GetBatchItemsResult =
  | { ok: true; items: TriageBatchItem[] }
  | { ok: false; error: string };

async function getReviewerAppUserId(): Promise<string | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  return resolveAppUserId(user.id);
}

/**
 * Salva a diretriz viva e as preferências de piloto automático do administrador.
 */
export async function saveEditorialGuidelineAction(input: {
  guideline: string;
  autoPublish: boolean;
  minScore?: number;
}): Promise<SaveGuidelineResult> {
  return accountOperation(async () => {
  const reviewer = await getReviewerAppUserId();
  if (!reviewer) return { ok: false, error: "forbidden" };

  const minScore = Math.min(Math.max(input.minScore ?? 4, 1), 5);
  const success = await saveEditorialGuideline(scopedTenantId(), input.guideline, input.autoPublish, minScore);
  if (!success) {
    return { ok: false, error: "database_error" };
  }

  const updated = await getEditorialGuideline(scopedTenantId());

  revalidatePath("/admin/direcionamento");
  revalidatePath("/admin/curadoria");
  revalidatePath("/admin");

  return { ok: true, config: updated };
  });
}

/**
 * Rejeita um produto auto-publicado durante a auditoria rápida (Spot-Check),
 * registrando o motivo/feedback do diretor para calibração contínua da IA.
 */
export async function rejectSpotCheckAction(input: {
  productId: string;
  sourceEventId: string;
  feedback: string;
}): Promise<RejectSpotCheckResult> {
  return accountOperation(async () => {
  const reviewer = await getReviewerAppUserId();
  if (!reviewer) return { ok: false, error: "forbidden" };

  if (!input.productId) {
    return { ok: false, error: "missing_product_id" };
  }

  const success = await rejectAndLearnSpotCheck(
    input.productId,
    input.feedback,
    reviewer,
    scopedTenantId(),
    input.sourceEventId,
  );

  if (!success) {
    return { ok: false, error: "not_found_or_cannot_reject" };
  }

  revalidatePath("/admin/direcionamento");
  revalidatePath("/admin/curadoria");
  revalidatePath("/");
  revalidatePath("/pauta");
  revalidatePath("/admin");

  return { ok: true };
  });
}

/**
 * Confirma a aprovação automática de um produto na auditoria rápida (Spot-Check).
 * "Manter" deixa de ser só visual e passa a registrar a decisão — o item some da mesa.
 */
export async function confirmSpotCheckAction(input: {
  productId: string;
  sourceEventId: string;
}): Promise<ConfirmSpotCheckResult> {
  return accountOperation(async () => {
  const reviewer = await getReviewerAppUserId();
  if (!reviewer) return { ok: false, error: "forbidden" };

  if (!input.productId) {
    return { ok: false, error: "missing_product_id" };
  }

  const success = await confirmSpotCheck(input.productId, reviewer, scopedTenantId(), input.sourceEventId);

  if (!success) {
    return { ok: false, error: "not_found_or_cannot_confirm" };
  }

  revalidatePath("/admin/direcionamento");
  revalidatePath("/admin/curadoria");
  revalidatePath("/");
  revalidatePath("/pauta");
  revalidatePath("/admin");

  return { ok: true };
  });
}

/**
 * Busca os produtos e rationale detalhada de um lote de triagem específico para inspeção no modal.
 */
export async function getTriageBatchItemsAction(
  runTimeMinute: string,
): Promise<GetBatchItemsResult> {
  return accountOperation(async () => {
  const reviewer = await getReviewerAppUserId();
  if (!reviewer) return { ok: false, error: "forbidden" };

  if (!runTimeMinute) {
    return { ok: false, error: "missing_runtime" };
  }

  try {
    const items = await getTriageBatchItems(runTimeMinute, scopedTenantId());
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: "database_error" };
  }
  });
}
