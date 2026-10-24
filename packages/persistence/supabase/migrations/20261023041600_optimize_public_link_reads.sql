-- Incremental after the installed A/B/C rollout. Historical sealed artifacts
-- and account/RLS rules are unchanged. Supersedes the unpublished navigation
-- candidate with canonical-publication checks shared by every link consumer.
set local lock_timeout = '5s';
set local statement_timeout = '45s';

-- Internal projection: only publication eligibility and the latest price.
-- A slug first restricts the product through publication_slug_key; the lateral
-- publication still selects the canonical active publication for that product.
create or replace function garimpa.public_offer_candidates(p_tenant text,p_slug text)
returns table(
 id text,tenant_id text,publication_id text,title text,image_url text,category text,
 marketplace text,slug text,price_cents integer,original_price_cents integer,
 claimed_discount_rate double precision,rating_star double precision,
 sales_label text,sales_count integer,evidence_observed_at timestamptz,
 last_seen_at timestamptz,observation_id text,offer_evidence jsonb
) language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select p.id,p.tenant_id,pub.id,p.title,p.image_url,p.category,p.marketplace,pub.slug,
  l.price_cents,l.original_price_cents,l.claimed_discount_rate,l.rating_star,
  l.sales_label,l.sales_count,l.observed_at,p.last_seen_at,l.id,l.offer_evidence
 from garimpa.product p
 join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id
 join lateral (
  select o.* from garimpa.price_observation o
  where o.product_id=p.id and o.tenant_id=p.tenant_id
  order by o.observed_at desc,o.id desc limit 1
 ) l on l.price_cents>0
 join lateral (
  select publication.id,publication.slug
  from garimpa.publication publication
  join garimpa.affiliate_account a
   on a.id=publication.affiliate_id and a.tenant_id=publication.tenant_id and a.status='active'
  where publication.product_id=p.id and publication.tenant_id=p.tenant_id
   and publication.channel='web' and publication.status='active'
  order by publication.published_at desc,publication.id limit 1
 ) pub on true
 where c.status='approved' and p.last_seen_at>=now()-interval '7 days'
  and (p_tenant is null or p.tenant_id=p_tenant)
  and (p_slug is null or p.id=(select requested.product_id from garimpa.publication requested where requested.slug=p_slug))
  and (p_slug is null or pub.slug=p_slug);
$$;

-- History is evaluated only for eligible candidates. Comparable observations
-- are reused for minimum, coverage and gaps; no wider curation queue is read.
create or replace function garimpa.public_offer_rows_scoped(p_tenant text,p_slug text)
returns table(
 id text,tenant_id text,publication_id text,title text,image_url text,category text,
 marketplace text,slug text,price_cents integer,original_price_cents integer,
 claimed_discount_rate double precision,rating_star double precision,
 sales_label text,sales_count integer,evidence_observed_at timestamptz,
 min_price_cents integer,previous_min_price_cents integer,observation_count integer,
 history_days integer,lowest_verified boolean
) language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select f.id,f.tenant_id,f.publication_id,f.title,f.image_url,f.category,f.marketplace,f.slug,
  f.price_cents,f.original_price_cents,f.claimed_discount_rate,f.rating_star,
  f.sales_label,f.sales_count,f.evidence_observed_at,
  history.previous_min_price_cents,history.previous_min_price_cents,
  history.observation_count,history.history_days,
  (coalesce((pol.config->>'e3Enabled')::boolean,false)
   and f.evidence_observed_at<=now()
   and now()<f.evidence_observed_at+coalesce((pol.config->>'maxAgeHours')::numeric,48)*interval '1 hour'
   and f.price_cents>0
   and history.comparable_count>=coalesce((pol.config->>'minimumPriorCount')::int,3)
   and history.distinct_days>=coalesce((pol.config->>'minimumDistinctDays')::int,3)
   and history.covered_buckets::numeric/greatest(1,ceil(cfg.window_days*24/cfg.bucket_hours))>=coalesce((pol.config->>'minimumCoverageRatio')::numeric,0.7)
   and history.max_gap<=coalesce((pol.config->>'maximumGapHours')::numeric,72)
   and history.previous_min_price_cents is not null
   and f.price_cents<=history.previous_min_price_cents)
 from garimpa.public_offer_candidates(p_tenant,p_slug) f
 left join lateral (
  select policy.config from garimpa.effective_price_evidence_policy policy
  where policy.tenant_id=f.tenant_id and policy.status='approved'
  order by policy.created_at desc,policy.id desc limit 1
 ) pol on true
 cross join lateral (
  select greatest(1,coalesce((pol.config->>'windowDays')::numeric,30)) as window_days,
   greatest(0.01,coalesce((pol.config->>'bucketHours')::numeric,24)) as bucket_hours,
   garimpa.offer_configuration_key(f.offer_evidence) as configuration_key
 ) cfg
 cross join lateral (
  with observations as materialized (
   select o.id,o.price_cents,o.observed_at,o.offer_evidence
   from garimpa.price_observation o where o.product_id=f.id and o.tenant_id=f.tenant_id
  ), comparable as materialized (
   select o.price_cents,o.observed_at from observations o
   where o.id<>f.observation_id and o.price_cents>0
    and o.observed_at<f.evidence_observed_at
    and o.observed_at>=f.evidence_observed_at-cfg.window_days*interval '1 day'
    and f.offer_evidence->>'currency' is not null
    and o.offer_evidence->>'currency'=f.offer_evidence->>'currency'
    and cfg.configuration_key is not null
    and garimpa.offer_configuration_key(o.offer_evidence)=cfg.configuration_key
  ), totals as (
   select count(*)::int as observation_count,
    floor(extract(epoch from(f.evidence_observed_at-min(observed_at)))/86400)::int as history_days
   from observations
  ), prior as (
   select min(price_cents) as previous_min_price_cents,count(*)::int as comparable_count,
    count(distinct (observed_at at time zone 'UTC')::date)::int as distinct_days,
    count(distinct floor(extract(epoch from(observed_at-(f.evidence_observed_at-cfg.window_days*interval '1 day')))/(cfg.bucket_hours*3600)))::int as covered_buckets
   from comparable
  ), gaps as (
   select max(extract(epoch from(next_time-observed_at))/3600) as max_gap from (
    select observed_at,lead(observed_at) over(order by observed_at) as next_time from (
     select f.evidence_observed_at-cfg.window_days*interval '1 day' as observed_at
     union all select f.evidence_observed_at
     union all select observed_at from comparable
    ) points
   ) ordered
  ) select * from totals cross join prior cross join gaps
 ) history;
$$;

revoke all on function garimpa.public_offer_candidates(text,text),
 garimpa.public_offer_rows_scoped(text,text)
 from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
CREATE OR REPLACE FUNCTION garimpa.public_offer_rows(p_tenant text DEFAULT NULL::text)
 RETURNS TABLE(id text, tenant_id text, publication_id text, title text, image_url text, category text, marketplace text, slug text, price_cents integer, original_price_cents integer, claimed_discount_rate double precision, rating_star double precision, sales_label text, sales_count integer, evidence_observed_at timestamp with time zone, min_price_cents integer, previous_min_price_cents integer, observation_count integer, history_days integer, lowest_verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'garimpa'
AS $function$
 select * from garimpa.public_offer_rows_scoped(p_tenant,null);
$function$;

CREATE OR REPLACE FUNCTION garimpa.public_deal_detail(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'garimpa'
AS $function$
 select jsonb_build_object('deal',to_jsonb(f)-'tenant_id'-'publication_id','price_history',coalesce((
   select jsonb_agg(jsonb_build_object('price_cents',o.price_cents,'observed_at',o.observed_at) order by o.observed_at,o.id)
   from garimpa.price_observation o
   where o.product_id=f.id and o.tenant_id=f.tenant_id and o.observed_at>=now()-interval '90 days' and o.price_cents>0
     and o.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=latest.offer_evidence->>'currency'
     and garimpa.offer_configuration_key(latest.offer_evidence) is not null
     and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(latest.offer_evidence)
 ),'[]'::jsonb))
 from garimpa.public_offer_rows_scoped(null,p_slug) f join lateral(select offer_evidence from garimpa.price_observation where product_id=f.id and tenant_id=f.tenant_id order by observed_at desc,id desc limit 1) latest on true
 where f.slug=p_slug limit 1;
$function$;

CREATE OR REPLACE FUNCTION garimpa.public_catalog_stats(p_tenant text, p_days integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'garimpa'
AS $function$
 with rows as (select f.* from garimpa.public_offer_candidates(p_tenant,null) f join garimpa.product p on p.id=f.id and p.tenant_id=f.tenant_id
  where p.last_seen_at>=now()-least(7,greatest(1,p_days))*interval '1 day'),
 categories as(select category,count(*)::int as count,sum(coalesce(sales_count,0))::bigint as "totalSales",sum(price_cents)::bigint as "sumPriceCents" from rows where category is not null group by category)
 select jsonb_build_object('categories',coalesce((select jsonb_agg(category order by category) from categories),'[]'::jsonb),
 'marketplaces',coalesce((select jsonb_object_agg(m,n) from (select marketplace m,count(*)::int n from rows group by marketplace) counts),'{}'::jsonb),
 'categoryStats',coalesce((select jsonb_agg(c) from categories c),'[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION garimpa.public_monetized_target(p_slug text)
 RETURNS TABLE(url text, publication_id text, tenant_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'garimpa'
AS $function$
declare f record; p record; c record; pair text; kept text[]:=array[]::text[]; base text; fragment text; query text; begin
 select * into f from garimpa.public_offer_candidates(null,p_slug) where slug=p_slug limit 1;
 if not found then return; end if;
 select pub.*,product.product_url into p from garimpa.publication pub join garimpa.product product on product.id=pub.product_id and product.tenant_id=pub.tenant_id where pub.id=f.publication_id;
 if f.marketplace in ('shopee','aliexpress') then
  if p.affiliate_url is null or p.affiliate_url !~ '^https://' then return; end if;
  return query select p.affiliate_url::text,f.publication_id::text,f.tenant_id::text; return;
 end if;
 if f.marketplace<>'mercadolivre' or p.product_url !~ '^https://([a-z0-9-]+[.])*mercadolivre[.]com[.]br/' then return; end if;
 select * into c from garimpa.affiliate_marketplace_config where affiliate_id=p.affiliate_id and marketplace=f.marketplace and status='active';
 if not found or c.tracking_id is null or c.tool_id is null or c.tracking_id='' or c.tool_id='' then return; end if;
 base:=split_part(split_part(p.product_url,'#',1),'?',1); fragment:=case when position('#' in p.product_url)>0 then '#'||split_part(p.product_url,'#',2) else '' end;
 query:=case when position('?' in split_part(p.product_url,'#',1))>0 then split_part(split_part(p.product_url,'#',1),'?',2) else '' end;
 foreach pair in array string_to_array(query,'&') loop if pair<>'' and split_part(pair,'=',1) not in ('matt_word','matt_tool','forceInApp') then kept:=array_append(kept,pair); end if; end loop;
 kept:=kept||array['matt_word='||garimpa.uri_component(c.tracking_id||'_'||p_slug),'matt_tool='||garimpa.uri_component(c.tool_id),'forceInApp=true'];
 return query select (base||'?'||array_to_string(kept,'&')||fragment)::text,f.publication_id::text,f.tenant_id::text;
end $function$;

CREATE OR REPLACE FUNCTION garimpa.public_short_link(p_code text, p_tenant text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'garimpa'
AS $function$
 select s.slug from garimpa.short_link s join lateral garimpa.public_offer_candidates(s.tenant_id,s.slug) f on f.slug=s.slug and f.tenant_id=s.tenant_id
 where s.code=p_code and (p_tenant is null or s.tenant_id=p_tenant) limit 1;
$function$;

CREATE OR REPLACE FUNCTION garimpa.public_campaign_link(p_code text, p_slug text DEFAULT NULL::text)
 RETURNS TABLE(code text, slug text, tenant_id text, link_id text, social_publication_id text, web_publication_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'garimpa'
AS $function$
 select cl.code,f.slug,f.tenant_id,cl.id,cp.id,f.publication_id
 from garimpa.campaign_link cl join garimpa.campaign_publication cp on cp.id=cl.publication_id and cp.tenant_id=cl.tenant_id
 join garimpa.commercial_kit k on k.id=cp.kit_id and k.tenant_id=cp.tenant_id
 join garimpa.opportunity o on o.id=k.opportunity_id and o.tenant_id=k.tenant_id
 join garimpa.publication web on web.id=cl.web_publication_id and web.tenant_id=cl.tenant_id
 join lateral garimpa.public_offer_candidates(cl.tenant_id,web.slug) f on f.id=o.product_id and f.tenant_id=cl.tenant_id and f.publication_id=cl.web_publication_id
 where cl.code=p_code and cl.monetization_status='valid' and cl.revoked_at is null
   and (p_slug is null or f.slug=p_slug);
$function$;

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

create or replace function garimpa.public_mint_short_link(p_slug text,p_tenant text,p_code text)
returns text language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare result text;
begin
 if p_code is null or p_code !~ '^[abcdefghjkmnpqrtuvwxyz2346789]{4}$' then return null; end if;
 select s.code into result from garimpa.short_link s where s.slug=p_slug and s.tenant_id=p_tenant;
 -- Existing links still revalidate publication, account, curation and freshness.
 if not exists(select 1 from garimpa.public_offer_candidates(p_tenant,p_slug)) then return null; end if;
 if result is not null then return result; end if;
 insert into garimpa.short_link(code,tenant_id,slug) values(p_code,p_tenant,p_slug) on conflict do nothing;
 select s.code into result from garimpa.short_link s where s.slug=p_slug and s.tenant_id=p_tenant;
 return result;
end;
$$;

create or replace function garimpa.public_mint_short_links(p_tenant text,p_slugs text[],p_codes text[])
returns table(slug text,code text)
language sql security definer set search_path=pg_catalog,garimpa as $$
 with requested as materialized (
  select distinct on(r.slug) r.slug,r.code
  from unnest(p_slugs,p_codes) r(slug,code)
  where r.slug is not null and r.code ~ '^[abcdefghjkmnpqrtuvwxyz2346789]{4}$'
  order by r.slug,r.code
 ), eligible as materialized (
  select r.slug,r.code as proposed_code from requested r
  join lateral garimpa.public_offer_candidates(p_tenant,r.slug) f on true
 ), existing as materialized (
  select s.slug,s.code from garimpa.short_link s
  join eligible e on e.slug=s.slug where s.tenant_id=p_tenant
 ), inserted as (
  insert into garimpa.short_link(code,tenant_id,slug)
  select e.proposed_code,p_tenant,e.slug from eligible e
  where not exists(select 1 from existing x where x.slug=e.slug)
  order by e.slug
  on conflict do nothing returning short_link.slug,short_link.code
 )
 select * from existing union all select * from inserted;
$$;

revoke all on function garimpa.public_mint_short_links(text,text[],text[]) from public,anon,authenticated,garimpa_app;
grant execute on function garimpa.public_mint_short_links(text,text[],text[]) to garimpa_public_runtime;

-- Replacements retain their existing owner and EXECUTE grants. The new
-- helpers remain internal and no private relation is granted to the runtime.
