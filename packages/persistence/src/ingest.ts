/**
 * Serviço de ingestão: liga um CaptureAdapter ao OfferStore.
 *
 * Responsabilidades: percorrer páginas via streamOffers, persistir produto +
 * observação de preço, agregar contadores da execução e registrar
 * capture_run — incluindo o caso "zero itens", que é o sintoma silencioso
 * de scraper quebrado (modelo-de-dados.md §10).
 */

import type { CaptureAdapter, CaptureContext, Credential, FetchParams } from "../../capture/src/types.ts";
import { categoryForTitle } from "./category.ts";
import type { OfferStore } from "./store.ts";

export interface SweepOptions {
  readonly tenantId: string;
  readonly params?: FetchParams;
  readonly maxPages?: number;
}

export interface SweepSummary {
  readonly runId: string;
  readonly marketplace: string;
  readonly itemsCaptured: number;
  readonly itemsNew: number;
  readonly priceChanges: number;
  readonly durationMs: number;
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
    },
  });

  let itemsCaptured = 0;
  let itemsNew = 0;
  let priceChanges = 0;
  let errorMessage: string | undefined;

  try {
    for await (const offers of adapter.streamOffers(cred, params, ctx)) {
      for (const offer of offers) {
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
          priceCents: offer.priceCents,
          originalPriceCents: offer.originalPriceCents,
          claimedDiscountRate: offer.claimedDiscountRate,
          ratingStar: offer.ratingStar,
          salesLabel: offer.salesLabel,
          salesCount: offer.salesCount,
          observedAt: offer.capturedAt,
        });
        if (result.isNew) itemsNew++;
        else if (result.previousPriceCents !== offer.priceCents) priceChanges++;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await store.finishCaptureRun(runId, {
      finishedAt: new Date(),
      status: errorMessage ? "error" : itemsCaptured === 0 ? "error" : "ok",
      itemsCaptured,
      itemsNew,
      priceChanges,
      error: errorMessage ?? (itemsCaptured === 0 ? "zero itens capturados" : undefined),
    });
  }

  ctx.log({
    level: "info",
    msg: "varredura concluída",
    data: { marketplace: adapter.marketplace, itemsCaptured, itemsNew, priceChanges },
  });

  return {
    runId,
    marketplace: adapter.marketplace,
    itemsCaptured,
    itemsNew,
    priceChanges,
    durationMs: Date.now() - startedMs,
  };
}
