import { currentAccount, scopedTenantId } from "./account-scope.ts";
import { accountDatabase } from "./database-pool.ts";
import { sameOfferConfigurationSql, projectConservativePriceEvidence } from "./offer-history.ts";
import postgres from "postgres";
import { PRODUCT_EVIDENCE_TTL_DAYS, PUBLIC_CURATION_STATUS } from "./catalog-policy.ts";
import { publishedEditorialStateKey, type PublishedEditorialSelection } from "./editorial-selection.ts";
import type { DealQuery, FreshnessBand } from "./deal-query";
import { freshnessDays, priceRangeForBand, isHomepageSelectionQuery } from "./deal-query.ts";
import { categoryDesirabilityFromStats, heroScore, type CategoryStats, type HeroScorable } from "./desirability.ts";
import { toVitrineProduct, type VitrineProduct } from "./deal-view.ts";
import { parseProductSlug, slugCaseSql } from "./marketplaces.ts";

/**
 * Acesso de leitura/escrita do web ao schema garimpa (role garimpa_app).
 * Handles por operação compartilham um pool limitado no processo.
 */

import type { ProductPresentation } from "./product-presentation.ts";
import { hydrateProductPresentations } from "./product-presentation-db.ts";
import type { HistoryContext } from "./price-history.ts";
import { buildConfigurationKey, type OfferEvidence } from "./price-evidence.ts";

export interface DealRow extends Partial<ProductPresentation> {
  id: string;
  title: string;
  slug: string;
  marketplace: string;
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
  history_context?: HistoryContext;
}

export interface DealsPage {
  deals: DealRow[];
  total: number;
  selectionVersion: number | null;
  selectionStateKey: string;
}

export function db() {
  // The shared transport has no account state; each handle authorizes its own transactions.
  return accountDatabase(process.env.DATABASE_URL!, currentAccount());
}

export interface CatalogPresentation {
  categories: string[];
  marketplaceCounts: Record<string, number>;
}

export interface CatalogPage {
  page: DealsPage;
  presentation: CatalogPresentation;
}

function publicCatalogQuery(query: DealQuery): Record<string, unknown> {
  const bounds = priceRangeForBand(query.priceBand ?? "all");
  return {
    category: query.category?.trim() || null, search: query.search?.trim() || null,
    marketplace: query.marketplace?.trim() || null, minPriceCents: bounds.min, maxPriceCents: bounds.max,
    minRating: query.minRating ?? null, minDiscount: query.minDiscount ?? null,
    freshnessDays: freshnessDays(query.freshness ?? "2d"), sort: query.sort ?? "signal",
    lowestOnly: query.lowestOnly ?? false, hasHistory: query.hasHistory ?? false,
    limit: query.limit ?? 12, offset: query.offset ?? 0,
  };
}

/** A seleção editorial determina a ordem inicial; filtros explícitos preservam sua ordenação. */
export async function topDeals(query: DealQuery = {}, tenantId = "local", publishedSelection?: PublishedEditorialSelection, sqlFactory: typeof db = db): Promise<DealsPage> {
  const selection = publishedSelection ?? await (await import("./editorial-selection-db.ts")).getPublishedEditorialSelection("home", tenantId, sqlFactory);
  if (isHomepageSelectionQuery(query) && selection.homepageReady) {
    const deals: DealRow[] = selection.products.map(p => ({ coverHeadline:p.coverHeadline,coverImageApproved:p.coverImageApproved,displayTitle:p.displayTitle,sourceTitle:p.sourceTitle,titleOrigin:p.titleOrigin,
      editorialRevisionId:p.editorialRevisionId,editorialReviewedAt:p.editorialReviewedAt,benefit:p.benefit,audience:p.audience,caveat:p.caveat,purchaseContents:p.purchaseContents,
      priceType:p.priceType,priceMinCents:p.priceMinCents,priceMaxCents:p.priceMaxCents,currency:p.currency,originalPriceKind:p.originalPriceKind, id: p.id, slug: p.slug, title: p.title, marketplace: p.marketplace,
      price_cents: p.priceCents, original_price_cents: p.originalPriceCents, claimed_discount_rate: p.discountPercent === null ? null : p.discountPercent / 100,
      min_price_cents: p.previousMinPriceCents, previous_min_price_cents: p.previousMinPriceCents, observation_count: p.observationCount,
      history_days: p.historyDays, lowest_verified: p.lowestVerified, category: p.category, image_url: p.imageUrl,
      rating_star: p.ratingStar, sales_label: p.salesLabel, sales_count: p.salesCount, evidence_observed_at: p.evidenceObservedAt }));
    const offset = Math.max(0, query.offset ?? 0), limit = Math.min(24, Math.max(1, query.limit ?? 12));
    return { deals: deals.slice(offset, offset + limit), total: deals.length, selectionVersion: selection.version, selectionStateKey: publishedEditorialStateKey(selection) };
  }
  const publicReader = await import("./public-offer-db.ts");
  if (await publicReader.publicProjectionReady(sqlFactory)) {
    const page = await publicReader.publicCatalog(tenantId, publicCatalogQuery(query), sqlFactory);
    return { ...page, selectionVersion: selection.version, selectionStateKey: publishedEditorialStateKey(selection) };
  }
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 24);
  const offset = Math.max(query.offset ?? 0, 0);
  const sort = query.sort ?? "signal";
  const category = query.category?.trim() || null;
  const search = query.search?.trim() || null;
  const marketplace = query.marketplace?.trim() || null;
  const freshness = query.freshness ?? "2d";
  const minRating = query.minRating ?? null;
  const minDiscount = query.minDiscount ?? null;
  const lowestOnly = query.lowestOnly ?? false;
  const hasHistory = query.hasHistory ?? false;
  const selectedIds = sort === "signal" ? selection.products.map((product) => product.id) : [];
  const { min: minPriceCents, max: maxPriceCents } = priceRangeForBand(query.priceBand ?? "all");
  // Filtros antigos como "all" e "14d" não furam a validade global de 7 dias.
  // Valores menores continuam restringindo a captura dentro desse teto.
  const freshnessDaysValue = freshnessDays(freshness);
  const connection = sqlFactory();
  try {
    return await connection.begin("isolation level repeatable read read only", async transaction => {
    const sql = transaction as unknown as ReturnType<typeof db>;
    const snapshotFactory = (() => new Proxy(sql, { get(target, key) {
      if (key === "end") return async () => {};
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } })) as typeof db;
    const { editorialSelectionSchemaReady } = await import("./editorial-selection-db.ts");
    const schemaReady = await editorialSelectionSchemaReady(sql);
    const configurationComparison = schemaReady ? sameOfferConfigurationSql("l", "o") : "false";
    const rows = await sql<(DealRow & { total_count: number; in_current_run: boolean })[]>`
      with current_run as (
        -- Uma rodagem "atual" por marketplace, não uma global filtrada no ML.
        -- Cada plataforma tem sua própria noção de "visto agora".
        select distinct on (cr.marketplace) cr.marketplace, cr.id
        from garimpa.capture_run cr
        where cr.tenant_id = ${tenantId}
          and cr.status = 'ok'
          and exists (
            select 1 from garimpa.price_observation observed
            where observed.capture_run_id = cr.id
          )
        order by cr.marketplace, cr.finished_at desc nulls last, cr.started_at desc
      ), latest as (
        select distinct on (product_id)
          id, product_id, capture_run_id, price_cents, original_price_cents, claimed_discount_rate,
          rating_star, sales_label, sales_count, observed_at,
          ${sql.unsafe(schemaReady ? "offer_evidence" : "null::jsonb as offer_evidence")}
        from garimpa.price_observation
        where tenant_id = ${tenantId}
        order by product_id, observed_at desc, id desc
      ), stats as (
        select l.product_id,
          count(o.id)::int as observation_count,
          floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int as history_days,
          min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents,
          bool_and(${sql.unsafe(configurationComparison)}) as history_comparable
        from latest l
        join garimpa.price_observation o
          on o.product_id = l.product_id and o.tenant_id = ${tenantId}
        group by l.product_id, l.id, l.observed_at, l.offer_evidence
      ), ranked as (
        select p.id, p.title, p.image_url, p.category, p.marketplace,
               ${sql.unsafe(slugCaseSql("p.marketplace", "p.external_id"))} as slug,
               l.price_cents,
               l.original_price_cents,
               l.claimed_discount_rate,
               l.rating_star,
               l.sales_label,
               l.sales_count,
               l.observed_at as evidence_observed_at,
               case when s.history_comparable then s.previous_min_price_cents end as min_price_cents,
               case when s.history_comparable then s.previous_min_price_cents end as previous_min_price_cents,
               s.observation_count,
               s.history_days,
               (s.history_comparable and s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified,
               (cr.id is not null) as in_current_run,
               count(*) over()::int as total_count
        from garimpa.product p
        join garimpa.product_curation pc
          on pc.product_id = p.id and pc.tenant_id = p.tenant_id
         and pc.status = ${PUBLIC_CURATION_STATUS}
        join latest l on l.product_id = p.id
        join stats s on s.product_id = p.id
        left join current_run cr
          on cr.marketplace = p.marketplace and cr.id = l.capture_run_id
        where p.tenant_id = ${tenantId}
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and (${freshnessDaysValue}::integer is null or l.observed_at >= now() - (${freshnessDaysValue} || ' days')::interval)
          and (${category}::text is null or p.category = ${category})
          and (${search}::text is null or p.title ilike '%' || ${search} || '%')
          and (${minPriceCents}::integer is null or l.price_cents >= ${minPriceCents})
          and (${maxPriceCents}::integer is null or l.price_cents <= ${maxPriceCents})
          and (${marketplace}::text is null or p.marketplace = ${marketplace})
          and (${minRating}::numeric is null or l.rating_star >= ${minRating})
          and (${minDiscount}::numeric is null or l.claimed_discount_rate >= (${minDiscount}::numeric / 100))
          and (${lowestOnly}::boolean is false or (s.history_comparable and s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents))
          and (${hasHistory}::boolean is false or (s.observation_count >= 3 and s.history_days >= 7))
      )
      select id, title, image_url, category, marketplace, slug,
             price_cents, original_price_cents, claimed_discount_rate,
             rating_star, sales_label, sales_count, evidence_observed_at,
             min_price_cents, previous_min_price_cents,
             observation_count, history_days, lowest_verified,
             in_current_run, total_count
      from ranked
      order by
        case when ${sort} = 'signal' then array_position(${selectedIds}::text[], id) end asc nulls last,
        case when ${sort} = 'signal' then in_current_run end desc nulls last,
        case when ${sort} = 'signal' then lowest_verified end desc nulls last,
        case when ${sort} = 'signal' then ((previous_min_price_cents - price_cents)::numeric / nullif(previous_min_price_cents, 0)) end desc nulls last,
        case when ${sort} = 'signal' then claimed_discount_rate end desc nulls last,
        case when ${sort} = 'price' then price_cents end asc nulls last,
        case when ${sort} = 'popularity' then sales_count end desc nulls last,
        case when ${sort} = 'recent' then evidence_observed_at end desc nulls last,
        id asc
      limit ${limit}
      offset ${offset}
    `;
    return { deals: await hydrateProductPresentations(rows, tenantId, snapshotFactory), total: rows[0]?.total_count ?? 0, selectionVersion: selection.version, selectionStateKey: publishedEditorialStateKey(selection) };
    }) as unknown as DealsPage;
  } finally {
    await connection.end();
  }
}

/**
 * Categorias existentes na vitrine: produtos aprovados vistos nos últimos 7 dias
 * (estado ativo + recente). Antes filtrava pela rodagem atual — uma rodagem
 * curta fazia categorias sumirem.
 */
export async function dealCategories(freshness: FreshnessBand = "7d", tenantId = "local"): Promise<string[]> {
  const reader=await import("./public-offer-db.ts");
  if(await reader.publicProjectionReady()) return (await reader.publicCatalogStats(tenantId,Math.min(freshnessDays(freshness)??7,7))).categories;
  const freshnessDaysValue = Math.min(freshnessDays(freshness) ?? PRODUCT_EVIDENCE_TTL_DAYS, PRODUCT_EVIDENCE_TTL_DAYS);
  const sql = db();
  try {
    const rows = await sql<{ category: string }[]>`
      select distinct p.category as category
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      where p.tenant_id = ${tenantId}
        and p.category is not null
        and p.last_seen_at >= now() - (${freshnessDaysValue} * interval '1 day')
      order by category asc
    `;
    return rows.map((row) => row.category);
  } finally {
    await sql.end();
  }
}

/**
 * Contagem de produtos por marketplace, na mesma janela de 7 dias da
 * vitrine — alimenta o filtro de plataforma ("Mercado Livre (41)").
 */
export async function marketplaceCounts(freshness: FreshnessBand = "7d", tenantId = scopedTenantId()): Promise<Record<string, number>> {
  const reader=await import("./public-offer-db.ts");
  if(await reader.publicProjectionReady()) return (await reader.publicCatalogStats(tenantId,Math.min(freshnessDays(freshness)??7,7))).marketplaces;
  const freshnessDaysValue = Math.min(freshnessDays(freshness) ?? PRODUCT_EVIDENCE_TTL_DAYS, PRODUCT_EVIDENCE_TTL_DAYS);
  const sql = db();
  try {
    const rows = await sql<{ marketplace: string; count: number }[]>`
      select p.marketplace, count(*)::int as count
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      where p.tenant_id = ${tenantId}
        and p.last_seen_at >= now() - (${freshnessDaysValue} * interval '1 day')
      group by p.marketplace
    `;
    return Object.fromEntries(rows.map((row) => [row.marketplace, row.count]));
  } finally {
    await sql.end();
  }
}

/** Lista e facetas públicas reutilizam a mesma projeção no banco. */
export async function catalogPage(query: DealQuery = {}, tenantId = "local", sqlFactory: typeof db = db, publishedSelection?: PublishedEditorialSelection): Promise<CatalogPage> {
  const selection = publishedSelection ?? await (await import("./editorial-selection-db.ts")).getPublishedEditorialSelection("home", tenantId, sqlFactory);
  if (isHomepageSelectionQuery(query) && selection.homepageReady) {
    const [page, presentation] = await Promise.all([topDeals(query, tenantId, selection, sqlFactory), catalogPresentation(query.freshness, tenantId, sqlFactory)]);
    return { page, presentation };
  }
  const reader = await import("./public-offer-db.ts");
  if (await reader.publicProjectionReady(sqlFactory)) {
    const page = await reader.publicCatalog(tenantId, publicCatalogQuery(query), sqlFactory);
    page.selectionVersion = selection.version;
    page.selectionStateKey = publishedEditorialStateKey(selection);
    if (Array.isArray(page.categories) && page.marketplaceCounts && typeof page.marketplaceCounts === "object") {
      return { page, presentation: { categories: page.categories, marketplaceCounts: page.marketplaceCounts } };
    }
    // Mantém compatibilidade no intervalo entre publicar o app e a migração.
    return { page, presentation: await catalogPresentation(query.freshness, tenantId, sqlFactory) };
  }
  const [page, presentation] = await Promise.all([
    topDeals(query, tenantId, selection, sqlFactory),
    catalogPresentation(query.freshness, tenantId, sqlFactory),
  ]);
  return { page, presentation };
}

/**
 * Dados auxiliares do catálogo carregados juntos pela vitrine e pela API.
 * No caminho público, isso evita executar a projeção cara duas vezes para
 * obter categorias e contagens de marketplace da mesma janela.
 */
export async function catalogPresentation(freshness: FreshnessBand = "7d", tenantId = "local", sqlFactory: typeof db = db): Promise<CatalogPresentation> {
  const reader = await import("./public-offer-db.ts");
  const days = Math.min(freshnessDays(freshness) ?? PRODUCT_EVIDENCE_TTL_DAYS, PRODUCT_EVIDENCE_TTL_DAYS);
  if (await reader.publicProjectionReady(sqlFactory)) {
    const stats = await reader.publicCatalogStats(tenantId, days, sqlFactory);
    return { categories: stats.categories, marketplaceCounts: stats.marketplaces };
  }

  const sql = sqlFactory();
  try {
    const [row] = await sql<{ categories: string[] | null; marketplace_counts: Record<string, number> | null }[]>`
      with visible as (
        select p.category, p.marketplace
        from garimpa.product p
        join garimpa.product_curation pc
          on pc.product_id = p.id and pc.tenant_id = p.tenant_id
         and pc.status = ${PUBLIC_CURATION_STATUS}
        where p.tenant_id = ${tenantId}
          and p.last_seen_at >= now() - (${days} * interval '1 day')
      ), categories as (
        select array_agg(category order by category) as value
        from (select distinct category from visible where category is not null) listed
      ), marketplaces as (
        select jsonb_object_agg(marketplace, count) as value
        from (select marketplace, count(*)::int as count from visible group by marketplace) counted
      )
      select categories.value as categories, marketplaces.value as marketplace_counts
      from categories cross join marketplaces
    `;
    return { categories: row?.categories ?? [], marketplaceCounts: row?.marketplace_counts ?? {} };
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
  const reader=await import("./public-offer-db.ts");
  if(await reader.publicProjectionReady()) return (await reader.publicCatalogStats(tenantId,7)).categories;
  const sql = db();
  try {
    const rows = await sql<{ category: string }[]>`
      select distinct p.category as category
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
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
export async function dealDetail(slug: string, tenantId = "local", sqlFactory: typeof db = db): Promise<DealDetail | null> {
  const publicReader = await import("./public-offer-db.ts");
  if (await publicReader.publicProjectionReady(sqlFactory)) return publicReader.publicDealDetail(slug, sqlFactory);
  const parsed = parseProductSlug(slug);
  if (!parsed) return null;
  const { marketplace, externalId } = parsed;

  const connection = sqlFactory();
  try {
    return await connection.begin("isolation level repeatable read read only", async transaction => {
    const sql = transaction as unknown as ReturnType<typeof db>;
    const snapshotFactory = (() => new Proxy(sql, { get(target, key) {
      if (key === "end") return async () => {};
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } })) as typeof db;
    const { editorialSelectionSchemaReady } = await import("./editorial-selection-db.ts");
    const schemaReady = await editorialSelectionSchemaReady(sql);
    const configurationComparison = schemaReady ? sameOfferConfigurationSql("l", "o") : "false";
    const deals = await sql<DealRow[]>`
      with latest as (
        select distinct on (product_id)
          id, product_id, price_cents, original_price_cents, claimed_discount_rate,
          rating_star, sales_label, sales_count, observed_at,
          ${sql.unsafe(schemaReady ? "offer_evidence" : "null::jsonb as offer_evidence")}
        from garimpa.price_observation
        where tenant_id = ${tenantId}
        order by product_id, observed_at desc, id desc
      ), stats as (
        select l.product_id,
          count(o.id)::int as observation_count,
          floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int as history_days,
          min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents,
          bool_and(${sql.unsafe(configurationComparison)}) as history_comparable
        from latest l
        join garimpa.price_observation o
          on o.product_id = l.product_id and o.tenant_id = ${tenantId}
        group by l.product_id, l.id, l.observed_at, l.offer_evidence
      )
      select p.id, p.title, p.image_url, p.category, p.marketplace,
             ${sql.unsafe(slugCaseSql("p.marketplace", "p.external_id"))} as slug,
             l.price_cents, l.original_price_cents, l.claimed_discount_rate,
             l.rating_star, l.sales_label, l.sales_count, l.observed_at as evidence_observed_at,
             case when s.history_comparable then s.previous_min_price_cents end as min_price_cents,
             case when s.history_comparable then s.previous_min_price_cents end as previous_min_price_cents, s.observation_count, s.history_days,
             (s.history_comparable and s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      join latest l on l.product_id = p.id
      join stats s on s.product_id = p.id
      where p.tenant_id = ${tenantId}
        and p.marketplace = ${marketplace}
        and p.external_id = ${externalId}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      limit 1
    `;
    const deal = deals[0];
    if (!deal) return null;

    const observations = await sql<(PricePoint & { offer_evidence: OfferEvidence | null })[]>`
      select price_cents, observed_at, ${sql.unsafe(schemaReady ? "offer_evidence" : "null::jsonb as offer_evidence")}
      from garimpa.price_observation
      where tenant_id = ${tenantId} and product_id = ${deal.id}
        and observed_at >= now() - interval '90 days' and observed_at <= now()
      order by observed_at asc, id asc
    `;
    const evidence = observations.at(-1)?.offer_evidence;
    const configuration = buildConfigurationKey(evidence);
    const history = observations.filter(o => o.price_cents > 0 && evidence?.currency && o.offer_evidence?.currency === evidence.currency
      && configuration !== null && buildConfigurationKey(o.offer_evidence) === configuration)
      .map(({ price_cents, observed_at }) => ({ price_cents, observed_at }));
    const comparison: HistoryContext["comparison"] = evidence?.priceType && evidence.priceType !== "exact" ? "non_exact"
      : !evidence?.currency ? "currency_unknown" : !configuration ? "configuration_unknown" : "comparable";
    const [presented] = await hydrateProductPresentations([projectConservativePriceEvidence(deal)], tenantId, snapshotFactory);
    return { deal: presented, price_history: history, history_context: { windowDays: 90, totalCount: deal.observation_count,
      windowCount: observations.length, comparableCount: history.length, excludedCount: observations.length - history.length,
      comparison, currency: evidence?.currency } };
    }) as unknown as DealDetail | null;
  } finally {
    await connection.end();
  }
}

/**
 * Link afiliado (estratégia matt_full, provada em campo 17–18/08):
 * permalink + matt_word={trackingId}_{subId} + matt_tool + forceInApp.
 *
 * Desde E3, a credencial é EXPLÍCITA (vem do afiliado dono da publicação),
 * nunca lida de `process.env` global. A função não tem fallback para a tag da
 * casa — config ausente/inválida falha fechada no chamador.
 */
export interface AffiliateLinkConfig {
  trackingId: string;
  toolId: string;
}

export function affiliateLink(productUrl: string, subId: string, config: AffiliateLinkConfig): string {
  const u = new URL(productUrl);
  u.searchParams.set("matt_word", `${config.trackingId}_${subId}`);
  u.searchParams.set("matt_tool", config.toolId);
  u.searchParams.set("forceInApp", "true");
  return u.toString();
}

/**
 * Resolução de comissão por afiliado (E3): publication → produto →
 * affiliate_account → affiliate_marketplace_config. Devolve a credencial do
 * afiliado dono da publicação (config ativa) ou null (não encontrado / config
 * ausente/suspensa). O chamador falha fechado — nunca cai na tag global.
 */
export interface AffiliatePublicationResolution {
  publicationId: string;
  tenantId: string;
  productUrl: string;
  trackingId: string;
  toolId: string;
}

/**
 * Resolução do link Shopee (M3): busca a publication já persistida do
 * produto — nunca o `product_url` cru. `affiliateUrl: null` significa "ainda
 * não gerado" e é tratado pelo chamador como falha fechada (nunca cai no
 * fallback do link cru, que perderia a comissão em silêncio).
 */
export interface ShopeePublicationResolution {
  publicationId: string;
  tenantId: string;
  affiliateUrl: string | null;
}

/**
 * Resolve a publicação de um marketplace de link PRÉ-GERADO (Shopee,
 * AliExpress). Recebe o marketplace em vez de fixá-lo: antes esta função era
 * `resolveShopeePublicationForLink` com `'shopee'` embutido, e quando a
 * AliExpress entrou todo produto dela virou 404 no `/go` — o link morria e o
 * clique não gerava comissão. Generalizar aqui é o que impede a próxima loja
 * de repetir o mesmo bug (M-R5).
 */
export async function resolvePreGeneratedLink(
  externalId: string,
  marketplace: string,
  tenantId = "local",
): Promise<ShopeePublicationResolution | null> {
  const sql = db();
  try {
    const rows = await sql<{ publication_id: string; tenant_id: string; affiliate_url: string | null }[]>`
      select pub.id as publication_id, pub.tenant_id, pub.affiliate_url
      from garimpa.publication pub
      join garimpa.product p on p.id = pub.product_id
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      where p.tenant_id = ${tenantId}
        and p.marketplace = ${marketplace}
        and p.external_id = ${externalId}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      order by pub.published_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { publicationId: row.publication_id, tenantId: row.tenant_id, affiliateUrl: row.affiliate_url };
  } finally {
    await sql.end();
  }
}

/**
 * Decisão pura de redirect do /go para Shopee — separada da consulta ao banco
 * para ser testável sem DATABASE_URL. Estruturalmente não pode vazar
 * `product_url`: o tipo de entrada nem carrega esse campo, só `affiliateUrl`.
 */
export type ShopeeRedirectDecision =
  | { kind: "redirect"; url: string; publicationId: string; tenantId: string }
  | { kind: "not_found"; reason: string };

export function shopeeRedirectTarget(resolution: ShopeePublicationResolution | null): ShopeeRedirectDecision {
  if (!resolution) return { kind: "not_found", reason: "produto não encontrado" };
  if (!resolution.affiliateUrl) return { kind: "not_found", reason: "link de afiliado ainda não gerado" };
  return {
    kind: "redirect",
    url: resolution.affiliateUrl,
    publicationId: resolution.publicationId,
    tenantId: resolution.tenantId,
  };
}

export async function resolvePublicationForLink(slug: string): Promise<AffiliatePublicationResolution | null> {
  const sql = db();
  try {
    const rows = await sql<{
      publication_id: string;
      tenant_id: string;
      product_url: string;
      tracking_id: string;
      tool_id: string;
    }[]>`
      select pub.id as publication_id, pub.tenant_id, p.product_url,
             c.tracking_id, c.tool_id
      from garimpa.publication pub
      join garimpa.product p on p.id = pub.product_id
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      join garimpa.affiliate_account a on a.id = pub.affiliate_id
      join garimpa.affiliate_marketplace_config c
        on c.affiliate_id = a.id and c.marketplace = 'mercadolivre'
      where pub.slug = ${slug}
        and a.status = 'active'
        and c.status = 'active'
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      publicationId: row.publication_id,
      tenantId: row.tenant_id,
      productUrl: row.product_url,
      trackingId: row.tracking_id,
      toolId: row.tool_id,
    };
  } finally {
    await sql.end();
  }
}

/**
 * Desejabilidade global — P2 do plano de pauta.
 *
 * Calcula o score de desejo de cada categoria sobre o CATÁLOGO INTEIRO
 * (produtos aprovados vistos nos últimos 7 dias), não sobre uma página.
 * Retorna o Map de category → score normalizado (0–1).
 *
 * Destinado a ser chamado a cada rodagem de captura e materializado
 * (tabela ou cache). Enquanto não materializa, o hero usa a versão
 * em memória (categoryDesirabilityFromProducts).
 */
export async function globalCategoryDesirability(
  tenantId = "local",
): Promise<Map<string, number>> {
  const reader=await import("./public-offer-db.ts");
  if(await reader.publicProjectionReady()) return categoryDesirabilityFromStats((await reader.publicCatalogStats(tenantId,7)).categoryStats);
  const sql = db();
  try {
    const rows = await sql<CategoryStats[]>`
      with latest as (
        select distinct on (product_id)
          product_id, price_cents, sales_count
        from garimpa.price_observation
        where tenant_id = ${tenantId}
        order by product_id, observed_at desc, id desc
      )
      select p.category,
        count(*)::int as count,
        sum(coalesce(l.sales_count, 0))::int as "totalSales",
        sum(l.price_cents)::bigint::int as "sumPriceCents"
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      join latest l on l.product_id = p.id
      where p.tenant_id = ${tenantId}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
        and p.category is not null
      group by p.category
    `;
    return categoryDesirabilityFromStats(rows);
  } finally {
    await sql.end();
  }
}

/**
 * Seleciona os produtos para o hero a partir do catálogo inteiro.
 * Retorna até `max` produtos ordenados por heroScore desc.
 *
 * Usa a desejabilidade global (calculada sobre todos os produtos)
 * em vez da versão em memória (que normaliza sobre a página).
 */
export async function globalHeroProducts(
  max = 6,
  tenantId = "local",
): Promise<VitrineProduct[]> {
  const reader=await import("./public-offer-db.ts");
  if(await reader.publicProjectionReady()) {
    const desirability=await globalCategoryDesirability(tenantId);
    const rows=await reader.publicHeroCandidates(tenantId);
    return rows.map(row=>({row,score:heroScore({priceCents:row.price_cents,previousMinPriceCents:row.previous_min_price_cents,
     observationCount:row.observation_count,historyDays:row.history_days,lowestVerified:row.lowest_verified,ratingStar:row.rating_star,
     salesCount:row.sales_count,evidenceObservedAt:row.evidence_observed_at,category:row.category},desirability)}))
      .filter(e=>e.score>=7).sort((a,b)=>b.score-a.score||a.row.price_cents-b.row.price_cents).slice(0,max).map(e=>toVitrineProduct(e.row));
  }
  const desirability = await globalCategoryDesirability(tenantId);
  const sql = db();
  try {
    const { editorialSelectionSchemaReady } = await import("./editorial-selection-db.ts");
    const schemaReady = await editorialSelectionSchemaReady(sql);
    const configurationComparison = schemaReady ? sameOfferConfigurationSql("l", "o") : "false";
    const rows = await sql<(DealRow & { total_count: number })[]>`
      with latest as (
        select distinct on (product_id)
          id, product_id, price_cents, original_price_cents, claimed_discount_rate,
          rating_star, sales_label, sales_count, observed_at,
          ${sql.unsafe(schemaReady ? "offer_evidence" : "null::jsonb as offer_evidence")}
        from garimpa.price_observation
        where tenant_id = ${tenantId}
        order by product_id, observed_at desc, id desc
      ), stats as (
        select l.product_id,
          count(o.id)::int as observation_count,
          floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int as history_days,
          min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents,
          bool_and(${sql.unsafe(configurationComparison)}) as history_comparable
        from latest l
        join garimpa.price_observation o
          on o.product_id = l.product_id and o.tenant_id = ${tenantId}
        group by l.product_id, l.id, l.observed_at, l.offer_evidence
      )
      select p.id, p.title, p.image_url, p.category, p.marketplace,
             ${sql.unsafe(slugCaseSql("p.marketplace", "p.external_id"))} as slug,
             l.price_cents, l.original_price_cents, l.claimed_discount_rate,
             l.rating_star, l.sales_label, l.sales_count,
             l.observed_at as evidence_observed_at,
             case when s.history_comparable then s.previous_min_price_cents end as min_price_cents,
             case when s.history_comparable then s.previous_min_price_cents end as previous_min_price_cents,
             s.observation_count, s.history_days,
             (s.history_comparable and s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      join latest l on l.product_id = p.id
      join stats s on s.product_id = p.id
      where p.tenant_id = ${tenantId}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
        and p.image_url is not null
    `;

    const heroScorable: Array<{ row: DealRow; score: number }> = rows.map((r) => {
      const row = projectConservativePriceEvidence(r);
      const scorable: HeroScorable = {
        priceCents: row.price_cents,
        previousMinPriceCents: row.previous_min_price_cents,
        observationCount: row.observation_count,
        historyDays: row.history_days,
        lowestVerified: row.lowest_verified,
        ratingStar: row.rating_star,
        salesCount: row.sales_count,
        evidenceObservedAt: row.evidence_observed_at,
        category: row.category,
      };
      return { row, score: heroScore(scorable, desirability) };
    });

    return heroScorable
      .filter((entry) => entry.score >= 7)
      .sort((a, b) => b.score - a.score || a.row.price_cents - b.row.price_cents)
      .slice(0, max)
      .map((entry) => toVitrineProduct(entry.row));
  } finally {
    await sql.end();
  }
}
