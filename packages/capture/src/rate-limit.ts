/**
 * Controle de taxa e retentativa.
 *
 * A Shopee não publica limite numérico — sinaliza excesso pelo código 10030.
 * Isso significa que a cadência precisa ser calibrada empiricamente e o
 * sistema precisa reagir ao sinal, não confiar num número fixo.
 *
 * Duas peças: um token bucket que espaça as chamadas por marketplace, e um
 * backoff exponencial com jitter para quando o limite for atingido mesmo assim.
 */

import { CaptureError, isCaptureError } from "./errors.ts";

/** Espaça chamadas a uma taxa média, permitindo rajadas até `burst`. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly ratePerSecond: number;
  private readonly burst: number;
  private readonly now: () => number;

  constructor(
    ratePerSecond: number,
    burst?: number,
    now: () => number = Date.now,
  ) {
    if (ratePerSecond <= 0) throw new Error("ratePerSecond deve ser positivo");
    this.ratePerSecond = ratePerSecond;
    this.burst = burst ?? Math.max(1, Math.ceil(ratePerSecond));
    this.now = now;
    this.tokens = this.burst;
    this.lastRefill = now();
  }

  /** Resolve quando houver crédito para mais uma chamada. */
  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil((deficit / this.ratePerSecond) * 1000);
      await sleep(waitMs, signal);
    }
  }

  private refill(): void {
    const now = this.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.ratePerSecond);
    this.lastRefill = now;
  }

  /** Exposto para teste. */
  get available(): number {
    this.refill();
    return this.tokens;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CaptureError({ kind: "aborted", marketplace: "-", message: "cancelado" }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CaptureError({ kind: "aborted", marketplace: "-", message: "cancelado" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly signal?: AbortSignal;
  readonly onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  /** Injetável para tornar o teste determinístico. */
  readonly random?: () => number;
}

/**
 * Backoff exponencial com jitter completo.
 *
 * O jitter não é enfeite: sem ele, várias filas que estouram o limite ao mesmo
 * tempo repetem juntas, sincronizadas, e estouram de novo — o "thundering herd".
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    signal,
    onRetry,
    random = Math.random,
  } = opts;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (isCaptureError(err) && err.kind === "aborted") throw err;
      if (isCaptureError(err) && !err.retryable) throw err;
      if (attempt === maxAttempts) break;

      const hinted = isCaptureError(err) ? err.retryAfterMs : undefined;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = hinted ?? Math.floor(random() * exponential);

      onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs, signal);
    }
  }

  throw lastError;
}
