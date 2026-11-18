import type { collectBrowserOffers } from "../content/page-extractor.ts";
import type { collectMarketplacePage } from "../content/marketplace-page.ts";

export interface StoredBrowserBatch {
  batchId?: string;
  payload?: ReturnType<typeof collectBrowserOffers> | NonNullable<ReturnType<typeof collectMarketplacePage>>;
  sent?: boolean;
  queued?: boolean;
  queuedAt?: number;
  attempts?: number;
  lastAttemptAt?: number;
  lastError?: string;
  nextRetryAt?: number;
  stopped?: boolean;
  origin?: string;
  deviceId?: string;
  /** Recorded only by a successful fresh extraction. Missing means unknown, never current. */
  collectorVersion?: string | null;
}

export const BROWSER_BATCH_KEY = "bm_browser_batch";
export const BATCH_QUEUE_ALARM = "bm_batch_queue_retry";
export const BATCH_MAX_ATTEMPTS = 6; // includes initial delivery; never indefinite
export const BATCH_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Marca um lote para entrega assíncrona em segundo plano.
 * Preserva payload e timestamp original do enfileiramento.
 */
export function markBatchQueued(
  batch: StoredBrowserBatch,
  error: string = "retryable",
  now: number = Date.now(),
): StoredBrowserBatch {
  return {
    ...batch,
    queued: true,
    queuedAt: batch.queuedAt ?? now,
    attempts: (batch.attempts ?? 0) + 1,
    lastAttemptAt: now,
    lastError: error,
  };
}

/**
 * Verifica se o lote enfileirado expirou por tempo (> 30 min) ou excesso de tentativas.
 */
export function isBatchExpired(
  batch: StoredBrowserBatch,
  now: number = Date.now(),
): boolean {
  const capturedAt = Date.parse(batch.payload?.clientCapturedAt ?? "");
  const attempts = batch.attempts ?? 0;
  return !Number.isFinite(capturedAt) || now - capturedAt >= BATCH_MAX_AGE_MS || attempts >= BATCH_MAX_ATTEMPTS;
}

/**
 * Indica se o lote ainda deve ser retentado em segundo plano.
 */
export function shouldRetryBatch(
  batch: StoredBrowserBatch | undefined,
  now: number = Date.now(),
): boolean {
  if (!batch || batch.stopped || !batch.queued || !batch.payload) return false;
  return !isBatchExpired(batch, now);
}
