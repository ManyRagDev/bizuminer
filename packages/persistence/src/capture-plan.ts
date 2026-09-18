import type { CaptureAdapter, CaptureContext, Credential } from "../../capture/src/types.ts";
import { sweep, type DiscoveryPolicy, type SweepSummary } from "./ingest.ts";
import type { OfferStore } from "./store.ts";
import type { ProductFamily } from "./product-family.ts";

export type CapturePlanMode = "directed" | "exploratory";

export interface CapturePlanEntry {
  readonly id: string;
  readonly mode: CapturePlanMode;
  readonly category: string;
  readonly family?: ProductFamily;
  readonly keyword: string;
}

export interface CapturePlan {
  readonly id: string;
  readonly entries: readonly CapturePlanEntry[];
}

/**
 * O plano inicial reserva 80% das consultas para intenções explícitas e 20%
 * para exploração. Os termos são deliberadamente específicos: "achadinhos"
 * não é uma intenção de compra e já produziu concentração artificial.
 */
export const CATEGORY_FIRST_PLAN: CapturePlan = {
  id: "category-first-v1",
  entries: [
    { id: "casa-organizacao", mode: "directed", category: "Casa", family: "organizacao", keyword: "organizador para casa" },
    { id: "casa-cozinha", mode: "directed", category: "Casa", family: "cozinha", keyword: "utensílios de cozinha" },
    { id: "casa-iluminacao", mode: "directed", category: "Casa", family: "iluminacao", keyword: "iluminação led" },
    { id: "tecnologia-carregamento", mode: "directed", category: "Tecnologia", family: "carregamento", keyword: "carregador usb c" },
    { id: "tecnologia-audio", mode: "directed", category: "Tecnologia", family: "audio", keyword: "fone bluetooth" },
    { id: "beleza-cuidados", mode: "directed", category: "Beleza", family: "cuidados_pessoais", keyword: "cuidados com a pele" },
    { id: "ferramentas-kit", mode: "directed", category: "Ferramentas", family: "ferramentas", keyword: "kit ferramentas" },
    { id: "auto-suportes", mode: "directed", category: "Auto e moto", family: "suportes_veiculares", keyword: "suporte celular carro moto" },
    { id: "explorar-utilidades", mode: "exploratory", category: "Exploração", keyword: "utilidades inteligentes" },
    { id: "explorar-mais-vendidos", mode: "exploratory", category: "Exploração", keyword: "produtos mais vendidos" },
  ],
};

export interface CapturePlanRunOptions {
  readonly tenantId: string;
  readonly plan?: CapturePlan;
  readonly mode?: CapturePlanMode | "all";
  readonly maxPagesPerQuery?: number;
  readonly minClaimedDiscount?: number;
  readonly policy?: Partial<Omit<DiscoveryPolicy, "planId" | "queryId" | "mode" | "targetCategory" | "targetFamily">>;
  readonly operationBatchId?: string;
}

export interface CapturePlanSummary {
  readonly planId: string;
  readonly queriesPlanned: number;
  readonly queriesCompleted: number;
  readonly queriesFailed: number;
  readonly queriesSaturated: number;
  readonly itemsSeen: number;
  readonly itemsCaptured: number;
  readonly itemsNew: number;
  readonly priceChanges: number;
  readonly itemsSkippedByPolicy: number;
  readonly durationMs: number;
  readonly runs: readonly SweepSummary[];
}

export function entriesForMode(
  plan: CapturePlan,
  mode: CapturePlanMode | "all" = "all",
): readonly CapturePlanEntry[] {
  return mode === "all" ? plan.entries : plan.entries.filter((entry) => entry.mode === mode);
}

export async function runCapturePlan(
  adapter: CaptureAdapter,
  cred: Credential,
  store: OfferStore,
  opts: CapturePlanRunOptions,
  ctx: CaptureContext,
): Promise<CapturePlanSummary> {
  const startedMs = Date.now();
  if (!adapter.capabilities.search) {
    throw new Error(`marketplace ${adapter.marketplace} não suporta plano por palavra-chave`);
  }

  const plan = opts.plan ?? CATEGORY_FIRST_PLAN;
  const entries = entriesForMode(plan, opts.mode);
  const runs: SweepSummary[] = [];
  let queriesCompleted = 0;
  let queriesFailed = 0;

  for (const entry of entries) {
    const discovery: DiscoveryPolicy = {
      executionId: ctx.runId,
      planId: plan.id,
      queryId: entry.id,
      mode: entry.mode,
      targetCategory: entry.category,
      targetFamily: entry.family,
      maxNewItems: opts.policy?.maxNewItems ?? 8,
      maxNewPerFamily: opts.policy?.maxNewPerFamily ?? 5,
      saturationThreshold: opts.policy?.saturationThreshold ?? 0.6,
      minCandidatesForSaturation: opts.policy?.minCandidatesForSaturation ?? 10,
      stopOnSaturation: opts.policy?.stopOnSaturation ?? true,
    };

    try {
      const result = await sweep(
        adapter,
        cred,
        store,
        {
          tenantId: opts.tenantId,
          params: { keyword: entry.keyword, minClaimedDiscount: opts.minClaimedDiscount },
          maxPages: opts.maxPagesPerQuery ?? 1,
          discovery,
          operationBatchId: opts.operationBatchId,
        },
        { ...ctx, runId: `${ctx.runId}:${entry.id}` },
      );
      runs.push(result);
      if (result.itemsSeen === 0) queriesFailed++;
      else queriesCompleted++;
    } catch (error) {
      queriesFailed++;
      ctx.log({
        level: "error",
        msg: "consulta do plano falhou; próximas consultas serão tentadas",
        data: { planId: plan.id, queryId: entry.id, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return {
    planId: plan.id,
    queriesPlanned: entries.length,
    queriesCompleted,
    queriesFailed,
    queriesSaturated: runs.filter((run) => run.saturationDetected).length,
    itemsSeen: runs.reduce((sum, run) => sum + run.itemsSeen, 0),
    itemsCaptured: runs.reduce((sum, run) => sum + run.itemsCaptured, 0),
    itemsNew: runs.reduce((sum, run) => sum + run.itemsNew, 0),
    priceChanges: runs.reduce((sum, run) => sum + run.priceChanges, 0),
    itemsSkippedByPolicy: runs.reduce((sum, run) => sum + run.itemsSkippedByPolicy, 0),
    durationMs: Date.now() - startedMs,
    runs,
  };
}
