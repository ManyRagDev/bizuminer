export const CURATION_STATUSES = ["legacy_visible", "pending", "approved", "rejected", "held"] as const;
export type CurationStatus = (typeof CURATION_STATUSES)[number];

export const REJECTION_REASONS = [
  ["adult_sexual", "Adulto/sexual"],
  ["misleading_claim", "Promessa enganosa"],
  ["low_utility", "Pouca utilidade"],
  ["unsafe_restricted", "Inseguro ou restrito"],
  ["audience_mismatch", "Fora do público"],
  ["low_quality_listing", "Anúncio ruim"],
  ["duplicate", "Duplicado"],
  ["other", "Outro"],
] as const;

export const HOLD_REASONS = [
  ["insufficient_evidence", "Falta evidência"],
  ["weak_offer", "Oferta fraca"],
  ["stale_offer", "Preço desatualizado"],
  ["unavailable", "Indisponível"],
  ["family_saturation", "Saturação de família"],
  ["other", "Outro"],
] as const;

export type CurationReason =
  | (typeof REJECTION_REASONS)[number][0]
  | (typeof HOLD_REASONS)[number][0];

export type CurationDecision = "approve" | "reject" | "hold";

export interface CurationDecisionInput {
  productId: string;
  decision: CurationDecision;
  reasonCode?: string | null;
  reasonDetail?: string | null;
}

export type ValidCurationDecision = {
  productId: string;
  decision: CurationDecision;
  status: Extract<CurationStatus, "approved" | "rejected" | "held">;
  reasonCode: CurationReason | null;
  reasonDetail: string | null;
};

const PRODUCT_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;
const REJECTION_CODES = new Set<string>(REJECTION_REASONS.map(([code]) => code));
const HOLD_CODES = new Set<string>(HOLD_REASONS.map(([code]) => code));

export function validateCurationDecision(
  input: CurationDecisionInput,
): { ok: true; value: ValidCurationDecision } | { ok: false; error: string } {
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (!PRODUCT_ID_RE.test(productId)) return { ok: false, error: "invalid_product" };

  if (!(["approve", "reject", "hold"] as const).includes(input.decision)) {
    return { ok: false, error: "invalid_decision" };
  }

  if (input.decision === "approve") {
    return {
      ok: true,
      value: { productId, decision: "approve", status: "approved", reasonCode: null, reasonDetail: null },
    };
  }

  const allowed = input.decision === "reject" ? REJECTION_CODES : HOLD_CODES;
  const reasonCode = typeof input.reasonCode === "string" ? input.reasonCode.trim() : "";
  if (!allowed.has(reasonCode)) return { ok: false, error: "reason_required" };

  const reasonDetail = typeof input.reasonDetail === "string" ? input.reasonDetail.trim() : "";
  if (reasonCode === "other" && (reasonDetail.length < 3 || reasonDetail.length > 1000)) {
    return { ok: false, error: "other_detail_required" };
  }

  return {
    ok: true,
    value: {
      productId,
      decision: input.decision,
      status: input.decision === "reject" ? "rejected" : "held",
      reasonCode: reasonCode as CurationReason,
      reasonDetail: reasonCode === "other" ? reasonDetail : null,
    },
  };
}

/** Limite do horizonte do "Depois" (em dias). */
export const DEFER_MAX_DAYS = 30;

/** Horizonte padrão do "Depois" inicial [EVAL]: 7 dias. */
export const DEFAULT_DEFER_DAYS = 7;

export function defaultDeferredUntil(now = Date.now()): string {
  return new Date(now + DEFAULT_DEFER_DAYS * 86_400_000).toISOString();
}

export interface CurationDeferralInput {
  productId: string;
  /** ISO-8601; o produto volta à fila neste instante. */
  deferredUntil: string;
}

export type ValidCurationDeferral = {
  productId: string;
  deferredUntil: string;
};

export function validateCurationDeferral(
  input: CurationDeferralInput,
): { ok: true; value: ValidCurationDeferral } | { ok: false; error: string } {
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (!PRODUCT_ID_RE.test(productId)) return { ok: false, error: "invalid_product" };

  const rawUntil = typeof input.deferredUntil === "string" ? input.deferredUntil.trim() : "";
  const until = new Date(rawUntil);
  const max = new Date(Date.now() + DEFER_MAX_DAYS * 86_400_000);
  if (Number.isNaN(until.getTime())) return { ok: false, error: "invalid_deferred_until" };
  if (until.getTime() <= Date.now()) return { ok: false, error: "deferred_until_in_past" };
  if (until.getTime() > max.getTime()) return { ok: false, error: "deferred_until_too_far" };

  return { ok: true, value: { productId, deferredUntil: until.toISOString() } };
}

export const BULK_DECISIONS_MIN = 1;
export const BULK_DECISIONS_MAX = 200;

export interface CurationBulkContext {
  /** Grupo editorial determinístico (ver editorial-groups.ts). */
  groupId?: string | null;
  reviewSessionId?: string | null;
  bulkActionId?: string | null;
}

export interface CurationBulkDecisionInput {
  decisions: CurationDecisionInput[];
  context?: CurationBulkContext;
}

export interface ValidCurationBulk {
  decisions: ValidCurationDecision[];
  context: Required<CurationBulkContext>;
}

export function validateCurationBulk(
  input: CurationBulkDecisionInput,
): { ok: true; value: ValidCurationBulk } | { ok: false; error: string } {
  if (!Array.isArray(input.decisions) || input.decisions.length < BULK_DECISIONS_MIN) {
    return { ok: false, error: "bulk_empty" };
  }
  if (input.decisions.length > BULK_DECISIONS_MAX) {
    return { ok: false, error: "bulk_too_large" };
  }

  const parsed: ValidCurationDecision[] = [];
  const productIds = new Set<string>();
  for (const decision of input.decisions) {
    const result = validateCurationDecision(decision);
    if (!result.ok) return result;
    if (productIds.has(result.value.productId)) {
      return { ok: false, error: "bulk_duplicate_product" };
    }
    productIds.add(result.value.productId);
    parsed.push(result.value);
  }

  const context: Required<CurationBulkContext> = {
    groupId: input.context?.groupId ?? null,
    reviewSessionId: input.context?.reviewSessionId ?? null,
    bulkActionId: input.context?.bulkActionId ?? null,
  };
  for (const [key, value] of Object.entries(context) as [keyof CurationBulkContext, string | null][]) {
    if (value !== null && !SESSION_ID_RE.test(value)) {
      return { ok: false, error: "invalid_context_id" };
    }
  }
  if (context.bulkActionId === null) context.bulkActionId = crypto.randomUUID();
  if (context.reviewSessionId === null) context.reviewSessionId = crypto.randomUUID();

  return { ok: true, value: { decisions: parsed, context } };
}

/** Carga decisória da fila editorial (M4-E). */
export interface CurationDecisionLoad {
  openGroupsCount: number;
  singularsCount: number;
  totalCapturedAwaiting: number;
  withoutFamilyCount: number;
}

export function formatDecisionLoad(load: CurationDecisionLoad): string {
  const gText = load.openGroupsCount === 1 ? "1 grupo" : `${load.openGroupsCount} grupos`;
  const sText = load.singularsCount === 1 ? "1 produto singular" : `${load.singularsCount} produtos singulares`;
  const pText = load.totalCapturedAwaiting === 1 ? "1 produto capturado" : `${load.totalCapturedAwaiting} produtos capturados`;
  return `${gText} e ${sText} aguardam avaliação — ${pText}`;
}

/** Ação de grupo editorial (M4-E). */
export interface GroupActionInput {
  groupId: string;
  selectedProductIds: string[];
  action: CurationDecision;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  /** Se true, os membros restantes (não selecionados) deste grupo são retidos como held/family_saturation. */
  retainRemainingAsSaturation?: boolean;
  reviewSessionId?: string | null;
}

export interface ValidGroupAction {
  groupId: string;
  selectedProductIds: string[];
  action: CurationDecision;
  reasonCode: CurationReason | null;
  reasonDetail: string | null;
  retainRemainingAsSaturation: boolean;
  reviewSessionId: string;
}

const GROUP_ID_RE = /^grp_[0-9a-f]{16}$/;

export function validateGroupAction(
  input: GroupActionInput,
): { ok: true; value: ValidGroupAction } | { ok: false; error: string } {
  const groupId = typeof input.groupId === "string" ? input.groupId.trim() : "";
  if (!GROUP_ID_RE.test(groupId)) return { ok: false, error: "invalid_group_id" };

  if (!Array.isArray(input.selectedProductIds)) {
    return { ok: false, error: "invalid_selected_products" };
  }

  const selectedIds: string[] = [];
  const seen = new Set<string>();
  for (const rawId of input.selectedProductIds) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!PRODUCT_ID_RE.test(id)) return { ok: false, error: "invalid_product" };
    if (seen.has(id)) return { ok: false, error: "bulk_duplicate_product" };
    seen.add(id);
    selectedIds.push(id);
  }

  // Permitir lista de selecionados vazia APENAS se retainRemainingAsSaturation for true
  const retainRemaining = Boolean(input.retainRemainingAsSaturation);
  if (selectedIds.length === 0 && !retainRemaining) {
    return { ok: false, error: "group_selection_empty" };
  }
  if (selectedIds.length > BULK_DECISIONS_MAX) {
    return { ok: false, error: "bulk_too_large" };
  }

  if (selectedIds.length > 0) {
    if (!(["approve", "reject", "hold"] as const).includes(input.action)) {
      return { ok: false, error: "invalid_decision" };
    }

    if (input.action !== "approve") {
      const allowed = input.action === "reject" ? REJECTION_CODES : HOLD_CODES;
      const reasonCode = typeof input.reasonCode === "string" ? input.reasonCode.trim() : "";
      if (!allowed.has(reasonCode)) return { ok: false, error: "reason_required" };

      const reasonDetail = typeof input.reasonDetail === "string" ? input.reasonDetail.trim() : "";
      if (reasonCode === "other" && (reasonDetail.length < 3 || reasonDetail.length > 1000)) {
        return { ok: false, error: "other_detail_required" };
      }
    }
  }

  const reasonCode = input.action === "approve" ? null : (input.reasonCode?.trim() as CurationReason ?? null);
  const reasonDetail = reasonCode === "other" ? (input.reasonDetail?.trim() ?? null) : null;

  const reviewSessionId = typeof input.reviewSessionId === "string" && SESSION_ID_RE.test(input.reviewSessionId.trim())
    ? input.reviewSessionId.trim()
    : crypto.randomUUID();

  return {
    ok: true,
    value: {
      groupId,
      selectedProductIds: selectedIds,
      action: input.action ?? "approve",
      reasonCode,
      reasonDetail,
      retainRemainingAsSaturation: retainRemaining,
      reviewSessionId,
    },
  };
}

/** Resumo de encerramento de sessão de curadoria (M4-E). */
export interface CurationSessionSummary {
  approvedCount: number;
  rejectedCount: number;
  heldSaturationCount: number;
  heldEvidenceCount: number;
  heldOtherCount: number;
  otherReasons: Array<{
    productId: string;
    title: string;
    decision: "reject" | "hold";
    reasonCode: string;
    reasonDetail: string;
  }>;
  totalDecisions: number;
}

