import type { CaptureAdapter, CaptureContext, Credential, SourceQuery } from "../../capture/src/types.ts";
import { sweep, SweepError, type DiscoveryPolicy, type SweepSummary } from "./ingest.ts";
import type { OfferStore } from "./store.ts";
import { classifyCaptureFailure, type CaptureFailure } from "./capture-failure.ts";
import type { ProductFamily } from "./product-family.ts";
import { captureDiagnostic, type CaptureDiagnostic } from "./capture-diagnostic.ts";

export type CapturePlanMode = "directed" | "exploratory";

export interface CapturePlanEntry {
  readonly id: string;
  readonly mode: CapturePlanMode;
  readonly category: string;
  readonly family?: ProductFamily;
  readonly keyword?: string;
  readonly sourceQuery?: SourceQuery;
}

export interface CapturePlan {
  readonly id: string;
  readonly entries: readonly CapturePlanEntry[];
}

/** Versioned, immutable query identity: persisted checkpoints must not change across deployments. */
export const SINGLE_PRODUCT_TRIAL_PLAN: CapturePlan = {
  id: "single-product-v1",
  entries: [{ id: "single-product-casa-v1", mode: "directed", category: "Casa", keyword: "organizador para casa" }],
};

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
  readonly pageSize?: number;
  readonly policy?: Partial<Omit<DiscoveryPolicy, "planId" | "queryId" | "mode" | "targetCategory" | "targetFamily">>;
  readonly operationBatchId?: string;
  readonly operationWorkerId?: string;
  readonly trialSingleProduct?: boolean;
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
  readonly failure?: CaptureFailure;
  readonly diagnostic?: CaptureDiagnostic;
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
  if (opts.trialSingleProduct && (adapter.marketplace !== "shopee" || !opts.operationBatchId || !opts.operationWorkerId))
    throw new Error("capture_trial_requires_owned_shopee_batch");
  if (!adapter.capabilities.search && !adapter.capabilities.offerFeed) {
    throw new Error(`marketplace ${adapter.marketplace} não suporta plano de captura`);
  }

  const plan = opts.trialSingleProduct ? SINGLE_PRODUCT_TRIAL_PLAN : opts.plan ?? CATEGORY_FIRST_PLAN;
  const entries = entriesForMode(plan, opts.trialSingleProduct ? "all" : opts.mode);
  // Providers may ignore their requested page size. Truncate before ingestion, including known products.
  const captureAdapter: CaptureAdapter = opts.trialSingleProduct ? {
    ...adapter,
    marketplace: adapter.marketplace,
    capabilities: adapter.capabilities,
    validateCredential: adapter.validateCredential.bind(adapter),
    fetchOffers: adapter.fetchOffers.bind(adapter),
    async *streamOffers(credential, params, context) {
      for await (const offers of adapter.streamOffers(credential, { ...params, pageSize: 10, maxPages: 1 }, context)) {
        yield offers.slice(0, 1);
        return;
      }
    },
  } : adapter;
  const runs: SweepSummary[] = [];
  let queriesCompleted = 0;
  let queriesFailed = 0;
  let failure: CaptureFailure | undefined;
  let diagnostic: CaptureDiagnostic | undefined;

  for (const entry of entries) {
    const discovery: DiscoveryPolicy = {
      executionId: ctx.runId,
      planId: plan.id,
      queryId: entry.id,
      mode: entry.mode,
      targetCategory: entry.category,
      targetFamily: entry.family,
      maxNewItems: opts.policy?.maxNewItems ?? (plan.id.startsWith("departments-") ? 50 : 8),
      maxNewPerFamily: opts.policy?.maxNewPerFamily ?? (plan.id.startsWith("departments-") ? 25 : 5),
      saturationThreshold: opts.policy?.saturationThreshold ?? (plan.id.startsWith("departments-") ? 0.9 : 0.6),
      minCandidatesForSaturation: opts.policy?.minCandidatesForSaturation ?? 10,
      stopOnSaturation: opts.policy?.stopOnSaturation ?? (plan.id.startsWith("departments-") ? false : true),
    };

    try {
      const result = await sweep(
        captureAdapter,
        cred,
        store,
        {
          tenantId: opts.tenantId,
          params: {
            keyword: entry.keyword,
            sourceQuery: entry.sourceQuery,
            minClaimedDiscount: opts.minClaimedDiscount,
            pageSize: opts.trialSingleProduct ? 10 : opts.pageSize,
          },
          maxPages: opts.trialSingleProduct ? 1 : opts.maxPagesPerQuery ?? 1,
          discovery,
          operationBatchId: opts.operationBatchId,
          operationWorkerId: opts.operationWorkerId,
        },
        { ...ctx, runId: `${ctx.runId}:${entry.id}` },
      );
      runs.push(result);
      if (result.itemsSeen === 0) queriesFailed++;
      else queriesCompleted++;
    } catch (error) {
      queriesFailed++;
      if (error instanceof SweepError) runs.push(error.summary);
      failure = classifyCaptureFailure(error instanceof SweepError ? error.cause : error);
      diagnostic = captureDiagnostic(error instanceof SweepError ? error.cause : error, "capture_query");
      ctx.log({
        level: "error",
        msg: "consulta do plano falhou; próximas consultas serão tentadas",
        data: { planId: plan.id, queryId: entry.id, error: error instanceof Error ? error.message : String(error) },
      });
      // Shared provider limits/credentials block all subsequent queries; transient
      // per-query errors (like Shopee 10000 on one category) still let remaining entries run.
      if (opts.operationBatchId && (failure.kind === "rate_limit" || failure.kind === "quota" || failure.kind === "credential")) break;
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
    failure,
    diagnostic,
  };
}
