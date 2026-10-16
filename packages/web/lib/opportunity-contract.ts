/**
 * Contrato de oportunidade contextual, classificação e radar comercial (EP-03 / C-03).
 */

import type { PriceEvidence } from "./price-evidence.ts";
import type { RubricAssessment } from "./rubric-contract.ts";

export type OpportunityClass = "recommendable" | "good_buy" | "special" | "gold" | "unclassified";
export type OpportunityState = "candidate" | "monitored" | "prioritized" | "held" | "archived";

export interface AudiencePolicyConfig {
  readonly audienceKey: string;
  readonly name: string;
  readonly targetCategories: readonly string[];
  readonly ticketRange?: { readonly minCents?: number; readonly maxCents?: number };
  readonly allowedChannels: readonly string[];
  readonly maxRepetitionsPerWindow?: number;
  readonly cooldownHours?: number;
}

export interface Opportunity {
  readonly id: string;
  readonly tenantId: string;
  readonly productId: string;
  readonly policyVersionId: string;
  readonly audienceKey: string;
  readonly channel: string;
  readonly revision: number;
  readonly state: OpportunityState;
  readonly class: OpportunityClass;
  readonly assessmentRef?: string;
  readonly priceEvidenceSnapshot: PriceEvidence;
  readonly reasons: readonly string[];
  readonly unknowns: readonly string[];
  readonly nextAction: string;
  readonly validUntil: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly predecessorId?: string;
}

/**
 * Classifica a oportunidade de negócio com base na rubrica de qualidade/valor (C-03)
 * e na evidência de preço (C-02):
 * - recommendable: qualidade adequada/forte com utilidade clara e sem violação de segurança.
 * - good_buy: soma valor adequado/forte (boa relação benefício/preço).
 * - special: soma vantagem temporal observada (queda sustentada em E2/E3).
 * - gold: qualidade forte + valor forte + confiança forte da evidência.
 * - unclassified: qualidade fraca, risco ou dados insuficientes.
 */
export function classifyOpportunity(
  assessment: RubricAssessment,
  priceEvidence: PriceEvidence,
): {
  opportunityClass: OpportunityClass;
  state: OpportunityState;
  reasons: string[];
  unknowns: string[];
  nextAction: string;
} {
  const reasons: string[] = [];
  const unknowns: string[] = [...(assessment.unknowns ?? []), ...(priceEvidence.unknowns ?? [])];

  // 1. Bloqueio de segurança ou qualidade fraca
  if (assessment.safetyFlags.length > 0) {
    return {
      opportunityClass: "unclassified",
      state: "held",
      reasons: [`Risco de segurança detectado: ${assessment.safetyFlags.join(", ")}`],
      unknowns,
      nextAction: "revisar_segurança_humana",
    };
  }

  if (assessment.quality.level === "weak") {
    return {
      opportunityClass: "unclassified",
      state: "held",
      reasons: [`Qualidade avaliada como fraca: ${assessment.quality.reason}`],
      unknowns,
      nextAction: "descartar_ou_manter_retido",
    };
  }

  // 2. Base recommendable (qualidade adequada ou forte)
  reasons.push(`Qualidade ${assessment.quality.level}: ${assessment.quality.reason}`);

  let opportunityClass: OpportunityClass = "recommendable";
  let state: OpportunityState = "candidate";
  let nextAction = "monitorar_preco";

  // 3. Boa compra: agrega valor adequado ou forte
  const hasGoodValue = assessment.value.level === "adequate" || assessment.value.level === "strong";
  if (hasGoodValue) {
    opportunityClass = "good_buy";
    reasons.push(`Valor ${assessment.value.level}: ${assessment.value.reason}`);
    nextAction = "priorizar_para_publico";
  }

  // 4. Especial: vantagem temporal comprovada (queda observada em E2/E3)
  const hasTemporalAdvantage =
    (priceEvidence.state === "E2" || priceEvidence.state === "E3") &&
    priceEvidence.priorMinCents !== null &&
    priceEvidence.priceCents < priceEvidence.priorMinCents;

  if (hasTemporalAdvantage && hasGoodValue) {
    opportunityClass = "special";
    reasons.push(
      `Preço atual de ${priceEvidence.priceCents} abaixo do menor anterior (${priceEvidence.priorMinCents}) na mesma configuração.`,
    );
    state = "prioritized";
    nextAction = "criar_rascunho_campanha";
  }

  // 5. Gold: excelência simultânea em Q, V e Confiança
  if (
    assessment.quality.level === "strong" &&
    assessment.value.level === "strong" &&
    assessment.evidenceConfidence.level === "strong"
  ) {
    opportunityClass = "gold";
    reasons.push("Excelência comprovada em qualidade, valor e evidência factual.");
    state = "prioritized";
    nextAction = "destacar_em_campanha_principal";
  }

  return {
    opportunityClass,
    state,
    reasons,
    unknowns,
    nextAction,
  };
}

const CLASS_PRIORITY: Record<OpportunityClass, number> = {
  gold: 5,
  special: 4,
  good_buy: 3,
  recommendable: 2,
  unclassified: 1,
};

/**
 * Ordenação lexicográfica canônica de oportunidades (C-03):
 * 1. Prioridade de estado (prioritized > candidate > monitored > held > archived)
 * 2. Classe (gold > special > good_buy > recommendable > unclassified)
 * 3. Frescor (updatedAt mais recente)
 * 4. ID determinístico
 */
export function rankOpportunities(opportunities: readonly Opportunity[]): Opportunity[] {
  const statePriority: Record<OpportunityState, number> = {
    prioritized: 5,
    candidate: 4,
    monitored: 3,
    held: 2,
    archived: 1,
  };

  return [...opportunities].sort((a, b) => {
    const sDiff = (statePriority[b.state] ?? 0) - (statePriority[a.state] ?? 0);
    if (sDiff !== 0) return sDiff;

    const cDiff = (CLASS_PRIORITY[b.class] ?? 0) - (CLASS_PRIORITY[a.class] ?? 0);
    if (cDiff !== 0) return cDiff;

    const tA = new Date(a.updatedAt).getTime();
    const tB = new Date(b.updatedAt).getTime();
    if (tA !== tB) return tB - tA;

    return a.id.localeCompare(b.id);
  });
}
