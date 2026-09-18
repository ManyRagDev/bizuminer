import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import type { CurationReason, CurationStatus } from "./curation-contract.ts";

export interface AICurationItemInput {
  productId: string;
  title: string;
  category: string;
  priceFormatted: string;
}

export type EditorialCategory = "gadget_util" | "novidade" | "peca_chata" | "outro";

export interface AICurationItemOutput {
  productId: string;
  desirabilityScore: number; // 1 a 5
  hasMisleadingClaim: boolean;
  isAdultOrUnsafe: boolean;
  editorialCategory: EditorialCategory;
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
        enum: ["gadget_util", "novidade", "peca_chata", "outro"],
        description: "Classificação editorial temática",
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
}
