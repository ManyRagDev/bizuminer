-- Keep the public eligibility rules and mix marketplaces before pagination.
-- Explicit sort orders keep their global ordering.
create or replace function garimpa.public_catalog(p_tenant text,q jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with selected as (
  select id,version from garimpa.editorial_selection
  where tenant_id=p_tenant and status='active' and valid_until>now()
  order by version desc limit 1
 ), offer_rows as materialized (
  select * from garimpa.public_offer_rows(p_tenant)
 ), editorial_titles as materialized (
  select * from garimpa.product_presentation_rows(p_tenant,(select array_agg(id) from offer_rows))
 ), filtered as materialized (
  select f.*,item.position from offer_rows f
  left join editorial_titles editorial on editorial.product_id=f.id
  left join garimpa.editorial_selection_item item
    on item.product_id=f.id and item.tenant_id=f.tenant_id
   and item.selection_id=(select id from selected) and 'home'=any(item.destinations)
  where (q->>'category' is null or f.category=q->>'category')
    and (q->>'search' is null or f.title ilike '%'||(q->>'search')||'%' or editorial.presentation->>'displayTitle' ilike '%'||(q->>'search')||'%')
    and (q->>'marketplace' is null or f.marketplace=q->>'marketplace')
    and (q->>'minPriceCents' is null or f.price_cents>=(q->>'minPriceCents')::int)
    and (q->>'maxPriceCents' is null or f.price_cents<=(q->>'maxPriceCents')::int)
    and (q->>'minRating' is null or f.rating_star>=(q->>'minRating')::numeric)
    and (q->>'minDiscount' is null or f.claimed_discount_rate>=(q->>'minDiscount')::numeric/100)
    and (not coalesce((q->>'lowestOnly')::boolean,false) or f.lowest_verified)
    and (not coalesce((q->>'hasHistory')::boolean,false) or (f.observation_count>=3 and f.history_days>=7))
    and (q->>'freshnessDays' is null or f.evidence_observed_at>=now()-least(7,(q->>'freshnessDays')::int)*interval '1 day')
 ), ordered as (
  select filtered.*, row_number() over (order by
   case when coalesce(q->>'sort','signal')='signal' then position end nulls last,
   case when q->>'sort'='price' then price_cents end asc nulls last,
   case when q->>'sort'='popularity' then sales_count end desc nulls last,
   evidence_observed_at desc,id
  ) as catalog_position
  from filtered
 ), mixed as (
  select ordered.*, case when coalesce(q->>'sort','signal')='signal'
    and nullif(btrim(q->>'marketplace'),'') is null then
      row_number() over (partition by marketplace order by catalog_position)
  end as marketplace_position
  from ordered
 ), paged as materialized (
  select * from mixed order by marketplace_position nulls last,catalog_position
  limit least(24,greatest(1,coalesce((q->>'limit')::int,12)))
  offset greatest(0,coalesce((q->>'offset')::int,0))
 ), presentation_rows as materialized (
  select f.category,f.marketplace
  from offer_rows f
  join garimpa.product p on p.id=f.id and p.tenant_id=f.tenant_id
  where p.last_seen_at>=now()-least(7,greatest(1,coalesce((q->>'freshnessDays')::int,7)))*interval '1 day'
 ), categories as (
  select category,count(*)::int as count
  from presentation_rows where category is not null group by category
 ), marketplace_counts as (
  select marketplace,count(*)::int as count from presentation_rows group by marketplace
 )
 select jsonb_build_object(
  'deals',coalesce((
    select jsonb_agg((to_jsonb(p)-'tenant_id'-'publication_id'-'position'-'catalog_position'-'marketplace_position')
      || coalesce(pr.presentation,'{}'::jsonb) order by p.marketplace_position nulls last,p.catalog_position)
    from paged p
    left join garimpa.public_product_presentations(p_tenant,(select array_agg(id) from paged)) pr on pr.product_id=p.id
  ),'[]'::jsonb),
  'total',(select count(*) from filtered),
  'selectionVersion',(select version from selected),
  'selectionStateKey','public-v1',
  'categories',coalesce((select jsonb_agg(category order by category) from categories),'[]'::jsonb),
  'marketplaceCounts',coalesce((select jsonb_object_agg(marketplace,count) from marketplace_counts),'{}'::jsonb)
 );
$$;
