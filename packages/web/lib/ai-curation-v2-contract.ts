/** Assessment attributes are distinct from an editorial decision or price evidence. */
export const AI_CURATION_V2_VERSION = "attributes-v2";
export type AttributeAssessmentInput = {
  productId: string;
  title: string;
  marketplace: string;
  priceCents: number;
  category: string | null;
  ratingStar: number | null;
  salesCount: number | null;
  evidence: Record<string, unknown>;
};
export type AttributeAssessment = {
  productId: string;
  qualidade: number | null;
  genuinidade_oferta: number | null;
  apelo_whatsapp: number | null;
  categoria: string | null;
  flags: string[];
  confianca: number;
  justificativa: string;
  fatos_usados: string[];
  duvidas: string[];
};
const keys = ["productId", "qualidade", "genuinidade_oferta", "apelo_whatsapp", "categoria", "flags", "confianca", "justificativa", "fatos_usados", "duvidas"];
const categories = new Set(["Casa", "Tecnologia", "Ferramentas", "Beleza", "Fitness", "Auto e moto", "Brinquedos", "Papelaria", "Moda", "Suplementos", "Geral"]);
export const ATTRIBUTE_FLAGS = ["unsafe", "restricted", "misleading_claim", "ambiguous_configuration", "insufficient_evidence", "suspicious_discount"] as const;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const score = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const strings = (value: unknown) => Array.isArray(value) && value.length <= 20 && value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 300);

/** Reject the entire batch on missing, extra or duplicated results. */
export function parseAttributeAssessments(value: unknown, productIds: readonly string[]): AttributeAssessment[] {
  if (productIds.length < 1 || productIds.length > 20 || new Set(productIds).size !== productIds.length
      || !Array.isArray(value) || value.length !== productIds.length) throw new Error("attributes_batch_invalid");
  const expected = new Set(productIds);
  for (const item of value) {
    if (!record(item) || Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))
      || typeof item.productId !== "string" || !expected.delete(item.productId)
      || !score(item.qualidade) || !score(item.genuinidade_oferta) || !score(item.apelo_whatsapp)
      || !(item.categoria === null || typeof item.categoria === "string" && categories.has(item.categoria))
      || !strings(item.flags) || (item.flags as string[]).some(flag => !(ATTRIBUTE_FLAGS as readonly string[]).includes(flag))
      || new Set(item.flags as string[]).size !== (item.flags as string[]).length || !strings(item.fatos_usados) || !strings(item.duvidas)
      || typeof item.confianca !== "number" || !Number.isFinite(item.confianca) || item.confianca < 0 || item.confianca > 1
      || typeof item.justificativa !== "string" || !item.justificativa.trim() || item.justificativa.length > 1000) {
      throw new Error("attributes_response_invalid");
    }
  }
  if (expected.size) throw new Error("attributes_response_invalid");
  return value as AttributeAssessment[];
}

export type AssessmentBasis = { materialFingerprint: string; priceCents: number; policyVersion: string; promptVersion: string; model: string };
/** Compare to the last assessment, rather than the most recent capture. */
export function assessmentNeedsRefresh(previous: AssessmentBasis | null, next: AssessmentBasis): boolean {
  if (!previous || previous.materialFingerprint !== next.materialFingerprint || previous.policyVersion !== next.policyVersion
    || previous.promptVersion !== next.promptVersion || previous.model !== next.model) return true;
  if (!Number.isSafeInteger(previous.priceCents) || previous.priceCents <= 0 || !Number.isSafeInteger(next.priceCents) || next.priceCents <= 0) return true;
  return Math.abs(next.priceCents - previous.priceCents) / previous.priceCents >= 0.1;
}
