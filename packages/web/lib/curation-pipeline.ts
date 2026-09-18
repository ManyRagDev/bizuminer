import {
  type AICurationItemInput,
  type AICurationItemOutput,
  type TriageDecision,
} from "./ai-curation-contract.ts";
import { evaluateProductsBatch } from "./ai-curation-service.ts";
import { selectRepresentatives, type GroupMemberProduct } from "./editorial-groups.ts";

export interface CandidateProduct {
  id: string;
  marketplace: string;
  title: string;
  priceCents: number;
  ratingStar: number | null;
  salesCount: number | null;
  familyKey: string | null;
  category: string | null;
}

export interface PipelineOptions {
  minPriceCents?: number;
  maxRepresentatives?: number;
  evaluator?: (
    items: AICurationItemInput[],
    options?: {
      editorialGuideline?: string;
      fewShotExamples?: Array<{
        title: string;
        priceFormatted?: string;
        decision: "approved" | "rejected" | "held";
        reasonCode?: string | null;
        reasonDetail?: string | null;
        rationale?: string;
      }>;
    },
  ) => Promise<AICurationItemOutput[]>;
  autoPublish?: boolean;
  minScoreAutoPublish?: number;
  editorialGuideline?: string;
  fewShotExamples?: Array<{
    title: string;
    priceFormatted?: string;
    decision: "approved" | "rejected" | "held";
    reasonCode?: string | null;
    reasonDetail?: string | null;
    rationale?: string;
  }>;
}

export const MIN_PRICE_CENTS_DEFAULT = 2000; // R$ 20,00
export const MAX_REPRESENTATIVES_DEFAULT = 3;

export const ADULT_TERMS_RE =
  /\b(erotico|erotica|sexy|vibrador|anabolizante|replica|lingerie sensual|masturbador|dildo|plug anal|fantasia sensual)\b/i;

export const LOW_UTILITY_TERMS_RE =
  /\b(parafuso|porca sextavada|arruela|cabo extensor generico|engrenagem|rolamento|conector engate rapido|bico injetor|bomba hidr[aá]ulica)\b/i;

export async function processIngestionPipeline(
  products: CandidateProduct[],
  options?: PipelineOptions,
): Promise<TriageDecision[]> {
  const minPriceCents = options?.minPriceCents ?? MIN_PRICE_CENTS_DEFAULT;
  const maxRepresentatives = options?.maxRepresentatives ?? MAX_REPRESENTATIVES_DEFAULT;
  const evaluator = options?.evaluator ?? evaluateProductsBatch;

  const decisions: TriageDecision[] = [];
  const survivorsStage1: CandidateProduct[] = [];

  // ----------------------------------------------------
  // Estágio 1: Hard Filters Determinísticos (Custo Zero IA)
  // ----------------------------------------------------
  for (const p of products) {
    if (p.priceCents < minPriceCents) {
      decisions.push({
        productId: p.id,
        status: "held",
        reasonCode: "weak_offer",
        reasonDetail: null,
        rationale: `Preço R$ ${(p.priceCents / 100).toFixed(2)} abaixo do piso de ticket mínimo`,
        actorType: "rule",
      });
      continue;
    }

    if (ADULT_TERMS_RE.test(p.title)) {
      decisions.push({
        productId: p.id,
        status: "rejected",
        reasonCode: "adult_sexual",
        reasonDetail: null,
        rationale: "Blacklist de termos adultos/restritos",
        actorType: "rule",
      });
      continue;
    }

    if (LOW_UTILITY_TERMS_RE.test(p.title)) {
      decisions.push({
        productId: p.id,
        status: "rejected",
        reasonCode: "low_utility",
        reasonDetail: null,
        rationale: "Blacklist de peças industriais/chatas",
        actorType: "rule",
      });
      continue;
    }

    if (p.ratingStar !== null && p.ratingStar > 0 && p.ratingStar < 4.0) {
      decisions.push({
        productId: p.id,
        status: "rejected",
        reasonCode: "low_quality_listing",
        reasonDetail: null,
        rationale: `Avaliação ${p.ratingStar} abaixo da nota mínima 4.0`,
        actorType: "rule",
      });
      continue;
    }

    survivorsStage1.push(p);
  }

  // ----------------------------------------------------
  // Estágio 2: Anti-Saturação por Família
  // ----------------------------------------------------
  const survivorsStage2: CandidateProduct[] = [];
  const byFamily = new Map<string, CandidateProduct[]>();

  for (const p of survivorsStage1) {
    if (!p.familyKey) {
      survivorsStage2.push(p);
      continue;
    }
    const bucket = byFamily.get(p.familyKey) ?? [];
    bucket.push(p);
    byFamily.set(p.familyKey, bucket);
  }

  for (const [familyKey, familyProducts] of byFamily.entries()) {
    if (familyProducts.length <= 1) {
      survivorsStage2.push(familyProducts[0]!);
      continue;
    }

    const representativeIds = new Set(
      selectRepresentatives(
        familyProducts.map((p): GroupMemberProduct => ({
          tenantId: "local",
          productId: p.id,
          marketplace: p.marketplace,
          family: { key: familyKey, method: "pipeline", version: "v1" },
          status: "pending",
          observedAt: new Date().toISOString(),
          priceCents: p.priceCents,
          ratingStar: p.ratingStar,
          salesLabel: null,
          salesCount: p.salesCount,
          observationCount: 1,
          lowestVerified: false,
        })),
        maxRepresentatives,
      ),
    );

    for (const p of familyProducts) {
      if (representativeIds.has(p.id)) {
        survivorsStage2.push(p);
      } else {
        decisions.push({
          productId: p.id,
          status: "held",
          reasonCode: "family_saturation",
          reasonDetail: null,
          rationale: `Saturação da família ${familyKey}; outros representantes avançaram`,
          actorType: "rule",
        });
      }
    }
  }

  // ----------------------------------------------------
  // Estágio 3 & 4: Triagem Semântica com Gemini e Roteamento
  // ----------------------------------------------------
  if (survivorsStage2.length > 0) {
    const aiPayload: AICurationItemInput[] = survivorsStage2.map((p) => ({
      productId: p.id,
      title: p.title,
      category: p.category ?? "Geral",
      priceFormatted: `R$ ${(p.priceCents / 100).toFixed(2)}`,
    }));

    const aiResults = await evaluator(aiPayload, {
      editorialGuideline: options?.editorialGuideline,
      fewShotExamples: options?.fewShotExamples,
    });
    const aiMap = new Map(aiResults.map((r) => [r.productId, r]));

    for (const p of survivorsStage2) {
      const evaluation = aiMap.get(p.id);

      if (!evaluation) {
        // Fallback: se a IA falhou no item, permanece pending na fila humana sem anotação
        continue;
      }

      if (evaluation.hasMisleadingClaim) {
        decisions.push({
          productId: p.id,
          status: "rejected",
          reasonCode: "misleading_claim",
          reasonDetail: null,
          rationale: evaluation.justification,
          actorType: "llm",
          aiScore: evaluation.desirabilityScore,
          aiJustification: evaluation.justification,
          editorialCategory: evaluation.editorialCategory,
        });
      } else if (evaluation.isAdultOrUnsafe) {
        decisions.push({
          productId: p.id,
          status: "rejected",
          reasonCode: "unsafe_restricted",
          reasonDetail: null,
          rationale: evaluation.justification,
          actorType: "llm",
          aiScore: evaluation.desirabilityScore,
          aiJustification: evaluation.justification,
          editorialCategory: evaluation.editorialCategory,
        });
      } else if (evaluation.desirabilityScore <= 2 || evaluation.editorialCategory === "peca_chata") {
        decisions.push({
          productId: p.id,
          status: "rejected",
          reasonCode: "low_utility",
          reasonDetail: null,
          rationale: evaluation.justification,
          actorType: "llm",
          aiScore: evaluation.desirabilityScore,
          aiJustification: evaluation.justification,
          editorialCategory: evaluation.editorialCategory,
        });
      } else {
        // Score >= 3:
        const shouldAutoPublish =
          Boolean(options?.autoPublish) &&
          evaluation.desirabilityScore >= (options?.minScoreAutoPublish ?? 4);

        decisions.push({
          productId: p.id,
          status: shouldAutoPublish ? "approved" : "pending",
          reasonCode: null,
          reasonDetail: null,
          rationale: evaluation.justification,
          actorType: "llm",
          aiScore: evaluation.desirabilityScore,
          aiJustification: evaluation.justification,
          editorialCategory: evaluation.editorialCategory,
        });
      }
    }
  }

  return decisions;
}
