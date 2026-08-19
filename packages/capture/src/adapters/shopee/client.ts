/**
 * Transporte GraphQL da Shopee com assinatura HMAC-SHA256.
 *
 * Formato exigido pela Shopee:
 *   Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={Signature}
 *   Signature = SHA256(AppId + Timestamp + Payload + Secret)
 *
 * Detalhe que quebra a integração se ignorado: a assinatura é calculada sobre
 * a STRING EXATA do corpo enviado. Serializar duas vezes (uma para assinar,
 * outra para enviar) pode produzir strings diferentes — ordem de chave, espaço,
 * escape de unicode. Por isso serializamos uma vez e reusamos.
 */

import { createHash } from "node:crypto";
import { CaptureError } from "../../errors.ts";
import { TokenBucket, withRetry } from "../../rate-limit.ts";
import type { CaptureContext } from "../../types.ts";

export const SHOPEE_ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";
export const MARKETPLACE = "shopee";

/** Código que a Shopee usa para sinalizar excesso de requisições. */
export const RATE_LIMIT_CODE = 10030;

export interface ShopeeCredentialFields {
  readonly appId: string;
  readonly appSecret: string;
}

export interface ShopeeClientOptions {
  readonly endpoint?: string;
  /**
   * Requisições por segundo. A Shopee não publica o limite; começamos
   * conservadores e calibramos observando a frequência do código 10030.
   */
  readonly ratePerSecond?: number;
  readonly timeoutMs?: number;
  /** Injetável para teste. */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message?: string;
    extensions?: { code?: number | string };
  }>;
}

export class ShopeeClient {
  private readonly endpoint: string;
  private readonly bucket: TokenBucket;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(opts: ShopeeClientOptions = {}) {
    this.endpoint = opts.endpoint ?? SHOPEE_ENDPOINT;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.bucket = new TokenBucket(opts.ratePerSecond ?? 1, undefined, this.now);
  }

  /**
   * Monta o cabeçalho de autorização.
   * Exposto para que o teste verifique a assinatura sem rede.
   */
  buildAuthHeader(
    cred: ShopeeCredentialFields,
    payload: string,
    timestampSeconds: number,
  ): string {
    const base = `${cred.appId}${timestampSeconds}${payload}${cred.appSecret}`;
    const signature = createHash("sha256").update(base, "utf8").digest("hex");
    return `SHA256 Credential=${cred.appId}, Timestamp=${timestampSeconds}, Signature=${signature}`;
  }

  async request<T>(
    cred: ShopeeCredentialFields,
    query: string,
    variables: Record<string, unknown>,
    ctx: CaptureContext,
  ): Promise<T> {
    return withRetry(() => this.requestOnce<T>(cred, query, variables, ctx), {
      signal: ctx.signal,
      maxAttempts: 5,
      onRetry: ({ attempt, delayMs, error }) => {
        ctx.log({
          level: "warn",
          msg: "repetindo chamada à Shopee",
          data: {
            attempt,
            delayMs,
            kind: error instanceof CaptureError ? error.kind : "unknown",
          },
        });
      },
    });
  }

  private async requestOnce<T>(
    cred: ShopeeCredentialFields,
    query: string,
    variables: Record<string, unknown>,
    ctx: CaptureContext,
  ): Promise<T> {
    await this.bucket.acquire(ctx.signal);

    // Serializa UMA vez. A mesma string é assinada e enviada.
    const payload = JSON.stringify({ query, variables });
    const timestamp = Math.floor(this.now() / 1000);
    const authorization = this.buildAuthHeader(cred, payload, timestamp);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onOuterAbort = () => controller.abort();
    ctx.signal?.addEventListener("abort", onOuterAbort, { once: true });

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: authorization,
        },
        body: payload,
        signal: controller.signal,
      });
    } catch (cause) {
      if (ctx.signal?.aborted) {
        throw new CaptureError({
          kind: "aborted",
          marketplace: MARKETPLACE,
          message: "captura cancelada",
        });
      }
      throw new CaptureError({
        kind: "transport",
        marketplace: MARKETPLACE,
        message: "falha de rede ao chamar a Shopee",
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
        message: "credencial da Shopee rejeitada",
        vendorCode: response.status,
      });
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new CaptureError({
        kind: "rate_limit",
        marketplace: MARKETPLACE,
        message: "limite de requisições atingido (HTTP 429)",
        vendorCode: 429,
        retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
      });
    }

    if (response.status >= 500) {
      throw new CaptureError({
        kind: "transport",
        marketplace: MARKETPLACE,
        message: `erro do servidor da Shopee (HTTP ${response.status})`,
        vendorCode: response.status,
      });
    }

    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch (cause) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: MARKETPLACE,
        message: "resposta da Shopee não é JSON válido",
        cause,
      });
    }

    // GraphQL devolve 200 mesmo em erro — o status HTTP não basta.
    if (body.errors?.length) {
      const first = body.errors[0];
      const code = first?.extensions?.code;

      if (Number(code) === RATE_LIMIT_CODE) {
        throw new CaptureError({
          kind: "rate_limit",
          marketplace: MARKETPLACE,
          message: "limite de requisições atingido (código 10030)",
          vendorCode: RATE_LIMIT_CODE,
        });
      }

      throw new CaptureError({
        kind: "marketplace_error",
        marketplace: MARKETPLACE,
        message: first?.message ?? "erro não descrito retornado pela Shopee",
        vendorCode: code,
      });
    }

    if (!body.data) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: MARKETPLACE,
        message: "resposta da Shopee sem campo data",
      });
    }

    return body.data;
  }
}
