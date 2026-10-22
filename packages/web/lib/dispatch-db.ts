/**
 * Operações de banco de dados para a fila transacional de disparo (EP-11 / M-11 / C-08).
 *
 * Utiliza Row Level Security e transações seguras com garimpa.tenant_id.
 * Implementa marcador estrito de I/O, recuperação conservadora de crash e reconciliação.
 */

import type postgres from "postgres";
import type { DispatchJob, DispatchJobStatus } from "./dispatch-contract.ts";

export type Sql = postgres.Sql | postgres.TransactionSql;

interface DispatchJobRow {
  id: string;
  tenant_id: string;
  campaign_publication_id: string;
  kit_revision_id: string;
  destination_id: string;
  scheduled_at: string;
  status: DispatchJobStatus;
  lease_until: string | null;
  lease_token: string | null;
  attempt: number;
  next_attempt_at: string | null;
  io_started_at: string | null;
  provider_message_id: string | null;
  failure_code: string | null;
  reconciliation_note: string | null;
  reconciled_by: string | null;
  reconciled_at: string | null;
  idempotency_key: string;
  created_at: string;
}

function toIso(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapRow(row: any): DispatchJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignPublicationId: row.campaign_publication_id,
    kitRevisionId: row.kit_revision_id,
    destinationId: row.destination_id,
    scheduledAt: toIso(row.scheduled_at)!,
    status: row.status,
    leaseUntil: toIso(row.lease_until),
    leaseToken: row.lease_token,
    attempt: Number(row.attempt),
    nextAttemptAt: toIso(row.next_attempt_at),
    ioStartedAt: toIso(row.io_started_at),
    providerMessageId: row.provider_message_id,
    failureCode: row.failure_code,
    reconciliationNote: row.reconciliation_note,
    reconciledBy: row.reconciled_by,
    reconciledAt: toIso(row.reconciled_at),
    idempotencyKey: row.idempotency_key,
    createdAt: toIso(row.created_at)!,
  };
}

/**
 * Agenda um novo job de disparo de forma transacional e idempotente.
 * Impede reagendar jobs que já estão em 'leased', 'unknown' ou 'succeeded'.
 */
export async function scheduleDispatchJob(
  sql: Sql,
  input: {
    tenantId: string;
    campaignPublicationId: string;
    kitRevisionId: string;
    destinationId: string;
    scheduledAt: string;
    idempotencyKey: string;
  },
): Promise<DispatchJob> {
  // Verificar se já existe um job para esse alvo
  const [existing] = await sql<DispatchJobRow[]>`
    select *
    from garimpa.dispatch_job
    where tenant_id = ${input.tenantId}
      and campaign_publication_id = ${input.campaignPublicationId}
      and kit_revision_id = ${input.kitRevisionId}
      and destination_id = ${input.destinationId}
    limit 1
  `;

  if (existing) {
    if (existing.status === "succeeded") {
      return mapRow(existing);
    }
    if (existing.status === "leased") {
      throw new Error(
        "JOB_IN_FLIGHT: Cannot reschedule job currently leased by a worker",
      );
    }
    if (existing.status === "unknown") {
      throw new Error(
        "JOB_UNKNOWN_RECONCILIATION_REQUIRED: Cannot reschedule job in unknown status",
      );
    }
    if (existing.status === "queued") {
      const [updated] = await sql<DispatchJobRow[]>`
        update garimpa.dispatch_job
        set scheduled_at = ${input.scheduledAt}
        where id = ${existing.id} and tenant_id = ${input.tenantId}
        returning *
      `;
      return mapRow(updated!);
    }
  }

  const rows = await sql<DispatchJobRow[]>`
    insert into garimpa.dispatch_job (
      tenant_id, campaign_publication_id, kit_revision_id, destination_id,
      scheduled_at, status, idempotency_key
    ) values (
      ${input.tenantId}, ${input.campaignPublicationId}, ${input.kitRevisionId}, ${input.destinationId},
      ${input.scheduledAt}, 'queued', ${input.idempotencyKey}
    )
    returning *
  `;

  return mapRow(rows[0]!);
}

/**
 * Varre leases expirados com recuperação conservadora de crash.
 * Se o I/O já foi iniciado antes da queda do worker, move obrigatoriamente para 'unknown'.
 * Se caiu antes de iniciar o I/O, restaura com segurança para 'queued'.
 */
export async function sweepExpiredLeases(
  sql: Sql,
  tenantId: string,
): Promise<{ recoveredQueued: number; transitionedUnknown: number }> {
  // 1. Leases expirados onde I/O foi iniciado -> obrigatoriamente UNKNOWN
  const unknownRows = await sql<{ id: string }[]>`
    update garimpa.dispatch_job
    set
      status = 'unknown',
      reconciliation_note = 'WORKER_CRASH_AFTER_IO_START: Lease expired with in-flight I/O marker. Transitioned to unknown for audit reconciliation.',
      lease_token = null,
      lease_until = null
    where tenant_id = ${tenantId}
      and status = 'leased'
      and lease_until < now()
      and io_started_at is not null
    returning id
  `;

  for (const r of unknownRows) {
    await sql`update garimpa.dispatch_reservation set state='unknown' where tenant_id=${tenantId} and job_id=${r.id} and state in ('reserved','started')`;
    await sql`
      update garimpa.dispatch_attempt
      set status = 'unknown',
          note = 'Worker crashed or lost connectivity after starting I/O. Lease expired.',
          io_completed_at = now()
      where job_id = ${r.id} and status = 'in_flight'
    `;
  }

  // 2. Leases expirados sem I/O iniciado -> seguro voltar para QUEUED
  const queuedRows = await sql<{ id: string }[]>`
    update garimpa.dispatch_job
    set
      status = 'queued',
      lease_token = null,
      lease_until = null
    where tenant_id = ${tenantId}
      and status = 'leased'
      and lease_until < now()
      and io_started_at is null
    returning id
  `;

  for (const r of queuedRows) {
    await sql`update garimpa.dispatch_reservation set state='released' where tenant_id=${tenantId} and job_id=${r.id} and state='reserved'`;
    await sql`
      update garimpa.dispatch_attempt
      set status = 'aborted',
          note = 'Worker lease expired before starting I/O. Safely recovered to queue.',
          io_completed_at = now()
      where job_id = ${r.id} and status = 'in_flight'
    `;
  }

  return {
    recoveredQueued: queuedRows.length,
    transitionedUnknown: unknownRows.length,
  };
}

/**
 * Tenta adquirir lease atômico do próximo job elegível.
 * Garante com FOR UPDATE SKIP LOCKED que dois workers nunca acessem o mesmo job.
 */
export async function leaseNextEligibleJob(
  sql: Sql,
  tenantId: string,
  workerLeaseToken: string,
  leaseDurationSeconds = 60,
): Promise<DispatchJob | null> {
  // Executar varredura conservadora de leases expirados antes de dar novo claim
  await sweepExpiredLeases(sql, tenantId);

  const leaseDurationInterval = `${leaseDurationSeconds} seconds`;

  const rows = await sql<DispatchJobRow[]>`
    with candidate as (
      select id
      from garimpa.dispatch_job
      where tenant_id = ${tenantId}
        and status = 'queued'
        and scheduled_at <= now()
        and (next_attempt_at is null or next_attempt_at <= now())
      order by scheduled_at asc
      limit 1
      for update skip locked
    )
    update garimpa.dispatch_job j
    set
      status = 'leased',
      lease_token = ${workerLeaseToken},
      lease_until = now() + ${leaseDurationInterval}::interval,
      attempt = j.attempt + 1,
      io_started_at = null
    from candidate
    where j.id = candidate.id and j.tenant_id = ${tenantId}
    returning j.*
  `;

  if (rows.length === 0) return null;
  const job = mapRow(rows[0]!);

  // Registrar início da tentativa no histórico de auditoria
  await sql`
    insert into garimpa.dispatch_attempt (
      tenant_id, job_id, attempt_number, worker_token, status
    ) values (
      ${tenantId}, ${job.id}, ${job.attempt}, ${workerLeaseToken}, 'in_flight'
    )
  `;

  return job;
}

/**
 * Marca o início formal do I/O externo.
 * Chamado imediatamente antes da chamada de rede ao provedor.
 * Se o processo morrer após essa marcação, o job é recuperado como 'unknown', nunca retry cego.
 */
export async function markIoStarted(
  sql: Sql,
  tenantId: string,
  jobId: string,
  workerLeaseToken: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    update garimpa.dispatch_job
    set io_started_at = now()
    where id = ${jobId}
      and tenant_id = ${tenantId}
      and status = 'leased'
      and lease_token = ${workerLeaseToken}
      and lease_until > now() and io_started_at is null
    returning id
  `;

  if (rows.length === 0) return false;

  await sql`
    update garimpa.dispatch_attempt
    set io_started_at = now()
    where job_id = ${jobId}
      and worker_token = ${workerLeaseToken}
      and status = 'in_flight'
  `;

  return true;
}

/**
 * Finaliza o job com sucesso comprovado pelo provedor.
 */
export async function finalizeJobSuccess(
  sql: Sql,
  tenantId: string,
  jobId: string,
  workerLeaseToken: string,
  result: { providerMessageId: string; confirmedAt?: string },
): Promise<DispatchJob> {
  const rows = await sql<DispatchJobRow[]>`
    update garimpa.dispatch_job
    set
      status = 'succeeded',
      provider_message_id = ${result.providerMessageId},
      lease_token = null,
      lease_until = null
    where id = ${jobId}
      and tenant_id = ${tenantId}
      and status = 'leased'
      and lease_token = ${workerLeaseToken}
    returning *
  `;

  if (rows.length === 0) {
    throw new Error(
      "LEASE_NOT_HELD: Cannot finalize job leased by another worker or not in leased status",
    );
  }

  await sql`
    update garimpa.dispatch_attempt
    set
      status = 'sent',
      provider_message_id = ${result.providerMessageId},
      io_completed_at = now()
    where job_id = ${jobId}
      and worker_token = ${workerLeaseToken}
      and status = 'in_flight'
  `;

  return mapRow(rows[0]!);
}

/**
 * Finaliza o job com rejeição/falha ou reagenda se retryable.
 */
export async function finalizeJobFailure(
  sql: Sql,
  tenantId: string,
  jobId: string,
  workerLeaseToken: string,
  result: {
    retryable: boolean;
    code: string;
    nextAttemptAt?: string;
  },
): Promise<DispatchJob> {
  const nextStatus: DispatchJobStatus = result.retryable ? "queued" : "failed";

  const rows = await sql<DispatchJobRow[]>`
    update garimpa.dispatch_job
    set
      status = ${nextStatus},
      failure_code = ${result.code},
      next_attempt_at = ${result.nextAttemptAt ?? null},
      lease_token = null,
      lease_until = null
    where id = ${jobId}
      and tenant_id = ${tenantId}
      and status = 'leased'
      and lease_token = ${workerLeaseToken}
    returning *
  `;

  if (rows.length === 0) {
    throw new Error(
      "LEASE_NOT_HELD: Cannot finalize job leased by another worker or not in leased status",
    );
  }

  await sql`
    update garimpa.dispatch_attempt
    set
      status = 'rejected',
      error_code = ${result.code},
      io_completed_at = now()
    where job_id = ${jobId}
      and worker_token = ${workerLeaseToken}
      and status = 'in_flight'
  `;

  return mapRow(rows[0]!);
}

/**
 * Coloca o job em estado 'unknown' (timeout de transporte após envio possível).
 * Nunca retenta automaticamente sem reconciliação.
 */
export async function finalizeJobUnknown(
  sql: Sql,
  tenantId: string,
  jobId: string,
  workerLeaseToken: string,
  reason: string,
): Promise<DispatchJob> {
  const rows = await sql<DispatchJobRow[]>`
    update garimpa.dispatch_job
    set
      status = 'unknown',
      reconciliation_note = ${reason},
      lease_token = null,
      lease_until = null
    where id = ${jobId}
      and tenant_id = ${tenantId}
      and status = 'leased'
      and lease_token = ${workerLeaseToken}
    returning *
  `;

  if (rows.length === 0) {
    throw new Error(
      "LEASE_NOT_HELD: Cannot finalize job leased by another worker or not in leased status",
    );
  }

  await sql`
    update garimpa.dispatch_attempt
    set
      status = 'unknown',
      note = ${reason},
      io_completed_at = now()
    where job_id = ${jobId}
      and worker_token = ${workerLeaseToken}
      and status = 'in_flight'
  `;

  return mapRow(rows[0]!);
}

/**
 * Cancela um job.
 * Se o I/O já tiver sido iniciado, não afirma que não foi enviado: move para 'unknown' para reconciliação.
 */
export async function cancelDispatchJob(
  sql: Sql,
  tenantId: string,
  jobId: string,
  options?: { cancelledBy?: string; note?: string },
): Promise<{ cancelled: boolean; status: DispatchJobStatus; message: string }> {
  const [job] = await sql<DispatchJobRow[]>`
    select *
    from garimpa.dispatch_job
    where id = ${jobId} and tenant_id = ${tenantId}
    limit 1 for update
  `;

  if (!job) {
    return { cancelled: false, status: "failed", message: "JOB_NOT_FOUND" };
  }

  if (
    job.status === "succeeded" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return {
      cancelled: false,
      status: job.status,
      message: `CANNOT_CANCEL_FINAL_STATE:${job.status}`,
    };
  }

  // Se I/O já foi iniciado, cancelamento não pode garantir que não foi enviado
  if (job.io_started_at) {
    const note =
      options?.note ??
      "CANCEL_REQUESTED_AFTER_IO_START: I/O was potentially in-flight. Moved to unknown for audit reconciliation.";
    await sql`
      update garimpa.dispatch_job
      set status = 'unknown',
          reconciliation_note = ${note},
          lease_token = null,
          lease_until = null
      where id = ${jobId} and tenant_id = ${tenantId}
    `;
    await sql`update garimpa.dispatch_reservation set state='unknown' where tenant_id=${tenantId} and job_id=${jobId} and state in ('reserved','started')`;
    await sql`update garimpa.dispatch_attempt set status='unknown',note=${note},io_completed_at=clock_timestamp() where tenant_id=${tenantId} and job_id=${jobId} and status='in_flight'`;
    return {
      cancelled: false,
      status: "unknown",
      message:
        "I/O was already in-flight. Job moved to unknown for reconciliation.",
    };
  }

  // Cancelamento limpo antes do I/O
  await sql`
    update garimpa.dispatch_job
    set
      status = 'cancelled',
      reconciliation_note = ${options?.note ?? "Cancelled cleanly before I/O"},
      lease_token = null,
      lease_until = null
    where id = ${jobId} and tenant_id = ${tenantId}
  `;

  await sql`update garimpa.dispatch_reservation set state='released' where tenant_id=${tenantId} and job_id=${jobId} and state='reserved'`;
  return {
    cancelled: true,
    status: "cancelled",
    message: "Job cancelled successfully.",
  };
}

/**
 * Reconcilia manualmente ou via adapter um job em estado 'unknown'.
 */
export async function reconcileDispatchJob(
  sql: Sql,
  tenantId: string,
  input: {
    jobId: string;
    resolvedStatus: "succeeded" | "failed";
    reconciliationNote: string;
    reconciledBy: string;
    providerMessageId?: string;
    confirmedAt?: string;
  },
): Promise<DispatchJob> {
  const [job] = await sql<DispatchJobRow[]>`
    select *
    from garimpa.dispatch_job
    where id = ${input.jobId} and tenant_id = ${tenantId}
    limit 1 for update
  `;

  if (!job) throw new Error("job_not_found");
  if (job.status !== "unknown") {
    throw new Error(`cannot_reconcile_non_unknown_job:status=${job.status}`);
  }

  if (!input.reconciliationNote.trim() || !input.reconciledBy.trim())
    throw new Error("reconciliation_evidence_required");
  if (
    input.resolvedStatus === "succeeded" &&
    (!input.providerMessageId?.trim() ||
      !input.confirmedAt ||
      !Number.isFinite(Date.parse(input.confirmedAt)) ||
      Date.parse(input.confirmedAt) > Date.now())
  )
    throw new Error("provider_confirmation_required");
  if (input.resolvedStatus === "succeeded") {
    const publications =
      await sql`update garimpa.campaign_publication set status='published_confirmed',published_at=${input.confirmedAt!} where tenant_id=${tenantId} and id=${job.campaign_publication_id} and kit_revision_id=${job.kit_revision_id} returning id`;
    if (publications.length !== 1)
      throw new Error("publication_revision_conflict");
  }
  await sql`update garimpa.dispatch_reservation set state=${input.resolvedStatus === "succeeded" ? "sent" : "released"} where tenant_id=${tenantId} and job_id=${input.jobId}`;
  const [updated] = await sql<DispatchJobRow[]>`
    update garimpa.dispatch_job
    set
      status = ${input.resolvedStatus},
      provider_message_id = coalesce(${input.providerMessageId ?? null}, provider_message_id),
      reconciliation_note = ${input.reconciliationNote},
      reconciled_by = ${input.reconciledBy},
      reconciled_at = now()
    where id = ${input.jobId} and tenant_id = ${tenantId}
    returning *
  `;

  // Registrar evento de domínio
  await sql`
    insert into garimpa.domain_event (
      tenant_id,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      event_type,
      actor_ref,
      request_id,
      idempotency_key,
      payload
    ) values (
      ${tenantId},
      'dispatch_job',
      ${input.jobId},
      ${job.attempt + 1},
      'DispatchJobReconciled',
      ${input.reconciledBy},
      ${`rec_${Date.now()}`},
      ${`reconcile:${input.jobId}:${Date.now()}`},
      ${JSON.stringify({
        jobId: input.jobId,
        previousStatus: "unknown",
        resolvedStatus: input.resolvedStatus,
        note: input.reconciliationNote,
        reconciledBy: input.reconciledBy,
        providerMessageId: input.providerMessageId,
        confirmedAt: input.confirmedAt,
      })}::jsonb
    )
  `;

  return mapRow(updated!);
}

/**
 * Lista jobs para o painel de monitoramento / auditoria.
 */
export async function listDispatchJobs(
  sql: Sql,
  tenantId: string,
  options: {
    destinationId?: string;
    status?: DispatchJobStatus;
    limit?: number;
  } = {},
): Promise<DispatchJob[]> {
  const limit = options.limit ?? 50;

  const rows = await sql<DispatchJobRow[]>`
    select *
    from garimpa.dispatch_job
    where tenant_id = ${tenantId}
      and (${options.destinationId ?? null}::text is null or destination_id = ${options.destinationId ?? null})
      and (${options.status ?? null}::text is null or status = ${options.status ?? null})
    order by scheduled_at desc, created_at desc
    limit ${limit}
  `;

  return rows.map(mapRow);
}

/**
 * Busca job por ID.
 */
export async function getDispatchJobById(
  sql: Sql,
  tenantId: string,
  jobId: string,
): Promise<DispatchJob | null> {
  const rows = await sql<DispatchJobRow[]>`
    select *
    from garimpa.dispatch_job
    where id = ${jobId} and tenant_id = ${tenantId}
    limit 1
  `;

  if (rows.length === 0) return null;
  return mapRow(rows[0]!);
}

/**
 * Consulta histórico de tentativas de um job.
 */
export async function listDispatchAttempts(
  sql: Sql,
  tenantId: string,
  jobId: string,
): Promise<
  {
    id: string;
    attemptNumber: number;
    workerToken: string;
    ioStartedAt: string | null;
    ioCompletedAt: string | null;
    status: string;
    providerMessageId: string | null;
    errorCode: string | null;
    note: string | null;
    createdAt: string;
  }[]
> {
  const rows = await sql<any[]>`
    select
      id, attempt_number as "attemptNumber", worker_token as "workerToken",
      io_started_at::text as "ioStartedAt", io_completed_at::text as "ioCompletedAt",
      status, provider_message_id as "providerMessageId", error_code as "errorCode",
      note, created_at::text as "createdAt"
    from garimpa.dispatch_attempt
    where job_id = ${jobId} and tenant_id = ${tenantId}
    order by attempt_number asc
  `;

  return rows;
}
