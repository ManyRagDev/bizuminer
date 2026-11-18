begin;
set local lock_timeout='5s';

-- Internal factual gate, shared by public projections. Invoker access only;
-- public readers invoke it through the existing restricted projection owner.
create function garimpa.current_offer_valid_until(p_tenant text,p_product text,p_observation text)
returns timestamptz language sql stable security invoker set search_path=pg_catalog,garimpa as $$
 select v.verified_at + make_interval(secs=>3600 * (case when p.marketplace='shopee' then
     case when jsonb_typeof(policy.config->'shopeeHours')='number' then
       case when (policy.config->>'shopeeHours')::numeric > 0 and (policy.config->>'shopeeHours')::numeric <= 1
         then (policy.config->>'shopeeHours')::numeric else 1 end else 1 end
   else case when jsonb_typeof(policy.config->'domStayHours')='number' then
       case when (policy.config->>'domStayHours')::numeric between 1 and 48 then (policy.config->>'domStayHours')::numeric else 24 end
       else 24 end end)::double precision)
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
revoke all on function garimpa.current_offer_valid_until(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.current_offer_valid_until(text,text,text) to garimpa_app;

-- Fields used by editorialEvidenceFingerprint; preserve the distinction
-- between a missing field and a field explicitly reported as null.
create function garimpa.curation_material_evidence(p_evidence jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select coalesce((select jsonb_object_agg(item.key,item.value) from jsonb_each(
   case when jsonb_typeof(p_evidence)='object' then p_evidence else '{}'::jsonb end) item
   where item.key=any(array['description','variantKey','variantLabel','variantIdentity','packageContents','packageQuantity',
     'dimensions','positiveReviewRate','currency','priceType','fieldStates','payment','coupon','region','sellerId','shipping','conditions'])), '{}'::jsonb)
   || jsonb_build_object('__range',case when jsonb_typeof(p_evidence->'priceMinCents')='number'
     and jsonb_typeof(p_evidence->'priceMaxCents')='number'
     then p_evidence->'priceMinCents'<>p_evidence->'priceMaxCents' else false end)
$$;
revoke all on function garimpa.curation_material_evidence(jsonb) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.curation_material_evidence(jsonb) to garimpa_app;

create function garimpa.has_current_curation_assessment(p_tenant text,p_product text,p_observation text)
returns boolean language sql stable security invoker set search_path=pg_catalog,garimpa as $$
 select exists(select 1 from garimpa.curation_score_projection score
   join garimpa.curation_attribute_assessment a on a.tenant_id=score.tenant_id and a.product_id=score.product_id and a.id=score.assessment_id
   join garimpa.product p on p.tenant_id=score.tenant_id and p.id=score.product_id
   join garimpa.price_observation current_fact on current_fact.tenant_id=score.tenant_id and current_fact.product_id=score.product_id and current_fact.id=score.observation_id
   join garimpa.price_observation assessed_fact on assessed_fact.tenant_id=a.tenant_id and assessed_fact.product_id=a.product_id and assessed_fact.id=a.observation_id
   where score.tenant_id=p_tenant and score.product_id=p_product and score.observation_id=p_observation
     -- Keep these versions aligned with the attribute contract in the app.
     and a.policy_version='attributes-policy-v2' and a.prompt_version='attributes-prompt-v2.4'
     and jsonb_typeof(a.input_snapshot->'materialSnapshot')='object'
     and (a.input_snapshot->'materialSnapshot') ?& array['title','imageUrl','category','productUrl']
     and a.input_snapshot#>>'{materialSnapshot,title}'=p.title
     and a.input_snapshot#>>'{materialSnapshot,imageUrl}' is not distinct from p.image_url
     and a.input_snapshot#>>'{materialSnapshot,category}' is not distinct from p.category
     and a.input_snapshot#>>'{materialSnapshot,productUrl}'=p.product_url
     and current_fact.option_key=assessed_fact.option_key and a.price_cents>0
     and abs(current_fact.price_cents-a.price_cents)::numeric/a.price_cents<0.1
     and garimpa.curation_material_evidence(current_fact.offer_evidence)=garimpa.curation_material_evidence(assessed_fact.offer_evidence)
     and nullif(greatest(current_fact.rating_star,0),0) is not distinct from nullif(greatest(assessed_fact.rating_star,0),0)
     and a.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
       where event.tenant_id=p_tenant and event.product_id=p_product order by event.id desc limit 1)
     and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence']))
$$;
revoke all on function garimpa.has_current_curation_assessment(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.has_current_curation_assessment(text,text,text) to garimpa_app;

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
  and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p.tenant_id and policy.factual_gate_required)
    or now()<garimpa.current_offer_valid_until(p.tenant_id,p.id,l.id))
  and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p.tenant_id and policy.enabled)
    or (now()<garimpa.current_offer_valid_until(p.tenant_id,p.id,l.id) and garimpa.has_current_curation_assessment(p.tenant_id,p.id,l.id)))
  and (
    (p_slug is null and p.last_seen_at >= now() - interval '7 days')
    or (p_slug is not null and p.last_seen_at >= now() - interval '60 days')
  )
  and (p_tenant is null or p.tenant_id=p_tenant)
  and (p_slug is null or p.id=(select requested.product_id from garimpa.publication requested where requested.slug=p_slug))
  and (p_slug is null or pub.slug=p_slug);
$function$;


create or replace function garimpa.read_recommendation_edition(p_tenant text,p_channel text) returns jsonb
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with edition as materialized(
  select e.*,c.policy as channel_policy,c.enabled and c.policy_version='recommendation-v1' and e.policy_version=c.policy_version
   and e.config_version=c.version and (c.valid_until is null or c.valid_until>now()) as source_valid
  from garimpa.recommendation_channel c left join garimpa.recommendation_edition e using(tenant_id,channel)
  where c.tenant_id=p_tenant and c.channel=p_channel
 ), eligible as materialized(
  select product.value||jsonb_build_object('offerValidUntil', case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
    then least((guard.value->>'validUntil')::timestamptz,garimpa.current_offer_valid_until(p_tenant,p.id,latest.id)) else (guard.value->>'validUntil')::timestamptz end) as value,
    product.ordinality,guard.value||jsonb_build_object('validUntil',case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
    then least((guard.value->>'validUntil')::timestamptz,garimpa.current_offer_valid_until(p_tenant,p.id,latest.id)) else (guard.value->>'validUntil')::timestamptz end) as input
  from edition h cross join lateral jsonb_array_elements(h.selection->'products') with ordinality product(value,ordinality)
  join lateral jsonb_array_elements(h.inputs) guard(value) on guard.value->>'productId'=product.value->>'id'
  join garimpa.product p on p.id=product.value->>'id' and p.tenant_id=p_tenant
  join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id and c.status='approved'
  join lateral(select o.id,o.observed_at from garimpa.price_observation o
   where o.product_id=p.id and o.tenant_id=p_tenant
    and (guard.value->>'optionKey' is null or o.option_key=guard.value->>'optionKey')
   order by o.observed_at desc,o.id desc limit 1) latest
   on latest.id=guard.value->>'observationId' and latest.observed_at>now()-interval '48 hours' and latest.observed_at<=now()+interval '1 minute'
  left join lateral(select a.id from garimpa.editorial_assessment a where a.tenant_id=p_tenant and a.product_id=p.id
   and coalesce(a.assessment->>'schemaVersion','1')<>'2' order by a.created_at desc,a.id desc limit 1) assessment on true
  left join lateral(select x.* from garimpa.recommendation_exposure x where x.tenant_id=p_tenant
    and x.channel=p_channel and x.product_id=p.id order by x.confirmed_at desc,x.id desc limit 1) exposure on true
  where h.source_valid and assessment.id is not distinct from guard.value->>'assessmentId'
   and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and policy.enabled)
     or (guard.value ? 'sourceRevision' and garimpa.has_current_curation_assessment(p_tenant,p.id,latest.id)))
   and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
     or now()<garimpa.current_offer_valid_until(p_tenant,p.id,latest.id))
   and (not (guard.value ? 'sourceRevision') or not exists(select 1 from garimpa.curation_policy_v2 policy
       where policy.tenant_id=p_tenant and policy.enabled) or exists(
     select 1 from garimpa.curation_policy_v2 policy
     join garimpa.curation_score_projection score on score.tenant_id=policy.tenant_id and score.product_id=p.id
       and score.observation_id=latest.id and score.source_revision=guard.value->>'sourceRevision'
       and score.policy_version=guard.value->>'scoreVersion'
     join garimpa.curation_attribute_assessment attribute on attribute.tenant_id=score.tenant_id
       and attribute.product_id=score.product_id and attribute.id=score.assessment_id
     where policy.tenant_id=p_tenant and policy.enabled and policy.version::text=guard.value->>'curationPolicyVersion'
       and attribute.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
         where event.tenant_id=p_tenant and event.product_id=p.id order by event.id desc limit 1)
       and not (coalesce(attribute.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration'])
   ))
   and (exposure.id is null or exposure.confirmed_at<=now()-make_interval(hours=>coalesce((h.channel_policy->>'repeatHours')::integer,0))
    or (exposure.option_key=guard.value->>'optionKey' and latest.observed_at>exposure.confirmed_at
      and (product.value->>'priceCents')::numeric<=exposure.price_cents*(1-coalesce((h.channel_policy->>'improvementPercent')::numeric,5)/100)))
   and p.last_seen_at>now()-interval '7 days' and p.last_seen_at<=now()+interval '1 minute'
   and p.title=product.value->>'title' and p.image_url is not distinct from product.value->>'imageUrl'
   and p.category is not distinct from product.value->>'category' and p.product_url=guard.value->>'productUrl'
   and now()<(guard.value->>'validUntil')::timestamptz
   and (guard.value->>'optionKey' is null or exists(select 1 from garimpa.editorial_offer_choice choice
    where choice.tenant_id=p_tenant and choice.product_id=p.id and choice.option_key=guard.value->>'optionKey'))
   and not exists(select 1 from garimpa.price_observation original join garimpa.price_observation newer
    on newer.tenant_id=original.tenant_id and newer.product_id=original.product_id and newer.observed_at>original.observed_at
    and newer.option_key<>original.option_key and newer.offer_evidence->>'priceType'='exact'
    and coalesce(newer.offer_evidence->'variantIdentity'->>'key',newer.offer_evidence->>'variantKey')=
      coalesce(original.offer_evidence->'variantIdentity'->>'key',original.offer_evidence->>'variantKey')
    where original.id=guard.value->>'observationId' and original.tenant_id=p_tenant and guard.value->>'optionKey' is not null)
   and product.value->>'slug'=(select pub.slug from garimpa.publication pub join garimpa.affiliate_account a
    on a.id=pub.affiliate_id and a.tenant_id=pub.tenant_id and a.status='active'
    where pub.tenant_id=p_tenant and pub.product_id=p.id and pub.channel='web' and pub.status='active'
     order by pub.published_at desc,pub.id limit 1)
   and not exists(select 1 from jsonb_array_elements(h.dependencies) d where d->>'ownerProductId'=p.id and not exists(
    select 1 from garimpa.product alt join garimpa.product_curation ac on ac.product_id=alt.id and ac.tenant_id=alt.tenant_id and ac.status='approved'
    join lateral(select id from garimpa.price_observation o where o.tenant_id=p_tenant and o.product_id=alt.id order by observed_at desc,id desc limit 1) obs
     on obs.id=d->>'observationId'
    where alt.id=d->>'productId' and alt.tenant_id=p_tenant and alt.title=d->>'title' and alt.product_url=d->>'productUrl'
      and alt.image_url is not distinct from d->>'imageUrl' and alt.last_seen_at>now()-interval '7 days'
   ))
 )
 select coalesce(h.selection,'{}'::jsonb)||jsonb_build_object('schemaReady',true,'homepageReady',true,'mode','editorial',
  'id',h.id,'homepageEditionId',h.id,'version',h.version,'destination',p_channel,'renewedAt',h.renewed_at,
  'validUntil',(select min((input->>'validUntil')::timestamptz) from eligible),
  'heroValidUntil',(select min((input->>'validUntil')::timestamptz) from eligible),
  'heroProductIds',coalesce((select jsonb_agg(value->'id' order by ordinality) from eligible where h.selection->'heroProductIds' ? (value->>'id')),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(value order by ordinality) from eligible),'[]'::jsonb)) from edition h
 where p_channel in ('home','whatsapp','stories')
$$;

create or replace function garimpa.public_confirmed_offer(p_slug text,p_option text) returns jsonb
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with current_offer as materialized(
 select p.*,pub.slug,o.id as observation_id,o.price_cents,o.observed_at,o.offer_evidence,o.option_key,
  o.rating_star,o.sales_label,o.sales_count,
  garimpa.offer_configuration_key(o.offer_evidence) as configuration_key
 from garimpa.publication pub join garimpa.affiliate_account a on a.id=pub.affiliate_id and a.tenant_id=pub.tenant_id and a.status='active'
 join garimpa.product p on p.id=pub.product_id and p.tenant_id=pub.tenant_id
 join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='approved'
 join lateral(select * from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
  and o.option_key=p_option order by observed_at desc,id desc limit 1) o on true
 where pub.slug=p_slug and pub.channel='web' and pub.status='active'
  and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p.tenant_id and policy.factual_gate_required)
    or now()<garimpa.current_offer_valid_until(p.tenant_id,p.id,o.id))
  and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p.tenant_id and policy.enabled)
    or (now()<garimpa.current_offer_valid_until(p.tenant_id,p.id,o.id) and garimpa.has_current_curation_assessment(p.tenant_id,p.id,o.id))) and p_option ~ '^[a-f0-9]{32}$'
  and o.observed_at>now()-interval '48 hours' and o.observed_at<=now()+interval '1 minute'
  and p.last_seen_at>now()-interval '7 days' and o.offer_evidence->>'priceType'='exact' and o.offer_evidence->>'currency'='BRL'
  and coalesce(o.offer_evidence->>'variantLabel','')<>''
  and garimpa.offer_configuration_key(o.offer_evidence) is not null
  and p.title=o.title_snapshot and p.product_url=o.product_url_snapshot and p.image_url is not distinct from o.image_url_snapshot
  and not exists(select 1 from garimpa.price_observation newer where newer.tenant_id=p.tenant_id and newer.product_id=p.id
   and newer.observed_at>o.observed_at and newer.option_key<>o.option_key and newer.offer_evidence->>'priceType'='exact'
   and coalesce(newer.offer_evidence->'variantIdentity'->>'key',newer.offer_evidence->>'variantKey')=
     coalesce(o.offer_evidence->'variantIdentity'->>'key',o.offer_evidence->>'variantKey'))
 order by pub.published_at desc,pub.id limit 1
 ), history as materialized(
 select o.price_cents,o.observed_at from current_offer c join garimpa.price_observation o on o.tenant_id=c.tenant_id and o.product_id=c.id
 where o.observed_at>=now()-interval '90 days' and o.observed_at<=now() and o.price_cents>0
  and c.configuration_key is not null and garimpa.offer_configuration_key(o.offer_evidence)=c.configuration_key
  and o.offer_evidence->>'currency'=c.offer_evidence->>'currency'
 order by o.observed_at desc limit 1000
 )
 select jsonb_build_object('product',jsonb_build_object('id',c.id,'slug',c.slug,'title',c.title,
  'displayTitle',c.title||' — '||(c.offer_evidence->>'variantLabel'),'sourceTitle',c.title,
  'benefit',review.assessment->>'benefit','audience',review.assessment->>'audience','marketplace',c.marketplace,'category',c.category,
  'imageUrl',c.image_url,'priceCents',c.price_cents,'originalPriceCents',null,'previousMinPriceCents',null,'discountPercent',null,
  'priceType','exact','currency','BRL','ratingStar',c.rating_star,'salesLabel',c.sales_label,'salesCount',c.sales_count,
  'offerOptionKey',c.option_key,'offerOptionLabel',c.offer_evidence->>'variantLabel',
  'purchaseContents',(c.offer_evidence->>'packageQuantity')||' un. · '||array_to_string(array(select jsonb_array_elements_text(c.offer_evidence->'packageContents')),'; '),
  'offerConditions',concat_ws('; ','Pagamento: '||(c.offer_evidence->'conditions'->>'payment'),'Cupom: '||(c.offer_evidence->'conditions'->>'coupon'),
    'Região: '||(c.offer_evidence->'conditions'->>'region'),'Frete: '||(c.offer_evidence->'conditions'->>'shipping')),
  'evidenceObservedAt',c.observed_at,'observationCount',(select count(*) from history),
  'historyDays',coalesce((select floor(extract(epoch from(max(observed_at)-min(observed_at)))/86400) from history),0),
  'lowestVerified',false,'offerValidUntil',case when exists(select 1 from garimpa.curation_policy_v2 policy
    where policy.tenant_id=c.tenant_id and (policy.enabled or policy.factual_gate_required))
    then least(c.observed_at+interval '48 hours',garimpa.current_offer_valid_until(c.tenant_id,c.id,c.observation_id))
    else c.observed_at+interval '48 hours' end),
  'priceHistory',coalesce((select jsonb_agg(jsonb_build_object('price_cents',price_cents,'observed_at',observed_at) order by observed_at) from history),'[]'::jsonb),
  'historyContext',jsonb_build_object('windowDays',90,'totalCount',(select count(*) from garimpa.price_observation o where o.tenant_id=c.tenant_id and o.product_id=c.id),
   'windowCount',(select count(*) from garimpa.price_observation o where o.tenant_id=c.tenant_id and o.product_id=c.id and o.observed_at>=now()-interval '90 days' and o.observed_at<=now()),
   'comparableCount',(select count(*) from history),
   'excludedCount',(select count(*) from garimpa.price_observation o where o.tenant_id=c.tenant_id and o.product_id=c.id and o.observed_at>=now()-interval '90 days' and o.observed_at<=now())-(select count(*) from history),
   'olderCount',(select count(*) from garimpa.price_observation o where o.tenant_id=c.tenant_id and o.product_id=c.id and o.observed_at<now()-interval '90 days'),'currency','BRL',
   'comparison',case when c.configuration_key is null then 'configuration_unknown' else 'comparable' end))
 from current_offer c
 left join lateral(select * from (select a.* from garimpa.editorial_assessment a
   where a.tenant_id=c.tenant_id and a.product_id=c.id and coalesce(a.assessment->>'schemaVersion','1')<>'2'
   order by a.created_at desc,a.id desc limit 1) latest
   where latest.policy_version='achadinhos-v1' and garimpa.observation_option_key(latest.snapshot->'offer_evidence')=c.option_key
    and latest.snapshot->>'title'=c.title and latest.snapshot->>'image_url' is not distinct from c.image_url
    and case when jsonb_typeof(latest.assessment->'maxPriceCents')='number' then (latest.assessment->>'maxPriceCents')::numeric end>=c.price_cents
    and latest.assessment->'presentation'->>'status' is distinct from 'withdrawn'
    and latest.assessment->'criticalDoubts'='[]'::jsonb) review on true
$$;

create or replace function garimpa.read_homepage_edition(p_tenant text,p_destination text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with edition as materialized (
  select h.*, exists(select 1 from garimpa.editorial_selection s where s.tenant_id=p_tenant) as supervised,
   case when h.source_selection_id is null then
    not exists(select 1 from garimpa.editorial_selection s where s.tenant_id=p_tenant)
   else exists(select 1 from garimpa.editorial_selection s where s.tenant_id=p_tenant
    and s.id=h.source_selection_id and s.status='active' and s.valid_until>now()) end as source_valid
  from garimpa.homepage_edition h where h.tenant_id=p_tenant
 ), eligible as materialized (
  select product.value||jsonb_build_object('offerValidUntil',case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
    then least((guard.value->>'validUntil')::timestamptz,garimpa.current_offer_valid_until(p_tenant,p.id,latest.id)) else (guard.value->>'validUntil')::timestamptz end) as value,
    product.ordinality,guard.value||jsonb_build_object('validUntil',case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
    then least((guard.value->>'validUntil')::timestamptz,garimpa.current_offer_valid_until(p_tenant,p.id,latest.id)) else (guard.value->>'validUntil')::timestamptz end) as input
  from edition h cross join lateral jsonb_array_elements(h.selection->'products') with ordinality product(value,ordinality)
  join lateral jsonb_array_elements(h.inputs) guard(value) on guard.value->>'productId'=product.value->>'id'
  join garimpa.product p on p.id=product.value->>'id' and p.tenant_id=p_tenant
  join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id and c.status='approved'
  join lateral(select o.id,o.observed_at from garimpa.price_observation o
   where o.product_id=p.id and o.tenant_id=p_tenant order by o.observed_at desc,o.id desc limit 1) latest
   on latest.id=guard.value->>'observationId' and latest.observed_at>now()-interval '48 hours' and latest.observed_at<=now()+interval '1 minute'
  left join lateral(select a.id from garimpa.editorial_assessment a where a.tenant_id=p_tenant and a.product_id=p.id
   and coalesce(a.assessment->>'schemaVersion','1')<>'2' order by a.created_at desc,a.id desc limit 1) assessment
   on true
  where h.source_valid and assessment.id is not distinct from guard.value->>'assessmentId'
   and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and policy.enabled)
     or garimpa.has_current_curation_assessment(p_tenant,p.id,latest.id))
   and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
     or now()<garimpa.current_offer_valid_until(p_tenant,p.id,latest.id))
   and p.last_seen_at>now()-interval '7 days' and p.last_seen_at<=now()+interval '1 minute'
   and p.title=product.value->>'title' and p.image_url is not distinct from product.value->>'imageUrl'
   and p.category is not distinct from product.value->>'category' and p.product_url=guard.value->>'productUrl'
   and now()<(guard.value->>'validUntil')::timestamptz
   and product.value->>'slug'=(select pub.slug from garimpa.publication pub join garimpa.affiliate_account a
    on a.id=pub.affiliate_id and a.tenant_id=pub.tenant_id and a.status='active'
    where pub.tenant_id=p_tenant and pub.product_id=p.id and pub.channel='web' and pub.status='active'
     order by pub.published_at desc,pub.id limit 1)
   and not exists(select 1 from jsonb_array_elements(h.dependencies) d
    where d->>'ownerProductId'=p.id and not exists(
     select 1 from garimpa.product alt join garimpa.product_curation ac on ac.tenant_id=alt.tenant_id and ac.product_id=alt.id and ac.status='approved'
     join lateral(select o.id from garimpa.price_observation o where o.product_id=alt.id and o.tenant_id=p_tenant order by o.observed_at desc,o.id desc limit 1) obs on obs.id=d->>'observationId'
     where alt.tenant_id=p_tenant and alt.id=d->>'productId' and alt.last_seen_at>now()-interval '7 days'
      and alt.title=d->>'title' and alt.product_url=d->>'productUrl' and alt.image_url is not distinct from d->>'imageUrl'
    ))
 ), visible as (
  select * from eligible where p_destination='all' or input->'destinations' ? p_destination
 ), presentations as materialized (
  select * from garimpa.public_product_presentations(p_tenant,(select array_agg(value->>'id') from visible))
 ), heroes as (
  select jsonb_agg(id.value order by id.ordinality) as ids from edition h,
   jsonb_array_elements(h.selection->'heroProductIds') with ordinality id(value,ordinality)
  where exists(select 1 from eligible e where e.value->>'id'=id.value#>>'{}')
 )
 select (h.selection-'products'-'heroProductIds') || jsonb_build_object(
  'homepageEditionId',h.id,'mode',case when h.supervised then 'editorial' else 'catalog' end,
  'validUntil',(select min((input->>'validUntil')::timestamptz) from visible),
  'heroValidUntil',(select min((e.input->>'validUntil')::timestamptz) from eligible e
    where h.selection->'heroProductIds' ? (e.value->>'id')),
  'products',coalesce((select jsonb_agg((v.value-array['displayTitle','sourceTitle','titleOrigin','editorialRevisionId','editorialReviewedAt','benefit','audience','caveat','purchaseContents','coverHeadline','coverImageApproved','priceType','priceMinCents','priceMaxCents','currency','originalPriceKind']::text[]) || coalesce(p.presentation,'{}'::jsonb) order by v.ordinality) from visible v left join presentations p on p.product_id=v.value->>'id'),'[]'::jsonb),
  'heroProductIds',coalesce((select ids from heroes),'[]'::jsonb))
 from edition h where p_destination in ('home','pauta','all');
$$;



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
    and (case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=f.tenant_id and (policy.enabled or policy.factual_gate_required))
      then cfg.configuration_key is not null and garimpa.offer_configuration_key(o.offer_evidence)=cfg.configuration_key
        and o.offer_evidence->>'currency'='BRL' and f.offer_evidence->>'currency'='BRL'
        and o.offer_evidence->>'priceType'='exact' and f.offer_evidence->>'priceType'='exact'
      else coalesce(o.offer_evidence->>'currency','BRL')=coalesce(f.offer_evidence->>'currency','BRL')
        and ((cfg.configuration_key is not null and garimpa.offer_configuration_key(o.offer_evidence)=cfg.configuration_key)
          or (cfg.configuration_key is null and garimpa.offer_configuration_key(o.offer_evidence) is null
            and not ((o.offer_evidence ? 'priceMinCents' and o.offer_evidence ? 'priceMaxCents' and o.offer_evidence->'priceMinCents' <> o.offer_evidence->'priceMaxCents')
              or (f.offer_evidence ? 'priceMinCents' and f.offer_evidence ? 'priceMaxCents' and f.offer_evidence->'priceMinCents' <> f.offer_evidence->'priceMaxCents')))) end)
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


-- A previously public link remains useful as dated history, with no affiliate
-- target or claim that the last observed price is still available.
create function garimpa.public_offer_history_stub(p_slug text,p_tenant text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select jsonb_build_object('slug',pub.slug,'title',p.title,'marketplace',p.marketplace,'imageUrl',p.image_url,
   'observedAt',o.observed_at,'priceCents',case when o.offer_evidence->>'currency'='BRL' then o.price_cents else null end,
   'priceType',case when o.offer_evidence->>'currency'='BRL' then o.offer_evidence->>'priceType' else null end,
   'priceMaxCents',case when o.offer_evidence->>'currency'='BRL' and o.offer_evidence->>'priceType'='range' then o.offer_evidence->'priceMaxCents' else null end)
 from garimpa.publication pub join garimpa.affiliate_account a on a.id=pub.affiliate_id and a.tenant_id=pub.tenant_id and a.status='active'
 join garimpa.product p on p.id=pub.product_id and p.tenant_id=pub.tenant_id
 left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
 left join lateral(select * from garimpa.price_observation obs where obs.tenant_id=p.tenant_id and obs.product_id=p.id
   order by obs.observed_at desc,obs.id desc limit 1) o on true
 where pub.slug=p_slug and pub.channel='web' and pub.status='active' and (p_tenant is null or p.tenant_id=p_tenant)
   and (c.status='approved' or exists(select 1 from garimpa.recommendation_edition_archive archive
     where archive.tenant_id=p.tenant_id and archive.selection->'products' @> jsonb_build_array(jsonb_build_object('id',p.id))))
 limit 1
$$;
revoke all on function garimpa.public_offer_history_stub(text,text) from public,anon,authenticated,garimpa_app;
grant execute on function garimpa.public_offer_history_stub(text,text) to garimpa_public_runtime;

create or replace function garimpa.public_short_link(p_code text,p_tenant text)
returns text language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select s.slug from garimpa.short_link s
 where s.code=p_code and (p_tenant is null or s.tenant_id=p_tenant)
   and (exists(select 1 from garimpa.public_offer_rows(s.tenant_id) f where f.slug=s.slug)
     or garimpa.public_offer_history_stub(s.slug,s.tenant_id) is not null) limit 1
$$;

commit;
