import type { Sql } from "postgres";
import type { MonitoringCandidate, MonitorMarketplace } from "./monitoring-policy.ts";

interface CandidateRow {
  product_id: string;
  marketplace: string;
  external_id: string;
  title: string;
  last_observed_at: Date;
  active_watches: number;
  clicks_7d: number;
  curation_status: string | null;
}

export interface MonitoringProduct extends MonitoringCandidate {
  readonly externalId: string;
  readonly title: string;
}

/** IDs ausentes saem da fila por mais tempo a cada tentativa; interesse volta antes. */
export function missingRetryHours(attempts: number, watched: boolean): number {
  if (watched) return [0, 6, 24, 72][Math.min(Math.max(attempts, 0), 3)]!;
  return [0, 24, 72, 168, 336][Math.min(Math.max(attempts, 0), 4)]!;
}

export async function loadMonitoringCandidates(sql: Sql, tenantId: string): Promise<MonitoringProduct[]> {
  const rows = await sql<CandidateRow[]>`
    with watches as (
      select product_id, count(*)::int as active_watches
      from garimpa.price_watch
      where tenant_id = ${tenantId} and active
      group by product_id
    ), clicks as (
      select pub.product_id, count(*)::int as clicks_7d
      from garimpa.click_event click
      join garimpa.publication pub on pub.id = click.publication_id
        and pub.tenant_id = click.tenant_id
      where click.tenant_id = ${tenantId}
        and click.clicked_at >= now() - interval '7 days'
      group by pub.product_id
    )
    select p.id as product_id, p.marketplace, p.external_id, p.title,
      p.last_seen_at as last_observed_at,
      coalesce(w.active_watches, 0)::int as active_watches,
      coalesce(c.clicks_7d, 0)::int as clicks_7d,
      pc.status as curation_status
    from garimpa.product p
    left join watches w on w.product_id = p.id
    left join clicks c on c.product_id = p.id
    left join garimpa.product_curation pc on pc.product_id = p.id
      and pc.tenant_id = p.tenant_id
    where p.tenant_id = ${tenantId}
      and p.marketplace in ('mercadolivre', 'shopee', 'aliexpress')
      and p.last_seen_at is not null
  `;
  return rows.map((row) => ({
    productId: row.product_id,
    marketplace: row.marketplace as MonitorMarketplace,
    externalId: row.external_id,
    title: row.title,
    lastObservedAt: row.last_observed_at,
    activeWatches: row.active_watches,
    clicks7d: row.clicks_7d,
    curationStatus: row.curation_status,
  }));
}

/** Recuo progressivo após ausência e curto após erro; a evidência mantém a data real. */
export async function suppressedMonitoringIds(
  sql: Sql,
  tenantId: string,
  marketplace: MonitorMarketplace,
  candidates: readonly MonitoringProduct[],
  now = new Date(),
): Promise<ReadonlySet<string>> {
  const rows = await sql<Array<{ started_at: Date; missing_ids: string | null; failed_ids: string | null }>>`
    select started_at, parameters ->> 'missingIds' as missing_ids,
      parameters ->> 'failedIds' as failed_ids
    from garimpa.capture_run
    where tenant_id = ${tenantId} and marketplace = ${marketplace}
      and parameters ->> 'captureMode' = 'monitoring'
      and started_at >= ${now} - interval '30 days'
      and (parameters ? 'missingIds' or parameters ? 'failedIds')
  `;
  const watched = new Set(candidates.filter((candidate) => candidate.activeWatches > 0).map((candidate) => candidate.productId));
  const suppressed = new Set<string>();
  const missingAttempts = new Map<string, { count: number; lastAt: Date }>();
  for (const row of rows) {
    const ageHours = (now.getTime() - row.started_at.getTime()) / 3_600_000;
    if (ageHours < 6) {
      for (const id of (row.failed_ids ?? "").split(",")) if (id) suppressed.add(id);
    }
    for (const id of (row.missing_ids ?? "").split(",")) {
      if (!id) continue;
      const previous = missingAttempts.get(id);
      missingAttempts.set(id, {
        count: (previous?.count ?? 0) + 1,
        lastAt: previous && previous.lastAt > row.started_at ? previous.lastAt : row.started_at,
      });
    }
  }
  for (const [id, attempt] of missingAttempts) {
    const ageHours = (now.getTime() - attempt.lastAt.getTime()) / 3_600_000;
    if (ageHours < missingRetryHours(attempt.count, watched.has(id))) suppressed.add(id);
  }
  return suppressed;
}
