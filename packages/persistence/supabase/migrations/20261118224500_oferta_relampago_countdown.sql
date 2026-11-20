-- Track 024: Captura de Oferta Relâmpago (Countdown Mercado Livre), Exibição na Vitrine/Anúncio e Validade na Pauta
begin;
set local lock_timeout = '5s';

-- 1. Projeção pública com promotionType e promotionEndsAt
create or replace function garimpa.product_presentation_offer_rows(p_tenant text,p_product_ids text[])
returns table(product_id text,presentation jsonb) language sql stable security invoker set search_path = pg_catalog, garimpa as $$
  with editorial as materialized (select * from garimpa.product_presentation_rows(p_tenant,p_product_ids))
  select p.id,jsonb_build_object('sourceTitle',p.title,'displayTitle',p.title,'titleOrigin','source')
    || coalesce(editorial.presentation,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'priceType',case when latest.offer_evidence->>'priceType' in ('exact','from','range','unknown') then latest.offer_evidence->>'priceType' end,
      'currency',case when latest.offer_evidence->>'currency' ~ '^[A-Z]{3}$' then latest.offer_evidence->>'currency' end,
      'originalPriceKind',case when latest.offer_evidence->>'originalPriceKind' in ('source_claimed','derived_from_claim','unknown') then latest.offer_evidence->>'originalPriceKind' end,
      'priceMinCents',case when jsonb_typeof(latest.offer_evidence->'priceMinCents')='number' then latest.offer_evidence->'priceMinCents' end,
      'priceMaxCents',case when jsonb_typeof(latest.offer_evidence->'priceMaxCents')='number' then latest.offer_evidence->'priceMaxCents' end,
      'promotionType',case when latest.offer_evidence->>'promotionType'='lightning' then 'lightning' end,
      'promotionEndsAt',case when latest.offer_evidence->>'promotionEndsAt' is not null then latest.offer_evidence->>'promotionEndsAt' end))
  from garimpa.product p
  left join editorial on editorial.product_id=p.id
  left join lateral(select o.offer_evidence from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
    order by o.observed_at desc,o.id desc limit 1) latest on true
  where p.id=any(p_product_ids) and (p_tenant is null or p.tenant_id=p_tenant)
    and exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='approved')
    and exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id
      where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.channel='web' and pub.status='active' and account.status='active');
$$;

-- 2. Limite de validade factual respeitando a expiração da Oferta Relâmpago
create or replace function garimpa.current_offer_valid_until(p_tenant text,p_product text,p_observation text)
returns timestamptz language sql stable security invoker set search_path=pg_catalog,garimpa as $$
 select least(
   v.verified_at + make_interval(secs=>3600 * (case when p.marketplace='shopee' then
       case when jsonb_typeof(policy.config->'shopeeHours')='number' then
         case when (policy.config->>'shopeeHours')::numeric > 0 and (policy.config->>'shopeeHours')::numeric <= 1
           then (policy.config->>'shopeeHours')::numeric else 1 end else 1 end
     else case when jsonb_typeof(policy.config->'domStayHours')='number' then
         case when (policy.config->>'domStayHours')::numeric between 1 and 48 then (policy.config->>'domStayHours')::numeric else 24 end
         else 24 end end)::double precision),
   case when o.offer_evidence->>'promotionEndsAt' is not null and (o.offer_evidence->>'promotionEndsAt')::timestamptz > o.observed_at
     then (o.offer_evidence->>'promotionEndsAt')::timestamptz else null end
 )
 from garimpa.product p join garimpa.price_observation o on o.tenant_id=p.tenant_id and o.product_id=p.id and o.id=p_observation
 left join garimpa.curation_policy_v2 policy on policy.tenant_id=p.tenant_id and (policy.enabled or policy.factual_gate_required)
 join garimpa.offer_verification v on v.tenant_id=o.tenant_id and v.product_id=o.product_id and v.option_key=o.option_key
   and v.price_type=o.offer_evidence->>'priceType' and v.observation_id=o.id
 where p.tenant_id=p_tenant and p.id=p_product and o.price_cents>0 and o.offer_evidence->>'currency'='BRL'
   and o.offer_evidence->>'priceType' in ('exact','range','from') and v.availability<>'unavailable'
   and o.observed_at<=now() and v.verified_at<=now()
   and (p.marketplace='shopee' and o.offer_evidence#>>'{source,method}'='official_api' and o.offer_evidence->>'observationMethod'='id_lookup'
     or p.marketplace in ('mercadolivre','amazon','aliexpress') and o.offer_evidence#>>'{source,method}'='browser'
       and o.offer_evidence->>'observationMethod' in ('listing','product_page'))
   and not exists(select 1 from garimpa.offer_availability_observation unavailable
     where unavailable.tenant_id=p.tenant_id and unavailable.product_id=p.id
       and (unavailable.option_key=o.option_key or unavailable.option_key='listing')
       and unavailable.status='unavailable_confirmed' and unavailable.observed_at>=v.verified_at)
   and o.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=o.tenant_id and latest.product_id=o.product_id
     and latest.option_key=o.option_key and latest.offer_evidence->>'priceType'=o.offer_evidence->>'priceType'
     order by latest.observed_at desc,latest.id desc limit 1)
   and not exists(select 1 from garimpa.price_observation newer where newer.tenant_id=o.tenant_id and newer.product_id=o.product_id
     and newer.option_key=o.option_key and newer.observed_at>o.observed_at
     and newer.offer_evidence->>'priceType' is distinct from o.offer_evidence->>'priceType')
 limit 1
$$;

-- 3. Deadline público da página de produto
create or replace function garimpa.public_offer_deadline(p_slug text) returns timestamptz
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select least(
   case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=offer.tenant_id
       and (policy.enabled or policy.factual_gate_required))
     then least(offer.evidence_observed_at+interval '48 hours',offer.last_seen_at+interval '7 days',
       garimpa.current_offer_valid_until(offer.tenant_id,offer.id,offer.observation_id))
     else least(offer.evidence_observed_at+interval '48 hours',offer.last_seen_at+interval '7 days') end,
   case when offer.offer_evidence->>'promotionEndsAt' is not null and (offer.offer_evidence->>'promotionEndsAt')::timestamptz > offer.evidence_observed_at
     then (offer.offer_evidence->>'promotionEndsAt')::timestamptz else null end
 )
 from garimpa.public_offer_candidates(null,p_slug) offer limit 1
$$;

grant execute on function garimpa.product_presentation_offer_rows(text,text[]) to garimpa_app;
grant execute on function garimpa.current_offer_valid_until(text,text,text) to garimpa_app;
grant execute on function garimpa.public_offer_deadline(text) to garimpa_public_runtime;

commit;
