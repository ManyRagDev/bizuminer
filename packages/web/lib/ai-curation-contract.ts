import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import type { CurationReason, CurationStatus } from "./curation-contract.ts";
import type { TriageValueDecision } from "./triage-value-policy.ts";

export interface AICurationItemInput {
  productId: string;
  title: string;
  category: string;
  priceFormatted: string;
  ratingStar?: number | null;
  salesCount?: number | null;
  salesLabel?: string | null;
  originDepartment?: string | null;
  /** Conservative minimum from verified prior observations of the same configuration. */
  verifiedPriceReference?: { source: "comparable_history"; minimumPriceFormatted: string; observationCount: number; historyDays: number };
}

export type TriageInputVersion = {
  status: "pending" | "held";
  latestEventId: string | null;
  priceObservationId: string;
  priceCents: number;
  offerEvidenceKey: string;
  observedAt: string;
};

export type EditorialCategory =
  | "achadinho_impulso"
  | "utilidade_pratica"
  | "destaque_departamento"
  | "peca_tecnica_avulsa"
  | "outro"
  | "gadget_util"
  | "novidade"
  | "peca_chata";

export interface AICurationItemOutput {
  productId: string;
  desirabilityScore: number; // 1 a 5
  hasMisleadingClaim: boolean;
  isAdultOrUnsafe: boolean;
  editorialCategory: EditorialCategory;
  catalogCategory?: string;
  publicBenefit?: string;
  justification: string;
}

export const curationResponseSchema: ResponseSchema = {
  type: SchemaType.ARRAY,
  description: "Lista de avaliações de curadoria para os produtos informados.",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      productId: {
        type: SchemaType.STRING,
        nullable: false,
        description: "ID original do produto recebido no lote",
      },
      desirabilityScore: {
        type: SchemaType.INTEGER,
        description: "1 = sem apelo/peça de reposição/chato; 3 = útil mas comum; 5 = excelente achadinho com alto fator de compra",
      },
      hasMisleadingClaim: {
        type: SchemaType.BOOLEAN,
        description: "True se contiver promessas milagrosas, terapêuticas ou enganosas",
      },
      isAdultOrUnsafe: {
        type: SchemaType.BOOLEAN,
        description: "True se for produto sexual, erótico, armas, réplica falsificada ou perigosa",
      },
      editorialCategory: {
        type: SchemaType.STRING,
        format: "enum",
        enum: [
          "achadinho_impulso",
          "utilidade_pratica",
          "destaque_departamento",
          "peca_tecnica_avulsa",
          "outro",
          "gadget_util",
          "novidade",
          "peca_chata",
        ],
        description: "Classificação editorial temática",
      },
      catalogCategory: {
        type: SchemaType.STRING,
        format: "enum",
        enum: [
          "Casa",
          "Tecnologia",
          "Ferramentas",
          "Beleza",
          "Fitness",
          "Auto e moto",
          "Brinquedos",
          "Papelaria",
          "Moda",
          "Suplementos",
          "Geral",
        ],
        description: "Classificação canônica pelo uso principal do produto para o consumidor final",
      },
      publicBenefit: {
        type: SchemaType.STRING,
        description: "Frase factual curta e comercial sintetizando o benefício real do produto (máx 120 caracteres)",
      },
      justification: {
        type: SchemaType.STRING,
        description: "Breve explicação comercial da avaliação (máx 150 caracteres)",
      },
    },
    required: ["productId", "desirabilityScore", "hasMisleadingClaim", "isAdultOrUnsafe", "editorialCategory", "justification"],
  },
};

export interface TriageDecision {
  productId: string;
  status: Extract<CurationStatus, "approved" | "rejected" | "held" | "pending">;
  reasonCode: CurationReason | null;
  reasonDetail: string | null;
  rationale: string;
  actorType: "rule" | "llm";
  aiScore?: number;
  aiJustification?: string;
  editorialCategory?: EditorialCategory;
  catalogCategory?: string;
  publicBenefit?: string;
  pricePolicy?: TriageValueDecision;
  inputVersion?: TriageInputVersion;
}
