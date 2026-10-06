import { sameOfferConfigurationSql } from "./offer-history.ts";
import postgres from "postgres";
import { PRODUCT_EVIDENCE_TTL_DAYS, PUBLIC_CURATION_STATUS } from "./catalog-policy.ts";
import { publishedEditorialStateKey, type PublishedEditorialSelection } from "./editorial-selection.ts";
import type { DealQuery, FreshnessBand } from "./deal-query";
import { freshnessDays, priceRangeForBand } from "./deal-query.ts";
import { categoryDesirabilityFromStats, heroScore, type CategoryStats, type HeroScorable } from "./desirability.ts";
import { toVitrineProduct, type VitrineProduct } from "./deal-view.ts";
import { parseProductSlug, slugCaseSql } from "./marketplaces.ts";

/**
 * Acesso de leitura/escrita do web ao schema garimpa (role garimpa_app).
 * Uma instância por operação — o pooler Supavisor faz o pooling.
 */

export interface DealRow {
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
}

export interface DealsPage {
  deals: DealRow[];
  total: number;
  selectionVersion: number | null;
  selectionStateKey: string;
}

export function db() {
  return postgres(process.env.DATABASE_URL!, {
    prepare: false,
    // max: 1 — cada instância abre UMA conexão. O pooler do Supabase em modo
    // session limita a 15 sessões por projeto; instâncias com max:3 podiam
    // multiplicar conexões sob concorrência (o /api/pauta estourou o teto ao
    // passar de 12 para 20 produtos). Operações rodam suas queries de forma
    // sequencial, então max:1 não custa latência e mantém o teto distante.
    max: 1,
    ssl: process.env.DATABASE_URL!.includes("localhost") ? false : { rejectUnauthorized: false },
  });
}

/** A seleção editorial determina a ordem inicial; filtros explícitos preservam sua ordenação. */
export async function topDeals(query: DealQuery = {}, tenantId = "local", publishedSelection?: PublishedEditorialSelection, sqlFactory: typeof db = db): Promise<DealsPage> {
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
  const selection = publishedSelection ?? await (await import("./editorial-selection-db.ts")).getPublishedEditorialSelection("home", tenantId);
  const selectedIds = sort === "signal" ? selection.products.map((product) => product.id) : [];
  const { min: minPriceCents, max: maxPriceCents } = priceRangeForBand(query.priceBand ?? "all");
  // Filtros antigos como "all" e "14d" não furam a validade global de 7 dias.
  // Valores menores continuam restringindo a captura dentro desse teto.
  const freshnessDaysValue = freshnessDays(freshness);
  const sql = sqlFactory();
  try {
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
    return { deals: rows, total: rows[0]?.total_count ?? 0, selectionVersion: selection.version, selectionStateKey: publishedEditorialStateKey(selection) };
  } finally {
    await sql.end();
  }
}

/**
 * Categorias existentes na vitrine: produtos aprovados vistos nos últimos 7 dias
 * (estado ativo + recente). Antes filtrava pela rodagem atual — uma rodagem
 * curta fazia categorias sumirem.
 */
export async function dealCategories(freshness: FreshnessBand = "7d", tenantId = "local"): Promise<string[]> {
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
export async function marketplaceCounts(freshness: FreshnessBand = "7d", tenantId = "local"): Promise<Record<string, number>> {
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
  const parsed = parseProductSlug(slug);
  if (!parsed) return null;
  const { marketplace, externalId } = parsed;

  const sql = sqlFactory();
  try {
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
  const desirability = await globalCategoryDesirability(tenantId);
  const sql = db();
  try {
    const rows = await sql<(DealRow & { total_count: number })[]>`
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
      select p.id, p.title, p.image_url, p.category, p.marketplace,
             ${sql.unsafe(slugCaseSql("p.marketplace", "p.external_id"))} as slug,
             l.price_cents, l.original_price_cents, l.claimed_discount_rate,
             l.rating_star, l.sales_label, l.sales_count,
             l.observed_at as evidence_observed_at,
             s.previous_min_price_cents, s.observation_count, s.history_days,
             (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified
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

    const heroScorable: Array<{ row: DealRow; score: number }> = rows.map((row) => {
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
