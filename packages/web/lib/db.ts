import postgres from "postgres";
import type { DealQuery } from "./deal-query";
import { priceRangeForBand } from "./deal-query";

/**
 * Acesso de leitura/escrita do web ao schema garimpa (role garimpa_app).
 * Uma instância por operação — o pooler Supavisor faz o pooling.
 */

export interface DealRow {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
  original_price_cents: number | null;
  claimed_discount_rate: number | null;
  min_price_cents: number | null;
  previous_min_price_cents: number | null;
  observation_count: number;
  history_days: number;
  lowest_verified: boolean;
  category: string | null;
  image_url: string | null;
  rating_star: number | null;
  sales_label: string | null;
  sales_count: number | null;
  evidence_observed_at: Date | string | null;
}

export interface PricePoint {
  price_cents: number;
  observed_at: Date | string;
}

export interface DealDetail {
  deal: DealRow;
  price_history: PricePoint[];
}

export interface DealsPage {
  deals: DealRow[];
  total: number;
}

export function db() {
  return postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 3,
    ssl: process.env.DATABASE_URL!.includes("localhost") ? false : { rejectUnauthorized: false },
  });
}

/**
 * Vitrine: preço histórico primeiro, desconto declarado apenas como desempate.
 * A observação mais recente é excluída do mínimo anterior para que um produto
 * novo nunca seja chamado de "menor preço" por acidente.
 */
export async function topDeals(query: DealQuery = {}, tenantId = "local"): Promise<DealsPage> {
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 24);
  const offset = Math.max(query.offset ?? 0, 0);
  const sort = query.sort ?? "signal";
  const category = query.category?.trim() || null;
  const search = query.search?.trim() || null;
  const { min: minPriceCents, max: maxPriceCents } = priceRangeForBand(query.priceBand ?? "all");
  const sql = db();
  try {
    const rows = await sql<(DealRow & { total_count: number })[]>`
      with current_run as (
        select cr.id
        from garimpa.capture_run cr
        where cr.tenant_id = ${tenantId}
          and cr.marketplace = 'mercadolivre'
          and cr.status = 'ok'
          and exists (
            select 1 from garimpa.price_observation observed
            where observed.capture_run_id = cr.id
          )
        order by cr.finished_at desc nulls last, cr.started_at desc
        limit 1
      ), latest as (
        select distinct on (product_id)
          id, product_id, price_cents, original_price_cents, claimed_discount_rate,
          rating_star, sales_label, sales_count, observed_at
        from garimpa.price_observation
        where tenant_id = ${tenantId}
          and (
            not exists (select 1 from current_run)
            or capture_run_id = (select id from current_run)
          )
        order by product_id, observed_at desc, id desc
      ), stats as (
        select l.product_id,
          count(o.id)::int as observation_count,
          floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int as history_days,
          min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents
        from latest l
        join garimpa.price_observation o
          on o.product_id = l.product_id and o.tenant_id = ${tenantId}
        group by l.product_id, l.id, l.observed_at
      )
      select p.id, p.title, p.image_url, p.category,
             'ml-' || p.external_id as slug,
             l.price_cents,
             l.original_price_cents,
             l.claimed_discount_rate,
             l.rating_star,
             l.sales_label,
             l.sales_count,
             l.observed_at as evidence_observed_at,
             s.previous_min_price_cents as min_price_cents,
              s.previous_min_price_cents,
              s.observation_count,
              s.history_days,
              (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified,
              count(*) over()::int as total_count
      from garimpa.product p
      join latest l on l.product_id = p.id
      join stats s on s.product_id = p.id
      where p.tenant_id = ${tenantId}
        and (${category}::text is null or p.category = ${category})
        and (${search}::text is null or p.title ilike '%' || ${search} || '%')
        and (${minPriceCents}::integer is null or l.price_cents >= ${minPriceCents})
        and (${maxPriceCents}::integer is null or l.price_cents <= ${maxPriceCents})
      
      order by
        case when ${sort} = 'signal' then (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) end desc nulls last,
        case when ${sort} = 'signal' then ((s.previous_min_price_cents - l.price_cents)::numeric / nullif(s.previous_min_price_cents, 0)) end desc nulls last,
        case when ${sort} = 'signal' then l.claimed_discount_rate end desc nulls last,
        case when ${sort} = 'price' then l.price_cents end asc nulls last,
        case when ${sort} = 'popularity' then l.sales_count end desc nulls last,
        case when ${sort} = 'recent' then l.observed_at end desc nulls last,
        p.id asc
      limit ${limit}
      offset ${offset}
    `;
    return { deals: rows, total: rows[0]?.total_count ?? 0 };
  } finally {
    await sql.end();
  }
}

/** Categorias existentes, para que o filtro não invente corredores vazios. */
export async function dealCategories(tenantId = "local"): Promise<string[]> {
  const sql = db();
  try {
    const rows = await sql<{ category: string }[]>`
      with current_run as (
        select cr.id
        from garimpa.capture_run cr
        where cr.tenant_id = ${tenantId}
          and cr.marketplace = 'mercadolivre'
          and cr.status = 'ok'
          and exists (
            select 1 from garimpa.price_observation observed
            where observed.capture_run_id = cr.id
          )
        order by cr.finished_at desc nulls last, cr.started_at desc
        limit 1
      )
      select distinct p.category as category
      from garimpa.product p
      where p.tenant_id = ${tenantId}
        and p.category is not null
        and (
          not exists (select 1 from current_run)
          or p.last_capture_run_id = (select id from current_run)
        )
      order by category asc
    `;
    return rows.map((row) => row.category);
  } finally {
    await sql.end();
  }
}

/**
 * Todas as categorias já vistas no catálogo, independente da varredura mais
 * recente. O perfil do comprador usa esta lista; a vitrine usa `dealCategories`.
 *
 * A distinção não é cosmética: na vitrine o recorte por execução atual está
 * certo (filtra o que está à venda agora), mas no perfil ele apagava intenção
 * declarada — uma varredura de 1 página bastava para "Moda" sumir da tela e
 * ser descartada no próximo salvamento.
 */
export async function catalogCategories(tenantId = "local"): Promise<string[]> {
  const sql = db();
  try {
    const rows = await sql<{ category: string }[]>`
      select distinct p.category as category
      from garimpa.product p
      where p.tenant_id = ${tenantId}
        and p.category is not null
      order by category asc
    `;
    return rows.map((row) => row.category);
  } finally {
    await sql.end();
  }
}

/** Produto individual e seus fatos de preço para a página compartilhável. */
export async function dealDetail(slug: string, tenantId = "local"): Promise<DealDetail | null> {
  const externalId = slug.match(/^ml-(.+)$/)?.[1];
  if (!externalId) return null;

  const sql = db();
  try {
    const deals = await sql<DealRow[]>`
      with latest as (
        select distinct on (product_id)
          id, product_id, price_cents, original_price_cents, claimed_discount_rate,
          rating_star, sales_label, sales_count, observed_at
        from garimpa.price_observation
        where tenant_id = ${tenantId}
        order by product_id, observed_at desc, id desc
      ), stats as (
        select l.product_id,
          count(o.id)::int as observation_count,
          floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int as history_days,
          min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents
        from latest l
        join garimpa.price_observation o
          on o.product_id = l.product_id and o.tenant_id = ${tenantId}
        group by l.product_id, l.id, l.observed_at
      )
      select p.id, p.title, p.image_url, p.category,
             'ml-' || p.external_id as slug,
             l.price_cents, l.original_price_cents, l.claimed_discount_rate,
             l.rating_star, l.sales_label, l.sales_count, l.observed_at as evidence_observed_at,
             s.previous_min_price_cents as min_price_cents,
             s.previous_min_price_cents, s.observation_count, s.history_days,
             (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified
      from garimpa.product p
      join latest l on l.product_id = p.id
      join stats s on s.product_id = p.id
      where p.tenant_id = ${tenantId}
        and p.marketplace = 'mercadolivre'
        and p.external_id = ${externalId}
      limit 1
    `;
    const deal = deals[0];
    if (!deal) return null;

    const history = await sql<PricePoint[]>`
      select price_cents, observed_at
      from garimpa.price_observation
      where tenant_id = ${tenantId}
        and product_id = ${deal.id}
        and observed_at >= now() - interval '90 days'
      order by observed_at asc, id asc
    `;
    return { deal, price_history: history };
  } finally {
    await sql.end();
  }
}

/**
 * Link afiliado (estratégia matt_full, provada em campo 17–18/08):
 * permalink + matt_word={trackingId}_{subId} + matt_tool + forceInApp.
 */
export function affiliateLink(productUrl: string, subId: string): string {
  const trackingId = process.env.ML_TRACKING_ID!;
  const toolId = process.env.ML_TOOL_ID!;
  const u = new URL(productUrl);
  u.searchParams.set("matt_word", `${trackingId}_${subId}`);
  u.searchParams.set("matt_tool", toolId);
  u.searchParams.set("forceInApp", "true");
  return u.toString();
}
