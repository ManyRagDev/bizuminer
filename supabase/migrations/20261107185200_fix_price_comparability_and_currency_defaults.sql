-- Garimpa: Comparabilidade de histórico e moeda padrão (R$)
-- Permite que observações de preço do mesmo produto sejam comparáveis no histórico,
-- assumindo BRL (R$) como moeda padrão e evitando bloqueio de comparabilidade quando
-- variantes específicas não foram distinguidas pela API.

create or replace function garimpa.public_offer_candidates(p_tenant text, p_slug text)
 returns table(id text, tenant_id text, publication_id text, title text, image_url text, category text, marketplace text, slug text, price_cents integer, original_price_cents integer, claimed_discount_rate double precision, rating_star double precision, sales_label text, sales_count integer, evidence_observed_at timestamp with time zone, last_seen_at timestamp with time zone, observation_id text, offer_evidence jsonb)
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'garimpa'
as $function$
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
 where c.status='approved'
  and (
    (p_slug is null and p.last_seen_at >= now() - interval '7 days')
    or (p_slug is not null and p.last_seen_at >= now() - interval '60 days')
  )
  and (p_tenant is null or p.tenant_id=p_tenant)
  and (p_slug is null or p.id=(select requested.product_id from garimpa.publication requested where requested.slug=p_slug))
  and (p_slug is null or pub.slug=p_slug);
$function$;

create or replace function garimpa.public_offer_rows_scoped(p_tenant text, p_slug text)
 returns table(id text, tenant_id text, publication_id text, title text, image_url text, category text, marketplace text, slug text, price_cents integer, original_price_cents integer, claimed_discount_rate double precision, rating_star double precision, sales_label text, sales_count integer, evidence_observed_at timestamp with time zone, min_price_cents integer, previous_min_price_cents integer, observation_count integer, history_days integer, lowest_verified boolean)
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'garimpa'
as $function$
 select f.id,f.tenant_id,f.publication_id,f.title,f.image_url,f.category,f.marketplace,f.slug,
  f.price_cents,f.original_price_cents,f.claimed_discount_rate,f.rating_star,
  f.sales_label,f.sales_count,f.evidence_observed_at,
  history.previous_min_price_cents,history.previous_min_price_cents,
  history.observation_count,history.history_days,
  (coalesce((pol.config->>'e3Enabled')::boolean,true)
   and f.evidence_observed_at<=now()
   and now()<f.evidence_observed_at+coalesce((pol.config->>'maxAgeHours')::numeric,48)*interval '1 hour'
   and f.price_cents>0
   and history.comparable_count>=coalesce((pol.config->>'minimumPriorCount')::int,3)
   and history.distinct_days>=coalesce((pol.config->>'minimumDistinctDays')::int,3)
   and (pol.config is null or history.covered_buckets::numeric/greatest(1,ceil(cfg.window_days*24/cfg.bucket_hours))>=coalesce((pol.config->>'minimumCoverageRatio')::numeric,0.7))
   and (pol.config is null or history.max_gap<=coalesce((pol.config->>'maximumGapHours')::numeric,72))
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
    and coalesce(o.offer_evidence->>'currency','BRL')=coalesce(f.offer_evidence->>'currency','BRL')
    and (
      (cfg.configuration_key is not null and garimpa.offer_configuration_key(o.offer_evidence)=cfg.configuration_key)
      or (cfg.configuration_key is null and garimpa.offer_configuration_key(o.offer_evidence) is null
          and not (
            (o.offer_evidence ? 'priceMinCents' and o.offer_evidence ? 'priceMaxCents' and o.offer_evidence->'priceMinCents' <> o.offer_evidence->'priceMaxCents')
            or (f.offer_evidence ? 'priceMinCents' and f.offer_evidence ? 'priceMaxCents' and f.offer_evidence->'priceMinCents' <> f.offer_evidence->'priceMaxCents')
          ))
    )
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
$function$;

create or replace function garimpa.public_deal_detail(p_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'garimpa'
as $function$
  with offer as materialized (
    select * from garimpa.public_offer_rows_scoped(null,p_slug) where slug=p_slug limit 1
  ), latest as (
    select o.offer_evidence, garimpa.offer_configuration_key(o.offer_evidence) configuration_key
    from offer f join lateral (
      select offer_evidence from garimpa.price_observation where tenant_id=f.tenant_id and product_id=f.id
      order by observed_at desc,id desc limit 1
    ) o on true
  ), window_points as materialized (
    select o.id,o.price_cents,o.observed_at,
      coalesce(o.price_cents>0
        and coalesce(o.offer_evidence->>'currency','BRL') = coalesce(l.offer_evidence->>'currency','BRL')
        and (
          (l.configuration_key is not null and garimpa.offer_configuration_key(o.offer_evidence) = l.configuration_key)
          or (l.configuration_key is null and garimpa.offer_configuration_key(o.offer_evidence) is null
              and not (
                (o.offer_evidence ? 'priceMinCents' and o.offer_evidence ? 'priceMaxCents' and o.offer_evidence->'priceMinCents' <> o.offer_evidence->'priceMaxCents')
                or (l.offer_evidence ? 'priceMinCents' and l.offer_evidence ? 'priceMaxCents' and l.offer_evidence->'priceMinCents' <> l.offer_evidence->'priceMaxCents')
              ))
        ),false) comparable
    from offer f join garimpa.price_observation o on o.product_id=f.id and o.tenant_id=f.tenant_id
    cross join latest l where o.observed_at>=now()-interval '90 days' and o.observed_at<=now()
  )
  select jsonb_build_object(
    'deal',(to_jsonb(f)-'tenant_id'-'publication_id') || coalesce(p.presentation,'{}'::jsonb),
    'price_history',coalesce((select jsonb_agg(jsonb_build_object('price_cents',price_cents,'observed_at',observed_at)
      order by observed_at,id) from window_points where comparable),'[]'::jsonb),
    'history_context',jsonb_build_object('windowDays',90,'totalCount',f.observation_count,
      'olderCount',(select count(*) from garimpa.price_observation o where o.tenant_id=f.tenant_id and o.product_id=f.id and o.observed_at<now()-interval '90 days'),
      'windowCount',(select count(*) from window_points),'comparableCount',(select count(*) from window_points where comparable),
      'excludedCount',(select count(*) from window_points where not comparable),
      'currency',coalesce(l.offer_evidence->>'currency','BRL'),
      'comparison',case
        when (l.offer_evidence ? 'priceMinCents' and l.offer_evidence ? 'priceMaxCents'
            and l.offer_evidence->'priceMinCents'<>l.offer_evidence->'priceMaxCents') then 'non_exact'
        else 'comparable' end))
  from offer f cross join latest l
  left join lateral garimpa.public_product_presentations(f.tenant_id,array[f.id]) p on p.product_id=f.id;
$function$;
