import { databaseSsl } from "./database-ssl.ts";
/**
 * Implementação Postgres do OfferStore (Supabase, schema `garimpa`).
 *
 * Facts are prepared durably by run and stay outside the live catalogue.
 * A successful standalone run publishes in one short transaction; batches are
 * published explicitly by their lease owner after every source is complete.
 * Provider I/O is never performed while a database transaction is held.
 */

import { normalizeSourceTitle } from "../../capture/src/title.ts";
import postgres, { type Sql } from "postgres";
import { withMonitoringDb } from "./monitoring-db.ts";
import { RECENT_WINDOW_DAYS, type ActivityCounts } from "./activity.ts";
import type { ProductFamilyInfo } from "./product-family.ts";
import type { OfferEvidence } from "../../capture/src/types.ts";
import type {
  FinishCaptureRunInput,
  OfferStore,
  PriceObservationRecord,
  StartCaptureRunInput,
  UpsertResult,
} from "./store.ts";

export interface PostgresStoreOptions {
  readonly connectionString: string;
  readonly schema?: string; // default: garimpa
  readonly maxConnections?: number;
  readonly sqlFactory?: () => Sql;
}

interface UpsertRow {
  id: string;
  is_new: boolean;
  previous_price_cents: number | null;
}

export class PostgresStore implements OfferStore {
  private readonly sql: Sql;
  private readonly s: string;
  private readonly runWorkers = new Map<string, string>();

  constructor(opts: PostgresStoreOptions) {
    this.s = opts.schema ?? "garimpa";
    this.sql = opts.sqlFactory?.() ?? postgres(opts.connectionString, {
      prepare: false, // compatível com poolers (PgBouncer/Supavisor)
      max: opts.maxConnections ?? 5,
      ssl: databaseSsl(opts.connectionString),
    });
  }

  private async withTenant<T>(tenantId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
    return withMonitoringDb(this.sql,tenantId,fn);
  }

  async findExistingExternalIds(
    tenantId: string,
    marketplace: string,
    externalIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (externalIds.length === 0) return new Set();
    return await this.withTenant(tenantId, async (sql) => {
      const rows = await sql<{ external_id: string }[]>`
        select external_id
        from ${sql(this.s)}.product
        where tenant_id = ${tenantId}
          and marketplace = ${marketplace}
          and external_id = any(${externalIds})
      `;
      return new Set(rows.map((row) => row.external_id));
    });
  }

  async upsertProductWithObservation(input: {
    captureRunId: string;
    tenantId: string;
    marketplace: string;
    externalId: string;
    title: string;
    productUrl: string;
    imageUrl?: string;
    category?: string;
    family?: ProductFamilyInfo;
    priceCents: number;
    originalPriceCents?: number;
    claimedDiscountRate?: number;
    ratingStar?: number;
    salesLabel?: string;
    salesCount?: number;
    offerEvidence?: OfferEvidence;
    observedAt: Date;
  }): Promise<UpsertResult> {
    input = { ...input, title: normalizeSourceTitle(input.title) };
    return await this.withTenant(input.tenantId, async (sql) => {
      const [prepared] = await sql<{ result: UpsertRow }[]>`
        select garimpa.stage_capture_offer(${input.tenantId},${input.captureRunId},${sql.json({ ...input, observedAt: input.observedAt.toISOString(), operationWorkerId: this.runWorkers.get(input.captureRunId) } as any)}::jsonb) as result`;
      if (!prepared) throw new Error("capture_stage_missing");
      const row = prepared.result;

      return {
        product: {
          id: row.id,
          tenantId: input.tenantId,
          marketplace: input.marketplace,
          externalId: input.externalId,
          title: input.title,
          productUrl: input.productUrl,
          imageUrl: input.imageUrl,
          category: input.category,
          family: input.family,
          lastPriceCents: input.priceCents,
          firstSeenAt: input.observedAt,
          lastSeenAt: input.observedAt,
          lastCaptureRunId: input.captureRunId,
        },
        isNew: row.is_new,
        previousPriceCents: row.previous_price_cents ?? undefined,
      };
    });
  }

  async startCaptureRun(run: StartCaptureRunInput): Promise<string> {
    return this.withTenant(run.tenantId, async sql => {
      const batchId = run.parameters.operationBatchId as string | undefined;
      const workerId = run.parameters.operationWorkerId as string | undefined;
      if (batchId) {
        const [batch] = await sql<{ metadata: any }[]>`select metadata from ${sql(this.s)}.capture_batch
          where tenant_id=${run.tenantId} and id=${batchId}::uuid and status='running' for update`;
        if (!batch || batch.metadata.publication?.publishedAt || batch.metadata.publicationSources?.[run.marketplace]?.publishedAt || !workerId || batch.metadata.execution?.workerId !== workerId || Date.parse(batch.metadata.execution.deadline) <= Date.now())
          throw new Error("capture_batch_ownership_lost");
        const checkpointKey = String(run.parameters.captureQueryId ?? run.parameters.keyword ?? "default");
        const [prior] = await sql<{ id: string; status: string }[]>`select id,status from ${sql(this.s)}.capture_run
          where tenant_id=${run.tenantId} and marketplace=${run.marketplace} and parameters->>'operationBatchId'=${batchId}
          and coalesce(parameters->>'captureQueryId',parameters->>'keyword','default')=${checkpointKey}
          order by started_at desc limit 1 for update`;
        if (prior) {
          this.runWorkers.set(prior.id, workerId);
          if (prior.status !== "ok") await sql`update ${sql(this.s)}.capture_run set status='running',finished_at=null,error=null,
            parameters=parameters||${sql.json({ operationWorkerId: workerId })}::jsonb where id=${prior.id} and tenant_id=${run.tenantId}`;
          return prior.id;
        }
      }
      const [row] = await sql<{ id: string }[]>`
        insert into ${sql(this.s)}.capture_run(id,tenant_id,marketplace,started_at,status,collector_run_id,parameters)
        values(gen_random_uuid()::text,${run.tenantId},${run.marketplace},${run.startedAt},'running',${run.collectorRunId},${sql.json(run.parameters as any)}) returning id`;
      if (!row) throw new Error("capture_run_missing");
      if (workerId) this.runWorkers.set(row.id, workerId);
      return row.id;
    });
  }

  async captureRunCheckpoint(runId: string, tenantId: string) {
    return this.withTenant(tenantId, async sql => {
      const [r] = await sql<{ marketplace: string; items_captured: number; items_new: number; price_changes: number; parameters: any }[]>`
        select marketplace,items_captured,items_new,price_changes,parameters from ${sql(this.s)}.capture_run
        where tenant_id=${tenantId} and id=${runId} and status='ok'`;
      if (!r) return null;
      return { runId, marketplace: r.marketplace, itemsSeen: Number(r.parameters.itemsSeen ?? r.items_captured),
        itemsCaptured: r.items_captured, itemsNew: r.items_new, priceChanges: r.price_changes,
        itemsSkippedByPolicy: Number(r.parameters.itemsSkippedByPolicy ?? 0), pagesRead: Number(r.parameters.pagesRead ?? 0),
        saturationDetected: r.parameters.saturationDetected === true, durationMs: 0 };
    });
  }

  async finishCaptureRun(runId: string, run: FinishCaptureRunInput & { tenantId?: string }): Promise<void> {
    const tenantId = run.tenantId ?? (run.parameterPatch?.tenantId as string | undefined) ?? "local";
    await this.withTenant(tenantId, async (sql) => {
      const [parent] = await sql<{ batch_id: string | null }[]>`select parameters->>'operationBatchId' as batch_id
        from ${sql(this.s)}.capture_run where id=${runId} and tenant_id=${tenantId}`;
      if (parent?.batch_id) {
        const [owner] = await sql<{ owned: boolean }[]>`select metadata#>>'{execution,workerId}'=${this.runWorkers.get(runId) ?? null}
          and (metadata#>>'{execution,deadline}')::timestamptz>now() as owned from ${sql(this.s)}.capture_batch
          where id=${parent.batch_id}::uuid and tenant_id=${tenantId} and status='running' for update`;
        if (!owner?.owned) throw new Error("capture_batch_ownership_lost");
      }
      const [record] = await sql<{ published: boolean }[]>`select parameters->>'publishedAt' is not null as published
        from ${sql(this.s)}.capture_run where id=${runId} and tenant_id=${tenantId} for update`;
      if (!record) throw new Error("capture_run_not_found");
      if (record.published) {
        if (run.status !== "ok") throw new Error("capture_run_already_published");
        return;
      }
      await sql`
        update ${sql(this.s)}.capture_run
        set finished_at = ${run.finishedAt}, status = ${run.status},
            items_captured = ${run.itemsCaptured}, items_new = ${run.itemsNew},
            price_changes = ${run.priceChanges}, error = ${run.error ?? null},
            parameters = parameters || ${sql.json((run.parameterPatch ?? {}) as any)}
        where id = ${runId} and tenant_id=${tenantId}
      `;
      if (run.status === "ok") {
        const [record] = await sql<{ standalone: boolean }[]>`select parameters->>'operationBatchId' is null as standalone
          from ${sql(this.s)}.capture_run where id=${runId} and tenant_id=${tenantId}`;
        if (record?.standalone) await sql`select garimpa.publish_capture_run(${tenantId},${runId})`;
      }
    });
  }

  async priceRange(productId: string, tenantId = "local") {
    return await this.withTenant(tenantId, async (sql) => {
      const rows = await sql<{ min_cents: number; max_cents: number; observations: string }[]>`
        select min(price_cents) as min_cents, max(price_cents) as max_cents, count(*)::text as observations
        from ${sql(this.s)}.price_observation
        where product_id = ${productId}
      `;
      const row = rows[0];
      if (!row || Number(row.observations) === 0) return null;
      return { minCents: row.min_cents, maxCents: row.max_cents, observations: Number(row.observations) };
    });
  }

  async latestObservation(productId: string, tenantId = "local"): Promise<PriceObservationRecord | null> {
    return await this.withTenant(tenantId, async (sql) => {
      const rows = await sql<
        { capture_run_id: string | null; price_cents: number; original_price_cents: number | null; claimed_discount_rate: number | null; rating_star: number | null; sales_label: string | null; sales_count: number | null; observed_at: Date; title_snapshot: string | null; product_url_snapshot: string | null; image_url_snapshot: string | null; category_snapshot: string | null; offer_evidence: OfferEvidence | null }[]
      >`
        select capture_run_id, price_cents, original_price_cents, claimed_discount_rate,
               rating_star, sales_label, sales_count, observed_at,
               title_snapshot, product_url_snapshot, image_url_snapshot, category_snapshot, offer_evidence
        from ${sql(this.s)}.price_observation
        where product_id = ${productId}
        order by observed_at desc
        limit 1
      `;
      const row = rows[0];
      return row && row.capture_run_id
        ? {
            captureRunId: row.capture_run_id,
            productId,
            priceCents: row.price_cents,
            originalPriceCents: row.original_price_cents ?? undefined,
            claimedDiscountRate: row.claimed_discount_rate ?? undefined,
            ratingStar: row.rating_star ?? undefined,
            salesLabel: row.sales_label ?? undefined,
            salesCount: row.sales_count ?? undefined,
            offerEvidence: row.offer_evidence ?? undefined,
            observedAt: row.observed_at,
            titleSnapshot: row.title_snapshot ?? "",
            productUrlSnapshot: row.product_url_snapshot ?? "",
            imageUrlSnapshot: row.image_url_snapshot ?? undefined,
            categorySnapshot: row.category_snapshot ?? undefined,
          }
        : null;
    });
  }

  async productActivity(
    tenantId: string,
    currentRunId: string | null,
    now: Date = new Date(),
  ): Promise<ActivityCounts> {
    return await this.withTenant(tenantId, async (sql) => {
      const rows = await sql<{ level: string; n: string }[]>`
        select
          case
            when last_capture_run_id = ${currentRunId} then 'ativo'
            when last_seen_at >= ${now} - (${RECENT_WINDOW_DAYS} * interval '1 day') then 'recente'
            else 'dormente'
          end as level,
          count(*)::text as n
        from ${sql(this.s)}.product
        where tenant_id = ${tenantId}
        group by 1
      `;
      const counts = { ativo: 0, recente: 0, dormente: 0 };
      for (const row of rows) counts[row.level as keyof typeof counts] = Number(row.n);
      return counts;
    });
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  /** Ranking de curadoria: maiores descontos declarados do tenant. */
  async topByClaimedDiscount(
    tenantId: string,
    limit: number,
  ): Promise<{ id: string; title: string; lastPriceCents: number; claimedDiscountRate: number }[]> {
    return await this.withTenant(tenantId, async (sql) => {
      return await sql`
        select p.id, p.title, p.last_price_cents as "lastPriceCents",
               o.claimed_discount_rate as "claimedDiscountRate"
        from ${sql(this.s)}.product p
        join lateral (
          select claimed_discount_rate
          from ${sql(this.s)}.price_observation
          where product_id = p.id
          order by observed_at desc
          limit 1
        ) o on true
        where p.tenant_id = ${tenantId}
          and o.claimed_discount_rate is not null
        order by o.claimed_discount_rate desc
        limit ${limit}
      `;
    });
  }
}
