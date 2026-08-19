/**
 * Implementação Postgres do OfferStore (Supabase, schema `garimpa`).
 *
 * - IDs gerados pelo banco (gen_random_uuid()) — sem lógica de ID no app.
 * - Upsert atômico em CTE: `prev` lê o preço no snapshot anterior à mutação,
 *   `up` faz o insert/on-conflict, `ins` grava a observação.
 *   Tudo numa viagem ao banco (importante com pooler + rate de 185 itens).
 * - `(xmax = 0)` no RETURNING distingue insert novo de update.
 */

import postgres, { type Sql } from "postgres";
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
}

interface UpsertRow {
  id: string;
  is_new: boolean;
  previous_price_cents: number | null;
}

export class PostgresStore implements OfferStore {
  private readonly sql: Sql;
  private readonly s: string;

  constructor(opts: PostgresStoreOptions) {
    this.s = opts.schema ?? "garimpa";
    this.sql = postgres(opts.connectionString, {
      prepare: false, // compatível com poolers (PgBouncer/Supavisor)
      max: opts.maxConnections ?? 5,
      ssl: opts.connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
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
    priceCents: number;
    originalPriceCents?: number;
    claimedDiscountRate?: number;
    ratingStar?: number;
    salesLabel?: string;
    salesCount?: number;
    observedAt: Date;
  }): Promise<UpsertResult> {
    const rows = await this.sql<UpsertRow[]>`
      with prev as (
        select id, last_price_cents
        from ${this.sql(this.s)}.product
        where tenant_id = ${input.tenantId}
          and marketplace = ${input.marketplace}
          and external_id = ${input.externalId}
      ), up as (
        insert into ${this.sql(this.s)}.product as p
          (id, tenant_id, marketplace, external_id, title, product_url, image_url, category,
           last_price_cents, first_seen_at, last_seen_at, last_capture_run_id)
        values (gen_random_uuid()::text, ${input.tenantId}, ${input.marketplace}, ${input.externalId},
                ${input.title}, ${input.productUrl}, ${input.imageUrl ?? null}, ${input.category ?? null},
                ${input.priceCents}, ${input.observedAt}, ${input.observedAt}, ${input.captureRunId})
        on conflict (tenant_id, marketplace, external_id) do update set
          title = excluded.title,
          product_url = excluded.product_url,
          image_url = coalesce(excluded.image_url, p.image_url),
          category = coalesce(excluded.category, p.category),
          last_price_cents = excluded.last_price_cents,
          last_seen_at = excluded.last_seen_at,
          last_capture_run_id = excluded.last_capture_run_id,
          updated_at = now()
        returning id, (xmax = 0) as is_new
      ), ins as (
        insert into ${this.sql(this.s)}.price_observation
          (id, tenant_id, capture_run_id, product_id, price_cents, original_price_cents,
           claimed_discount_rate, rating_star, sales_label, sales_count, observed_at,
           title_snapshot, product_url_snapshot, image_url_snapshot, category_snapshot)
        select gen_random_uuid()::text, ${input.tenantId}, ${input.captureRunId}, id, ${input.priceCents},
               ${input.originalPriceCents ?? null}, ${input.claimedDiscountRate ?? null}, ${input.ratingStar ?? null},
               ${input.salesLabel ?? null}, ${input.salesCount ?? null}, ${input.observedAt},
               ${input.title}, ${input.productUrl}, ${input.imageUrl ?? null}, ${input.category ?? null}
        from up
        on conflict (capture_run_id, product_id) do update set
          price_cents = excluded.price_cents,
          original_price_cents = excluded.original_price_cents,
          claimed_discount_rate = excluded.claimed_discount_rate,
          rating_star = excluded.rating_star,
          sales_label = excluded.sales_label,
          sales_count = excluded.sales_count,
          observed_at = excluded.observed_at,
          title_snapshot = excluded.title_snapshot,
          product_url_snapshot = excluded.product_url_snapshot,
          image_url_snapshot = excluded.image_url_snapshot,
          category_snapshot = excluded.category_snapshot
      )
      select up.id, up.is_new, prev.last_price_cents as previous_price_cents
      from up left join prev on true
    `;

    const row = rows[0]!;
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
        lastPriceCents: input.priceCents,
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
        lastCaptureRunId: input.captureRunId,
      },
      isNew: row.is_new,
      previousPriceCents: row.previous_price_cents ?? undefined,
    };
  }

  async startCaptureRun(run: StartCaptureRunInput): Promise<string> {
    const rows = await this.sql<{ id: string }[]>`
      insert into ${this.sql(this.s)}.capture_run
        (id, tenant_id, marketplace, started_at, status, collector_run_id, parameters)
      values (gen_random_uuid()::text, ${run.tenantId}, ${run.marketplace}, ${run.startedAt},
              'running', ${run.collectorRunId}, ${this.sql.json(run.parameters)})
      returning id
    `;
    return rows[0]!.id;
  }

  async finishCaptureRun(runId: string, run: FinishCaptureRunInput): Promise<void> {
    await this.sql`
      update ${this.sql(this.s)}.capture_run
      set finished_at = ${run.finishedAt}, status = ${run.status},
          items_captured = ${run.itemsCaptured}, items_new = ${run.itemsNew},
          price_changes = ${run.priceChanges}, error = ${run.error ?? null}
      where id = ${runId}
    `;
  }

  async priceRange(productId: string) {
    const rows = await this.sql<{ min_cents: number; max_cents: number; observations: string }[]>`
      select min(price_cents) as min_cents, max(price_cents) as max_cents, count(*)::text as observations
      from ${this.sql(this.s)}.price_observation
      where product_id = ${productId}
    `;
    const row = rows[0];
    if (!row || Number(row.observations) === 0) return null;
    return { minCents: row.min_cents, maxCents: row.max_cents, observations: Number(row.observations) };
  }

  async latestObservation(productId: string): Promise<PriceObservationRecord | null> {
    const rows = await this.sql<
      { capture_run_id: string | null; price_cents: number; original_price_cents: number | null; claimed_discount_rate: number | null; rating_star: number | null; sales_label: string | null; sales_count: number | null; observed_at: Date; title_snapshot: string | null; product_url_snapshot: string | null; image_url_snapshot: string | null; category_snapshot: string | null }[]
    >`
      select capture_run_id, price_cents, original_price_cents, claimed_discount_rate,
             rating_star, sales_label, sales_count, observed_at,
             title_snapshot, product_url_snapshot, image_url_snapshot, category_snapshot
      from ${this.sql(this.s)}.price_observation
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
          observedAt: row.observed_at,
          titleSnapshot: row.title_snapshot ?? "",
          productUrlSnapshot: row.product_url_snapshot ?? "",
          imageUrlSnapshot: row.image_url_snapshot ?? undefined,
          categorySnapshot: row.category_snapshot ?? undefined,
        }
      : null;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  /** Ranking de curadoria: maiores descontos declarados do tenant. */
  async topByClaimedDiscount(
    tenantId: string,
    limit: number,
  ): Promise<{ id: string; title: string; lastPriceCents: number; claimedDiscountRate: number }[]> {
    return this.sql`
      select p.id, p.title, p.last_price_cents as "lastPriceCents",
             o.claimed_discount_rate as "claimedDiscountRate"
      from ${this.sql(this.s)}.product p
      join lateral (
        select claimed_discount_rate
        from ${this.sql(this.s)}.price_observation
        where product_id = p.id
        order by observed_at desc
        limit 1
      ) o on true
      where p.tenant_id = ${tenantId}
        and o.claimed_discount_rate is not null
      order by o.claimed_discount_rate desc
      limit ${limit}
    `;
  }
}
