/**
 * Rate limit em memória (janela deslizante) por chave (normalmente IP).
 *
 * Escopo propositalmente mínimo (decisão 25/08/2026): o dono pediu para NÃO
 * blindar agora — o cenário de flood só existe quando houver muitos usuários
 * ativos (i.e., o produto vingou). Isto é um backstop barato, não uma solução
 * de produção.
 *
 * Limitações honestas:
 * - Estado EM MEMÓRIA. Em serverless (Vercel) cada instância/função tem seu
 *   próprio mapa, e um cold start zera tudo. Serve para dev e para absorver
 *   picos de um token vazado, não para garantia forte.
 * - A chave de produção correta seria Redis ou uma tabela no Postgres. Trocar
 *   depois não muda a interface: `check()` segue igual.
 */

export interface RateLimitResult {
  /** `true` quando o pedido deve ser rejeitado (estourou o limite). */
  limited: boolean;
  /** Quantos pedidos restam na janela (0 quando limitado). */
  remaining: number;
}

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Registra um pedido e informa se ele deve ser bloqueado. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const times = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);

    if (times.length >= this.max) {
      this.buckets.set(key, times);
      return { limited: true, remaining: 0 };
    }

    times.push(now);
    this.buckets.set(key, times);
    return { limited: false, remaining: this.max - times.length };
  }
}

/** Limite do endpoint de captura: janela de 60s, 30 pedidos por IP. */
const CAPTURE_LIMITER = new SlidingWindowLimiter(30, 60_000);

/**
 * Chave de rate limit a partir do request. Em serverless o `x-forwarded-for`
 * vem preenchido pelo proxy; localmente cai para um valor fixo.
 */
export function captureIpKey(forwardedFor: string | null): string {
  const first = (forwardedFor ?? "").split(",")[0]?.trim();
  return first || "local";
}

export function captureRateLimited(key: string): RateLimitResult {
  return CAPTURE_LIMITER.check(key);
}
