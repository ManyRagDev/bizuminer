-- Public navigation reads: reuse the public candidate set for one response and
-- resolve a product page from its indexed publication slug before evaluating
-- the expensive curation facts view.

create or replace function garimpa.public_catalog(p_tenant text,q jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with selected as (
  select id,version from garimpa.editorial_selection
  where tenant_id=p_tenant and status='active' and valid_until>now()
  order by version desc limit 1
 ), offer_rows as materialized (
  select * from garimpa.public_offer_rows(p_tenant)
 ), filtered as materialized (
  select f.*,item.position from offer_rows f
  left join garimpa.editorial_selection_item item
    on item.product_id=f.id and item.tenant_id=f.tenant_id
   and item.selection_id=(select id from selected) and 'home'=any(item.destinations)
  where (q->>'category' is null or f.category=q->>'category')
    and (q->>'search' is null or f.title ilike '%'||(q->>'search')||'%')
    and (q->>'marketplace' is null or f.marketplace=q->>'marketplace')
    and (q->>'minPriceCents' is null or f.price_cents>=(q->>'minPriceCents')::int)
    and (q->>'maxPriceCents' is null or f.price_cents<=(q->>'maxPriceCents')::int)
    and (q->>'minRating' is null or f.rating_star>=(q->>'minRating')::numeric)
    and (q->>'minDiscount' is null or f.claimed_discount_rate>=(q->>'minDiscount')::numeric/100)
    and (not coalesce((q->>'lowestOnly')::boolean,false) or f.lowest_verified)
    and (not coalesce((q->>'hasHistory')::boolean,false) or (f.observation_count>=3 and f.history_days>=7))
    and (q->>'freshnessDays' is null or f.evidence_observed_at>=now()-least(7,(q->>'freshnessDays')::int)*interval '1 day')
 ), paged as (
  select * from filtered order by
   case when coalesce(q->>'sort','signal')='signal' then position end nulls last,
   case when q->>'sort'='price' then price_cents end asc nulls last,
   case when q->>'sort'='popularity' then sales_count end desc nulls last,
   evidence_observed_at desc,id
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
  'deals',coalesce((select jsonb_agg(to_jsonb(p)-'tenant_id'-'publication_id'-'position') from paged p),'[]'::jsonb),
  'total',(select count(*) from filtered),
  'selectionVersion',(select version from selected),
  'selectionStateKey','public-v1',
  'categories',coalesce((select jsonb_agg(category order by category) from categories),'[]'::jsonb),
  'marketplaceCounts',coalesce((select jsonb_object_agg(marketplace,count) from marketplace_counts),'{}'::jsonb)
 );
$$;

create or replace function garimpa.public_deal_detail(p_slug text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with selected_publication as materialized (
  select p.id,p.tenant_id,p.product_id,p.slug
  from garimpa.publication p
  join garimpa.affiliate_account a
    on a.id=p.affiliate_id and a.tenant_id=p.tenant_id and a.status='active'
  where p.slug=p_slug and p.channel='web' and p.status='active'
  order by p.published_at desc,p.id limit 1
 ), deal as materialized (
  select f.id,f.tenant_id,pub.id as publication_id,f.title,f.image_url,f.category,f.marketplace,pub.slug,
    f.price_cents,f.original_price_cents,f.claimed_discount_rate,f.rating_star,f.sales_label,f.sales_count,
    f.observed_at as evidence_observed_at,f.previous_min_price_cents as min_price_cents,
    f.previous_min_price_cents,f.observation_count,f.history_days,f.lowest_verified
  from selected_publication pub
  join garimpa.curation_queue_facts f
    on f.id=pub.product_id and f.tenant_id=pub.tenant_id
  where f.status='approved' and f.price_cents>0 and f.last_seen_at>=now()-interval '7 days'
 )
 select jsonb_build_object('deal',to_jsonb(f)-'tenant_id'-'publication_id','price_history',coalesce((
   select jsonb_agg(jsonb_build_object('price_cents',o.price_cents,'observed_at',o.observed_at) order by o.observed_at,o.id)
   from garimpa.price_observation o
   where o.product_id=f.id and o.tenant_id=f.tenant_id and o.observed_at>=now()-interval '90 days' and o.price_cents>0
     and o.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=latest.offer_evidence->>'currency'
     and garimpa.offer_configuration_key(latest.offer_evidence) is not null
     and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(latest.offer_evidence)
 ),'[]'::jsonb))
 from deal f
 join lateral (
  select offer_evidence from garimpa.price_observation
  where product_id=f.id and tenant_id=f.tenant_id
  order by observed_at desc,id desc limit 1
 ) latest on true
 limit 1;
$$;

revoke all on function garimpa.public_catalog(text,jsonb),garimpa.public_deal_detail(text) from public,anon,authenticated;
grant execute on function garimpa.public_catalog(text,jsonb),garimpa.public_deal_detail(text) to garimpa_public_runtime;
