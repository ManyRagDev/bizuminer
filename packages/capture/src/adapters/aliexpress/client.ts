/**
 * Transporte da AliExpress Open Platform (esquema TOP).
 *
 * A especificação aqui NÃO foi inferida de documentação — foi determinada
 * empiricamente por `bin/aliexpress-probe.ts` contra a API real em
 * 28/08/2026, que testou cinco variantes plausíveis e reportou quais o
 * servidor aceita. Resultado:
 *
 *   gateway  /sync ✓        |  /rest ✗ ("InvalidApiPath")
 *   hash     hmac-sha256 ✓  |  md5 ✓
 *   tempo    epoch-ms ✓     |  "yyyy-MM-dd HH:mm:ss" GMT+8 ✓
 *   OAuth    NÃO exigido para aliexpress.affiliate.product.query
 *
 * Das combinações aceitas escolhemos HMAC-SHA256 + epoch-ms por dois motivos
 * de risco, não de gosto:
 * 1. MD5 é criptograficamente quebrado; não há razão para preferi-lo quando
 *    o servidor aceita HMAC-SHA256.
 * 2. O timestamp em datetime exige converter para GMT+8. Errar esse fuso não
 *    falha com "hora errada" — falha com "assinatura inválida", porque o
 *    timestamp entra na string assinada, e aí se perde o dia depurando o
 *    hash, que está certo. Epoch-ms é `Date.now()`: zero lógica de fuso.
 */

import { CaptureError } from "../../errors.ts";
import { TokenBucket, withRetry } from "../../rate-limit.ts";
import type { CaptureContext } from "../../types.ts";
import { baseString, signHmacSha256 } from "./signing.ts";

export const ALIEXPRESS_ENDPOINT = "https://api-sg.aliexpress.com/sync";
export const MARKETPLACE = "aliexpress";

export interface AliExpressCredentialFields {
  readonly appKey: string;
  readonly appSecret: string;
  /** Rótulo de canal criado no Portals. Sem ele a comissão não é atribuída. */
  readonly trackingId?: string;
}

export interface AliExpressClientOptions {
  readonly endpoint?: string;
  /**
   * Requisições por segundo. Referência operacional citada nos materiais da
   * plataforma: ~5.000 chamadas/dia. Começamos conservadores; o limite real
   * depende das permissões aprovadas na conta.
   */
  readonly ratePerSecond?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

/**
 * Envelope de erro do TOP. Chega com HTTP 200, então o status não basta —
 * mesmo problema do GraphQL da Shopee.
 */
interface TopErrorEnvelope {
  readonly type?: string;
  readonly code?: string | number;
  readonly message?: string;
  readonly request_id?: string;
  readonly error_response?: {
    readonly code?: string | number;
    readonly msg?: string;
    readonly sub_code?: string;
    readonly sub_msg?: string;
  };
}

export class AliExpressClient {
  private readonly endpoint: string;
  private readonly bucket: TokenBucket;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(opts: AliExpressClientOptions = {}) {
    this.endpoint = opts.endpoint ?? ALIEXPRESS_ENDPOINT;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.bucket = new TokenBucket(opts.ratePerSecond ?? 2, undefined, this.now);
  }

  /**
   * Monta os parâmetros assinados. Exposto para o teste verificar a
   * assinatura sem rede.
   */
  buildSignedParams(
    cred: AliExpressCredentialFields,
    method: string,
    business: Record<string, string>,
    timestampMs: number,
  ): Record<string, string> {
    const params: Record<string, string> = {
      app_key: cred.appKey,
      method,
      format: "json",
      v: "2.0",
      sign_method: "hmac-sha256",
      timestamp: String(timestampMs),
      ...business,
    };
    // A assinatura cobre TODOS os parâmetros, inclusive os de negócio.
    // Por isso ela é calculada por último, e nada pode ser acrescentado depois.
    return { ...params, sign: signHmacSha256(baseString(params), cred.appSecret) };
  }

  async request<T>(
    cred: AliExpressCredentialFields,
    method: string,
    business: Record<string, string>,
    ctx: CaptureContext,
  ): Promise<T> {
    return withRetry(() => this.requestOnce<T>(cred, method, business, ctx), {
      signal: ctx.signal,
      maxAttempts: 4,
      onRetry: ({ attempt, delayMs, error }) => {
        ctx.log({
          level: "warn",
          msg: "repetindo chamada à AliExpress",
          data: {
            method,
            attempt,
            delayMs,
            kind: error instanceof CaptureError ? error.kind : "unknown",
          },
        });
      },
    });
  }

  private async requestOnce<T>(
    cred: AliExpressCredentialFields,
    method: string,
    business: Record<string, string>,
    ctx: CaptureContext,
  ): Promise<T> {
    await this.bucket.acquire(ctx.signal);

    const params = this.buildSignedParams(cred, method, business, this.now());
    const body = new URLSearchParams(params).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onOuterAbort = () => controller.abort();
    ctx.signal?.addEventListener("abort", onOuterAbort, { once: true });

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body,
        signal: controller.signal,
      });
    } catch (cause) {
      if (ctx.signal?.aborted) {
        throw new CaptureError({ kind: "aborted", marketplace: MARKETPLACE, message: "captura cancelada" });
      }
      throw new CaptureError({
        kind: "transport",
        marketplace: MARKETPLACE,
        message: "falha de rede ao chamar a AliExpress",
        cause,
      });
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (response.status === 401 || response.status === 403) {
      throw new CaptureError({
        kind: "auth",
        marketplace: MARKETPLACE,
        message: "credencial da AliExpress rejeitada",
        vendorCode: response.status,
      });
    }
    if (response.status >= 500) {
      throw new CaptureError({
        kind: "transport",
        marketplace: MARKETPLACE,
        message: `erro do servidor da AliExpress (HTTP ${response.status})`,
        vendorCode: response.status,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: MARKETPLACE,
        message: "resposta da AliExpress não é JSON válido",
        cause,
      });
    }

    this.assertNoTopError(payload as TopErrorEnvelope);
    return payload as T;
  }

  /**
   * O TOP sinaliza erro de duas formas distintas, ambas com HTTP 200:
   * `{type, code, message}` no nível raiz (ex.: InvalidApiPath, visto na
   * espiga) e `{error_response:{...}}` no formato clássico. Tratar só uma
   * delas faria o erro passar como sucesso e virar "resposta sem produtos".
   */
  private assertNoTopError(body: TopErrorEnvelope): void {
    if (body?.error_response) {
      const e = body.error_response;
      const code = e.sub_code ?? e.code ?? "?";
      throw new CaptureError({
        kind: this.kindForCode(String(code)),
        marketplace: MARKETPLACE,
        message: String(e.sub_msg ?? e.msg ?? "erro não descrito"),
        vendorCode: code,
      });
    }
    if (body?.code !== undefined && body?.message) {
      throw new CaptureError({
        kind: this.kindForCode(String(body.code)),
        marketplace: MARKETPLACE,
        message: String(body.message),
        vendorCode: body.code,
      });
    }
  }

  /** Traduz o código do fornecedor para a taxonomia que o worker entende. */
  private kindForCode(code: string): "auth" | "rate_limit" | "marketplace_error" {
    const c = code.toLowerCase();
    if (c.includes("sign") || c.includes("apppermission") || c.includes("invalidapikey")) return "auth";
    if (c.includes("limit") || c.includes("flow") || c.includes("frequen")) return "rate_limit";
    return "marketplace_error";
  }
}
