/**
 * Motor canônico de evidência de preço e alegações comerciais (EP-01 / C-02).
 *
 * Implementa a máquina de estados E0, E1, E2, E3:
 * - E0: Sem pontos anteriores no catálogo.
 * - E1: Histórico existe, mas não comparável (variante diferente, configuração
 *       desconhecida, moeda diferente ou preço inválido).
 * - E2: Histórico comparável na janela. Permite "observed_drop" em relação ao
 *       preço anterior ou mediana da amostra, sem alegação de recorde.
 * - E3: Cobertura temporal homologada (OPEN-03 / G-PRICE). Permite
 *       "historical_observed_minimum" (menor preço verificado dos últimos X dias).
 *       Permanece desligado por padrão (e3Enabled = false) até aprovação de política.
 *
 * Preserva compatibilidade com projeções legadas lowestVerified e previousMinPriceCents.
 */

import { calculateContentDigest } from "./commerce-contract.ts";
export type PriceEvidenceState = "E0" | "E1" | "E2" | "E3";

export interface OfferEvidence {
  readonly version?: number;
  readonly variantKey?: string;
  readonly variantLabel?: string;
  readonly packageContents?: readonly string[];
  readonly packageQuantity?: number;
  readonly dimensions?: string;
  readonly priceMinCents?: number;
  readonly priceMaxCents?: number;
  readonly currency?: string;
  readonly sellerId?: string;
  readonly priceType?: "exact" | "from" | "range" | "unknown";
  readonly fieldStates?: Readonly<Record<string, "observed" | "source_claimed" | "absent" | "not_applicable">>;
  readonly variantIdentity?: {
    readonly state: "source_verified" | "human_verified" | "inferred" | "unknown";
    readonly key?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly conditions?: {
    readonly quantity?: number;
    readonly payment?: string;
    readonly shipping?: string;
    readonly coupon?: string;
    readonly region?: string;
  };
}

export type AllowedClaimType =
  | "observed_current_price"
  | "observed_drop"
  | "historical_observed_minimum"
  | "seller_claimed_discount"
  | "coupon_condition_if_verified"
  | "limited_stock_if_verified"
  | "sourced_attribute"
  | "qualified_quality_assessment";

export interface Claim {
  readonly id: string;
  readonly type: AllowedClaimType;
  readonly observationIds: readonly string[];
  readonly evidenceDigest: string;
  readonly policyVersion: string;
  readonly scope: string;
  readonly conditions?: Readonly<Record<string, unknown>>;
  readonly validUntil?: string;
  readonly textParameters?: Readonly<Record<string, unknown>>;
}

export interface PriceEvidence {
  readonly schemaVersion: 2;
  readonly tenantId: string;
  readonly productId: string;
  readonly currentObservationId: string;
  readonly configurationKey: string | null;
  readonly comparisonScope: string;
  readonly state: PriceEvidenceState;
  readonly observedAt: string;
  readonly validUntil: string;
  readonly currency: string;
  readonly priceCents: number;
  readonly priorMinCents: number | null;
  readonly medianCents: number | null;
  readonly priorCount: number;
  readonly distinctDays: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly coverageRatio: number;
  readonly maxGapHours: number;
  readonly excludedCount: number;
  readonly unknowns: readonly string[];
  readonly policyVersion: string;
  readonly evidenceDigest: string;
  readonly allowedClaims: readonly Claim[];
}

export interface PriceEvidencePolicyConfig {
  readonly windowDays: number;
  readonly bucketHours: number;
  readonly minimumPriorCount: number;
  readonly minimumDistinctDays: number;
  readonly maximumGapHours: number;
  readonly minimumCoverageRatio: number;
  readonly maxAgeHours: number;
  readonly scope: string;
  readonly e3Enabled: boolean;
}

export const DEFAULT_PRICE_EVIDENCE_POLICY: PriceEvidencePolicyConfig = {
  windowDays: 30,
  bucketHours: 24,
  minimumPriorCount: 3,
  minimumDistinctDays: 3,
  maximumGapHours: 72,
  minimumCoverageRatio: 0.7,
  maxAgeHours: 48,
  scope: "listing_price_excluding_shipping",
  e3Enabled: false, // E3 desligado até calibração e aprovação de política comercial (G-PRICE)
};

export interface PriceObservationInput {
  readonly id: string;
  readonly priceCents: number;
  readonly originalPriceCents?: number | null;
  readonly observedAt: Date | string;
  readonly offerEvidence?: OfferEvidence | null;
  readonly currency?: string | null;
}

/**
 * Constrói a chave canônica da configuração física/comercial.
 *
 * "Dois desconhecidos não são iguais. Estado inferred nunca passa por verified."
 * Se a variante não foi informada ou é desconhecida/inferida, devolve null.
 */
export function buildConfigurationKey(evidence?: OfferEvidence | null): string | null {
  if (!evidence) return null;

  // Extrai chave de variante e atributos se verificados
  let variantKey: string | undefined;
  if ("variantIdentity" in evidence && evidence.variantIdentity) {
    const ident = evidence.variantIdentity;
    if (ident.state === "source_verified" || ident.state === "human_verified") {
      variantKey = ident.key;
    } else {
      // Estado inferred ou unknown não passa por verificado
      return null;
    }
  } else if (evidence.variantKey) {
    variantKey = evidence.variantKey;
  }

  if (!variantKey) return null;

  // Rejeita faixa de preço como preço único
  if (
    evidence.priceMinCents !== undefined &&
    evidence.priceMaxCents !== undefined &&
    evidence.priceMinCents !== evidence.priceMaxCents
  ) {
    return null;
  }

  if (evidence.priceType && evidence.priceType !== "exact") return null;
  const quantity = evidence.packageQuantity ?? evidence.conditions?.quantity;
  if (!Number.isSafeInteger(quantity) || !quantity || quantity < 1) return null;
  const material: Record<string, unknown> = {
    sellerId: evidence.sellerId, contents: evidence.packageContents, dimensions: evidence.dimensions,
    payment: evidence.conditions?.payment, coupon: evidence.conditions?.coupon, region: evidence.conditions?.region,
  };
  for (const [field, value] of Object.entries(material)) {
    if (value === undefined || value === null || value === "") {
      const stateField = field === "contents" ? "packageContents" : field;
      if (evidence.fieldStates?.[stateField] !== "not_applicable") return null;
      material[field] = null;
    }
  }

  return JSON.stringify({
    variantKey,
    quantity,
    attributes: Object.fromEntries(Object.entries(evidence.variantIdentity?.attributes ?? {}).sort(([a],[b])=>a.localeCompare(b))),
    ...material,
  });
}

function parseDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function computeMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Avalia o histórico de observações de um produto sob as regras de C-02.
 */
export function calculatePriceEvidence(input: {
  tenantId: string;
  productId: string;
  currentObservationId: string;
  observations: readonly PriceObservationInput[];
  policy?: PriceEvidencePolicyConfig;
  policyVersion?: string;
  policyStatus?: "draft" | "approved" | "retired";
  calibrationVerified?: boolean;
  calibrationReportRef?: string | null;
  now?: Date;
}): PriceEvidence {
  const policy = input.policy ?? DEFAULT_PRICE_EVIDENCE_POLICY;
  if (![policy.windowDays,policy.bucketHours,policy.maxAgeHours].every(n=>Number.isFinite(n)&&n>0)
    || ![policy.minimumPriorCount,policy.minimumDistinctDays].every(n=>Number.isSafeInteger(n)&&n>=0)
    || !Number.isFinite(policy.maximumGapHours)||policy.maximumGapHours<0
    || !Number.isFinite(policy.minimumCoverageRatio)||policy.minimumCoverageRatio<0||policy.minimumCoverageRatio>1) throw new Error("invalid_policy");
  const policyVersion = input.policyVersion ?? "1.0.0";
  const now = input.now ?? new Date();

  // 1. Localiza a observação corrente
  const currentObs = input.observations.find((o) => o.id === input.currentObservationId);
  if (!currentObs) {
    throw new Error(`Observação corrente não encontrada: ${input.currentObservationId}`);
  }

  const currentObsDate = parseDate(currentObs.observedAt);
  if (!Number.isSafeInteger(currentObs.priceCents) || currentObs.priceCents <= 0 || !Number.isFinite(currentObsDate.getTime())) throw new Error("invalid_observation");
  const currency = currentObs.currency || currentObs.offerEvidence?.currency || "UNKNOWN";
  const currentConfigKey = buildConfigurationKey(currentObs.offerEvidence);

  // Janela da política
  const windowMs = policy.windowDays * 24 * 60 * 60 * 1000;
  const windowStart = new Date(currentObsDate.getTime() - windowMs);
  const windowEnd = currentObsDate;
  const validUntil = new Date(currentObsDate.getTime() + policy.maxAgeHours * 60 * 60 * 1000).toISOString();

  // 2. Ordena observações cronologicamente por (observedAt, id)
  const sortedObs = [...input.observations].sort((a, b) => {
    const tA = parseDate(a.observedAt).getTime();
    const tB = parseDate(b.observedAt).getTime();
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });

  // 3. Filtra pontos anteriores (excluindo a observação corrente)
  const priors = sortedObs.filter((o) => {
    if (o.id === currentObs.id) return false;
    const t = parseDate(o.observedAt).getTime();
    return t < currentObsDate.getTime() && o.priceCents > 0;
  });

  const evidenceDigest = (state: PriceEvidenceState) => calculateContentDigest({tenantId:input.tenantId,productId:input.productId,
    currentObservationId:input.currentObservationId,state,policy,policyVersion,policyStatus:input.policyStatus??"draft",
    observations:sortedObs.map(o=>({...o,observedAt:parseDate(o.observedAt).toISOString()}))});
  const unknowns: string[] = [];
  if (!currentConfigKey) {
    unknowns.push("configuration_unverified");
  }
  if (!currentObs.currency && !(currentObs.offerEvidence && "currency" in currentObs.offerEvidence)) {
    unknowns.push("currency_unknown");
  }
  if (policy.e3Enabled && (input.policyStatus !== "approved" || input.calibrationVerified === false)) {
    unknowns.push("e3_calibration_unratified");
  }

  // 4. Sem pontos anteriores válidos -> E0
  if (priors.length === 0) {
    const digest = evidenceDigest("E0");

    const claims: Claim[] = [
      {
        id: `clm-${digest.slice(0, 12)}-curr`,
        type: "observed_current_price",
        observationIds: [currentObs.id],
        evidenceDigest: digest,
        policyVersion,
        scope: policy.scope,
        validUntil,
        textParameters: { priceCents: currentObs.priceCents, currency },
      },
    ];

    if (currentObs.originalPriceCents && currentObs.originalPriceCents > currentObs.priceCents) {
      claims.push({
        id: `clm-${digest.slice(0, 12)}-seller`,
        type: "seller_claimed_discount",
        observationIds: [currentObs.id],
        evidenceDigest: digest,
        policyVersion,
        scope: policy.scope,
        validUntil,
        textParameters: {
          originalPriceCents: currentObs.originalPriceCents,
          priceCents: currentObs.priceCents,
          discountRate: (currentObs.originalPriceCents - currentObs.priceCents) / currentObs.originalPriceCents,
        },
      });
    }

    return {
      schemaVersion: 2,
      tenantId: input.tenantId,
      productId: input.productId,
      currentObservationId: currentObs.id,
      configurationKey: currentConfigKey,
      comparisonScope: policy.scope,
      state: "E0",
      observedAt: currentObsDate.toISOString(),
      validUntil,
      currency,
      priceCents: currentObs.priceCents,
      priorMinCents: null,
      medianCents: null,
      priorCount: 0,
      distinctDays: 0,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      coverageRatio: 0,
      maxGapHours: 0,
      excludedCount: 0,
      unknowns,
      policyVersion,
      evidenceDigest: digest,
      allowedClaims: claims,
    };
  }

  // 5. Filtra observações comparáveis (mesma configuração verificada, mesma moeda, dentro da janela)
  const comparablePriors = priors.filter((o) => {
    // Mesma moeda
    const oCurrency = o.currency || o.offerEvidence?.currency || "UNKNOWN";
    if (currency === "UNKNOWN" || oCurrency !== currency) return false;

    // Data dentro da janela
    const oTime = parseDate(o.observedAt).getTime();
    if (oTime < windowStart.getTime()) return false;

    // Configuração idêntica comprovada (dois desconhecidos não são iguais)
    if (!currentConfigKey) return false;
    const oConfigKey = buildConfigurationKey(o.offerEvidence);
    return oConfigKey !== null && oConfigKey === currentConfigKey;
  });

  const excludedCount = priors.length - comparablePriors.length;

  // 6. Sem comparáveis -> E1
  if (comparablePriors.length === 0) {
    const digest = evidenceDigest("E1");

    const claims: Claim[] = [
      {
        id: `clm-${digest.slice(0, 12)}-curr`,
        type: "observed_current_price",
        observationIds: [currentObs.id],
        evidenceDigest: digest,
        policyVersion,
        scope: policy.scope,
        validUntil,
        textParameters: { priceCents: currentObs.priceCents, currency },
      },
    ];

    if (currentObs.originalPriceCents && currentObs.originalPriceCents > currentObs.priceCents) {
      claims.push({
        id: `clm-${digest.slice(0, 12)}-seller`,
        type: "seller_claimed_discount",
        observationIds: [currentObs.id],
        evidenceDigest: digest,
        policyVersion,
        scope: policy.scope,
        validUntil,
        textParameters: {
          originalPriceCents: currentObs.originalPriceCents,
          priceCents: currentObs.priceCents,
          discountRate: (currentObs.originalPriceCents - currentObs.priceCents) / currentObs.originalPriceCents,
        },
      });
    }

    return {
      schemaVersion: 2,
      tenantId: input.tenantId,
      productId: input.productId,
      currentObservationId: currentObs.id,
      configurationKey: currentConfigKey,
      comparisonScope: policy.scope,
      state: "E1",
      observedAt: currentObsDate.toISOString(),
      validUntil,
      currency,
      priceCents: currentObs.priceCents,
      priorMinCents: null,
      medianCents: null,
      priorCount: 0,
      distinctDays: 0,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      coverageRatio: 0,
      maxGapHours: 0,
      excludedCount,
      unknowns: [...unknowns, "comparable_history_absent"],
      policyVersion,
      evidenceDigest: digest,
      allowedClaims: claims,
    };
  }

  // 7. Calcula métricas da série comparável
  const priorPrices = comparablePriors.map((o) => o.priceCents);
  const priorMinCents = Math.min(...priorPrices);
  const medianCents = computeMedian(priorPrices);
  const priorCount = comparablePriors.length;

  // Dias distintos observados (formato YYYY-MM-DD em UTC)
  const distinctDaysSet = new Set<string>();
  for (const o of comparablePriors) {
    const dStr = parseDate(o.observedAt).toISOString().slice(0, 10);
    distinctDaysSet.add(dStr);
  }
  const distinctDays = distinctDaysSet.size;

  // Cobertura por buckets
  const totalBuckets = Math.max(1, Math.ceil((policy.windowDays * 24) / policy.bucketHours));
  const coveredBuckets = new Set<number>();
  for (const o of comparablePriors) {
    const oTime = parseDate(o.observedAt).getTime();
    const bucketIndex = Math.floor((oTime - windowStart.getTime()) / (policy.bucketHours * 60 * 60 * 1000));
    if (bucketIndex >= 0 && bucketIndex < totalBuckets) {
      coveredBuckets.add(bucketIndex);
    }
  }
  const coverageRatio = Number((coveredBuckets.size / totalBuckets).toFixed(4));

  // Maior lacuna em horas (inclui bordas)
  let maxGapHours = 0;
  let previousTime = windowStart.getTime();
  for (const o of comparablePriors) {
    const oTime = parseDate(o.observedAt).getTime();
    const gapH = (oTime - previousTime) / (60 * 60 * 1000);
    if (gapH > maxGapHours) maxGapHours = gapH;
    previousTime = oTime;
  }
  const endGapH = (currentObsDate.getTime() - previousTime) / (60 * 60 * 1000);
  if (endGapH > maxGapHours) maxGapHours = endGapH;
  maxGapHours = Number(maxGapHours.toFixed(1));

  // 8. Determina estado: E3 (se e3Enabled e critérios cumpridos) ou E2
  const meetsE3Criteria =
    input.policyStatus === "approved" &&
    input.calibrationVerified !== false &&
    now.getTime() >= currentObsDate.getTime() && now.getTime() < new Date(validUntil).getTime() &&
    policy.e3Enabled &&
    priorCount >= policy.minimumPriorCount &&
    distinctDays >= policy.minimumDistinctDays &&
    coveredBuckets.size / totalBuckets >= policy.minimumCoverageRatio &&
    (Math.max(endGapH, ...comparablePriors.map((o,i) => (parseDate(o.observedAt).getTime() - (i ? parseDate(comparablePriors[i-1]!.observedAt).getTime() : windowStart.getTime())) / 3600000))) <= policy.maximumGapHours;

  const state: PriceEvidenceState = meetsE3Criteria ? "E3" : "E2";

  const digest = evidenceDigest(state);

  // 9. Monta alegações permitidas
  const claims: Claim[] = [
    {
      id: `clm-${digest.slice(0, 12)}-curr`,
      type: "observed_current_price",
      observationIds: [currentObs.id],
      evidenceDigest: digest,
      policyVersion,
      scope: policy.scope,
      validUntil,
      textParameters: { priceCents: currentObs.priceCents, currency },
    },
  ];

  if (currentObs.originalPriceCents && currentObs.originalPriceCents > currentObs.priceCents) {
    claims.push({
      id: `clm-${digest.slice(0, 12)}-seller`,
      type: "seller_claimed_discount",
      observationIds: [currentObs.id],
      evidenceDigest: digest,
      policyVersion,
      scope: policy.scope,
      validUntil,
      textParameters: {
        originalPriceCents: currentObs.originalPriceCents,
        priceCents: currentObs.priceCents,
        discountRate: (currentObs.originalPriceCents - currentObs.priceCents) / currentObs.originalPriceCents,
      },
    });
  }

  // Queda observada ou recorde histórico
  if (currentObs.priceCents < priorMinCents) {
    if (state === "E3") {
      claims.push({
        id: `clm-${digest.slice(0, 12)}-hist-min`,
        type: "historical_observed_minimum",
        observationIds: [currentObs.id, ...comparablePriors.map((o) => o.id)],
        evidenceDigest: digest,
        policyVersion,
        scope: policy.scope,
        validUntil,
        textParameters: {
          currentPriceCents: currentObs.priceCents,
          priorMinCents,
          windowDays: policy.windowDays,
          discountUnderPriorMin: (priorMinCents - currentObs.priceCents) / priorMinCents,
        },
      });
    } else {
      // E2: somente queda observada em relação à amostra anterior, sem claim de recorde
      const lowestPriorObs = comparablePriors.reduce((min, cur) => (cur.priceCents < min.priceCents ? cur : min), comparablePriors[0]!);
      claims.push({
        id: `clm-${digest.slice(0, 12)}-drop`,
        type: "observed_drop",
        observationIds: [currentObs.id, lowestPriorObs.id],
        evidenceDigest: digest,
        policyVersion,
        scope: policy.scope,
        validUntil,
        textParameters: {
          currentPriceCents: currentObs.priceCents,
          referencePriceCents: priorMinCents,
          referenceObservedAt: parseDate(lowestPriorObs.observedAt).toISOString(),
          dropRate: (priorMinCents - currentObs.priceCents) / priorMinCents,
        },
      });
    }
  } else if (medianCents !== null && currentObs.priceCents < medianCents) {
    claims.push({
      id: `clm-${digest.slice(0, 12)}-drop-med`,
      type: "observed_drop",
      observationIds: [currentObs.id],
      evidenceDigest: digest,
      policyVersion,
      scope: policy.scope,
      validUntil,
      textParameters: {
        currentPriceCents: currentObs.priceCents,
        referencePriceCents: medianCents,
        dropRate: (medianCents - currentObs.priceCents) / medianCents,
        isMedianSample: true,
      },
    });
  }

  return {
    schemaVersion: 2,
    tenantId: input.tenantId,
    productId: input.productId,
    currentObservationId: currentObs.id,
    configurationKey: currentConfigKey,
    comparisonScope: policy.scope,
    state,
    observedAt: currentObsDate.toISOString(),
    validUntil,
    currency,
    priceCents: currentObs.priceCents,
    priorMinCents,
    medianCents,
    priorCount,
    distinctDays,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    coverageRatio,
    maxGapHours,
    excludedCount,
    unknowns,
    policyVersion,
    evidenceDigest: digest,
    allowedClaims: claims,
  };
}

/**
 * Projeta o PriceEvidence canônico para os campos legados esperados pelas telas e APIs:
 * - lowestVerified: true SOMENTE se o estado for E3 (cobertura homologada) e o preço atual for <= mínimo anterior.
 *   Com E3 desabilitado (padrão), lowestVerified é SEMPRE false.
 * - previousMinPriceCents: priorMinCents quando em E2 ou E3; null quando em E0 ou E1.
 * - minPriceCents: menor preço conhecido (incluindo o atual) quando em E2/E3; null se não comparável.
 */
export function projectCanonicalToLegacy(evidence: PriceEvidence): {
  lowestVerified: boolean;
  lowest_verified: boolean;
  previousMinPriceCents: number | null;
  previous_min_price_cents: number | null;
  minPriceCents: number | null;
  min_price_cents: number | null;
} {
  const isLowest = evidence.state === "E3" && evidence.priorMinCents !== null && evidence.priceCents <= evidence.priorMinCents;
  const previousMin = (evidence.state === "E2" || evidence.state === "E3") ? evidence.priorMinCents : null;
  const minPrice = (evidence.state === "E2" || evidence.state === "E3")
    ? Math.min(evidence.priceCents, evidence.priorMinCents ?? evidence.priceCents)
    : null;

  return {
    lowestVerified: isLowest,
    lowest_verified: isLowest,
    previousMinPriceCents: previousMin,
    previous_min_price_cents: previousMin,
    minPriceCents: minPrice,
    min_price_cents: minPrice,
  };
}

/**
 * Casos de Calibração EXP-02 (C-02 / EP-01 / OPEN-03 / G-PRICE).
 *
 * Avalia 10 casos reais e contrastantes de série temporal de preço:
 * 1. Ponto isolado (E0)
 * 2. Histórico com variante inferida ou não verificada (E1)
 * 3. Moeda diferente no histórico (E1)
 * 4. Preço de faixa não-exato (E1)
 * 5. Seller sem comprovação e sem not_applicable (E1)
 * 6. Quantidade de pacote diferente (E1)
 * 7. Histórico comparável, mas E3 desabilitado na política (E2)
 * 8. Política em draft com e3Enabled=true não promove sem aprovação formal (E2)
 * 9. Política aprovada, mas lacuna superior ao máximo permitido (E2)
 * 10. Cobertura plena homologada com e3Enabled=true e menor preço (E3)
 */
export interface CalibrationCase {
  readonly id: string;
  readonly description: string;
  readonly currentPriceCents: number;
  readonly originalPriceCents?: number | null;
  readonly currency: string;
  readonly observedAt: string;
  readonly offerEvidence: OfferEvidence;
  readonly priors: readonly PriceObservationInput[];
  readonly expectedState: PriceEvidenceState;
  readonly policy?: PriceEvidencePolicyConfig;
  readonly policyStatus?: "draft" | "approved";
}

export interface CalibrationReport {
  readonly totalCases: number;
  readonly passedCases: number;
  readonly pass: boolean;
  readonly results: readonly {
    readonly id: string;
    readonly description: string;
    readonly expectedState: PriceEvidenceState;
    readonly actualState: PriceEvidenceState;
    readonly matches: boolean;
    readonly unknowns: readonly string[];
  }[];
}

export function runCalibrationEXP02(cases: readonly CalibrationCase[], defaultNow?: Date): CalibrationReport {
  const results = cases.map((c) => {
    const currentObs: PriceObservationInput = {
      id: `${c.id}-curr`,
      priceCents: c.currentPriceCents,
      originalPriceCents: c.originalPriceCents,
      observedAt: c.observedAt,
      currency: c.currency,
      offerEvidence: c.offerEvidence,
    };
    const caseNow = defaultNow ?? parseDate(c.observedAt);
    const evidence = calculatePriceEvidence({
      tenantId: "calib",
      productId: `prod-${c.id}`,
      currentObservationId: currentObs.id,
      observations: [currentObs, ...c.priors],
      policy: c.policy ?? DEFAULT_PRICE_EVIDENCE_POLICY,
      policyStatus: c.policyStatus ?? "approved",
      now: caseNow,
    });
    return {
      id: c.id,
      description: c.description,
      expectedState: c.expectedState,
      actualState: evidence.state,
      matches: evidence.state === c.expectedState,
      unknowns: evidence.unknowns,
    };
  });

  const passedCases = results.filter((r) => r.matches).length;
  return {
    totalCases: cases.length,
    passedCases,
    pass: passedCases === cases.length,
    results,
  };
}

export const BENCHMARK_CALIBRATION_CASES_EXP02: readonly CalibrationCase[] = [
  // 1. Ponto isolado sem histórico anterior -> E0
  {
    id: "exp02-01-isolated",
    description: "Ponto único sem histórico anterior",
    currentPriceCents: 10000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [],
    expectedState: "E0",
  },
  // 2. Histórico existe mas variante é inferred -> E1
  {
    id: "exp02-02-inferred-variant",
    description: "Histórico com variante inferida não verificada",
    currentPriceCents: 8000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantIdentity: { state: "inferred", key: "v1" },
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 10000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantIdentity: { state: "inferred", key: "v1" } } },
    ],
    expectedState: "E1",
  },
  // 3. Moeda diferente no histórico -> E1
  {
    id: "exp02-03-currency-mismatch",
    description: "Histórico em moeda estrangeira (USD vs BRL)",
    currentPriceCents: 10000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      currency: "BRL",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 2000, observedAt: "2026-10-01T12:00:00Z", currency: "USD", offerEvidence: { variantKey: "v1", currency: "USD", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    expectedState: "E1",
  },
  // 4. Preço de faixa não-exato -> E1
  {
    id: "exp02-04-price-range",
    description: "Preço observado em faixa com min != max",
    currentPriceCents: 10000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      priceType: "range",
      priceMinCents: 9000,
      priceMaxCents: 11000,
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 12000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    expectedState: "E1",
  },
  // 5. Seller sem comprovação e sem not_applicable -> E1
  {
    id: "exp02-05-seller-unverified",
    description: "Vendedor desconhecido sem estado not_applicable",
    currentPriceCents: 10000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "absent", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 12000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "absent", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    expectedState: "E1",
  },
  // 6. Quantidade de pacote diferente -> E1
  {
    id: "exp02-06-quantity-mismatch",
    description: "Quantidade diferente (1 unidade vs 2 unidades)",
    currentPriceCents: 10000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 18000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 2, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    expectedState: "E1",
  },
  // 7. Histórico comparável na janela, mas e3Enabled=false -> E2
  {
    id: "exp02-07-e2-drop-e3-disabled",
    description: "Queda observada comparável com política padrão (E3 desabilitado)",
    currentPriceCents: 9000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 12000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p2", priceCents: 11000, observedAt: "2026-10-03T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p3", priceCents: 10000, observedAt: "2026-10-06T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    policy: DEFAULT_PRICE_EVIDENCE_POLICY, // e3Enabled: false
    expectedState: "E2",
  },
  // 8. Política em draft com e3Enabled=true não promove para E3 -> E2
  {
    id: "exp02-08-draft-policy-retains-e2",
    description: "Política em status draft não promove para E3 mesmo com e3Enabled=true",
    currentPriceCents: 9000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 12000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p2", priceCents: 11000, observedAt: "2026-10-03T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p3", priceCents: 10000, observedAt: "2026-10-06T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    policy: { ...DEFAULT_PRICE_EVIDENCE_POLICY, e3Enabled: true },
    policyStatus: "draft",
    expectedState: "E2",
  },
  // 9. Política aprovada mas lacuna (gap) excessiva -> E2
  {
    id: "exp02-09-gap-exceeded-retains-e2",
    description: "Política aprovada com gap entre observações superior ao teto -> E2",
    currentPriceCents: 9000,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 12000, observedAt: "2026-09-15T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p2", priceCents: 11000, observedAt: "2026-09-16T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p3", priceCents: 10000, observedAt: "2026-10-09T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    policy: { ...DEFAULT_PRICE_EVIDENCE_POLICY, e3Enabled: true, maximumGapHours: 72 },
    policyStatus: "approved",
    expectedState: "E2",
  },
  // 10. Cobertura plena homologada com e3Enabled=true e menor preço -> E3
  {
    id: "exp02-10-e3-full-coverage-approved",
    description: "Cobertura temporal homologada e aprovada com menor preço histórico -> E3",
    currentPriceCents: 8500,
    currency: "BRL",
    observedAt: "2026-10-10T12:00:00Z",
    offerEvidence: {
      variantKey: "v1",
      packageQuantity: 1,
      fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" },
    },
    priors: [
      { id: "p1", priceCents: 12000, observedAt: "2026-10-01T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p2", priceCents: 11000, observedAt: "2026-10-03T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p3", priceCents: 10000, observedAt: "2026-10-05T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p4", priceCents: 9500, observedAt: "2026-10-07T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
      { id: "p5", priceCents: 9000, observedAt: "2026-10-09T12:00:00Z", currency: "BRL", offerEvidence: { variantKey: "v1", packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } } },
    ],
    policy: { ...DEFAULT_PRICE_EVIDENCE_POLICY, e3Enabled: true, windowDays: 10, minimumCoverageRatio: 0.5, maximumGapHours: 72 },
    policyStatus: "approved",
    expectedState: "E3",
  },
];

export async function getActivePriceEvidencePolicy(
  sql: any,
  tenantId: string
): Promise<{ config: PriceEvidencePolicyConfig; version: string; status: string } | null> {
  const [row] = await sql<{ config: PriceEvidencePolicyConfig; version: string; status: string }[]>`
    select config, version, status
    from garimpa.effective_price_evidence_policy
    where tenant_id = ${tenantId} and status = 'approved'
    order by created_at desc, id desc
    limit 1
  `;
  return row ?? null;
}

export async function savePriceEvidencePolicyDraft(
  sql: any,
  tenantId: string,
  input: { version: string; config: PriceEvidencePolicyConfig }
): Promise<{ id: string }> {
  const config=input.config;
  if(!input.version.trim()||typeof config.e3Enabled!=='boolean'||!config.scope?.trim()||!['windowDays','bucketHours','minimumPriorCount','minimumDistinctDays','maximumGapHours','maxAgeHours'].every(key=>Number.isFinite((config as any)[key])&&(config as any)[key]>0)||!Number.isFinite(config.minimumCoverageRatio)||config.minimumCoverageRatio<0||config.minimumCoverageRatio>1)throw new Error('invalid_price_policy_configuration');
  const [row] = await sql<{ id: string }[]>`
    insert into garimpa.price_evidence_policy_version(tenant_id, version, config, status)
    values (${tenantId}, ${input.version}, ${sql.json(input.config)}, 'draft')
    returning id
  `;
  return row!;
}

export async function approvePriceEvidencePolicy(
  sql: any,
  tenantId: string,
  input: { version: string; approvedBy: string; calibrationReportRef?: string }
): Promise<{ id: string }> {
  const [owner]=await sql`select m.app_user_id from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id where a.tenant_id=${tenantId} and a.status='active' and m.role='owner' and m.revoked_at is null and m.app_user_id=${input.approvedBy} and m.app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'') and current_setting('garimpa.membership_role',true)='owner'`;
  if(!owner)throw new Error('authorized_owner_approver_required');
  const [row] = await sql<{ id: string; config: PriceEvidencePolicyConfig }[]>`
    select id, config
    from garimpa.price_evidence_policy_version
    where tenant_id = ${tenantId} and version = ${input.version} and status = 'draft'
    for update
  `;
  if (!row) throw new Error("policy_draft_not_found");
  if(row.config.e3Enabled) {
    const runs= input.calibrationReportRef && /^[a-f0-9-]{36}$/i.test(input.calibrationReportRef) ? await sql`select id from garimpa.price_calibration_run where id::text=${input.calibrationReportRef} and tenant_id=${tenantId} and policy_version=${input.version} and synthetic=false and results->>'experiment'='EXP-02' and results->>'reviewed'='true' and results->>'pass'='true' and policy_digest=${calculateContentDigest(row.config)}` : [];
    if(!runs.length)throw new Error("approved_calibration_required_for_e3");
  }
  if (row.config.e3Enabled && !input.calibrationReportRef) {
    throw new Error("calibration_report_required_for_e3");
  }
  await sql`
    update garimpa.price_evidence_policy_version
    set status = 'approved', approved_by = ${input.approvedBy}, approved_at = clock_timestamp(), calibration_run_id=${row.config.e3Enabled ? input.calibrationReportRef! : null}
    where id = ${row.id}
  `;
  return { id: row.id };
}

export async function calculateCanonicalPriceEvidenceForProduct(
  sql: any,
  tenantId: string,
  productId: string,
  currentObservationId?: string,
  now = new Date()
): Promise<PriceEvidence> {
  const activePolicy = await getActivePriceEvidencePolicy(sql, tenantId);
  const policy = activePolicy?.config ?? DEFAULT_PRICE_EVIDENCE_POLICY;
  const policyStatus = activePolicy?.status === "approved" ? "approved" : "draft";
  const policyVersion = activePolicy?.version ?? "1.0.0";

  let calibrationVerified = true;
  if (policy.e3Enabled) {
    const [cal] = await sql`
      select id from garimpa.price_calibration_run
      where tenant_id = ${tenantId}
        and policy_version = ${policyVersion}
        and synthetic = false
        and results->>'experiment' = 'EXP-02'
        and results->>'reviewed' = 'true'
        and results->>'pass' = 'true'
      limit 1
    `;
    calibrationVerified = Boolean(cal);
  }

  const rows = await sql<{
    id: string;
    price_cents: number;
    original_price_cents: number | null;
    observed_at: string;
    offer_evidence: OfferEvidence | null;
  }[]>`
    select id, price_cents, original_price_cents, observed_at::text, offer_evidence
    from garimpa.price_observation
    where tenant_id = ${tenantId} and product_id = ${productId}
    order by observed_at desc, id desc
  `;

  if (rows.length === 0) {
    throw new Error("product_has_no_observations");
  }

  const curId = currentObservationId ?? rows[0]!.id;
  return calculatePriceEvidence({
    tenantId,
    productId,
    currentObservationId: curId,
    observations: rows.map((r: any) => ({
      id: r.id,
      priceCents: r.price_cents,
      originalPriceCents: r.original_price_cents,
      observedAt: r.observed_at,
      offerEvidence: r.offer_evidence,
      currency: r.offer_evidence?.currency,
    })),
    policy,
    policyVersion,
    policyStatus,
    calibrationVerified,
    now,
  });
}

