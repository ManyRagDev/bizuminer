import { db, type DealRow } from "./db";
import { withUserDb } from "./tenant-db.ts";
import { projectConservativePriceEvidence } from "./offer-history.ts";
import { PRODUCT_EVIDENCE_TTL_DAYS, PUBLIC_CURATION_STATUS } from "./catalog-policy.ts";
import type { PriceBand } from "./deal-query";
import { slugCaseSql } from "./marketplaces.ts";

/**
 * Área do comprador: leitura/escrita sobre app_user, favorite, price_watch e
 * buyer_profile (role garimpa_app). Identidade pré-auth: o user_id é o UUID do
 * cookie bm_uid; quando o auth chegar (AL-3), o merge vive em app_user.auth_user_id.
 */

export interface SavedDealRow extends DealRow {
  saved_at: Date | string;
  available: boolean;
}

export interface WatchRow {
  watch_id: string;
  product_id: string;
  title: string;
  slug: string;
  image_url: string | null;
  category: string | null;
  marketplace: string;
  baseline_price_cents: number;
  baseline_currency: string | null;
  target_price_cents: number | null;
  option_key: string | null;
  option_label: string | null;
  current_price_cents: number | null;
  current_observed_at: Date | string | null;
  watched_at: Date | string;
  benefit?: string; audience?: string; caveat?: string; purchaseContents?: string;
  comparison_status: "comparable" | "configuration_changed" | "baseline_unresolved" | "unavailable";
  evidence_current: boolean;
  no_safe_page: boolean;
  valid_until: Date | string | null;
  available: boolean;
}

export type RecommendationOrigin = "salvos" | "acompanhando" | "perfil";

export interface RecommendedDeal extends DealRow {
  reason_origin: RecommendationOrigin;
}

export interface BuyerProfile {
  preferredCategories: string[];
  priceBand: PriceBand;
}

type SqlClient = ReturnType<typeof db>;

type MemberSchemaCapabilities = {
  currentOffers: boolean;
  watchConfiguration: boolean;
  watchStartObservation: boolean;
};

async function memberSchemaCapabilities(sql: SqlClient): Promise<MemberSchemaCapabilities> {
  const [row] = await sql<{
    current_offers: boolean;
    watch_configuration: boolean;
    watch_start_observation: boolean;
  }[]>`
    select
      to_regprocedure('garimpa.member_current_offers(text)') is not null as current_offers,
      (
        to_regprocedure('garimpa.member_watch_evidence(text,text)') is not null
        and exists (
          select 1
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'garimpa'
            and c.relname = 'price_watch'
            and a.attname = 'option_key'
            and not a.attisdropped
        )
      ) as watch_configuration,
      to_regprocedure('garimpa.member_watch_start_observation(text,text,text)') is not null as watch_start_observation
  `;
  return {
    currentOffers: row?.current_offers === true,
    watchConfiguration: row?.watch_configuration === true,
    watchStartObservation: row?.watch_start_observation === true,
  };
}

async function touchUserInternal(sql: SqlClient, userId: string, tenantId: string): Promise<void> {
  await sql`
    update garimpa.app_user
    set last_seen_at = now()
    where id = ${userId} and tenant_id = ${tenantId}
  `;
}

async function ensureUserInternal(sql: SqlClient, userId: string, tenantId: string): Promise<void> {
  await sql`
    insert into garimpa.app_user (id, tenant_id)
    values (${userId}, ${tenantId})
    on conflict (id) do update set last_seen_at = now()
  `;
}

async function setFavoriteInternal(sql: SqlClient, userId: string, productId: string, saved: boolean, tenantId: string): Promise<boolean> {
  if (saved) {
    const rows = await sql`
      insert into garimpa.favorite (tenant_id, user_id, product_id)
      select ${tenantId}, ${userId}, p.id
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      where p.id = ${productId} and p.tenant_id = ${tenantId}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      on conflict (user_id, product_id) do nothing
      returning id
    `;
    if (rows.length > 0) return true;
    const existing = await sql`select 1 from garimpa.favorite where tenant_id = ${tenantId} and user_id = ${userId} and product_id = ${productId}`;
    return existing.length > 0;
  }
  const rows = await sql`
    delete from garimpa.favorite
    where tenant_id = ${tenantId} and user_id = ${userId} and product_id = ${productId}
    returning id
  `;
  return rows.length > 0;
}

async function bulkFavoritesInternal(sql: SqlClient, userId: string, productIds: string[], tenantId: string): Promise<number> {
  if (productIds.length === 0) return 0;
  const rows = await sql`
    insert into garimpa.favorite (tenant_id, user_id, product_id)
    select ${tenantId}, ${userId}, p.id
    from garimpa.product p
    join garimpa.product_curation pc
      on pc.product_id = p.id and pc.tenant_id = p.tenant_id
     and pc.status = ${PUBLIC_CURATION_STATUS}
    where p.tenant_id = ${tenantId} and p.id = any(${productIds})
      and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
    on conflict (user_id, product_id) do nothing
    returning id
  `;
  return rows.length;
}

async function stopWatchInternal(sql: SqlClient, userId: string, productId: string, tenantId: string,
  selector?: {watchId?: string; optionKey?: string | null}): Promise<boolean> {
  const { watchConfiguration } = await memberSchemaCapabilities(sql);
  if (!watchConfiguration) {
    if (selector?.optionKey != null) return false;
    const rows = await sql`
      update garimpa.price_watch
      set active = false, deactivated_at = now()
      where tenant_id = ${tenantId} and user_id = ${userId} and product_id = ${productId} and active
        and (${selector?.watchId ?? null}::text is null or id=${selector?.watchId ?? null})
      returning id
    `;
    return rows.length > 0;
  }
  const hasOption=selector?.optionKey !== undefined;
  const rows = await sql`
    update garimpa.price_watch
    set active = false, deactivated_at = now()
    where tenant_id = ${tenantId} and user_id = ${userId} and product_id = ${productId} and active
      and (${selector?.watchId ?? null}::text is null or id=${selector?.watchId ?? null})
      and (not ${hasOption}::boolean or option_key is not distinct from ${selector?.optionKey ?? null}::text)
    returning id
  `;
  return rows.length > 0;
}

async function getProfileInternal(sql: SqlClient, userId: string, tenantId: string): Promise<BuyerProfile> {
  const rows = await sql<{ preferred_categories: string[]; price_band: PriceBand }[]>`
    select preferred_categories, price_band
    from garimpa.buyer_profile
    where tenant_id = ${tenantId} and user_id = ${userId}
  `;
  if (rows.length === 0) return { preferredCategories: [], priceBand: "all" };
  return { preferredCategories: rows[0].preferred_categories, priceBand: rows[0].price_band };
}

async function saveProfileInternal(sql: SqlClient, userId: string, profile: BuyerProfile, tenantId: string): Promise<void> {
  await sql`
    insert into garimpa.buyer_profile (user_id, tenant_id, preferred_categories, price_band)
    values (${userId}, ${tenantId}, ${profile.preferredCategories}, ${profile.priceBand})
    on conflict (user_id) do update set
      preferred_categories = excluded.preferred_categories,
      price_band = excluded.price_band,
      updated_at = now()
  `;
}

async function savedProductIdsInternal(sql: SqlClient, userId: string, tenantId: string): Promise<string[]> {
  const rows = await sql<{ product_id: string }[]>`
    select product_id
    from garimpa.favorite
    where tenant_id = ${tenantId} and user_id = ${userId}
    order by created_at desc
  `;
  return rows.map((row) => row.product_id);
}

async function savedDealsInternal(sql: SqlClient, userId: string, tenantId: string): Promise<SavedDealRow[]> {
  const { currentOffers } = await memberSchemaCapabilities(sql);
  if (!currentOffers) {
    const rows = await sql<SavedDealRow[]>`
      with fav as (
        select product_id, created_at
        from garimpa.favorite
        where tenant_id = ${tenantId} and user_id = ${userId}
      ), latest as (
        select distinct on (product_id)
          id, product_id, price_cents, original_price_cents, claimed_discount_rate,
          rating_star, sales_label, sales_count, observed_at
        from garimpa.price_observation
        where tenant_id = ${tenantId} and product_id in (select product_id from fav)
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
             s.previous_min_price_cents as min_price_cents,
             s.previous_min_price_cents, s.observation_count, s.history_days,
             (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified,
             f.created_at as saved_at,
             (coalesce(pc.status = ${PUBLIC_CURATION_STATUS}, false) and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')) as available
      from fav f
      join garimpa.product p on p.id = f.product_id and p.tenant_id = ${tenantId}
      left join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
      join latest l on l.product_id = p.id
      join stats s on s.product_id = p.id
      order by f.created_at desc
    `;
    return rows.map((row) => ({ ...projectConservativePriceEvidence(row), saved_at: row.saved_at, available: row.available }));
  }
  const rows = await sql<SavedDealRow[]>`
    with fav as (
      select product_id, created_at
      from garimpa.favorite
      where tenant_id = ${tenantId} and user_id = ${userId}
    ), current_offers as materialized (
      select * from garimpa.member_current_offers(${tenantId}::text)
    ), latest as (
      select distinct on (o.product_id)
        o.id, o.product_id, o.price_cents, o.original_price_cents, o.claimed_discount_rate,
        o.rating_star, o.sales_label, o.sales_count, o.observed_at
      from garimpa.price_observation o left join current_offers valid on valid.product_id=o.product_id
      where o.tenant_id = ${tenantId} and o.product_id in (select product_id from fav)
      order by o.product_id, (o.id=valid.observation_id) desc nulls last, o.observed_at desc, o.id desc
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
           s.previous_min_price_cents as min_price_cents,
           s.previous_min_price_cents, s.observation_count, s.history_days,
           (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified,
           f.created_at as saved_at,
           (valid.product_id is not null and valid.observation_id=l.id) as available,
           valid.valid_until as "offerValidUntil",valid.option_key as "offerOptionKey"
    from fav f
    join garimpa.product p on p.id = f.product_id and p.tenant_id = ${tenantId}
    left join garimpa.product_curation pc
      on pc.product_id = p.id and pc.tenant_id = p.tenant_id
    join latest l on l.product_id = p.id
    left join current_offers valid on valid.product_id=p.id
    join stats s on s.product_id = p.id
    order by f.created_at desc
  `;
  return rows.map((r) => projectConservativePriceEvidence(r));
}

async function watchedDealsInternal(sql: SqlClient, userId: string, tenantId: string): Promise<WatchRow[]> {
  const { watchConfiguration } = await memberSchemaCapabilities(sql);
  if (!watchConfiguration) {
    return await sql<WatchRow[]>`
      with watching as (
        select * from garimpa.price_watch where tenant_id = ${tenantId} and user_id = ${userId} and active
      ), latest as (
        select distinct on (product_id) product_id, price_cents, observed_at, offer_evidence
        from garimpa.price_observation where tenant_id = ${tenantId} and product_id in (select product_id from watching)
        order by product_id, observed_at desc, id desc
      ), presentation_batches as (
        select array_agg(product_id) as ids from (
          select product_id, (row_number() over (order by product_id) - 1) / 200 as batch from watching
        ) grouped group by batch
      ), presentation as (
        select pr.* from presentation_batches b
        cross join lateral garimpa.public_product_presentations(${tenantId}::text, b.ids) pr
      )
      select w.id as watch_id, w.product_id, null::text as option_key, null::text as option_label, p.marketplace,
        w.baseline_price_cents, w.baseline_currency, w.target_price_cents,
        w.created_at as watched_at,
        (coalesce(pc.status = ${PUBLIC_CURATION_STATUS}, false) and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')) as available,
        coalesce(pr.presentation->>'displayTitle', p.title) as title,
        pr.presentation->>'benefit' as benefit, pr.presentation->>'audience' as audience,
        pr.presentation->>'caveat' as caveat, pr.presentation->>'purchaseContents' as "purchaseContents",
        ${sql.unsafe(slugCaseSql("p.marketplace", "p.external_id"))} as slug, p.image_url, p.category,
        (l.observed_at is not null and l.observed_at >= greatest(w.baseline_observed_at, now() - interval '48 hours')) as evidence_current,
        false as no_safe_page,
        null::timestamptz as valid_until,
        case when w.baseline_currency is not null and w.baseline_configuration is not null
          and l.offer_evidence->>'currency' = w.baseline_currency
          and garimpa.offer_configuration_key(l.offer_evidence) = w.baseline_configuration
          and l.observed_at >= greatest(w.baseline_observed_at, now() - interval '48 hours') then l.price_cents end as current_price_cents,
        l.observed_at as current_observed_at,
        case when w.baseline_currency is null or w.baseline_configuration is null or l.observed_at is null
          or l.observed_at < greatest(w.baseline_observed_at, now() - interval '48 hours') then 'unavailable'
          when l.offer_evidence->>'currency' is distinct from w.baseline_currency
            or garimpa.offer_configuration_key(l.offer_evidence) is distinct from w.baseline_configuration then 'configuration_changed'
          else 'comparable' end as comparison_status
      from watching w join garimpa.product p on p.id = w.product_id and p.tenant_id = ${tenantId}
      left join garimpa.product_curation pc on pc.product_id = p.id and pc.tenant_id = p.tenant_id
      left join latest l on l.product_id = w.product_id
      left join presentation pr on pr.product_id = w.product_id order by w.created_at desc
    `;
  }
  return await sql<WatchRow[]>`
    with watching as (
      select * from garimpa.price_watch where tenant_id = ${tenantId} and user_id = ${userId} and active
    ), latest as (
      select w.id as watch_id, observation.* from watching w
      join lateral (select price_cents, observed_at, offer_evidence from garimpa.price_observation
        where tenant_id=${tenantId} and product_id=w.product_id and (w.option_key is null or option_key=w.option_key)
        order by observed_at desc,id desc limit 1) observation on true
    ), presentation_batches as (
      select array_agg(product_id) as ids from (
        select product_id, (row_number() over (order by product_id) - 1) / 200 as batch
        from (select distinct product_id from watching) unique_products
      ) grouped group by batch
    ), presentation as (
      select pr.* from presentation_batches b
      cross join lateral garimpa.public_product_presentations(${tenantId}, b.ids) pr
    )
    select w.id as watch_id, w.product_id, w.option_key,
      coalesce(baseline.offer_evidence->>'variantLabel',l.offer_evidence->>'variantLabel') as option_label,p.marketplace,
      w.baseline_price_cents, w.baseline_currency, w.target_price_cents,
      w.created_at as watched_at,
      (coalesce(pc.status = ${PUBLIC_CURATION_STATUS}, false) and evidence.evidence_current and evidence.public_current
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')) as available,
      coalesce(pr.presentation->>'displayTitle', p.title) as title,
      pr.presentation->>'benefit' as benefit, pr.presentation->>'audience' as audience,
      pr.presentation->>'caveat' as caveat, pr.presentation->>'purchaseContents' as "purchaseContents",
      coalesce(evidence.public_slug,${sql.unsafe(slugCaseSql("p.marketplace", "p.external_id"))}) as slug, p.image_url, p.category,
      evidence.evidence_current,evidence.no_safe_page,evidence.valid_until,
      case when evidence.evidence_current and w.baseline_currency is not null and w.baseline_configuration is not null
        and l.offer_evidence->>'currency' = w.baseline_currency
        and garimpa.offer_configuration_key(l.offer_evidence) = w.baseline_configuration
        and l.observed_at >= greatest(w.baseline_observed_at, now() - interval '48 hours') then l.price_cents end as current_price_cents,
      l.observed_at as current_observed_at,
      case when w.baseline_configuration ? 'membership_unresolved' then 'baseline_unresolved'
        when not evidence.evidence_current or w.baseline_currency is null or w.baseline_configuration is null or l.observed_at is null
        or l.observed_at < greatest(w.baseline_observed_at, now() - interval '48 hours') then 'unavailable'
        when l.offer_evidence->>'currency' is distinct from w.baseline_currency
          or garimpa.offer_configuration_key(l.offer_evidence) is distinct from w.baseline_configuration then 'configuration_changed'
        else 'comparable' end as comparison_status
    from watching w join garimpa.product p on p.id = w.product_id and p.tenant_id = ${tenantId}
    cross join lateral garimpa.member_watch_evidence(w.tenant_id,w.id::text) evidence
    left join garimpa.product_curation pc on pc.product_id = p.id and pc.tenant_id = p.tenant_id
    left join latest l on l.watch_id = w.id
    left join lateral (select o.offer_evidence from garimpa.price_observation o where o.tenant_id=w.tenant_id
      and o.product_id=w.product_id and o.observed_at=w.baseline_observed_at and o.price_cents=w.baseline_price_cents
      and (w.option_key is null or o.option_key=w.option_key)
      and (w.baseline_configuration is null or garimpa.offer_configuration_key(o.offer_evidence)=w.baseline_configuration)
      order by o.id desc limit 1) baseline on true
    left join presentation pr on pr.product_id = w.product_id order by w.created_at desc
  `;
}

async function recommendationBaseInternal(sql: SqlClient, userId: string, tenantId: string): Promise<Map<string, RecommendationOrigin>> {
  const [fromFavorites, fromWatches, profileRows] = await Promise.all([
    sql<{ category: string }[]>`
      select distinct p.category
      from garimpa.favorite f
      join garimpa.product p on p.id = f.product_id and p.tenant_id = ${tenantId}
      where f.tenant_id = ${tenantId} and f.user_id = ${userId} and p.category is not null
    `,
    sql<{ category: string }[]>`
      select distinct p.category
      from garimpa.price_watch w
      join garimpa.product p on p.id = w.product_id and p.tenant_id = ${tenantId}
      where w.tenant_id = ${tenantId} and w.user_id = ${userId} and w.active and p.category is not null
    `,
    sql<{ preferred_categories: string[] }[]>`
      select preferred_categories
      from garimpa.buyer_profile
      where tenant_id = ${tenantId} and user_id = ${userId}
    `,
  ]);
  const base = new Map<string, RecommendationOrigin>();
  for (const row of profileRows[0]?.preferred_categories ?? []) base.set(row, "perfil");
  for (const row of fromWatches) base.set(row.category, "acompanhando");
  for (const row of fromFavorites) base.set(row.category, "salvos");
  return base;
}

async function recommendedDealsInternal(sql: SqlClient, userId: string, limit: number, tenantId: string): Promise<RecommendedDeal[]> {
  const base = await recommendationBaseInternal(sql, userId, tenantId);
  if (base.size === 0) return [];
  const categories = [...base.keys()];
  const { currentOffers } = await memberSchemaCapabilities(sql);
  if (!currentOffers) {
    const rows = await sql<DealRow[]>`
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
             s.previous_min_price_cents as min_price_cents,
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
        and p.category = any(${categories})
        and p.id not in (
          select product_id from garimpa.favorite
          where tenant_id = ${tenantId} and user_id = ${userId}
        )
      order by
        l.claimed_discount_rate desc nulls last,
        l.observed_at desc,
        p.id asc
      limit ${limit}
    `;
    return rows.map((row) => ({
      ...projectConservativePriceEvidence(row),
      reason_origin: base.get(row.category ?? "") ?? "perfil",
    }));
  }
  const rows = await sql<DealRow[]>`
    with current_offers as materialized (
      select * from garimpa.member_current_offers(${tenantId}::text)
    ), latest as (
      select o.id, o.product_id, o.price_cents, o.original_price_cents, o.claimed_discount_rate,
        o.rating_star, o.sales_label, o.sales_count, o.observed_at
      from garimpa.price_observation o join current_offers valid on valid.product_id=o.product_id and valid.observation_id=o.id
      where o.tenant_id = ${tenantId}
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
           s.previous_min_price_cents as min_price_cents,
           s.previous_min_price_cents, s.observation_count, s.history_days,
           (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified,
           valid.valid_until as "offerValidUntil",valid.option_key as "offerOptionKey"
    from garimpa.product p
    join garimpa.product_curation pc
      on pc.product_id = p.id and pc.tenant_id = p.tenant_id
     and pc.status = ${PUBLIC_CURATION_STATUS}
    join latest l on l.product_id = p.id
    join current_offers valid on valid.product_id=p.id and valid.observation_id=l.id
    join stats s on s.product_id = p.id
    where p.tenant_id = ${tenantId}
      and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      and p.category = any(${categories})
      and p.id not in (
        select product_id from garimpa.favorite
        where tenant_id = ${tenantId} and user_id = ${userId}
      )
    order by
      l.claimed_discount_rate desc nulls last,
      l.observed_at desc,
      p.id asc
    limit ${limit}
  `;
  return rows.map((row) => ({
    ...projectConservativePriceEvidence(row),
    reason_origin: base.get(row.category ?? "") ?? "perfil",
  }));
}

/**
 * Marca presença sem criar registro. Só as escritas chamam `ensureUser`; abrir
 * a área para olhar não deve fabricar um usuário no banco (minimização de
 * dados — e a tabela deixa de acumular linhas órfãs de quem nunca salvou nada).
 */
export async function touchUser(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<void> {
  await withUserDb(tenantId, userId, async (sql) => {
    await touchUserInternal(sql, userId, tenantId);
  }, sqlFactory);
}

export async function ensureUser(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<void> {
  await withUserDb(tenantId, userId, async (sql) => {
    await ensureUserInternal(sql, userId, tenantId);
  }, sqlFactory);
}

/** Insert condicionado à existência do produto: id velho de localStorage não vira erro. */
export async function setFavorite(userId: string, productId: string, saved: boolean, tenantId = "local", sqlFactory: typeof db = db): Promise<boolean> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await setFavoriteInternal(sql, userId, productId, saved, tenantId);
  }, sqlFactory);
}

/** Migração do localStorage: idempotente, devolve quantos entraram de fato. */
export async function bulkFavorites(userId: string, productIds: string[], tenantId = "local", sqlFactory: typeof db = db): Promise<number> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await bulkFavoritesInternal(sql, userId, productIds, tenantId);
  }, sqlFactory);
}

/**
 * Começa (ou retoma) o acompanhamento. O baseline é o preço da observação mais
 * recente no momento da marcação; retomar zera o baseline e a data — "desde que
 * você marcou" volta a ser verdade literal.
 */
export async function startWatch(
  userId: string,
  productId: string,
  targetPriceCents: number | null,
  tenantId = "local",
  sqlFactory: typeof db = db,
  optionKey?: string | null,
): Promise<WatchRow | null> {
  return await withUserDb(tenantId, userId, async (sql) => {
    const existing = await watchedDealsInternal(sql, userId, tenantId);
    const active = existing.find((watch) => watch.product_id === productId && watch.option_key === (optionKey ?? null));
    if (active) return active;
    const { watchConfiguration, watchStartObservation } = await memberSchemaCapabilities(sql);
    if (!watchConfiguration || !watchStartObservation) {
      if (optionKey != null) return null;
      const rows = await sql`
        insert into garimpa.price_watch (tenant_id, user_id, product_id, baseline_price_cents, target_price_cents, baseline_currency, baseline_configuration, baseline_observed_at)
        select ${tenantId}, ${userId}, latest.product_id, latest.price_cents, ${targetPriceCents},
          case when latest.offer_evidence->>'currency' ~ '^[A-Z]{3}$' then latest.offer_evidence->>'currency' end, garimpa.offer_configuration_key(latest.offer_evidence), latest.observed_at
        from (
          select o.product_id, o.price_cents, o.offer_evidence, o.observed_at
          from garimpa.price_observation o
          join garimpa.product p on p.id = o.product_id and p.tenant_id = o.tenant_id
          join garimpa.product_curation pc on pc.product_id = o.product_id and pc.tenant_id = o.tenant_id and pc.status = ${PUBLIC_CURATION_STATUS}
          where o.tenant_id = ${tenantId} and o.product_id = ${productId}
            and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          order by o.observed_at desc, o.id desc limit 1
        ) latest
        where latest.observed_at >= now() - interval '48 hours'
        on conflict (user_id, product_id) do update set
          active = true, deactivated_at = null, baseline_price_cents = excluded.baseline_price_cents,
          target_price_cents = excluded.target_price_cents, baseline_currency = excluded.baseline_currency,
          baseline_configuration = excluded.baseline_configuration, baseline_observed_at = excluded.baseline_observed_at,
          created_at = now()
        where not garimpa.price_watch.active
        returning id
      `;
      if (rows.length === 0) {
        const current = await watchedDealsInternal(sql, userId, tenantId);
        return current.find((watch) => watch.product_id === productId) ?? null;
      }
      const watches = await watchedDealsInternal(sql, userId, tenantId);
      return watches.find((watch) => watch.product_id === productId) ?? null;
    }
    const rows = await sql`
      insert into garimpa.price_watch (tenant_id, user_id, product_id, option_key, baseline_price_cents, target_price_cents, baseline_currency, baseline_configuration, baseline_observed_at)
      select ${tenantId}, ${userId}, latest.product_id, ${optionKey ?? null}, latest.price_cents, ${targetPriceCents},
        case when latest.offer_evidence->>'currency' ~ '^[A-Z]{3}$' then latest.offer_evidence->>'currency' end, garimpa.offer_configuration_key(latest.offer_evidence), latest.observed_at
      from (
        select o.product_id, o.price_cents, o.offer_evidence, o.observed_at
        from garimpa.price_observation o
        join garimpa.product p on p.id = o.product_id and p.tenant_id = o.tenant_id
        join garimpa.product_curation pc on pc.product_id = o.product_id and pc.tenant_id = o.tenant_id and pc.status = ${PUBLIC_CURATION_STATUS}
        where o.tenant_id = ${tenantId} and o.product_id = ${productId}
          and (${optionKey ?? null}::text is null or o.option_key=${optionKey ?? null})
          and o.id=garimpa.member_watch_start_observation(${tenantId}::text,${productId}::text,${optionKey ?? null}::text)
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
        order by o.observed_at desc, o.id desc limit 1
      ) latest
      where latest.observed_at >= now() - interval '48 hours'
      on conflict (user_id, product_id, (coalesce(option_key,''))) do update set
        active = true, deactivated_at = null, baseline_price_cents = excluded.baseline_price_cents,
        target_price_cents = excluded.target_price_cents, baseline_currency = excluded.baseline_currency,
        option_key = excluded.option_key,
        baseline_configuration = excluded.baseline_configuration, baseline_observed_at = excluded.baseline_observed_at,
        created_at = now()
      where not garimpa.price_watch.active
      returning id
    `;
    if (rows.length === 0) {
      const current = await watchedDealsInternal(sql, userId, tenantId);
      return current.find((watch) => watch.product_id === productId && watch.option_key === (optionKey ?? null)) ?? null;
    }
    const watches = await watchedDealsInternal(sql, userId, tenantId);
    return watches.find((watch) => watch.product_id === productId && watch.option_key === (optionKey ?? null)) ?? null;
  }, sqlFactory);
}

/** Desativa sem apagar: o histórico de interesse é insumo do alerta (M3). */
export async function stopWatch(userId: string, productId: string, tenantId = "local", sqlFactory: typeof db = db,
  selector?: {watchId?: string; optionKey?: string | null}): Promise<boolean> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await stopWatchInternal(sql, userId, productId, tenantId, selector);
  }, sqlFactory);
}

export async function getProfile(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<BuyerProfile> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await getProfileInternal(sql, userId, tenantId);
  }, sqlFactory);
}

export async function saveProfile(userId: string, profile: BuyerProfile, tenantId = "local", sqlFactory: typeof db = db): Promise<void> {
  await withUserDb(tenantId, userId, async (sql) => {
    await saveProfileInternal(sql, userId, profile, tenantId);
  }, sqlFactory);
}

/** Só os ids salvos — para a vitrine e o botão de produto pintarem os corações
 *  da conta sem carregar o catálogo inteiro (estado da bancada em qualquer aparelho). */
export async function savedProductIds(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<string[]> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await savedProductIdsInternal(sql, userId, tenantId);
  }, sqlFactory);
}

export async function savedDeals(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<SavedDealRow[]> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await savedDealsInternal(sql, userId, tenantId);
  }, sqlFactory);
}

export async function watchedDeals(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<WatchRow[]> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await watchedDealsInternal(sql, userId, tenantId);
  }, sqlFactory);
}

/**
 * Base de recomendação: categorias derivadas do que a pessoa fez (salvos,
 * acompanhados) e do que declarou (perfil). Prioridade de razão: salvos >
 * acompanhando > perfil — a razão exibida é a mais forte que sustenta o item.
 */
export async function recommendationBase(
  userId: string,
  tenantId = "local",
  sqlFactory: typeof db = db,
): Promise<Map<string, RecommendationOrigin>> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await recommendationBaseInternal(sql, userId, tenantId);
  }, sqlFactory);
}

/**
 * Recomendações v1: mesmos critérios de sinal do topDeals, restritos às
 * categorias da base e excluindo o que já foi salvo. Sem base → lista vazia;
 * a UI mostra destaques rotulados como destaques, nunca finge personalização.
 */
export async function recommendedDeals(
  userId: string,
  limit = 8,
  tenantId = "local",
  sqlFactory: typeof db = db,
): Promise<RecommendedDeal[]> {
  return await withUserDb(tenantId, userId, async (sql) => {
    return await recommendedDealsInternal(sql, userId, limit, tenantId);
  }, sqlFactory);
}

export interface MemberSnapshot {
  saved: SavedDealRow[];
  watches: WatchRow[];
  recommended: RecommendedDeal[];
  profile: BuyerProfile;
}

export async function memberSnapshot(userId: string, tenantId = "local", sqlFactory: typeof db = db): Promise<MemberSnapshot> {
  return await withUserDb(tenantId, userId, async (sql) => {
    await touchUserInternal(sql, userId, tenantId);
    const [saved, watches, profile] = await Promise.all([
      savedDealsInternal(sql, userId, tenantId),
      watchedDealsInternal(sql, userId, tenantId),
      getProfileInternal(sql, userId, tenantId),
    ]);
    const recommended = await recommendedDealsInternal(sql, userId, 8, tenantId);
    return { saved, watches, recommended, profile };
  }, sqlFactory);
}

export async function isWatching(userId: string, productId: string, tenantId = "local", optionKey?: string | null): Promise<boolean> {
  return (await watchedDeals(userId, tenantId)).some((watch) => watch.product_id === productId
    && (optionKey === undefined || watch.option_key === optionKey));
}
