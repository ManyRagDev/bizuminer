import { scopedTenantId } from "./account-scope.ts";
import { db } from "./db";
import { withTenantDb } from "./tenant-db.ts";

/**
 * Painel administrativo: leitura agregada de tudo que o app registra.
 * Nenhuma escrita acontece aqui — acionar rodagem é responsabilidade da rota
 * /api/admin/rodagem, e quem grava capture_run é o próprio sweep.
 */

export interface CaptureRunRow {
  id: string;
  marketplace: string;
  status: "running" | "ok" | "error";
  started_at: Date | string;
  finished_at: Date | string | null;
  items_captured: number;
  items_new: number;
  price_changes: number;
  error: string | null;
  collector_run_id: string | null;
  observation_count: number;
  /** Identidade da execução pai, derivada no SQL para incluir o histórico anterior ao campo explícito. */
  execution_id?: string | null;
  parameters?: Record<string, unknown>;
  capture_mode?: string | null;
}

export { captureBatchStatus, latestCaptureBatch } from "./capture-batch-db.ts";
export type { CaptureBatch, CaptureBatchStatus } from "./capture-batch-db.ts";

export interface AdminOverview {
  products: number;
  observations: number;
  runs: number;
  clicks7d: number;
  publications: number;
  subscribers: number;
  members: number;
  favorites: number;
  activeWatches: number;
  profiles: number;
  lastOkRunAt: Date | string | null;
  lastDiscoveryAt: Date | string | null;
  triageRuns: number;
  lastTriageRunAt: Date | string | null;
  lastTriage: {
    status: string;
    startedAt: Date | string;
    finishedAt: Date | string | null;
    totalInput: number;
    approvedCount: number;
    heldCount: number;
    rejectedCount: number;
  } | null;
}

export interface TopClickedRow {
  title: string;
  slug: string;
  clicks: number;
}

export async function adminOverview(tenantId = scopedTenantId(), customSql?: any): Promise<AdminOverview> {
  const runner = async (sql: any) => {
    const rows = await sql<Array<Record<string, number | Date | string | null>>>`
      select
        (select count(*)::int from garimpa.product where tenant_id = ${tenantId}) as products,
        (select count(*)::int from garimpa.price_observation where tenant_id = ${tenantId}) as observations,
        (select count(distinct (
          cr.marketplace || ':' || coalesce(
            nullif(cr.parameters ->> 'captureExecutionId', ''),
            case
              when nullif(cr.parameters ->> 'capturePlanId', '') is not null
               and nullif(cr.parameters ->> 'captureQueryId', '') is not null
               and cr.collector_run_id is not null
               and char_length(cr.collector_run_id) > char_length(cr.parameters ->> 'captureQueryId') + 1
               and right(cr.collector_run_id, char_length(cr.parameters ->> 'captureQueryId') + 1)
                   = ':' || (cr.parameters ->> 'captureQueryId')
              then left(cr.collector_run_id, char_length(cr.collector_run_id) - char_length(cr.parameters ->> 'captureQueryId') - 1)
            end,
            cr.id
          )
        ))::int from garimpa.capture_run cr where cr.tenant_id = ${tenantId}) as runs,
        (select count(*)::int from garimpa.click_event c
          join garimpa.publication pub on pub.id = c.publication_id
          where pub.tenant_id = ${tenantId} and c.clicked_at >= now() - interval '7 days') as clicks_7d,
        (select count(*)::int from garimpa.publication where tenant_id = ${tenantId}) as publications,
        (select count(*)::int from garimpa.subscriber where tenant_id = ${tenantId}) as subscribers,
        (select count(*)::int from garimpa.app_user where tenant_id = ${tenantId}) as members,
        (select count(*)::int from garimpa.favorite where tenant_id = ${tenantId}) as favorites,
        (select count(*)::int from garimpa.price_watch where tenant_id = ${tenantId} and active) as active_watches,
        (select count(*)::int from garimpa.buyer_profile where tenant_id = ${tenantId}) as profiles,
        (select max(finished_at) from garimpa.capture_run
          where tenant_id = ${tenantId} and status = 'ok') as last_ok_run_at,
        (select max(finished_at) from garimpa.capture_run
          where tenant_id = ${tenantId} and status = 'ok'
          and parameters->>'captureMode' is distinct from 'monitoring') as last_discovery_at
    `;
    const row = rows[0];

    let triageRuns = 0;
    let lastTriageRunAt: Date | string | null = null;
    let lastTriage: AdminOverview["lastTriage"] = null;

    try {
      const tStats = await sql`
        select
          count(*)::int as triage_runs,
          max(finished_at) filter (where status = 'ok') as last_triage_run_at
        from garimpa.triage_run
        where tenant_id = ${tenantId}
      `;
      triageRuns = tStats[0]?.triage_runs ?? 0;
      lastTriageRunAt = (tStats[0]?.last_triage_run_at as Date | string) ?? null;

      const latestTriageRows = await sql<{
        status: string;
        started_at: Date;
        finished_at: Date | null;
        total_input: number;
        approved_count: number;
        held_count: number;
        rejected_count: number;
      }[]>`
        select status, started_at, finished_at, total_input, approved_count, held_count, rejected_count
        from garimpa.triage_run
        where tenant_id = ${tenantId}
        order by started_at desc
        limit 1
      `;
      if (latestTriageRows.length > 0) {
        const r = latestTriageRows[0]!;
        lastTriage = {
          status: r.status,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          totalInput: r.total_input,
          approvedCount: r.approved_count,
          heldCount: r.held_count,
          rejectedCount: r.rejected_count,
        };
      }
    } catch {
      // Degrada graciosamente caso a tabela garimpa.triage_run ainda não exista
    }

    return {
      products: row.products as number,
      observations: row.observations as number,
      runs: row.runs as number,
      clicks7d: row.clicks_7d as number,
      publications: row.publications as number,
      subscribers: row.subscribers as number,
      members: row.members as number,
      favorites: row.favorites as number,
      activeWatches: row.active_watches as number,
      profiles: row.profiles as number,
      lastDiscoveryAt: (row?.last_discovery_at as Date | string) ?? null,
      lastOkRunAt: row.last_ok_run_at as Date | string | null,
      triageRuns,
      lastTriageRunAt,
      lastTriage,
    };
  };

  if (customSql) return await runner(customSql);
  return await withTenantDb(tenantId, runner);
}

export async function captureRuns(limit = 20, tenantId = scopedTenantId(), marketplace?: string, customSql?: any): Promise<CaptureRunRow[]> {
  const runner = async (sql: any) => {
    return await sql<CaptureRunRow[]>`
      select cr.id, cr.marketplace, cr.status, cr.started_at, cr.finished_at,
             cr.items_captured, cr.items_new, cr.price_changes, cr.error,
             cr.collector_run_id, cr.parameters->>'captureMode' as capture_mode,
             (select count(*)::int from garimpa.price_observation o
               where o.capture_run_id = cr.id) as observation_count
      from garimpa.capture_run cr
      where cr.tenant_id = ${tenantId}
        and (${marketplace ?? null}::text is null or cr.marketplace = ${marketplace ?? null})
      order by cr.started_at desc
      limit ${Math.min(Math.max(limit, 1), 100)}
    `;
  };
  if (customSql) return await runner(customSql);
  return await withTenantDb(tenantId, runner);
}

/**
 * Histórico para a UI: limita execuções completas, não consultas filhas.
 *
 * `captureExecutionId` é a identidade canônica nova. Para as rodagens
 * category-first já existentes, o prefixo do collector só é aceito quando o
 * sufixo casa exatamente com `captureQueryId`; não agrupamos por timestamp.
 */
export async function captureRunHistory(
  executionLimit = 20,
  tenantId = scopedTenantId(),
  marketplace?: string,
  customSql?: any,
): Promise<CaptureRunRow[]> {
  const safeLimit = Math.min(Math.max(executionLimit, 1), 50);
  const runner = async (sql: any) => {
    return await sql<CaptureRunRow[]>`
      with normalized as (
        select cr.*,
               cr.marketplace || ':' || coalesce(
                 nullif(cr.parameters ->> 'captureExecutionId', ''),
                 case
                   when nullif(cr.parameters ->> 'capturePlanId', '') is not null
                    and nullif(cr.parameters ->> 'captureQueryId', '') is not null
                    and cr.collector_run_id is not null
                    and char_length(cr.collector_run_id) > char_length(cr.parameters ->> 'captureQueryId') + 1
                    and right(cr.collector_run_id, char_length(cr.parameters ->> 'captureQueryId') + 1)
                        = ':' || (cr.parameters ->> 'captureQueryId')
                   then left(cr.collector_run_id, char_length(cr.collector_run_id) - char_length(cr.parameters ->> 'captureQueryId') - 1)
                 end,
                 cr.id
               ) as execution_id
        from garimpa.capture_run cr
        where cr.tenant_id = ${tenantId}
          and (${marketplace ?? null}::text is null or cr.marketplace = ${marketplace ?? null})
      ), selected as (
        select execution_id, max(started_at) as sort_at
        from normalized
        group by execution_id
        order by sort_at desc
        limit ${safeLimit}
      )
      select cr.id, cr.marketplace, cr.status, cr.started_at, cr.finished_at,
              cr.items_captured, cr.items_new, cr.price_changes, cr.error,
              cr.collector_run_id, cr.parameters, cr.execution_id,
              (select count(*)::int from garimpa.price_observation o
                where o.capture_run_id = cr.id) as observation_count
      from normalized cr
      join selected s on s.execution_id = cr.execution_id
      order by s.sort_at desc, cr.started_at asc, cr.id asc
    `;
  };
  if (customSql) return await runner(customSql);
  return await withTenantDb(tenantId, runner);
}

/**
 * Rodagem em andamento (janela de 30 min): trava de concorrência do acionador.
 * Um `running` mais velho que isso é processo morto que não fechou o registro —
 * não deve travar o painel para sempre, mas aparece na tabela como está.
 */
/**
 * `marketplace` opcional filtra a trava de concorrência por plataforma —
 * uma rodagem do ML em andamento não deve bloquear o disparo da Shopee.
 * Sem filtro, devolve a rodagem em andamento de qualquer plataforma (usado
 * pela visão geral do painel).
 */
export async function runningRun(tenantId = scopedTenantId(), marketplace?: string, customSql?: any): Promise<CaptureRunRow | null> {
  const runner = async (sql: any) => {
    const rows = await sql<CaptureRunRow[]>`
      select cr.id, cr.marketplace, cr.status, cr.started_at, cr.finished_at,
             cr.items_captured, cr.items_new, cr.price_changes, cr.error,
             cr.collector_run_id, 0 as observation_count
      from garimpa.capture_run cr
      where cr.tenant_id = ${tenantId}
        and cr.status = 'running'
        and cr.started_at >= now() - interval '30 minutes'
        and (${marketplace ?? null}::text is null or cr.marketplace = ${marketplace ?? null})
      order by cr.started_at desc
      limit 1
    `;
    return rows[0] ?? null;
  };
  if (customSql) return await runner(customSql);
  return await withTenantDb(tenantId, runner);
}

export async function topClicked(days = 7, limit = 6, tenantId = scopedTenantId(), customSql?: any): Promise<TopClickedRow[]> {
  const runner = async (sql: any) => {
    return await sql<TopClickedRow[]>`
      select p.title, pub.slug, count(c.id)::int as clicks
      from garimpa.click_event c
      join garimpa.publication pub on pub.id = c.publication_id
      join garimpa.product p on p.id = pub.product_id
      where pub.tenant_id = ${tenantId}
        and c.clicked_at >= now() - make_interval(days => ${Math.min(Math.max(days, 1), 90)})
      group by p.title, pub.slug
      order by clicks desc
      limit ${Math.min(Math.max(limit, 1), 20)}
    `;
  };
  if (customSql) return await runner(customSql);
  return await withTenantDb(tenantId, runner);
}
