/**
 * Outbox da extensão (E6, esqueleto completo em E5). Pura, sem chrome — recebe
 * e devolve listas. Retry NUNCA gera outro requestId: o payload já nasce com
 * `requestId` e todos os retries o preservam (I4).
 */

import type { CapturePayload } from "./contracts.ts";

export const OUTBOX_MAX_ITEMS = 200;
export const OUTBOX_TTL_MS = 30 * 60 * 1000; // same freshness window as manual browser imports
export const OUTBOX_MAX_ATTEMPTS = 6;

/** Backoff em ms, indexado por tentativa: 5s, 30s, 2min, 10min. */
export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

export interface OutboxEntry {
  requestId: string;
  payload: CapturePayload;
  attempts: number;
  addedAt: number;
  nextRetryAt: number;
  lastError?: string;
  stopped?: boolean;
  origin?: string;
  deviceId?: string;
}

export type Outbox = OutboxEntry[];

/** Adiciona um payload à fila. Preserva se já existir (idempotente). */
export function enqueue(outbox: Outbox, payload: CapturePayload, now = Date.now()): Outbox {
  if (outbox.some((e) => e.requestId === payload.requestId)) return outbox;
  if (outbox.length >= OUTBOX_MAX_ITEMS) throw new Error("queue_full");
  const entry: OutboxEntry = {
    requestId: payload.requestId,
    payload,
    attempts: 0,
    addedAt: now,
    nextRetryAt: now,
  };
  return [...outbox, entry];
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

/** Retém itens expirados como falhas visíveis (TTL) — chamado no alarme/ativação. */
export function pruneExpired(outbox: Outbox, now = Date.now()): Outbox {
  return outbox.map(e => !e.stopped && (now - e.addedAt >= OUTBOX_TTL_MS || e.attempts >= OUTBOX_MAX_ATTEMPTS)
    ? { ...e, stopped: true, lastError: e.attempts >= OUTBOX_MAX_ATTEMPTS ? "retry_limit" : "capture_expired" } : e);
}

/** Itens prontos para nova tentativa (nextRetryAt <= now). */
export function dueForRetry(outbox: Outbox, now = Date.now()): OutboxEntry[] {
  return pruneExpired(outbox, now).filter((e) => !e.stopped && e.nextRetryAt <= now);
}
