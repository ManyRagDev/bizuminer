/**
 * Outbox da extensão (E6, esqueleto completo em E5). Pura, sem chrome — recebe
 * e devolve listas. Retry NUNCA gera outro requestId: o payload já nasce com
 * `requestId` e todos os retries o preservam (I4).
 */

import type { CapturePayload } from "./contracts.ts";

export const OUTBOX_MAX_ITEMS = 200;
export const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Backoff em ms, indexado por tentativa: 5s, 30s, 2min, 10min. */
export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

export interface OutboxEntry {
  requestId: string;
  payload: CapturePayload;
  attempts: number;
  addedAt: number;
  nextRetryAt: number;
  lastError?: string;
}

export type Outbox = OutboxEntry[];

/** Adiciona um payload à fila. Descarta silenciosamente se já existir (idempotente). */
export function enqueue(outbox: Outbox, payload: CapturePayload, now = Date.now()): Outbox {
  if (outbox.some((e) => e.requestId === payload.requestId)) return outbox;
  const entry: OutboxEntry = {
    requestId: payload.requestId,
    payload,
    attempts: 0,
    addedAt: now,
    nextRetryAt: now,
  };
  const next = [...outbox, entry];
  return next.length > OUTBOX_MAX_ITEMS ? next.slice(next.length - OUTBOX_MAX_ITEMS) : next;
}

/** Remove o item por requestId (200 recebido, mesmo com duplicate:true). */
export function dequeue(outbox: Outbox, requestId: string): Outbox {
  return outbox.filter((e) => e.requestId !== requestId);
}

/** Marca falha recuperável e agenda o próximo retry com backoff. */
export function markRetry(outbox: Outbox, requestId: string, error: string, now = Date.now()): Outbox {
  return outbox.map((e) => {
    if (e.requestId !== requestId) return e;
    const delay = RETRY_DELAYS_MS[Math.min(e.attempts, RETRY_DELAYS_MS.length - 1)]!;
    return { ...e, attempts: e.attempts + 1, lastError: error, nextRetryAt: now + delay };
  });
}

/** Remove itens expirados (TTL) — chamado no alarme/ativação. */
export function pruneExpired(outbox: Outbox, now = Date.now()): Outbox {
  return outbox.filter((e) => now - e.addedAt < OUTBOX_TTL_MS);
}

/** Itens prontos para nova tentativa (nextRetryAt <= now). */
export function dueForRetry(outbox: Outbox, now = Date.now()): OutboxEntry[] {
  return outbox.filter((e) => e.nextRetryAt <= now);
}
