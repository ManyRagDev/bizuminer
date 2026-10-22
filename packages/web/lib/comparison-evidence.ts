/**
 * Módulo puro de comparação e confiança da evidência (OS-028).
 *
 * Responsabilidades:
 * 1. Resolver variante e configuração com base em evidências confirmadas da fonte ("não confirmada" se ausente).
 * 2. Priorização conservadora de evidência para exame: preferir amostras robustas (4,6★/1.500) a amostras
 *    pequenas (4,9★/8) no mesmo marketplace/contexto sem veto, sem gerar falsa alegação de "melhor".
 * 3. Identificação e validação de alegações públicas de superioridade e base comparativa estruturada.
 */

export interface VariantEvidence {
  readonly variantKey: string | null;
  readonly variantLabel: string | null;
  readonly confirmed: boolean;
  readonly description: string;
}

export function resolveVariantEvidence(input: unknown): VariantEvidence {
  if (!input || typeof input !== "object") {
    return { variantKey: null, variantLabel: null, confirmed: false, description: "não confirmada" };
  }
  const rawRec = input as Record<string, unknown>;
  const rec = (rawRec.offerEvidence && typeof rawRec.offerEvidence === "object")
    ? (rawRec.offerEvidence as Record<string, unknown>)
    : rawRec;
  const key = typeof rec.variantKey === "string" && rec.variantKey.trim().length > 0 ? rec.variantKey.trim() : null;
  const label = typeof rec.variantLabel === "string" && rec.variantLabel.trim().length > 0 ? rec.variantLabel.trim() : null;
  if (!key && !label) {
    return { variantKey: null, variantLabel: null, confirmed: false, description: "não confirmada" };
  }

  // Verificação de procedência (BUG-017 / AC-028.1):
  // Exige prova documental de fonte e método de captura na evidência da própria oferta.
  const rawSource = rec.source ?? (rawRec.source && typeof rawRec.source === "object" ? rawRec.source : null);
  const source = rawSource && typeof rawSource === "object" ? (rawSource as Record<string, unknown>) : null;
  const hasValidMarketplaceOrUrl = source !== null && (
    (typeof source.marketplace === "string" && source.marketplace.trim().length > 0) ||
    (typeof source.url === "string" && source.url.trim().length > 0)
  );
  const hasValidMethodOrDate = source !== null && (
    (typeof source.method === "string" && source.method.trim().length > 0) ||
    (typeof source.capturedAt === "string" && !isNaN(Date.parse(source.capturedAt)))
  );

  if (!hasValidMarketplaceOrUrl || !hasValidMethodOrDate) {
    return { variantKey: null, variantLabel: null, confirmed: false, description: "não confirmada" };
  }

  return {
    variantKey: key,
    variantLabel: label,
    confirmed: true,
    description: label || key || "não confirmada",
  };
}

export interface ReviewEvidenceItem {
  readonly id: string;
  readonly marketplace: string;
  readonly ratingStar: number | null;
  readonly reviewCount?: number | null;
  readonly salesCount?: number | null;
  readonly salesLabel?: string | null;
  readonly observedAt?: string | null;
  readonly lowestVerified?: boolean;
  readonly priceCents?: number;
  readonly observationCount?: number;
}

export interface EvidenceComparisonResult {
  readonly prioritizedId: string | null;
  readonly scoreA: number | null;
  readonly scoreB: number | null;
  readonly isClaimOfBest: false;
  readonly reasons: string[];
}

/**
 * Calcula a confiança estatística da nota por suavização Bayesiana.
 * Prior conservador = 4.0 estrelas (piso de nota mínima), peso de incerteza C = 25.
 * Apenas contagem de avaliações inteira não negativa válida recebe score (BUG-022).
 */
export function ratingConfidenceScore(
  ratingStar: number | null,
  reviewCount: number | null | undefined,
): number | null {
  if (typeof ratingStar !== "number" || !Number.isFinite(ratingStar) || ratingStar < 1 || ratingStar > 5) {
    return null;
  }
  if (typeof reviewCount !== "number" || !Number.isSafeInteger(reviewCount) || reviewCount < 0) {
    return null;
  }
  const prior = 4.0;
  const weight = 25;
  return (reviewCount * ratingStar + weight * prior) / (reviewCount + weight);
}

/**
 * Compara dois itens para fins de ORDEM DE EXAME da curadoria (AC-028.2).
 * Não atribui vitória nem gera alegação pública de superioridade ("melhor").
 */
export function compareReviewEvidence(
  a: ReviewEvidenceItem,
  b: ReviewEvidenceItem,
): number {
  const scoreA = ratingConfidenceScore(a.ratingStar, a.reviewCount);
  const scoreB = ratingConfidenceScore(b.ratingStar, b.reviewCount);

  // Veto: nota abaixo do piso (4.0) fica atrás
  const vetoA = (a.ratingStar ?? 0) < 4.0;
  const vetoB = (b.ratingStar ?? 0) < 4.0;
  if (vetoA !== vetoB) return vetoA ? 1 : -1;

  // Menor preço verificado mantém preferência inicial
  const lowA = a.lowestVerified ? 1 : 0;
  const lowB = b.lowestVerified ? 1 : 0;
  if (lowA !== lowB) return lowB - lowA;

  // No mesmo marketplace, compara a robustez estatística da nota se ambos tiverem amostras válidas (BUG-022)
  if (a.marketplace === b.marketplace && scoreA !== null && scoreB !== null) {
    if (Math.abs(scoreA - scoreB) >= 0.02) {
      return scoreB - scoreA;
    }
  }

  // Desempate estável por ID
  return a.id.localeCompare(b.id);
}

/**
 * Produz razões conservadoras e reproduzíveis sobre os limites da comparação entre ofertas.
 */
export function explainEvidenceComparison(
  a: ReviewEvidenceItem,
  b: ReviewEvidenceItem,
): EvidenceComparisonResult {
  const scoreA = ratingConfidenceScore(a.ratingStar, a.reviewCount);
  const scoreB = ratingConfidenceScore(b.ratingStar, b.reviewCount);
  const reasons: string[] = [];

  if (a.marketplace !== b.marketplace) {
    reasons.push("lojas e marketplaces distintos não possuem denominador comparável de vendas");
  }

  const reviewAValid = typeof a.reviewCount === "number" && Number.isSafeInteger(a.reviewCount) && a.reviewCount >= 0;
  const reviewBValid = typeof b.reviewCount === "number" && Number.isSafeInteger(b.reviewCount) && b.reviewCount >= 0;
  if (!reviewAValid || !reviewBValid) {
    reasons.push("amostra de avaliações desconhecida");
  }

  const salesAValid = typeof a.salesCount === "number" && Number.isSafeInteger(a.salesCount) && a.salesCount >= 0;
  const salesBValid = typeof b.salesCount === "number" && Number.isSafeInteger(b.salesCount) && b.salesCount >= 0;
  if (!salesAValid || !salesBValid || Boolean(a.salesLabel && !salesAValid) || Boolean(b.salesLabel && !salesBValid)) {
    reasons.push("vendas aproximadas ou não auditadas");
  }

  if ((a.ratingStar ?? 0) < 4.0 || (b.ratingStar ?? 0) < 4.0) {
    reasons.push("nota abaixo do piso mínimo de 4,0 estrelas");
  }

  if (a.marketplace === b.marketplace && reviewAValid && reviewBValid && (a.ratingStar ?? 0) >= 4.0 && (b.ratingStar ?? 0) >= 4.0) {
    if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
      reasons.push("amostra robusta de avaliações confere maior confiança estatística do que nota alta com poucas avaliações");
    }
  }

  const prioritizedId = compareReviewEvidence(a, b) <= 0 ? a.id : b.id;

  return {
    prioritizedId,
    scoreA: scoreA !== null ? Math.round(scoreA * 1000) / 1000 : null,
    scoreB: scoreB !== null ? Math.round(scoreB * 1000) / 1000 : null,
    isClaimOfBest: false,
    reasons,
  };
}

/** Padrão que detecta alegação inequívoca de superioridade pública (incluindo preço relativo, BUG-023). */
export const SUPERIORITY_CLAIM_PATTERN =
  /(^|[^\p{L}\p{N}])(melhor(es)?|o melhor|a melhor|os melhores|as melhores|superior(es)?|imbat[ií]ve(l|is)|campe[aã](o)?|campe[oõ]es|l[ií]der absoluto|insuper[aá]vel|n[uú]mero 1|nº 1|sem concorrentes?|mais barat[oa]s?|menor(es)? pre[çc]o(s)?|mais em conta)(?=[^\p{L}\p{N}]|$)/iu;

export function hasSuperiorityClaim(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  return SUPERIORITY_CLAIM_PATTERN.test(text);
}

export interface ComparativeEvidenceReference {
  readonly observedAt: string;
  readonly priceCents?: number | null;
  readonly variantKey?: string | null;
  readonly variantLabel?: string | null;
  readonly variantConfirmed?: boolean;
  readonly marketplace?: string | null;
  readonly externalId?: string | null;
  readonly productUrl?: string | null;
  readonly sourceUrl?: string | null;
  readonly sourceMarketplace?: string | null;
  readonly curationStatus?: string | null;
  readonly observationId?: string | null;
  readonly latestCurationEventId?: string | number | null;
  readonly latestEvidenceEventId?: string | number | null;
  readonly materialSequenceMark?: string | null;
  readonly source?: Record<string, unknown> | null;
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed);
    parsed.hash = "";
    let pathname = parsed.pathname;
    if (pathname.endsWith("/") && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * AC-037.3: Avalia se uma projeção de evento é materialmente equivalente à referência canônica.
 * Trata como material: preço diferente, variante diferente/surgida/perdida, loja/ID alterado,
 * URL do produto alterada, URL de origem alterada ou origem ausente/inválida.
 */
export function isMateriallyEquivalent(
  reference: ComparativeEvidenceReference,
  projection: Record<string, any>
): boolean {
  if (!projection || typeof projection !== "object") return false;
  if (projection.deleted === true || projection.operation === "delete") return false;

  // 1. Preço
  if (reference.priceCents != null) {
    if (typeof projection.priceCents !== "number" || projection.priceCents !== reference.priceCents) {
      return false;
    }
  }

  // 2. Variante e configuração
  if (reference.variantConfirmed) {
    if (!projection.variantConfirmed || projection.variantKey !== reference.variantKey) {
      return false;
    }
  } else {
    if (projection.variantConfirmed || (projection.variantKey != null && projection.variantKey !== "")) {
      return false;
    }
  }

  // 3. Loja e ID externo
  if (reference.marketplace && projection.marketplace && reference.marketplace !== projection.marketplace) {
    return false;
  }
  if (reference.externalId && projection.externalId && reference.externalId !== projection.externalId) {
    return false;
  }

  // 4. URL do produto
  if (reference.productUrl && projection.productUrl) {
    if (normalizeUrl(reference.productUrl) !== normalizeUrl(projection.productUrl)) {
      return false;
    }
  }

  // 5. Origem / URL da fonte
  const refSourceUrl = reference.sourceUrl ?? (reference.source && typeof reference.source.url === "string" ? reference.source.url : null);
  const projSourceUrl = projection.sourceUrl ?? (projection.source && typeof projection.source.url === "string" ? projection.source.url : null);

  if (refSourceUrl) {
    if (!projSourceUrl || normalizeUrl(refSourceUrl) !== normalizeUrl(projSourceUrl)) {
      return false;
    }
  } else if (projSourceUrl) {
    return false;
  }

  return true;
}

export interface ComparativeBasis {
  readonly version: string;
  readonly candidateProductId?: string;
  readonly checkedAt?: string;
  readonly usageScope?: string | null;
  readonly priceRange?: { readonly minCents?: number | null; readonly maxCents?: number | null } | null;
  readonly alternativeProductIds: readonly string[];
  readonly criteria?: readonly string[];
  readonly evidenceReferences?: Record<string, ComparativeEvidenceReference>;
  readonly rationale: string;
}

function normalizeRationale(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\p{M}]/gu, "")
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, " ")
    .trim();
}

export function validateComparativeBasis(
  input: unknown,
  mainProductId?: string,
  publicRationale?: string,
): { ok: true; value: ComparativeBasis } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "comparative_basis_required" };
  const raw = input as Record<string, unknown>;
  const version = typeof raw.version === "string" && raw.version.trim().length > 0 ? raw.version.trim() : "v1";

  if (!Array.isArray(raw.alternativeProductIds) || raw.alternativeProductIds.length === 0) {
    return { ok: false, error: "comparative_basis_alternatives_required" };
  }
  const altIds: string[] = [];
  const seen = new Set<string>();
  const effectiveMainId = mainProductId ?? (typeof raw.candidateProductId === "string" ? raw.candidateProductId.trim() : undefined);
  for (const item of raw.alternativeProductIds) {
    if (typeof item !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(item.trim())) {
      return { ok: false, error: "invalid_alternative_product_id" };
    }
    const cleanId = item.trim();
    if (effectiveMainId && cleanId === effectiveMainId) {
      return { ok: false, error: "alternative_cannot_be_self" };
    }
    if (seen.has(cleanId)) {
      return { ok: false, error: "duplicate_alternative_product_id" };
    }
    seen.add(cleanId);
    altIds.push(cleanId);
  }

  const usageScope = typeof raw.usageScope === "string" && raw.usageScope.trim().length >= 3 ? raw.usageScope.trim() : null;

  let priceRange: { minCents?: number | null; maxCents?: number | null } | null = null;
  if (raw.priceRange && typeof raw.priceRange === "object") {
    const pr = raw.priceRange as Record<string, unknown>;
    const minCents = typeof pr.minCents === "number" && Number.isSafeInteger(pr.minCents) && pr.minCents >= 0 ? pr.minCents : null;
    const maxCents = typeof pr.maxCents === "number" && Number.isSafeInteger(pr.maxCents) && pr.maxCents >= 0 ? pr.maxCents : null;
    if (minCents !== null || maxCents !== null) {
      priceRange = { minCents, maxCents };
    }
  }

  // BUG-020: checkedAt informado não substitui recorte de uso nem faixa de preço
  if (!usageScope && !priceRange) {
    return { ok: false, error: "comparative_basis_scope_or_price_required" };
  }

  // BUG-020: ao menos um critério explícito obrigatório
  const criteria = Array.isArray(raw.criteria)
    ? raw.criteria.map((c) => (typeof c === "string" ? c.trim() : "")).filter((c) => c.length > 0)
    : [];
  if (criteria.length === 0) {
    return { ok: false, error: "comparative_basis_criteria_required" };
  }

  // BUG-020: referências atuais de oferta para o candidato e cada alternativa obrigatórias
  if (!raw.evidenceReferences || typeof raw.evidenceReferences !== "object") {
    return { ok: false, error: "comparative_basis_references_required" };
  }
  const rawRefs = raw.evidenceReferences as Record<string, any>;
  if (effectiveMainId && !rawRefs[effectiveMainId]) {
    return { ok: false, error: "comparative_basis_references_required" };
  }
  for (const altId of altIds) {
    if (!rawRefs[altId]) {
      return { ok: false, error: "comparative_basis_references_required" };
    }
  }
  const evidenceReferences: Record<string, ComparativeEvidenceReference> = {};
  for (const [id, ref] of Object.entries(rawRefs)) {
    if (!ref || typeof ref !== "object") {
      return { ok: false, error: "comparative_basis_references_required" };
    }
    const observedAt = typeof ref.observedAt === "string" && !isNaN(Date.parse(ref.observedAt))
      ? new Date(ref.observedAt).toISOString()
      : null;
    const priceCents = typeof ref.priceCents === "number" && Number.isSafeInteger(ref.priceCents) && ref.priceCents > 0
      ? ref.priceCents
      : null;
    if (!observedAt || priceCents === null) {
      return { ok: false, error: "comparative_basis_references_required" };
    }
    evidenceReferences[id] = {
      observedAt,
      priceCents,
      variantKey: typeof ref.variantKey === "string" ? ref.variantKey.trim() : null,
      variantLabel: typeof ref.variantLabel === "string" ? ref.variantLabel.trim() : null,
      variantConfirmed: typeof ref.variantConfirmed === "boolean" ? ref.variantConfirmed : undefined,
      marketplace: typeof ref.marketplace === "string" ? ref.marketplace.trim() : null,
      externalId: typeof ref.externalId === "string" ? ref.externalId.trim() : null,
      productUrl: typeof ref.productUrl === "string" ? ref.productUrl.trim() : null,
      sourceUrl: typeof ref.sourceUrl === "string" ? ref.sourceUrl.trim() : null,
      sourceMarketplace: typeof ref.sourceMarketplace === "string" ? ref.sourceMarketplace.trim() : null,
      curationStatus: typeof ref.curationStatus === "string" ? ref.curationStatus.trim() : undefined,
      observationId: typeof ref.observationId === "string" ? ref.observationId.trim() : undefined,
      latestCurationEventId: ref.latestCurationEventId != null ? String(ref.latestCurationEventId) : undefined,
      latestEvidenceEventId: ref.latestEvidenceEventId != null ? String(ref.latestEvidenceEventId) : undefined,
      materialSequenceMark: typeof ref.materialSequenceMark === "string" ? ref.materialSequenceMark.trim() : undefined,
      source: ref.source && typeof ref.source === "object" ? ref.source : undefined,
    };
  }

  const rationale = typeof raw.rationale === "string" && raw.rationale.trim().length >= 3 ? raw.rationale.trim() : null;
  if (!rationale) {
    return { ok: false, error: "comparative_basis_rationale_required" };
  }

  // BUG-020 / AC-036.4: justificativa independente da alegação pública
  if (publicRationale && normalizeRationale(rationale) === normalizeRationale(publicRationale)) {
    return { ok: false, error: "comparative_basis_rationale_must_be_distinct" };
  }

  const checkedAt = typeof raw.checkedAt === "string" && !isNaN(Date.parse(raw.checkedAt))
    ? new Date(raw.checkedAt).toISOString()
    : undefined;
  const candidateProductId = typeof raw.candidateProductId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(raw.candidateProductId.trim())
    ? raw.candidateProductId.trim()
    : (mainProductId ?? undefined);

  return {
    ok: true,
    value: {
      version,
      candidateProductId,
      checkedAt,
      usageScope,
      priceRange,
      alternativeProductIds: altIds,
      criteria,
      evidenceReferences,
      rationale,
    },
  };
}
