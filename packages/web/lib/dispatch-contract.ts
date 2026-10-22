/**
 * Contratos de Automação Progressiva de Distribuição (EP-11 / C-08 / C-05).
 *
 * Implementa o núcleo da fila de disparo assistido, leases atômicos,
 * validação pré-I/O, gestão de incerteza e isolamento de canais.
 */

export type DispatchJobStatus =
  | "queued"
  | "leased"
  | "succeeded"
  | "failed"
  | "unknown"
  | "cancelled";

export interface DispatchJob {
  readonly id: string;
  readonly tenantId: string;
  readonly campaignPublicationId: string;
  readonly kitRevisionId: string;
  readonly destinationId: string;
  readonly scheduledAt: string;
  readonly status: DispatchJobStatus;
  readonly leaseUntil: string | null;
  readonly leaseToken: string | null;
  readonly attempt: number;
  readonly nextAttemptAt: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly ioStartedAt?: string | null;
  readonly failureCode?: string | null;
  readonly providerMessageId?: string | null;
  readonly reconciliationNote?: string | null;
  readonly reconciledBy?: string | null;
  readonly reconciledAt?: string | null;
}

/**
 * Classifica a recuperação conservadora de um lease expirado (crash do worker).
 * Se o I/O já foi iniciado antes da queda, move obrigatoriamente para 'unknown'.
 * Se caiu antes de iniciar o I/O, é seguro recuperar para 'queued'.
 */
export function classifyExpiredLease(job: DispatchJob): "recover_queued" | "transition_unknown" {
  if (job.ioStartedAt) {
    return "transition_unknown";
  }
  return "recover_queued";
}

export type DistributionAdapterResult =
  | {
      readonly kind: "sent";
      readonly providerMessageId: string;
      readonly confirmedAt: string;
    }
  | {
      readonly kind: "rejected";
      readonly code: string;
      readonly retryable: boolean;
      readonly retryAfterSeconds?: number;
    }
  | {
      readonly kind: "unknown";
      readonly attemptId: string;
      readonly reason: string;
    };

export interface DistributionAdapterCapabilities {
  readonly canReconcile: boolean;
  readonly supportsCancellation: boolean;
}

export interface ApprovedDispatchFacts {
  readonly offer: {readonly productId:string;readonly title:string;readonly priceCents:number;readonly currency:string;readonly productUrl:string};
  readonly campaign: {readonly id:string;readonly publicationId:string;readonly kitRevisionId:string};
}
export interface DistributionAdapter {
  readonly channel: string;
  readonly capabilities: DistributionAdapterCapabilities;
  validateDestination(targetRef: string): Promise<{
    valid: boolean;
    normalizedRef?: string;
    error?: string;
  }>;
  sendApprovedRevision(params: {
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
  }): Promise<DistributionAdapterResult>;
  reconcileStatus?(
    providerMessageId: string,
  ): Promise<DistributionAdapterResult | null>;
}

/**
 * Validação mandatória antes de qualquer I/O com provedores externos.
 * Se houver alteração de preço, expiração, revogação de link,
 * suspensão de conta ou acionamento de kill switch, o envio é impedido.
 */
export function validatePreDispatch(params: {
  accountStatus: string;
  destinationStatus: string;
  killSwitchActive: boolean;
  kitStatus: string;
  kitRevisionId: string;
  targetKitRevisionId: string;
  priceObservedCents: number;
  snapshotPriceCents: number;
  validUntil: string;
  linkMonetizationStatus: string;
  now?: Date;
}): { canDispatch: boolean; reason?: string } {
  const now = params.now ?? new Date();

  if (params.accountStatus !== "active") {
    return {
      canDispatch: false,
      reason: `ACCOUNT_NOT_ACTIVE:${params.accountStatus}`,
    };
  }

  if (params.killSwitchActive) {
    return {
      canDispatch: false,
      reason: "KILL_SWITCH_ACTIVE",
    };
  }

  if (params.destinationStatus !== "active") {
    return {
      canDispatch: false,
      reason: `DESTINATION_NOT_ACTIVE:${params.destinationStatus}`,
    };
  }

  if (params.kitStatus !== "approved") {
    return {
      canDispatch: false,
      reason: `KIT_NOT_APPROVED:${params.kitStatus}`,
    };
  }

  if (params.kitRevisionId !== params.targetKitRevisionId) {
    return {
      canDispatch: false,
      reason: "KIT_REVISION_SUPERSEDED",
    };
  }

  if (params.priceObservedCents !== params.snapshotPriceCents) {
    return {
      canDispatch: false,
      reason: `PRICE_DRIFT:observed=${params.priceObservedCents},snapshot=${params.snapshotPriceCents}`,
    };
  }

  if (!params.validUntil || typeof params.validUntil !== "string") {
    return {
      canDispatch: false,
      reason: "INVALID_VALID_UNTIL",
    };
  }
  const validUntilMs = new Date(params.validUntil).getTime();
  if (!Number.isFinite(validUntilMs)) {
    return {
      canDispatch: false,
      reason: "INVALID_VALID_UNTIL",
    };
  }
  if (now.getTime() >= validUntilMs) {
    return {
      canDispatch: false,
      reason: "EVIDENCE_EXPIRED",
    };
  }

  if (params.linkMonetizationStatus !== "valid") {
    return {
      canDispatch: false,
      reason: `LINK_INVALID:${params.linkMonetizationStatus}`,
    };
  }

  return { canDispatch: true };
}

/**
 * Verifica se um job está elegível para ser leased por um worker.
 */
export function canLeaseJob(job: DispatchJob, now: Date = new Date()): boolean {
  if (job.status === "cancelled" || job.status === "succeeded") {
    return false;
  }

  // Job em estado unknown nunca é re-leased cegamente sem reconciliação humana ou de adapter
  if (job.status === "unknown") {
    return false;
  }

  const nowMs = now.getTime();
  const scheduledMs = new Date(job.scheduledAt).getTime();

  if (job.status === "queued") {
    if (scheduledMs > nowMs) return false;
    if (job.nextAttemptAt && new Date(job.nextAttemptAt).getTime() > nowMs) {
      return false;
    }
    return true;
  }

  if (job.status === "leased") {
    // Só pode ser re-leased se o lease anterior expirou (worker morreu)
    if (!job.leaseUntil) return true;
    return new Date(job.leaseUntil).getTime() < nowMs;
  }

  return false;
}

/**
 * Verifica se o worker detém o lease atual para poder atualizar o status.
 */
export function canFinalizeJob(job: DispatchJob, workerLeaseToken: string): boolean {
  if (job.status !== "leased") return false;
  if (!job.leaseToken || job.leaseToken !== workerLeaseToken) return false;
  return true;
}

/**
 * Calcula próximo status e agendamento para jobs rejeitados.
 */
export function computeNextAttempt(
  job: DispatchJob,
  result: Extract<DistributionAdapterResult, { kind: "rejected" }>,
  maxAttempts = 3,
  now: Date = new Date(),
  random: () => number = Math.random,
): { nextStatus: "queued" | "failed"; nextAttemptAt?: string } {
  if (!result.retryable || job.attempt >= maxAttempts) {
    return { nextStatus: "failed" };
  }

  const baseDelaySeconds = Math.min(3600, Math.pow(2, Math.min(10, Math.max(0,job.attempt))) * 30);
  const draw=random();
  const jitter=baseDelaySeconds*0.2*(Number.isFinite(draw)?Math.max(0,Math.min(1,draw)):0);
  const providerFloor=Number.isFinite(result.retryAfterSeconds)?Math.max(0,result.retryAfterSeconds!):0;
  const nextAttemptMs = now.getTime() + Math.ceil(Math.max(baseDelaySeconds+jitter,providerFloor)*1000);

  return {
    nextStatus: "queued",
    nextAttemptAt: new Date(nextAttemptMs).toISOString(),
  };
}

/**
 * Reconcilia um job em estado 'unknown'.
 * Não faz retry cego: se o provedor não confirmar o envio, o operador decide ou marca failed.
 */
export function reconcileUnknownJob(
  job: DispatchJob,
  confirmedResult: DistributionAdapterResult | null,
): { resolvedStatus: "succeeded" | "failed" | "unknown"; note: string } {
  if (job.status !== "unknown") {
    return { resolvedStatus: job.status as any, note: "Job was not in unknown state." };
  }

  if (!confirmedResult) {
    return {
      resolvedStatus: "unknown",
      note: "No conclusive evidence from provider yet. Remains unknown.",
    };
  }

  if (confirmedResult.kind === "sent") {
    return {
      resolvedStatus: "succeeded",
      note: `Confirmed sent with provider message ID ${confirmedResult.providerMessageId}.`,
    };
  }

  if (confirmedResult.kind === "rejected") {
    return {
      resolvedStatus: "failed",
      note: `Confirmed not delivered by provider (${confirmedResult.code}).`,
    };
  }

  return {
    resolvedStatus: "unknown",
    note: "Reconciliation attempt returned inconclusive status.",
  };
}

/**
 * Verificação de rate limits e cooldowns por destino.
 */
export function checkRateLimitAndCooldown(params: {
  lastDispatchedAt: string | null;
  minIntervalSeconds: number;
  currentHourlyCount: number;
  maxHourlyCount: number;
  now?: Date;
}): { allowed: boolean; waitSeconds?: number; reason?: string } {
  const now = params.now ?? new Date();

  if (params.currentHourlyCount >= params.maxHourlyCount) {
    return {
      allowed: false,
      reason: `HOURLY_QUOTA_EXCEEDED:${params.currentHourlyCount}/${params.maxHourlyCount}`,
    };
  }

  if (params.lastDispatchedAt) {
    const lastMs = new Date(params.lastDispatchedAt).getTime();
    const elapsedSeconds = (now.getTime() - lastMs) / 1000;
    if (elapsedSeconds < params.minIntervalSeconds) {
      const waitSeconds = Math.ceil(params.minIntervalSeconds - elapsedSeconds);
      return {
        allowed: false,
        waitSeconds,
        reason: `COOLDOWN_ACTIVE:wait_${waitSeconds}s`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Adapter Sintético para testes isolados e desenvolvimento de core sem envio real.
 */
export class SyntheticDistributionAdapter implements DistributionAdapter {
  readonly channel = "synthetic_test";
  readonly capabilities: DistributionAdapterCapabilities = {
    canReconcile: true,
    supportsCancellation: true,
  };

  private sentMessages = new Map<string, { providerMessageId: string; confirmedAt: string }>();
  public behavior: "success" | "reject_retryable" | "reject_fatal" | "timeout_unknown" = "success";

  async validateDestination(targetRef: string): Promise<{ valid: boolean; normalizedRef?: string; error?: string }> {
    if (targetRef.startsWith("@") || targetRef.startsWith("+55") || targetRef.startsWith("test_")) {
      return { valid: true, normalizedRef: targetRef.trim() };
    }
    return { valid: false, error: "INVALID_TARGET_FORMAT" };
  }

  async sendApprovedRevision(params: {
    destination: { id: string; targetRef: string; secretRef?: string };
    text: string;
    link: string;
    idempotencyKey: string;
  }): Promise<DistributionAdapterResult> {
    if (this.behavior === "reject_fatal") {
      return { kind: "rejected", code: "PERMISSION_DENIED", retryable: false };
    }

    if (this.behavior === "reject_retryable") {
      return { kind: "rejected", code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 60 };
    }

    if (this.behavior === "timeout_unknown") {
      return {
        kind: "unknown",
        attemptId: `att_${Date.now()}`,
        reason: "TRANSPORT_TIMEOUT_AFTER_CONNECT: Provider status unknown",
      };
    }

    const providerMessageId = `msg_synth_${Math.random().toString(36).slice(2, 10)}`;
    const confirmedAt = new Date().toISOString();
    this.sentMessages.set(params.idempotencyKey, { providerMessageId, confirmedAt });

    return {
      kind: "sent",
      providerMessageId,
      confirmedAt,
    };
  }

  async reconcileStatus(providerMessageId: string): Promise<DistributionAdapterResult | null> {
    for (const [_, msg] of this.sentMessages.entries()) {
      if (msg.providerMessageId === providerMessageId) {
        return {
          kind: "sent",
          providerMessageId: msg.providerMessageId,
          confirmedAt: msg.confirmedAt,
        };
      }
    }
    return null;
  }
}
