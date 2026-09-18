/**
 * Serviço de ingestão: liga um CaptureAdapter ao OfferStore.
 *
 * Responsabilidades: percorrer páginas via streamOffers, persistir produto +
 * observação de preço, agregar contadores da execução e registrar
 * capture_run — incluindo o caso "zero itens", que é o sintoma silencioso
 * de scraper quebrado (modelo-de-dados.md §10).
 */

import type { CaptureAdapter, CaptureContext, Credential, FetchParams, RawOffer } from "../../capture/src/types.ts";
import { categoryForTitle } from "./category.ts";
import { familyInfoForTitle, productFamilyForTitle, type ProductFamily } from "./product-family.ts";
import type { OfferStore } from "./store.ts";

export interface DiscoveryPolicy {
  /** Identifica uma execução completa do plano; todas as consultas compartilham este valor. */
  readonly executionId?: string;
  readonly planId: string;
  readonly queryId: string;
  readonly mode: "directed" | "exploratory";
  readonly targetCategory: string;
  readonly targetFamily?: ProductFamily;
  readonly maxNewItems: number;
  readonly maxNewPerFamily: number;
  readonly saturationThreshold: number;
  readonly minCandidatesForSaturation: number;
  readonly stopOnSaturation: boolean;
}

export interface SweepOptions {
  readonly tenantId: string;
  readonly params?: FetchParams;
  readonly maxPages?: number;
  readonly discovery?: DiscoveryPolicy;
  /** Lote acionado pelo painel; fica no audit trail de cada captura filha. */
  readonly operationBatchId?: string;
}

export interface SweepSummary {
  readonly runId: string;
  readonly marketplace: string;
  /** Ofertas recebidas da fonte antes do gate de descoberta. */
  readonly itemsSeen: number;
  readonly itemsCaptured: number;
  readonly itemsNew: number;
  readonly priceChanges: number;
  readonly itemsSkippedByPolicy: number;
  readonly pagesRead: number;
  readonly saturationDetected: boolean;
  readonly dominantFamily?: ProductFamily;
  readonly durationMs: number;
}

function dominantFamily(
  counts: ReadonlyMap<ProductFamily, number>,
  totalCandidates: number,
): { family?: ProductFamily; share: number } {
  let family: ProductFamily | undefined;
  let count = 0;
  for (const [candidate, value] of counts) {
    if (value > count) {
      family = candidate;
      count = value;
    }
  }
  return { family, share: totalCandidates > 0 ? count / totalCandidates : 0 };
}

function shouldAcceptNewOffer(
  offer: RawOffer,
  policy: DiscoveryPolicy | undefined,
  acceptedNew: number,
  acceptedByFamily: ReadonlyMap<ProductFamily, number>,
): boolean {
  if (!policy) return true;
  if (acceptedNew >= policy.maxNewItems) return false;
  const family = productFamilyForTitle(offer.title);
  if (!family) return true;
  return (acceptedByFamily.get(family) ?? 0) < policy.maxNewPerFamily;
}

export async function sweep(
  adapter: CaptureAdapter,
  cred: Credential,
  store: OfferStore,
  opts: SweepOptions,
  ctx: CaptureContext,
): Promise<SweepSummary> {
  const startedAt = new Date();
  const startedMs = Date.now();
  const params: FetchParams = { ...(opts.params ?? {}), maxPages: opts.maxPages };
  const runId = await store.startCaptureRun({
    tenantId: opts.tenantId,
    marketplace: adapter.marketplace,
    startedAt,
    collectorRunId: ctx.runId,
    parameters: {
      keyword: params.keyword,
      shopId: params.shopId,
      minClaimedDiscount: params.minClaimedDiscount,
      pageSize: params.pageSize,
      cursor: params.cursor,
      maxPages: params.maxPages,
      captureExecutionId: opts.discovery?.executionId,
      operationBatchId: opts.operationBatchId,
      capturePlanId: opts.discovery?.planId,
      captureQueryId: opts.discovery?.queryId,
      captureMode: opts.discovery?.mode,
      targetCategory: opts.discovery?.targetCategory,
      targetFamily: opts.discovery?.targetFamily,
      maxNewItems: opts.discovery?.maxNewItems,
      maxNewPerFamily: opts.discovery?.maxNewPerFamily,
      saturationThreshold: opts.discovery?.saturationThreshold,
      minCandidatesForSaturation: opts.discovery?.minCandidatesForSaturation,
    },
  });

  let itemsSeen = 0;
  let itemsCaptured = 0;
  let itemsNew = 0;
  let priceChanges = 0;
  let itemsSkippedByPolicy = 0;
  let pagesRead = 0;
  let saturationDetected = false;
  let saturatedFamily: ProductFamily | undefined;
  let errorMessage: string | undefined;
  const acceptedExternalIds = new Set<string>();
  const skippedExternalIds = new Set<string>();
  const acceptedByFamily = new Map<ProductFamily, number>();
  const candidatesByFamily = new Map<ProductFamily, number>();
  let uniqueNewCandidates = 0;

  try {
    for await (const offers of adapter.streamOffers(cred, params, ctx)) {
      pagesRead++;
      itemsSeen += offers.length;
      const existingExternalIds = await store.findExistingExternalIds(
        opts.tenantId,
        adapter.marketplace,
        offers.map((offer) => offer.externalId),
      );

      for (const offer of offers) {
        const known = existingExternalIds.has(offer.externalId) || acceptedExternalIds.has(offer.externalId);
        if (!known && skippedExternalIds.has(offer.externalId)) continue;

        if (!known) {
          uniqueNewCandidates++;
          const family = productFamilyForTitle(offer.title);
          if (family) candidatesByFamily.set(family, (candidatesByFamily.get(family) ?? 0) + 1);

          if (!shouldAcceptNewOffer(offer, opts.discovery, itemsNew, acceptedByFamily)) {
            itemsSkippedByPolicy++;
            skippedExternalIds.add(offer.externalId);
            continue;
          }
        }

        itemsCaptured++;
        const result = await store.upsertProductWithObservation({
          captureRunId: runId,
          tenantId: opts.tenantId,
          marketplace: offer.marketplace,
          externalId: offer.externalId,
          title: offer.title,
          productUrl: offer.productUrl,
          imageUrl: offer.imageUrl,
          category: categoryForTitle(offer.title),
          family: familyInfoForTitle(offer.title),
          priceCents: offer.priceCents,
          originalPriceCents: offer.originalPriceCents,
          claimedDiscountRate: offer.claimedDiscountRate,
          ratingStar: offer.ratingStar,
          salesLabel: offer.salesLabel,
          salesCount: offer.salesCount,
          observedAt: offer.capturedAt,
        });
        if (result.isNew) {
          itemsNew++;
          acceptedExternalIds.add(offer.externalId);
          const family = productFamilyForTitle(offer.title);
          if (family) acceptedByFamily.set(family, (acceptedByFamily.get(family) ?? 0) + 1);
        }
        else if (result.previousPriceCents !== offer.priceCents) priceChanges++;
      }

      const dominant = dominantFamily(candidatesByFamily, uniqueNewCandidates);
      if (
        opts.discovery?.stopOnSaturation &&
        uniqueNewCandidates >= opts.discovery.minCandidatesForSaturation &&
        dominant.family &&
        dominant.share >= opts.discovery.saturationThreshold
      ) {
        saturationDetected = true;
        saturatedFamily = dominant.family;
        ctx.log({
          level: "warn",
          msg: "consulta interrompida por saturação de família",
          data: {
            planId: opts.discovery.planId,
            queryId: opts.discovery.queryId,
            family: dominant.family,
            share: dominant.share,
            candidates: uniqueNewCandidates,
          },
        });
        break;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await store.finishCaptureRun(runId, {
      finishedAt: new Date(),
      status: errorMessage ? "error" : itemsSeen === 0 ? "error" : "ok",
      itemsCaptured,
      itemsNew,
      priceChanges,
      error: errorMessage ?? (itemsSeen === 0 ? "zero itens recebidos da fonte" : undefined),
      parameterPatch: {
        itemsSeen,
        itemsSkippedByPolicy,
        pagesRead,
        saturationDetected,
        dominantFamily: saturatedFamily,
      },
    });
  }

  ctx.log({
    level: "info",
    msg: "varredura concluída",
    data: { marketplace: adapter.marketplace, itemsSeen, itemsCaptured, itemsNew, priceChanges, itemsSkippedByPolicy, saturationDetected },
  });

  return {
    runId,
    marketplace: adapter.marketplace,
    itemsSeen,
    itemsCaptured,
    itemsNew,
    priceChanges,
    itemsSkippedByPolicy,
    pagesRead,
    saturationDetected,
    dominantFamily: saturatedFamily,
    durationMs: Date.now() - startedMs,
  };
}
