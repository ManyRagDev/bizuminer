/**
 * Implementação Postgres do OfferStore (Supabase, schema `garimpa`).
 *
 * - IDs gerados pelo banco (gen_random_uuid()) — sem lógica de ID no app.
 * - Upsert atômico em CTE: `prev` lê o preço no snapshot anterior à mutação,
 *   `up` faz o insert/on-conflict, `ins` grava a observação.
 *   Tudo numa viagem ao banco (importante com pooler + rate de 185 itens).
 * - `(xmax = 0)` no RETURNING distingue insert novo de update.
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
}

interface UpsertRow {
  id: string;
  is_new: boolean;
  previous_price_cents: number | null;
}

export class PostgresStore implements OfferStore {
  private readonly sql: Sql;
  private readonly s: string;
  private optionsReady: boolean | undefined;

  constructor(opts: PostgresStoreOptions) {
    this.s = opts.schema ?? "garimpa";
    this.sql = postgres(opts.connectionString, {
      prepare: false, // compatível com poolers (PgBouncer/Supavisor)
      max: opts.maxConnections ?? 5,
      ssl: opts.connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
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
      if (this.optionsReady===undefined) {
        const [schema]=await sql<{ready:boolean}[]>`select exists(select 1 from information_schema.columns where table_schema=${this.s} and table_name='price_observation' and column_name='option_key') as ready`;
        this.optionsReady=schema?.ready===true;
      }
      if(this.optionsReady && input.offerEvidence===undefined){
        const repeated=await sql<{offer_evidence:OfferEvidence|null}[]>`select o.offer_evidence from ${sql(this.s)}.price_observation o
          join ${sql(this.s)}.product p on p.id=o.product_id and p.tenant_id=o.tenant_id
          where p.tenant_id=${input.tenantId} and p.marketplace=${input.marketplace} and p.external_id=${input.externalId}
            and o.capture_run_id=${input.captureRunId} and o.title_snapshot=${input.title} and o.product_url_snapshot=${input.productUrl}
            and o.image_url_snapshot is not distinct from ${input.imageUrl ?? null} and o.category_snapshot is not distinct from ${input.category ?? null}
            and o.price_cents=${input.priceCents} and o.original_price_cents is not distinct from ${input.originalPriceCents ?? null}
            and o.claimed_discount_rate is not distinct from ${input.claimedDiscountRate ?? null}::numeric
            and o.rating_star is not distinct from ${input.ratingStar ?? null}::numeric and o.sales_label is not distinct from ${input.salesLabel ?? null}
            and o.sales_count is not distinct from ${input.salesCount ?? null}::bigint limit 2`;
        if(repeated.length===1 && repeated[0]?.offer_evidence)input={...input,offerEvidence:repeated[0].offer_evidence};
      }
      const optionTransition=this.optionsReady ? sql`or (select option_key from ${sql(this.s)}.price_observation o
        where o.tenant_id=${input.tenantId} and o.product_id=up.id order by o.observed_at desc,o.id desc limit 1)
        is distinct from garimpa.observation_option_key(${input.offerEvidence ? sql.json({...input.offerEvidence} as any):null}::jsonb)` : sql``;
      const optionPredicate=this.optionsReady ? sql`and same_request.option_key=garimpa.observation_option_key(${input.offerEvidence ? sql.json({...input.offerEvidence} as any):null}::jsonb)` : sql``;
      const latestOptionPredicate=this.optionsReady ? sql`and o.option_key=garimpa.observation_option_key(${input.offerEvidence ? sql.json({...input.offerEvidence} as any):null}::jsonb)` : sql``;
      const rows = await sql<UpsertRow[]>`
        with prev as (
          select p.id, ${this.optionsReady ? sql`(select prior.price_cents from ${sql(this.s)}.price_observation prior
            where prior.tenant_id=p.tenant_id and prior.product_id=p.id
              and prior.option_key=garimpa.observation_option_key(${input.offerEvidence ? sql.json({...input.offerEvidence} as any):null}::jsonb)
            order by prior.observed_at desc,prior.id desc limit 1)` : sql`p.last_price_cents`} as last_price_cents
          from ${sql(this.s)}.product p
          where tenant_id = ${input.tenantId}
            and marketplace = ${input.marketplace}
            and external_id = ${input.externalId}
        ), up as (
          insert into ${sql(this.s)}.product as p
            (id, tenant_id, marketplace, external_id, title, product_url, image_url, category,
             family_key, family_label, family_method, family_version,
             last_price_cents, first_seen_at, last_seen_at, last_capture_run_id)
          values (gen_random_uuid()::text, ${input.tenantId}, ${input.marketplace}, ${input.externalId},
                  ${input.title}, ${input.productUrl}, ${input.imageUrl ?? null}, ${input.category ?? null},
                  ${input.family?.key ?? null}, ${input.family?.label ?? null},
                  ${input.family?.method ?? null}, ${input.family?.version ?? null},
                  ${input.priceCents}, ${input.observedAt}, ${input.observedAt}, ${input.captureRunId})
          on conflict (tenant_id, marketplace, external_id) do update set
            title = excluded.title,
            product_url = excluded.product_url,
            image_url = coalesce(excluded.image_url, p.image_url),
            category = coalesce(excluded.category, p.category),
            family_key = coalesce(excluded.family_key, p.family_key),
            family_label = coalesce(excluded.family_label, p.family_label),
            family_method = coalesce(excluded.family_method, p.family_method),
            family_version = coalesce(excluded.family_version, p.family_version),
            last_price_cents = excluded.last_price_cents,
            last_seen_at = excluded.last_seen_at,
            last_capture_run_id = excluded.last_capture_run_id,
            updated_at = now()
          returning id, (xmax = 0) as is_new
        ), ins as (
          insert into ${sql(this.s)}.price_observation as observation
            (id, tenant_id, capture_run_id, product_id, price_cents, original_price_cents,
             claimed_discount_rate, rating_star, sales_label, sales_count, observed_at,
             title_snapshot, product_url_snapshot, image_url_snapshot, category_snapshot, offer_evidence)
          select gen_random_uuid()::text, ${input.tenantId}, ${input.captureRunId}, up.id, ${input.priceCents},
                 ${input.originalPriceCents ?? null}, ${input.claimedDiscountRate ?? null}, ${input.ratingStar ?? null},
                 ${input.salesLabel ?? null}, ${input.salesCount ?? null}, ${input.observedAt},
                 ${input.title}, ${input.productUrl}, ${input.imageUrl ?? null}, ${input.category ?? null},
                 ${input.offerEvidence ? sql.json({ ...input.offerEvidence } as any) : null}
          from up
          left join prev on true
          where exists (select 1 from ${sql(this.s)}.price_observation same_request where same_request.capture_run_id = ${input.captureRunId} and same_request.product_id = up.id ${optionPredicate})
             or up.is_new
             ${optionTransition}
             or prev.last_price_cents is distinct from ${input.priceCents}
             or not exists (
               select 1 from (
                 select o.* from ${sql(this.s)}.price_observation o
                 where o.product_id = up.id and o.tenant_id = ${input.tenantId}
                   ${latestOptionPredicate}
                 order by o.observed_at desc, o.id desc limit 1
               ) latest
               where latest.observed_at > (${input.observedAt}::timestamptz - interval '20 hours')
                 and latest.title_snapshot is not distinct from ${input.title}
                 and latest.product_url_snapshot is not distinct from ${input.productUrl}
                 and latest.image_url_snapshot is not distinct from ${input.imageUrl ?? null}
                 and latest.category_snapshot is not distinct from ${input.category ?? null}
                 and latest.price_cents = ${input.priceCents}
                 and latest.original_price_cents is not distinct from ${input.originalPriceCents ?? null}
                 and latest.claimed_discount_rate is not distinct from ${input.claimedDiscountRate ?? null}::numeric
                 and latest.rating_star is not distinct from ${input.ratingStar ?? null}::numeric
                 and latest.sales_label is not distinct from ${input.salesLabel ?? null}
                 and latest.sales_count is not distinct from ${input.salesCount ?? null}::bigint
                 and (latest.offer_evidence #- '{source,capturedAt}') is not distinct from
                   (${input.offerEvidence ? sql.json({ ...input.offerEvidence } as any) : null}::jsonb #- '{source,capturedAt}')
             )
          on conflict ${sql.unsafe(this.optionsReady ? "(capture_run_id, product_id, option_key)" : "(capture_run_id, product_id)")} do update set
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
            category_snapshot = excluded.category_snapshot,
            offer_evidence = case
              when excluded.offer_evidence is not null then excluded.offer_evidence
              when observation.title_snapshot is not distinct from excluded.title_snapshot
               and observation.product_url_snapshot is not distinct from excluded.product_url_snapshot
               and observation.image_url_snapshot is not distinct from excluded.image_url_snapshot
               and observation.category_snapshot is not distinct from excluded.category_snapshot
               and observation.price_cents = excluded.price_cents
               and observation.original_price_cents is not distinct from excluded.original_price_cents
               and observation.claimed_discount_rate is not distinct from excluded.claimed_discount_rate
               and observation.rating_star is not distinct from excluded.rating_star
               and observation.sales_label is not distinct from excluded.sales_label
               and observation.sales_count is not distinct from excluded.sales_count then observation.offer_evidence
              else null
            end
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
    return await this.withTenant(run.tenantId, async (sql) => {
      const rows = await sql<{ id: string }[]>`
        insert into ${sql(this.s)}.capture_run
          (id, tenant_id, marketplace, started_at, status, collector_run_id, parameters)
        values (gen_random_uuid()::text, ${run.tenantId}, ${run.marketplace}, ${run.startedAt},
                'running', ${run.collectorRunId}, ${sql.json(run.parameters)})
        returning id
      `;
      return rows[0]!.id;
    });
  }

  async finishCaptureRun(runId: string, run: FinishCaptureRunInput & { tenantId?: string }): Promise<void> {
    const tenantId = run.tenantId ?? (run.parameterPatch?.tenantId as string | undefined) ?? "local";
    await this.withTenant(tenantId, async (sql) => {
      await sql`
        update ${sql(this.s)}.capture_run
        set finished_at = ${run.finishedAt}, status = ${run.status},
            items_captured = ${run.itemsCaptured}, items_new = ${run.itemsNew},
            price_changes = ${run.priceChanges}, error = ${run.error ?? null},
            parameters = parameters || ${sql.json(run.parameterPatch ?? {})}
        where id = ${runId}
      `;
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
