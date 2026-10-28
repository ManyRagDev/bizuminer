-- The detail response explains why raw observations may not form a comparable chart.
-- Preserve the same public eligibility and canonical configuration boundary.
create or replace function garimpa.public_deal_detail(p_slug text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, garimpa
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
      coalesce(o.price_cents>0 and nullif(l.offer_evidence->>'currency','') is not null
        and o.offer_evidence->>'currency'=l.offer_evidence->>'currency'
        and l.configuration_key is not null
        and garimpa.offer_configuration_key(o.offer_evidence)=l.configuration_key,false) comparable
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
      'currency',l.offer_evidence->>'currency',
      'comparison',case
        when coalesce(l.offer_evidence->>'priceType','exact')<>'exact'
          or (l.offer_evidence ? 'priceMinCents' and l.offer_evidence ? 'priceMaxCents'
            and l.offer_evidence->'priceMinCents'<>l.offer_evidence->'priceMaxCents') then 'non_exact'
        when nullif(l.offer_evidence->>'currency','') is null then 'currency_unknown'
        when l.configuration_key is null then 'configuration_unknown' else 'comparable' end))
  from offer f cross join latest l
  left join lateral garimpa.public_product_presentations(f.tenant_id,array[f.id]) p on p.product_id=f.id;
$function$;
revoke all on function garimpa.public_deal_detail(text) from public,anon,authenticated;
grant execute on function garimpa.public_deal_detail(text) to garimpa_public_runtime;
