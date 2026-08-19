/**
 * Erros tipados da camada de captura.
 *
 * O worker precisa reagir de forma diferente a cada um: rate limit espera e
 * repete, credencial inválida notifica o cliente e para, transporte repete
 * algumas vezes. Tratar tudo como `Error` genérico obriga a inspecionar
 * string de mensagem — que quebra na primeira mudança de texto do fornecedor.
 */

export type CaptureErrorKind =
  | "rate_limit"
  | "auth"
  | "transport"
  | "malformed_response"
  | "marketplace_error"
  | "aborted";

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind;
  readonly marketplace: string;
  /** Código original do fornecedor, quando houver. Ex.: 10030 na Shopee. */
  readonly vendorCode?: string | number;
  /** Sugestão de espera antes de repetir, em ms. */
  readonly retryAfterMs?: number;
  readonly cause?: unknown;

  constructor(opts: {
    kind: CaptureErrorKind;
    marketplace: string;
    message: string;
    vendorCode?: string | number;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "CaptureError";
    this.kind = opts.kind;
    this.marketplace = opts.marketplace;
    this.vendorCode = opts.vendorCode;
    this.retryAfterMs = opts.retryAfterMs;
    this.cause = opts.cause;
  }

  /** O worker deve tentar de novo? */
  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "transport";
  }

  /** Exige ação humana — notificar o cliente, não repetir em silêncio. */
  get needsOperatorAttention(): boolean {
    return this.kind === "auth" || this.kind === "malformed_response";
  }

  /**
   * Representação segura para log. Nunca inclui credencial porque
   * a credencial nunca chega até aqui.
   */
  toLogSafe(): Record<string, unknown> {
    return {
      kind: this.kind,
      marketplace: this.marketplace,
      vendorCode: this.vendorCode,
      retryAfterMs: this.retryAfterMs,
      message: this.message,
    };
  }
}

export const isCaptureError = (e: unknown): e is CaptureError =>
  e instanceof CaptureError;
