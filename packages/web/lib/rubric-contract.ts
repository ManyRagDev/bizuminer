/**
 * Contrato canônico da rubrica editorial de qualidade, valor, público e evidência (EP-02 / C-03).
 *
 * Implementa RubricAssessment v2:
 * - Quality (Q): utilidade, acabamento, função clara, ausência de defeito evidente.
 * - Value (V): relação custo/benefício diante das alternativas de mercado.
 * - Audience (A): adequação aos interesses e perfil do público-alvo da política.
 * - EvidenceConfidence (Confiança): grau de certeza factual dos dados disponíveis.
 * - FactsUsed, Inferences, Unknowns, SafetyFlags: separação explícita de proveniência.
 */

import { createHash } from "node:crypto";
import { SchemaType, type ResponseSchema } from "@google/generative-ai";

export type RubricLevel = "unknown" | "weak" | "adequate" | "strong";

export interface RubricDimension {
  readonly level: RubricLevel;
  readonly reason: string;
  readonly sourceRefs?: readonly string[];
}

export interface ValueDimension extends RubricDimension {
  readonly comparableAlternatives?: readonly string[];
}

export interface AudienceDimension extends RubricDimension {
  readonly policyId?: string;
}

export interface CreativePotential {
  readonly reason: string;
  readonly channels: readonly string[];
}

export interface RubricAssessment {
  readonly schemaVersion: 2;
  readonly quality: RubricDimension;
  readonly value: ValueDimension;
  readonly audience: AudienceDimension;
  readonly evidenceConfidence: RubricDimension;
  readonly priceEvidenceRef?: string;
  readonly creativePotential?: CreativePotential;
  readonly factsUsed: readonly string[];
  readonly inferences: readonly string[];
  readonly unknowns: readonly string[];
  readonly safetyFlags: readonly string[];
  readonly policyVersion: string;
  readonly modelVersion?: string;
  readonly promptVersion?: string;
  readonly evidenceDigest: string;
  readonly createdAt: string;
}

export interface RubricInputItem {
  readonly productId: string;
  readonly title: string;
  readonly category: string;
  readonly priceCents: number;
  readonly originalPriceCents?: number;
  readonly marketplace: string;
  readonly ratingStar?: number;
  readonly salesCount?: number;
  readonly salesLabel?: string;
  readonly productUrl?: string;
  readonly priceEvidenceDigest?: string;
}

export interface ComparisonDisagreement {
  readonly dimension: "quality" | "value" | "audience" | "confidence" | "safety";
  readonly humanLevel?: string;
  readonly aiLevel?: string;
  readonly reason: string;
}

export interface ComparisonReviewResult {
  readonly agreement: boolean;
  readonly disagreements: readonly ComparisonDisagreement[];
}

const VALID_LEVELS = new Set<string>(["unknown", "weak", "adequate", "strong"]);

export function isValidRubricLevel(val: unknown): val is RubricLevel {
  return typeof val === "string" && VALID_LEVELS.has(val);
}

/**
 * Valida e normaliza um payload de RubricAssessment v2.
 */
export function validateRubricAssessment(raw: unknown): RubricAssessment {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("RubricAssessment deve ser um objeto");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== 2) {
    throw new Error(`schemaVersion 2 esperado, recebido: ${obj.schemaVersion}`);
  }

  const validateDim = (name: string, d: unknown): RubricDimension => {
    if (typeof d !== "object" || d === null) throw new Error(`Dimensão '${name}' ausente ou inválida`);
    const o = d as Record<string, unknown>;
    if (!isValidRubricLevel(o.level)) throw new Error(`Nível inválido na dimensão '${name}': ${o.level}`);
    if (typeof o.reason !== "string" || o.reason.trim().length === 0) {
      throw new Error(`Justificativa obrigatória na dimensão '${name}'`);
    }
    return {
      level: o.level,
      reason: o.reason.trim(),
      sourceRefs: Array.isArray(o.sourceRefs) ? o.sourceRefs.map(String) : undefined,
    };
  };

  const quality = validateDim("quality", obj.quality);
  const rawValue = obj.value as Record<string, unknown> | undefined;
  const value: ValueDimension = {
    ...validateDim("value", rawValue),
    comparableAlternatives: Array.isArray(rawValue?.comparableAlternatives)
      ? rawValue.comparableAlternatives.map(String)
      : undefined,
  };
  const rawAudience = obj.audience as Record<string, unknown> | undefined;
  const audience: AudienceDimension = {
    ...validateDim("audience", rawAudience),
    policyId: typeof rawAudience?.policyId === "string" ? rawAudience.policyId : undefined,
  };
  const evidenceConfidence = validateDim("evidenceConfidence", obj.evidenceConfidence);

  const factsUsed = Array.isArray(obj.factsUsed) ? obj.factsUsed.map(String) : [];
  const inferences = Array.isArray(obj.inferences) ? obj.inferences.map(String) : [];
  const unknowns = Array.isArray(obj.unknowns) ? obj.unknowns.map(String) : [];
  const safetyFlags = Array.isArray(obj.safetyFlags) ? obj.safetyFlags.map(String) : [];

  const policyVersion = typeof obj.policyVersion === "string" ? obj.policyVersion : "1.0.0";
  const evidenceDigest = typeof obj.evidenceDigest === "string" ? obj.evidenceDigest : "";
  const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString();

  return {
    schemaVersion: 2,
    quality,
    value,
    audience,
    evidenceConfidence,
    priceEvidenceRef: typeof obj.priceEvidenceRef === "string" ? obj.priceEvidenceRef : undefined,
    creativePotential: obj.creativePotential && typeof obj.creativePotential === "object"
      ? {
          reason: String((obj.creativePotential as any).reason ?? ""),
          channels: Array.isArray((obj.creativePotential as any).channels)
            ? (obj.creativePotential as any).channels.map(String)
            : [],
        }
      : undefined,
    factsUsed,
    inferences,
    unknowns,
    safetyFlags,
    policyVersion,
    modelVersion: typeof obj.modelVersion === "string" ? obj.modelVersion : undefined,
    promptVersion: typeof obj.promptVersion === "string" ? obj.promptVersion : undefined,
    evidenceDigest,
    createdAt,
  };
}

/**
 * Compara avaliação humana contra avaliação de IA e documenta desacordos.
 */
export function compareAssessments(
  human: RubricAssessment,
  ai: RubricAssessment,
): ComparisonReviewResult {
  const disagreements: ComparisonDisagreement[] = [];

  const check = (dim: "quality" | "value" | "audience" | "confidence", hLevel: RubricLevel, aLevel: RubricLevel, name: string) => {
    if (hLevel !== aLevel) {
      disagreements.push({
        dimension: dim,
        humanLevel: hLevel,
        aiLevel: aLevel,
        reason: `Desacordo em ${name}: humano considerou '${hLevel}', IA avaliou '${aLevel}'.`,
      });
    }
  };

  check("quality", human.quality.level, ai.quality.level, "qualidade");
  check("value", human.value.level, ai.value.level, "valor");
  check("audience", human.audience.level, ai.audience.level, "público");
  check("confidence", human.evidenceConfidence.level, ai.evidenceConfidence.level, "confiança da evidência");

  if (human.safetyFlags.length > 0 && ai.safetyFlags.length === 0) {
    disagreements.push({
      dimension: "safety",
      reason: `Humano apontou sinalizadores de segurança não detectados pela IA: ${human.safetyFlags.join(", ")}`,
    });
  }

  return {
    agreement: disagreements.length === 0,
    disagreements,
  };
}

/**
 * Esquema estruturado para resposta do Gemini na avaliação shadow (v2).
 */
export const rubricShadowResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  description: "Avaliação editorial de utilidade, valor e evidência (C-03 / EP-02)",
  properties: {
    productId: { type: SchemaType.STRING, description: "ID do produto avaliado" },
    quality: {
      type: SchemaType.OBJECT,
      properties: {
        level: { type: SchemaType.STRING, format: "enum", enum: ["weak", "adequate", "strong", "unknown"], description: "Qualidade física e utilidade" },
        reason: { type: SchemaType.STRING, description: "Razão da nota de qualidade" },
      },
      required: ["level", "reason"],
    },
    value: {
      type: SchemaType.OBJECT,
      properties: {
        level: { type: SchemaType.STRING, format: "enum", enum: ["weak", "adequate", "strong", "unknown"], description: "Relação custo/benefício frente a alternativas" },
        reason: { type: SchemaType.STRING, description: "Razão da nota de valor" },
      },
      required: ["level", "reason"],
    },
    audience: {
      type: SchemaType.OBJECT,
      properties: {
        level: { type: SchemaType.STRING, format: "enum", enum: ["weak", "adequate", "strong", "unknown"], description: "Aderência ao público consumidor" },
        reason: { type: SchemaType.STRING, description: "Razão da aderência" },
      },
      required: ["level", "reason"],
    },
    evidenceConfidence: {
      type: SchemaType.OBJECT,
      properties: {
        level: { type: SchemaType.STRING, format: "enum", enum: ["weak", "adequate", "strong", "unknown"], description: "Grau de certeza factual" },
        reason: { type: SchemaType.STRING, description: "Razão da confiança" },
      },
      required: ["level", "reason"],
    },
    factsUsed: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Fatos reais do anúncio utilizados na análise",
    },
    inferences: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Inferências deduzidas além dos fatos estritos",
    },
    unknowns: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Lacunas de informação observadas",
    },
    safetyFlags: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Sinalizadores de risco (adulto, arma, promessa milagrosa, etc.)",
    },
  },
  required: ["productId", "quality", "value", "audience", "evidenceConfidence", "factsUsed", "inferences", "unknowns", "safetyFlags"],
};
