/**
 * Contratos de Métricas de Aprendizado e Experimentos de Políticas (EP-09 / C-07 / C-08).
 *
 * Regras normativas:
 * 1. Métricas possuem numerador, denominador e coorte explícitos.
 * 2. Divisão por zero ou ausência de dados observados resultam em value: null e motivo em limitations.
 * 3. Proibido calcular CTR sem dados de impressões reais (não usar cliques brutos como taxa de conversão).
 * 4. Promoção de política exige revisão humana auditada e tamanho mínimo de amostra.
 */

export interface MetricResult {
  readonly key: string;
  readonly value: number | null;
  readonly unit: "percent" | "ratio" | "count" | "currency_cents" | "seconds";
  readonly source: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly cohortDefinition: string;
  readonly numerator?: number;
  readonly denominator?: number;
  readonly sampleSize: number;
  readonly coverage: number;
  readonly attributionMethod: string;
  readonly limitations: readonly string[];
  readonly policyVersions: readonly string[];
}

export type PolicyExperimentStatus = "draft" | "shadow" | "reviewed" | "promoted" | "rejected";

export interface PolicyExperiment {
  readonly id: string;
  readonly tenantId: string;
  readonly baselineVersion: string;
  readonly candidateVersion: string;
  readonly hypothesis: string;
  readonly cohortSpec: Record<string, unknown>;
  readonly primaryMetric: string;
  readonly minSample: number;
  readonly startedAt: string;
  readonly endedAt?: string | null;
  readonly status: PolicyExperimentStatus;
  readonly promotionRationale?: string | null;
  readonly promotedBy?: string | null;
  readonly createdAt: string;
}

/**
 * Constrói um MetricResult auditável, garantindo que ausência de observações ou denominadores
 * nulos resultem honestamente em value: null com limitações documentadas.
 */
export function buildMetricResult(params: {
  key: string;
  numerator?: number | null;
  denominator?: number | null;
  unit: "percent" | "ratio" | "count" | "currency_cents" | "seconds";
  source: string;
  windowStart: string;
  windowEnd: string;
  cohortDefinition: string;
  sampleSize: number;
  coverage?: number;
  attributionMethod: string;
  policyVersions?: readonly string[];
  extraLimitations?: readonly string[];
}): MetricResult {
  const limitations: string[] = [...(params.extraLimitations || [])];

  if (params.denominator === 0 || params.denominator === null || params.denominator === undefined) {
    if (params.unit === "percent" || params.unit === "ratio") {
      limitations.push("Denominador ausente ou zero na janela observada. Taxa não calculável.");
      return {
        key: params.key,
        value: null,
        unit: params.unit,
        source: params.source,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        cohortDefinition: params.cohortDefinition,
        numerator: params.numerator ?? undefined,
        denominator: params.denominator ?? undefined,
        sampleSize: params.sampleSize,
        coverage: params.coverage ?? 0,
        attributionMethod: params.attributionMethod,
        limitations,
        policyVersions: params.policyVersions ?? [],
      };
    }
  }

  if (
    params.numerator === null ||
    params.numerator === undefined ||
    !Number.isFinite(params.numerator)
  ) {
    limitations.push("Numerador ausente ou inválido na janela observada.");
    return {
      key: params.key,
      value: null,
      unit: params.unit,
      source: params.source,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      cohortDefinition: params.cohortDefinition,
      numerator: params.numerator ?? undefined,
      denominator: params.denominator ?? undefined,
      sampleSize: params.sampleSize,
      coverage: params.coverage ?? 0,
      attributionMethod: params.attributionMethod,
      limitations,
      policyVersions: params.policyVersions ?? [],
    };
  }

  let value: number | null = null;
  if (params.unit === "percent") {
    value = Number(((params.numerator! / params.denominator!) * 100).toFixed(2));
  } else if (params.unit === "ratio") {
    value = Number((params.numerator! / params.denominator!).toFixed(4));
  } else {
    value = params.numerator ?? null;
  }

  return {
    key: params.key,
    value,
    unit: params.unit,
    source: params.source,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    cohortDefinition: params.cohortDefinition,
    numerator: params.numerator ?? undefined,
    denominator: params.denominator ?? undefined,
    sampleSize: params.sampleSize,
    coverage: params.coverage ?? (params.sampleSize > 0 ? 1 : 0),
    attributionMethod: params.attributionMethod,
    limitations,
    policyVersions: params.policyVersions ?? [],
  };
}

/**
 * Valida a promoção de um experimento de política editorial.
 * Falha se a amostra for insuficiente ou se faltar justificativa humana.
 */
export function validatePolicyPromotion(params: {
  experiment: PolicyExperiment;
  currentSampleSize: number;
  promotedBy: string;
  promotionRationale: string;
}): { canPromote: boolean; blockerReason?: string } {
  if (params.experiment.status !== "reviewed") {
    return {
      canPromote: false,
      blockerReason: `Experimento no estado '${params.experiment.status}' não pode ser promovido; status 'reviewed' é obrigatório.`,
    };
  }

  if (params.currentSampleSize < params.experiment.minSample) {
    return {
      canPromote: false,
      blockerReason: `Amostra observada (${params.currentSampleSize}) inferior ao mínimo exigido (${params.experiment.minSample}).`,
    };
  }

  if (!params.promotedBy || !params.promotionRationale.trim()) {
    return {
      canPromote: false,
      blockerReason: "Aprovação humana exige identificação do responsável e justificativa técnica formal.",
    };
  }

  return { canPromote: true };
}
