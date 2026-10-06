import type { VitrineProduct } from "./deal-view.ts";
import { HERO_POLICY_VERSION } from "./hero-policy.ts";

export const EDITORIAL_POLICY_VERSION = "achadinhos-v1";
/** The shared selection is broader than the hero's three positions. */
export const EDITORIAL_MAX_PRODUCTS = 24;
export const EDITORIAL_DIMENSIONS = [
  { id: "audience", label: "Adequação ao público", prompt: "Quem se beneficia e em qual situação?" },
  { id: "utility", label: "Utilidade ou interesse", prompt: "Qual benefício concreto justifica a indicação?" },
  { id: "value", label: "Valor da oferta", prompt: "Por que vale considerar esta configuração pelo preço apresentado?" },
  { id: "confidence", label: "Confiança", prompt: "Quais evidências sustentam a indicação e quais são seus limites?" },
  { id: "clarity", label: "Clareza da compra", prompt: "O que chega, em qual quantidade, tamanho e configuração?" },
] as const;
export type EditorialDimensionId = typeof EDITORIAL_DIMENSIONS[number]["id"];
export const EDITORIAL_LEVELS = ["unknown", "weak", "adequate", "strong", "exceptional"] as const;
export type EditorialLevel = typeof EDITORIAL_LEVELS[number];
export type EditorialDestination = "home" | "pauta";
export type EditorialDimensions = Record<EditorialDimensionId, { level: EditorialLevel; reason: string }>;

export interface EditorialAssessmentInput {
  heroPolicyVersion?: string;
  productId: string;
  evidenceFingerprint: string;
  dimensions: EditorialDimensions;
  audience: string;
  benefit: string;
  purchaseContents: string;
  publicRationale: string;
  criticalDoubts: string[];
  maxPriceCents: number;
}
export interface EditorialAssessment extends EditorialAssessmentInput {
  id: string;
  createdAt: string;
  policyVersion: string;
  /** Read from the server's immutable observation snapshot, never from a form. */
  priceCentsAtAssessment?: number;
}
export interface EditorialCandidate extends VitrineProduct {
  productUrl: string;
  lastSeenAt: string;
  curationStatus: string;
  evidenceFingerprint: string;
  offerEvidence: unknown;
  assessment: EditorialAssessment | null;
  selectionBlockers: string[];
}
export interface EditorialSelectionItem {
  productId: string;
  assessmentId: string;
  publicRationale: string;
  destinations: EditorialDestination[];
  context: string;
  position: number;
}
export interface EditorialSelection {
  id: string;
  version: number;
  validUntil: string;
  items: EditorialSelectionItem[];
}
export interface ReplaceEditorialSelectionInput {
  expectedVersion: number | null;
  validUntil: string;
  items: Array<{ productId: string; assessmentId: string; destinations: EditorialDestination[]; context?: string }>;
}
export type EditorialPublishedProduct = VitrineProduct & {
  editorialRationale: string;
  editorialPurchaseContents: string;
  selectionItemId: string;
  editorialContext: string;
};
export interface PublishedEditorialSelection {
  mode: "catalog" | "editorial" | "unavailable";
  schemaReady: boolean;
  id: string | null;
  version: number | null;
  validUntil: string | null;
  products: EditorialPublishedProduct[];
  heroProductIds: string[];
  heroValidUntil: string | null;
}

/** Also changes when an item is invalidated without activating another edition. */
export function publishedEditorialStateKey(selection: PublishedEditorialSelection): string {
  return JSON.stringify([HERO_POLICY_VERSION, selection.mode, selection.version, selection.validUntil, selection.heroProductIds, selection.heroValidUntil,
    selection.products.map((product) => [product.id, product.priceCents, product.evidenceObservedAt,
      product.title, product.imageUrl, product.editorialRationale, product.editorialPurchaseContents, product.editorialContext])]);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/** Material identity and confidence facts invalidate a review; timestamps and counters do not. */
export function editorialEvidenceFingerprint(product: {
  title: string; imageUrl: string | null; category: string | null; productUrl: string; offerEvidence?: unknown;
  ratingStar?: number | null;
}): string {
  const evidence = product.offerEvidence && typeof product.offerEvidence === "object" ? product.offerEvidence as Record<string, unknown> : {};
  const identityKeys = ["description", "variantKey", "variantLabel", "packageContents", "packageQuantity", "dimensions", "positiveReviewRate", "priceMinCents", "priceMaxCents"];
  // Price-range *values* may change with ordinary price updates. Only a change
  // between a single price and a range is a material ambiguity signal.
  const facts = Object.fromEntries(identityKeys.filter((key) => !key.startsWith("price") && key in evidence).map((key) => [key, evidence[key]]));
  const ranged = typeof evidence.priceMinCents === "number" && typeof evidence.priceMaxCents === "number" && evidence.priceMinCents !== evidence.priceMaxCents;
  return JSON.stringify(canonical({ title: product.title, imageUrl: product.imageUrl, category: product.category, productUrl: product.productUrl,
    ratingStar: product.ratingStar && product.ratingStar > 0 ? product.ratingStar : null, facts, ranged }));
}

const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const cleanText = (value: unknown, min: number, max: number): string | null => typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;

export function validateEditorialAssessment(input: unknown, allowHistoricalHeroPolicy = false): { ok: true; value: EditorialAssessmentInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_assessment" };
  const raw = input as Record<string, unknown>;
  if (raw.heroPolicyVersion !== undefined && (typeof raw.heroPolicyVersion !== "string" || !/^hero-v[1-9]\d*$/.test(raw.heroPolicyVersion)
    || (!allowHistoricalHeroPolicy && raw.heroPolicyVersion !== HERO_POLICY_VERSION))) return { ok: false, error: "invalid_hero_policy" };
  if (typeof raw.productId !== "string" || !idPattern.test(raw.productId)) return { ok: false, error: "invalid_product" };
  const fingerprint = cleanText(raw.evidenceFingerprint, 1, 50000);
  if (!fingerprint) return { ok: false, error: "missing_evidence_fingerprint" };
  const dimensions = {} as EditorialDimensions;
  for (const dimension of EDITORIAL_DIMENSIONS) {
    const record = (raw.dimensions as Partial<EditorialDimensions> | undefined)?.[dimension.id];
    const reason = cleanText(record?.reason, 3, 1000);
    if (!record || !EDITORIAL_LEVELS.includes(record.level) || !reason) return { ok: false, error: `invalid_dimension_${dimension.id}` };
    dimensions[dimension.id] = { level: record.level, reason };
  }
  const audience = cleanText(raw.audience, 3, 500);
  const benefit = cleanText(raw.benefit, 3, 500);
  const purchaseContents = cleanText(raw.purchaseContents, 3, 1000);
  const publicRationale = cleanText(raw.publicRationale, 10, 500);
  if (!audience || !benefit || !purchaseContents || !publicRationale) return { ok: false, error: "assessment_explanation_required" };
  if (!Array.isArray(raw.criticalDoubts) || raw.criticalDoubts.length > 20 || raw.criticalDoubts.some((doubt) => !cleanText(doubt, 3, 500))) return { ok: false, error: "invalid_critical_doubts" };
  if (!Number.isSafeInteger(raw.maxPriceCents) || (raw.maxPriceCents as number) <= 0 || (raw.maxPriceCents as number) > 100000000) return { ok: false, error: "invalid_max_price" };
  return { ok: true, value: { ...(raw.heroPolicyVersion === undefined ? {} : { heroPolicyVersion: raw.heroPolicyVersion as string }), productId: raw.productId, evidenceFingerprint: fingerprint, dimensions, audience, benefit, purchaseContents, publicRationale, criticalDoubts: raw.criticalDoubts.map((v) => String(v).trim()), maxPriceCents: raw.maxPriceCents as number } };
}

export function editorialOfferBlockers(candidate: {
  curationStatus: string; evidenceFingerprint: string; evidenceObservedAt: Date | string | null;
  lastSeenAt: Date | string; imageUrl: string | null; priceCents: number;
  offerEvidence?: unknown;
}, now = new Date()): string[] {
  const blockers: string[] = [];
  if (candidate.curationStatus !== "approved") blockers.push("Produto sem aprovação editorial.");
  const seen = new Date(candidate.lastSeenAt).getTime();
  if (!Number.isFinite(seen) || seen > now.getTime() + 60000 || now.getTime() - seen > 7 * 86400000) blockers.push("Produto fora da janela de presença de sete dias.");
  const observed = candidate.evidenceObservedAt ? new Date(candidate.evidenceObservedAt).getTime() : NaN;
  if (!Number.isFinite(observed) || observed > now.getTime() + 60000 || now.getTime() - observed > 48 * 3600000) blockers.push("Preço sem observação válida nas últimas 48 horas.");
  if (!candidate.imageUrl) blockers.push("Produto sem imagem para apresentação.");
  if (!Number.isSafeInteger(candidate.priceCents) || candidate.priceCents <= 0) blockers.push("Preço inválido.");
  const evidence = candidate.offerEvidence && typeof candidate.offerEvidence === "object"
    ? candidate.offerEvidence as Record<string, unknown> : {};
  if (typeof evidence.priceMinCents === "number" && typeof evidence.priceMaxCents === "number"
      && evidence.priceMinCents !== evidence.priceMaxCents) {
    blockers.push("O anúncio informa uma faixa de preços; confirme o preço da configuração antes do destaque.");
  }
  return blockers;
}

export function editorialSelectionBlockers(candidate: Parameters<typeof editorialOfferBlockers>[0] & { evidenceFingerprint: string }, assessment: EditorialAssessment | null, now = new Date()): string[] {
  const blockers = editorialOfferBlockers(candidate, now);
  if (!assessment) return [...blockers, "Avaliação do destaque ainda não registrada."];
  const validated = validateEditorialAssessment(assessment, true);
  if (!validated.ok) return [...blockers, "Avaliação incompleta ou inválida."];
  if (assessment.policyVersion !== EDITORIAL_POLICY_VERSION) blockers.push("Avaliação de uma política editorial anterior.");
  if (assessment.evidenceFingerprint !== candidate.evidenceFingerprint) blockers.push("O anúncio mudou depois da avaliação; revise a indicação.");
  if (candidate.priceCents > assessment.maxPriceCents) blockers.push("Preço acima do limite avaliado para a indicação.");
  for (const dimension of EDITORIAL_DIMENSIONS) {
    if (["unknown", "weak"].includes(assessment.dimensions[dimension.id].level)) blockers.push(`${dimension.label} precisa de revisão.`);
  }
  if (assessment.criticalDoubts.length) blockers.push("Há dúvidas essenciais abertas sobre a compra.");
  return blockers;
}

export function validateEditorialSelection(input: unknown, now = new Date()): { ok: true; value: ReplaceEditorialSelectionInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_selection" };
  const raw = input as Record<string, unknown>;
  if (raw.expectedVersion !== null && (!Number.isSafeInteger(raw.expectedVersion) || (raw.expectedVersion as number) < 1)) return { ok: false, error: "invalid_expected_version" };
  const validUntil = typeof raw.validUntil === "string" ? new Date(raw.validUntil) : new Date(NaN);
  if (!Number.isFinite(validUntil.getTime()) || validUntil <= now || validUntil.getTime() > now.getTime() + 7 * 86400000) return { ok: false, error: "invalid_selection_validity" };
  if (!Array.isArray(raw.items) || raw.items.length > EDITORIAL_MAX_PRODUCTS) return { ok: false, error: "selection_limit" };
  const seen = new Set<string>();
  const items: ReplaceEditorialSelectionInput["items"] = [];
  for (const item of raw.items as ReplaceEditorialSelectionInput["items"]) {
    if (!item || typeof item.productId !== "string" || typeof item.assessmentId !== "string" || !idPattern.test(item.productId) || !idPattern.test(item.assessmentId) || seen.has(item.productId)) return { ok: false, error: "invalid_selection_item" };
    if (!Array.isArray(item.destinations) || !item.destinations.length || new Set(item.destinations).size !== item.destinations.length || item.destinations.some((d) => d !== "home" && d !== "pauta")) return { ok: false, error: "invalid_destinations" };
    const context = item.context === undefined ? "" : cleanText(item.context, 0, 500);
    if (context === null || (item.destinations.length === 1 && context.length < 3)) return { ok: false, error: "destination_context_required" };
    seen.add(item.productId);
    items.push({ productId: item.productId, assessmentId: item.assessmentId, destinations: [...item.destinations], context });
  }
  return { ok: true, value: { expectedVersion: raw.expectedVersion as number | null, validUntil: validUntil.toISOString(), items } };
}
