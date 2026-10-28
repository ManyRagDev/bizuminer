-- Reuse the immutable assessment and its actor/snapshot; the homepage never owns this copy.
alter table garimpa.editorial_assessment add column presentation_invalidated_at timestamptz;
create index editorial_assessment_presentation_idx on garimpa.editorial_assessment
  (tenant_id, product_id, created_at desc, id desc)
  where assessment->'presentation'->>'status' in ('published','withdrawn');

-- Durable utility is independent of price, title wording, rating counters and capture time.
-- Configuration, included contents and product identity do require another human review.
create function garimpa.presentation_configuration(e jsonb)
returns jsonb language sql immutable set search_path = pg_catalog, garimpa as $$
  select jsonb_build_object(
    'variantIdentity', e->'variantIdentity', 'variantKey', e->'variantKey', 'variantLabel', e->'variantLabel',
    'packageContents', e->'packageContents', 'packageQuantity', e->'packageQuantity', 'dimensions', e->'dimensions',
    'sellerId', e->'sellerId', 'quantityCondition', e->'conditions'->'quantity', 'fieldStates', jsonb_build_object(
      'variantKey',e->'fieldStates'->'variantKey','packageContents',e->'fieldStates'->'packageContents',
      'packageQuantity',e->'fieldStates'->'packageQuantity','dimensions',e->'fieldStates'->'dimensions'));
$$;

-- Sticky invalidation also covers change -> restoration before a homepage refresh.
create function garimpa.invalidate_product_presentation()
returns trigger language plpgsql security definer set search_path = pg_catalog, garimpa as $$
declare tid text; pid text; p record; e jsonb;
begin
  if tg_table_name='product' then tid:=new.tenant_id; pid:=new.id;
  else tid:=coalesce(new.tenant_id,old.tenant_id); pid:=coalesce(new.product_id,old.product_id); end if;
  select * into p from garimpa.product where tenant_id=tid and id=pid for no key update;
  select offer_evidence into e from garimpa.price_observation where tenant_id=tid and product_id=pid order by observed_at desc,id desc limit 1;
  update garimpa.editorial_assessment a set presentation_invalidated_at=clock_timestamp()
  where a.tenant_id=tid and a.product_id=pid and a.presentation_invalidated_at is null
    and a.assessment->'presentation'->>'status'='published'
    and (garimpa.presentation_configuration(a.snapshot->'offer_evidence') is distinct from garimpa.presentation_configuration(e)
      or a.snapshot->>'product_url' is distinct from p.product_url
      or a.snapshot->>'marketplace' is distinct from p.marketplace
      or a.snapshot->>'external_id' is distinct from p.external_id
      or a.snapshot->>'image_url' is distinct from p.image_url
      or a.snapshot->>'category' is distinct from p.category);
  return coalesce(new,old);
end;
$$;
create trigger product_presentation_identity after update of product_url,marketplace,external_id,image_url,category on garimpa.product
  for each row execute function garimpa.invalidate_product_presentation();
create trigger product_presentation_configuration after insert or update or delete on garimpa.price_observation
  for each row execute function garimpa.invalidate_product_presentation();

-- All writes to public copy validate provenance against server facts. Old assessments are not auto-published.
create function garimpa.validate_product_presentation_revision()
returns trigger language plpgsql security definer set search_path = pg_catalog, garimpa as $$
declare p record; e jsonb; payload jsonb:=new.assessment->'presentation';
begin
  if payload is null then return new; end if;
  if payload->>'status' not in ('draft','published','withdrawn') or jsonb_typeof(payload)<>'object'
     or coalesce(jsonb_typeof(payload->'title'),'')<>'string' or char_length(payload->>'title')>500
     or coalesce(jsonb_typeof(payload->'caveat'),'')<>'string' or char_length(payload->>'caveat')>1000 then
    raise exception 'invalid_presentation';
  end if;
  if payload ? 'cover' and (
     jsonb_typeof(payload->'cover') is distinct from 'object'
     or jsonb_typeof(payload->'cover'->'headline') is distinct from 'string'
     or char_length(btrim(payload->'cover'->>'headline')) not between 3 and 72
     or jsonb_typeof(payload->'cover'->'imageApproved') is distinct from 'boolean') then
    raise exception 'invalid_presentation_cover';
  end if;
  if not exists(select 1 from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id
      where a.tenant_id=new.tenant_id and a.status='active' and m.app_user_id=new.actor_app_user_id
      and (to_jsonb(m)->>'revoked_at') is null) then raise exception 'presentation_actor_forbidden'; end if;
  select product_url, marketplace, external_id, image_url, category into p from garimpa.product
    where tenant_id=new.tenant_id and id=new.product_id for no key update;
  select offer_evidence into e from garimpa.price_observation where tenant_id=new.tenant_id and product_id=new.product_id
    order by observed_at desc,id desc limit 1;
  if payload->>'status'='published' then
    if char_length(btrim(payload->>'title'))<3 or not exists(select 1 from garimpa.product_curation c
      where c.tenant_id=new.tenant_id and c.product_id=new.product_id and c.status='approved') then raise exception 'presentation_not_reviewed'; end if;
    if garimpa.presentation_configuration(new.snapshot->'offer_evidence') is distinct from garimpa.presentation_configuration(e)
      or new.snapshot->>'product_url' is distinct from p.product_url
      or new.snapshot->>'marketplace' is distinct from p.marketplace
      or new.snapshot->>'external_id' is distinct from p.external_id
      or new.snapshot->>'image_url' is distinct from p.image_url
      or new.snapshot->>'category' is distinct from p.category then raise exception 'presentation_evidence_changed'; end if;
  end if;
  return new;
end;
$$;
create trigger editorial_presentation_revision before insert on garimpa.editorial_assessment
  for each row execute function garimpa.validate_product_presentation_revision();

-- Internal set-oriented helper can also join catalog search. It is not an RPC available to public roles.
create function garimpa.product_presentation_rows(p_tenant text, p_product_ids text[])
returns table(product_id text,presentation jsonb) language sql stable security invoker set search_path = pg_catalog, garimpa as $$
  select p.id,jsonb_build_object('sourceTitle',p.title,'displayTitle',a.assessment->'presentation'->>'title',
    'titleOrigin','editorial','editorialRevisionId',a.id,'editorialReviewedAt',a.created_at,
    'benefit',a.assessment->>'benefit','audience',a.assessment->>'audience',
    'purchaseContents',a.assessment->>'purchaseContents','caveat',a.assessment->'presentation'->>'caveat')
    || case when a.assessment->'presentation' ? 'cover' then jsonb_build_object(
      'coverHeadline',a.assessment->'presentation'->'cover'->>'headline',
      'coverImageApproved',a.assessment->'presentation'->'cover'->'imageApproved') else '{}'::jsonb end
  from garimpa.product p
  join lateral(select r.* from garimpa.editorial_assessment r where r.tenant_id=p.tenant_id and r.product_id=p.id
    and r.assessment->'presentation'->>'status' in ('published','withdrawn') order by r.created_at desc,r.id desc limit 1) a on true
  left join lateral(select o.offer_evidence from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
    order by o.observed_at desc,o.id desc limit 1) latest on true
  where (p_tenant is null or p.tenant_id=p_tenant) and (p_product_ids is null or p.id=any(p_product_ids))
    and a.assessment->'presentation'->>'status'='published' and a.presentation_invalidated_at is null
    and garimpa.presentation_configuration(a.snapshot->'offer_evidence')=garimpa.presentation_configuration(latest.offer_evidence)
    and a.snapshot->>'product_url' is not distinct from p.product_url
    and a.snapshot->>'marketplace' is not distinct from p.marketplace and a.snapshot->>'external_id' is not distinct from p.external_id
    and a.snapshot->>'image_url' is not distinct from p.image_url and a.snapshot->>'category' is not distinct from p.category
    and exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='approved')
    and exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id
      where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.channel='web' and pub.status='active' and account.status='active');
$$;

-- This is intentionally a narrow public projection; no table grants or private assessment JSON.
create function garimpa.product_presentation_offer_rows(p_tenant text,p_product_ids text[])
returns table(product_id text,presentation jsonb) language sql stable security invoker set search_path = pg_catalog, garimpa as $$
  with editorial as materialized (select * from garimpa.product_presentation_rows(p_tenant,p_product_ids))
  select p.id,jsonb_build_object('sourceTitle',p.title,'displayTitle',p.title,'titleOrigin','source')
    || coalesce(editorial.presentation,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'priceType',case when latest.offer_evidence->>'priceType' in ('exact','from','range','unknown') then latest.offer_evidence->>'priceType' end,
      'currency',case when latest.offer_evidence->>'currency' ~ '^[A-Z]{3}$' then latest.offer_evidence->>'currency' end,
      'originalPriceKind',case when latest.offer_evidence->>'originalPriceKind' in ('source_claimed','derived_from_claim','unknown') then latest.offer_evidence->>'originalPriceKind' end,
      'priceMinCents',case when jsonb_typeof(latest.offer_evidence->'priceMinCents')='number' then latest.offer_evidence->'priceMinCents' end,
      'priceMaxCents',case when jsonb_typeof(latest.offer_evidence->'priceMaxCents')='number' then latest.offer_evidence->'priceMaxCents' end))
  from garimpa.product p
  left join editorial on editorial.product_id=p.id
  left join lateral(select o.offer_evidence from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
    order by o.observed_at desc,o.id desc limit 1) latest on true
  where p.id=any(p_product_ids) and (p_tenant is null or p.tenant_id=p_tenant)
    and exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='approved')
    and exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id
      where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.channel='web' and pub.status='active' and account.status='active');
$$;
create function garimpa.public_product_presentations(p_tenant text,p_product_ids text[])
returns table(product_id text,presentation jsonb) language sql stable security definer set search_path=pg_catalog,garimpa as $$
  select * from garimpa.product_presentation_offer_rows(p_tenant,p_product_ids)
  where cardinality(p_product_ids) between 1 and 200;
$$;
revoke all on function garimpa.product_presentation_offer_rows(text,text[]) from public,anon,authenticated;
grant execute on function garimpa.product_presentation_offer_rows(text,text[]) to garimpa_app;
revoke all on function garimpa.presentation_configuration(jsonb),garimpa.invalidate_product_presentation(),
  garimpa.validate_product_presentation_revision(),garimpa.product_presentation_rows(text,text[]),
  garimpa.public_product_presentations(text,text[]) from public,anon,authenticated;
grant execute on function garimpa.public_product_presentations(text,text[]) to garimpa_public_runtime,garimpa_app;
grant execute on function garimpa.product_presentation_rows(text,text[]),garimpa.presentation_configuration(jsonb) to garimpa_app;

-- Revalidate user-selected IDs before copying or redisplaying saved products.
-- Eligibility comes from the same public catalog projection; no draft/private products.
create function garimpa.public_selected_products(p_ids text[])
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
  with offers as materialized (
    select f.* from garimpa.public_offer_rows(null) f
    where cardinality(p_ids) between 1 and 24 and f.id=any(p_ids)
  ), presentations as materialized (
    select * from garimpa.public_product_presentations(null,(select array_agg(id) from offers))
  )
  select coalesce(jsonb_agg((to_jsonb(o)-'tenant_id'-'publication_id') || coalesce(p.presentation,'{}'::jsonb)
    order by array_position(p_ids,o.id)),'[]'::jsonb)
  from offers o left join presentations p on p.product_id=o.id;
$$;
revoke all on function garimpa.public_selected_products(text[]) from public,anon,authenticated;
grant execute on function garimpa.public_selected_products(text[]) to garimpa_public_runtime,garimpa_app;

-- Search source and the same valid editorial revision used on cards, in one set.
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
  'deals',coalesce((select jsonb_agg((to_jsonb(p)-'tenant_id'-'publication_id'-'position') || coalesce(pr.presentation,'{}'::jsonb)) from paged p left join garimpa.public_product_presentations(p_tenant,(select array_agg(id) from paged)) pr on pr.product_id=p.id),'[]'::jsonb),
  'total',(select count(*) from filtered),
  'selectionVersion',(select version from selected),
  'selectionStateKey','public-v1',
  'categories',coalesce((select jsonb_agg(category order by category) from categories),'[]'::jsonb),
  'marketplaceCounts',coalesce((select jsonb_object_agg(marketplace,count) from marketplace_counts),'{}'::jsonb)
 );
$$;

create or replace function garimpa.public_hero_candidates(p_tenant text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
  with offers as materialized(select * from garimpa.public_offer_rows(p_tenant) where image_url is not null),
  presentations as materialized(select * from garimpa.product_presentation_offer_rows(p_tenant,(select array_agg(id) from offers)))
  select coalesce(jsonb_agg((to_jsonb(o)-'tenant_id'-'publication_id') || coalesce(p.presentation,'{}'::jsonb)),'[]'::jsonb)
  from offers o left join presentations p on p.product_id=o.id;
$$;

-- Merge live public copy and the observation-guarded edition within one MVCC snapshot.
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
  select product.value,product.ordinality,guard.value as input
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
