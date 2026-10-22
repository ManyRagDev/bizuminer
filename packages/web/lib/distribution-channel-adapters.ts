/**
 * Adapters de Canais Oficiais de Distribuição (OS-15 / EP-11 / G-CHANNEL / OPEN-04 / OPEN-06).
 *
 * Implementa:
 * - TelegramDistributionAdapter (Bot API com escape MarkdownV2 e rate-limit)
 * - WebhookDistributionAdapter (Webhook HTTPS assinado com HMAC-SHA256)
 * - Mock/Test DistributionAdapter para baterias determinísticas
 */

import { createHmac } from "node:crypto";
import type {
  DistributionAdapter,
  DistributionAdapterResult,
  DistributionAdapterCapabilities,
  ApprovedDispatchFacts,
} from "./dispatch-contract.ts";

/**
 * Escapa caracteres especiais para MarkdownV2 do Telegram.
 * Caracteres que devem ser escapados: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
export function escapeTelegramMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/** HTTP Retry-After supports delay-seconds or an HTTP date; invalid values use the safe default. */
function webhookRetryAfter(value: string | null | undefined, now: number): number {
  const header = value?.trim() ?? "";
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    if (Number.isSafeInteger(seconds) && now + seconds * 1000 <= 8.64e15) return seconds;
  } else if (/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(header)) {
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - now) / 1000));
  }
  return 30;
}

/**
 * Adapter oficial para envio via Telegram Bot API.
 */
export class TelegramDistributionAdapter implements DistributionAdapter {
  readonly channel: "telegram" | "telegram_channel";
  readonly capabilities: DistributionAdapterCapabilities = {
    canReconcile: false,
    supportsCancellation: true,
  };

  private readonly botTokenResolver?: (secretRef: string) => Promise<string | null>;
  private readonly customFetch: typeof fetch;

  constructor(
    botTokenResolver?: (secretRef: string) => Promise<string | null>,
    customFetch: typeof fetch = fetch,
    channel: "telegram" | "telegram_channel" = "telegram_channel",
  ) {
    this.channel = channel;
    this.botTokenResolver = botTokenResolver;
    this.customFetch = customFetch;
  }

  async validateDestination(targetRef: string): Promise<{
    valid: boolean;
    normalizedRef?: string;
    error?: string;
  }> {
    const trimmed = (targetRef || "").trim();
    // Canal público (@nome_canal) ou chat_id numérico (-100123456789 ou 123456789)
    if (/^@[A-Za-z0-9_]{5,32}$/.test(trimmed) || /^-?[0-9]{5,20}$/.test(trimmed)) {
      return { valid: true, normalizedRef: trimmed };
    }
    return {
      valid: false,
      error: "Destino inválido para Telegram. Esperado @canal_publico ou chat_id numérico.",
    };
  }

  async sendApprovedRevision(params: {
    destination: {
      id: string;
      targetRef: string;
      secretRef?: string;
    };
    text: string;
    link: string;
    idempotencyKey: string;
    signal?: AbortSignal;
    facts?: ApprovedDispatchFacts;
  }): Promise<DistributionAdapterResult> {
    if (params.signal?.aborted) {
      return {
        kind: "unknown",
        attemptId: params.idempotencyKey,
        reason: "ABORTED_BEFORE_TRANSPORT",
      };
    }

    let token: string | null = null;
    if (this.botTokenResolver) {
      try {token = await this.botTokenResolver(params.destination.secretRef || "");} catch {token = null;}
    }


    if (!token?.trim()) {
      return {
        kind: "rejected",
        code: "TELEGRAM_TOKEN_NOT_CONFIGURED",
        retryable: false,
      };
    }

    const escapedText = escapeTelegramMarkdownV2(params.text);
    const escapedLink = params.link.replace(/[\\)]/g, "\\$&");
    const fullMessage = `${escapedText}\n\n👉 [Pegar oferta aqui](${escapedLink})`;

    if (fullMessage.length > 4096) {
      return {
        kind: "rejected",
        code: "MESSAGE_EXCEEDS_TELEGRAM_LIMIT",
        retryable: false,
      };
    }

    const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      const response = await this.customFetch(endpoint, {
        method: "POST",
        signal: params.signal ?? AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": params.idempotencyKey,
        },
        body: JSON.stringify({
          chat_id: params.destination.targetRef,
          text: fullMessage,
          parse_mode: "MarkdownV2",
          disable_web_page_preview: false,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as any;
        if (body?.ok !== true || !body?.result?.message_id) return {kind:"unknown",attemptId:params.idempotencyKey,reason:"INVALID_PROVIDER_PROOF"};
        const msgId = String(body.result.message_id);
        return {
          kind: "sent",
          providerMessageId: msgId,
          confirmedAt: new Date().toISOString(),
        };
      }

      if (response.status === 429) {
        const body = (await response.json().catch(() => ({}))) as any;
        const retryAfter = body?.parameters?.retry_after ?? 30;
        return {
          kind: "rejected",
          code: "RATE_LIMITED",
          retryable: true,
          retryAfterSeconds: Number(retryAfter),
        };
      }

      if (response.status >= 500) {
        return {
          kind: "rejected",
          code: `TELEGRAM_SERVER_ERROR_${response.status}`,
          retryable: true,
          retryAfterSeconds: 15,
        };
      }

      // 400, 401, 403, 404: erros de configuração do cliente/destino
      const errBody = (await response.text().catch(() => "")) || "";
      return {
        kind: "rejected",
        code: `TELEGRAM_CLIENT_ERROR_${response.status}`,
        retryable: false,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return {
          kind: "unknown",
          attemptId: params.idempotencyKey,
          reason: "TRANSPORT_TIMEOUT_OR_ABORTED",
        };
      }
      return {
        kind: "unknown",
        attemptId: params.idempotencyKey,
        reason: "NETWORK_FAILURE",
      };
    }
  }
}

/**
 * Adapter para envio via Webhook HTTPS com assinatura HMAC-SHA256.
 */
export class WebhookDistributionAdapter implements DistributionAdapter {
  readonly channel = "webhook";
  readonly capabilities: DistributionAdapterCapabilities = {
    canReconcile: false,
    supportsCancellation: true,
  };

  private readonly secretResolver?: (secretRef: string) => Promise<string | null>;
  private readonly customFetch: typeof fetch;
  private readonly now: () => number;

  constructor(
    secretResolver?: (secretRef: string) => Promise<string | null>,
    customFetch: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.secretResolver = secretResolver;
    this.customFetch = customFetch;
    this.now = now;
  }

  async validateDestination(targetRef: string): Promise<{
    valid: boolean;
    normalizedRef?: string;
    error?: string;
  }> {
    const trimmed = (targetRef || "").trim();
    if (/^https:\/\/[A-Za-z0-9_.\-]+(?::[0-9]+)?(?:\/[A-Za-z0-9_.\-~%!$&'()*+,;=:@/]*)*$/.test(trimmed)) {
      return { valid: true, normalizedRef: trimmed };
    }
    return {
      valid: false,
      error: "Destino inválido para Webhook. Esperado endpoint HTTPS válido.",
    };
  }

  async sendApprovedRevision(params: {
    destination: {
      id: string;
      targetRef: string;
      secretRef?: string;
    };
    text: string;
    link: string;
    idempotencyKey: string;
    signal?: AbortSignal;
    facts?: ApprovedDispatchFacts;
  }): Promise<DistributionAdapterResult> {
    if (params.signal?.aborted) {
      return {
        kind: "unknown",
        attemptId: params.idempotencyKey,
        reason: "ABORTED_BEFORE_TRANSPORT",
      };
    }

    let secretKey: string | null = null;
    if (this.secretResolver) {
      try {secretKey = await this.secretResolver(params.destination.secretRef || "");} catch {secretKey = null;}
    }
    if (!secretKey?.trim()) return {kind:"rejected",code:"WEBHOOK_SECRET_NOT_CONFIGURED",retryable:false};

    const payloadObj = {
      offer: params.facts?.offer ?? null,
      campaign: params.facts?.campaign ?? null,
      event: "deal_dispatch",
      idempotencyKey: params.idempotencyKey,
      destinationId: params.destination.id,
      text: params.text,
      link: params.link,
      dispatchedAt: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(payloadObj);
    const signature = createHmac("sha256", secretKey).update(bodyStr).digest("hex");

    try {
      const response = await this.customFetch(params.destination.targetRef, {
        method: "POST",
        signal: params.signal ?? AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          "X-BizuMiner-Signature": `sha256=${signature}`,
          "X-Idempotency-Key": params.idempotencyKey,
        },
        body: bodyStr,
      });

      if (response.ok) {
        return {
          kind: "sent",
          providerMessageId: `wh-${params.idempotencyKey}`,
          confirmedAt: new Date().toISOString(),
        };
      }

      if (response.status === 429) {
        return {
          kind: "rejected",
          code: "WEBHOOK_RATE_LIMITED",
          retryable: true,
          retryAfterSeconds: webhookRetryAfter(response.headers?.get("Retry-After"), this.now()),
        };
      }

      if (response.status >= 500) {
        return {
          kind: "rejected",
          code: `WEBHOOK_SERVER_ERROR_${response.status}`,
          retryable: true,
          retryAfterSeconds: 15,
        };
      }

      return {
        kind: "rejected",
        code: `WEBHOOK_CLIENT_ERROR_${response.status}`,
        retryable: false,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return {
          kind: "unknown",
          attemptId: params.idempotencyKey,
          reason: "TRANSPORT_TIMEOUT_OR_ABORTED",
        };
      }
      return {
        kind: "unknown",
        attemptId: params.idempotencyKey,
        reason: "NETWORK_FAILURE",
      };
    }
  }
}

/**
 * Factory de adapters de distribuição.
 */
export function getDistributionAdapter(
  channel: string,
  secretResolver?: (secretRef: string) => Promise<string | null>,
  customFetch?: typeof fetch
): DistributionAdapter {
  const ch = channel.trim().toLowerCase();
  if (ch === "telegram" || ch === "telegram_channel") {
    return new TelegramDistributionAdapter(secretResolver, customFetch, ch);
  }
  if (ch === "webhook") {
    return new WebhookDistributionAdapter(secretResolver, customFetch);
  }
  throw new Error(`Canal de distribuição '${channel}' não suportado.`);
}

/** Built-in provider module consumed by run-dispatch. Approval remains owned by the entrypoint. */
export function createApprovedAdapter(options:{channel:string;resolveSecret:(ref:string)=>Promise<string|null>;fetch?:typeof fetch}):DistributionAdapter {
  return getDistributionAdapter(options.channel,options.resolveSecret,options.fetch);
}
