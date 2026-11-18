begin;
set local lock_timeout='5s';

-- Human-recognized identity is scoped to concrete configurations, never inferred
-- from titles, family, seller or a similar price. Historical prices stay separate.
create table garimpa.curation_equivalence_group (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  reason text not null check(length(btrim(reason)) between 3 and 1000),
  created_by text not null references garimpa.app_user(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text references garimpa.app_user(id),
  unique(id,tenant_id),
  check((revoked_at is null)=(revoked_by is null))
);
create table garimpa.curation_equivalence_member (
  tenant_id text not null,
  group_id uuid not null,
  product_id text not null,
  option_key text not null check(option_key<>'listing'),
  observation_id text not null,
  recognized_by text not null references garimpa.app_user(id),
  recognition_reason text not null check(length(btrim(recognition_reason)) between 3 and 1000),
  recognized_at timestamptz not null default now(),
  active boolean not null default true,
  primary key(tenant_id,group_id,product_id,option_key),
  foreign key(group_id,tenant_id) references garimpa.curation_equivalence_group(id,tenant_id),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id)
);
-- One active group per product prevents overlapping groups from leaking
-- equivalent examples between the reference and holdout partitions.
create unique index curation_equivalence_member_active on garimpa.curation_equivalence_member(tenant_id,product_id) where active;
create index curation_equivalence_member_group on garimpa.curation_equivalence_member(tenant_id,group_id,product_id) where active;
alter table garimpa.curation_equivalence_group enable row level security;
alter table garimpa.curation_equivalence_member enable row level security;
do $$ declare t text; begin
  foreach t in array array['curation_equivalence_group','curation_equivalence_member'] loop
    execute format('revoke all on garimpa.%I from public,anon,authenticated,garimpa_public_runtime',t);
    execute format('grant select,insert,update on garimpa.%I to garimpa_app',t);
    execute format('create policy equivalence_read on garimpa.%I for select to garimpa_app using (tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),'''') and garimpa.active_tenant(tenant_id) and (current_setting(''garimpa.actor_type'',true)=''worker'' or current_setting(''garimpa.membership_role'',true) in (''owner'',''operator'')))',t);
    execute format('create policy equivalence_write on garimpa.%I for all to garimpa_app using (tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),'''') and garimpa.active_tenant(tenant_id) and current_setting(''garimpa.membership_role'',true)=''owner'') with check (tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),'''') and garimpa.active_tenant(tenant_id) and current_setting(''garimpa.membership_role'',true)=''owner'')',t);
    execute format('create trigger pauta_changed_insert after insert on garimpa.%I referencing new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
    execute format('create trigger pauta_changed_update after update on garimpa.%I referencing old table as pauta_old new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
  end loop;
end $$;
create trigger signal_equivalence_created after insert on garimpa.curation_equivalence_group
  for each row execute function garimpa.signal_curation_projection();
create trigger signal_equivalence_member_added after insert on garimpa.curation_equivalence_member
  for each row execute function garimpa.signal_curation_projection();
create trigger signal_equivalence_revoked after update of revoked_at on garimpa.curation_equivalence_group
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function garimpa.signal_curation_projection();

-- Private factual gate used inside the already-restricted public projections.
-- It exposes no membership or review data and does not merge product histories.
create function garimpa.equivalent_human_veto(p_tenant text,p_product text,p_observation text)
returns boolean language sql stable security invoker set search_path=pg_catalog,garimpa as $$
 select exists(
   select 1 from garimpa.price_observation obs
   join garimpa.curation_equivalence_member own on own.tenant_id=obs.tenant_id and own.product_id=obs.product_id
     and own.option_key=obs.option_key and own.active
   join garimpa.curation_equivalence_group g on g.tenant_id=own.tenant_id and g.id=own.group_id and g.revoked_at is null
   join garimpa.curation_equivalence_member other on other.tenant_id=g.tenant_id and other.group_id=g.id and other.active
   join garimpa.product_curation c on c.tenant_id=other.tenant_id and c.product_id=other.product_id and c.status='rejected'
   join lateral (select e.to_status from garimpa.curation_event e where e.tenant_id=other.tenant_id
     and e.product_id=other.product_id and e.actor_type='human' order by e.id desc limit 1) human on human.to_status='rejected'
   where obs.tenant_id=p_tenant and obs.product_id=p_product and obs.id=p_observation
 )
$$;
revoke all on function garimpa.equivalent_human_veto(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.equivalent_human_veto(text,text,text) to garimpa_app;

create function garimpa.equivalence_group_for_observation(p_tenant text,p_product text,p_observation text)
returns uuid language sql stable security invoker set search_path=pg_catalog,garimpa as $$
 select g.id from garimpa.price_observation o
 join garimpa.curation_equivalence_member m on m.tenant_id=o.tenant_id and m.product_id=o.product_id and m.option_key=o.option_key and m.active
 join garimpa.curation_equivalence_group g on g.tenant_id=m.tenant_id and g.id=m.group_id and g.revoked_at is null
 where o.tenant_id=p_tenant and o.product_id=p_product and o.id=p_observation limit 1
$$;
revoke all on function garimpa.equivalence_group_for_observation(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.equivalence_group_for_observation(text,text,text) to garimpa_app;

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
   and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
     or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
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
  and not exists(select 1 from garimpa.price_observation newer where newer.tenant_id=l.tenant_id and newer.product_id=l.product_id
    and newer.observed_at>l.observed_at and newer.option_key<>l.option_key and newer.offer_evidence->>'priceType'='exact'
    and coalesce(newer.offer_evidence->'variantIdentity'->>'key',newer.offer_evidence->>'variantKey')=
      coalesce(l.offer_evidence->'variantIdentity'->>'key',l.offer_evidence->>'variantKey'))
  and not garimpa.equivalent_human_veto(p.tenant_id,p.id,l.id)
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
 ), eligible_candidates as materialized(
  select product.value||jsonb_build_object('offerValidUntil', case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
    then least((guard.value->>'validUntil')::timestamptz,garimpa.current_offer_valid_until(p_tenant,p.id,latest.id)) else (guard.value->>'validUntil')::timestamptz end) as value,
    garimpa.equivalence_group_for_observation(p_tenant,p.id,latest.id) as equivalence_group,
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
    and x.channel=p_channel and (x.product_id=p.id or (p_channel in ('whatsapp','stories') and exists(
      select 1 from garimpa.curation_equivalence_member member
      where member.tenant_id=p_tenant and member.group_id=garimpa.equivalence_group_for_observation(p_tenant,p.id,latest.id)
        and member.product_id=x.product_id and member.option_key=x.option_key and member.active)))
    order by x.confirmed_at desc,x.id desc limit 1) exposure on true
  where h.source_valid and assessment.id is not distinct from guard.value->>'assessmentId'
   and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and policy.enabled)
     or (guard.value ? 'sourceRevision' and garimpa.has_current_curation_assessment(p_tenant,p.id,latest.id)))
   and not garimpa.equivalent_human_veto(p_tenant,p.id,latest.id)
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
   and (exposure.id is null or exposure.confirmed_at<=now()-make_interval(hours=>case
      when p_channel in ('whatsapp','stories') and exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and policy.enabled)
        then coalesce((select config.repeat_hours from garimpa.pauta_slot_config config where config.tenant_id=p_tenant and config.channel=p_channel),240)
      else coalesce((h.channel_policy->>'repeatHours')::integer,0) end)
    or (exposure.product_id=p.id and exposure.option_key=guard.value->>'optionKey' and latest.observed_at>exposure.confirmed_at
      and ((not (p_channel in ('whatsapp','stories') and exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and policy.enabled))
          and (product.value->>'priceCents')::numeric<=exposure.price_cents*(1-coalesce((h.channel_policy->>'improvementPercent')::numeric,5)/100))
        or (p_channel in ('whatsapp','stories') and product.value->>'priceType'='exact'
          and exists(select 1 from garimpa.curation_policy_v2 policy join garimpa.pauta_slot_config config
            on config.tenant_id=policy.tenant_id and config.channel=p_channel and config.allow_price_improvement
            where policy.tenant_id=p_tenant and policy.enabled
              and (product.value->>'priceCents')::numeric<=exposure.price_cents*(1-config.improvement_percent::numeric/100))
          and exists(select 1 from garimpa.recommendation_edition_archive archive
            cross join lateral jsonb_array_elements(coalesce(archive.selection->'products','[]'::jsonb)) previous
            where archive.tenant_id=exposure.tenant_id and archive.channel=exposure.channel and archive.id=exposure.edition_id
              and previous->>'id'=exposure.product_id and previous->>'priceType'='exact')))))
   and p.last_seen_at>now()-interval '7 days' and p.last_seen_at<=now()+interval '1 minute'
   and p.title=product.value->>'title' and p.image_url is not distinct from product.value->>'imageUrl'
   and p.category is not distinct from product.value->>'category' and p.product_url=guard.value->>'productUrl'
   and now()<(guard.value->>'validUntil')::timestamptz
   and (guard.value->>'optionKey' is null or (guard.value->>'optionKey'='listing'
      and not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p_tenant and choice.product_id=p.id))
     or exists(select 1 from garimpa.editorial_offer_choice choice
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
 ), eligible as materialized (
  select value,ordinality,input from (
    select candidate.*,row_number() over(partition by coalesce('group:'||equivalence_group::text,'product:'||(value->>'id'))
      order by ordinality) as equivalent_position from eligible_candidates candidate
  ) distinct_candidates where equivalent_position=1
 )
 select coalesce(h.selection,'{}'::jsonb)||jsonb_build_object('schemaReady',true,'homepageReady',true,'mode','editorial',
  'id',h.id,'homepageEditionId',h.id,'version',h.version,'destination',p_channel,'renewedAt',h.renewed_at,
  'validUntil',(select min((input->>'validUntil')::timestamptz) from eligible),
  'heroValidUntil',(select min((input->>'validUntil')::timestamptz) from eligible),
  'heroProductIds',coalesce((select jsonb_agg(value->'id' order by ordinality) from eligible where h.selection->'heroProductIds' ? (value->>'id')),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(value order by ordinality) from eligible),'[]'::jsonb)) from edition h
 where p_channel in ('home','whatsapp','stories')
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
 ), eligible_candidates as materialized (
  select product.value||jsonb_build_object('offerValidUntil',case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant and (policy.enabled or policy.factual_gate_required))
    then least((guard.value->>'validUntil')::timestamptz,garimpa.current_offer_valid_until(p_tenant,p.id,latest.id)) else (guard.value->>'validUntil')::timestamptz end) as value,
    garimpa.equivalence_group_for_observation(p_tenant,p.id,latest.id) as equivalence_group,
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
   and not garimpa.equivalent_human_veto(p_tenant,p.id,latest.id)
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
 ), eligible as materialized (
  select value,ordinality,input from (
    select candidate.*,row_number() over(partition by coalesce('group:'||equivalence_group::text,'product:'||(value->>'id'))
      order by ordinality) as equivalent_position from eligible_candidates candidate
  ) distinct_candidates where equivalent_position=1
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
  and not garimpa.equivalent_human_veto(p.tenant_id,p.id,o.id)
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
-- Buyers receive only the identities of offers already permitted by the
-- public projection in their own account; no private queue or review data.
create function garimpa.member_current_offers(p_tenant text)
returns table(product_id text,observation_id text,valid_until timestamptz,option_key text)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'')
   or not garimpa.active_tenant(p_tenant)
   or not exists(select 1 from garimpa.app_user u where u.tenant_id=p_tenant
     and u.id=nullif(current_setting('garimpa.actor_app_user_id',true),'')) then
   raise exception 'member_scope_denied';
 end if;
 return query select offer.id,offer.observation_id,
   case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p_tenant
       and (policy.enabled or policy.factual_gate_required))
     then least(offer.last_seen_at+interval '7 days',garimpa.current_offer_valid_until(p_tenant,offer.id,offer.observation_id))
     else offer.last_seen_at+interval '7 days' end,o.option_key
   from garimpa.public_offer_candidates(p_tenant,null) offer
   join garimpa.price_observation o on o.tenant_id=p_tenant and o.product_id=offer.id and o.id=offer.observation_id;
end $$;
revoke all on function garimpa.member_current_offers(text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.member_current_offers(text) to garimpa_app;

-- A watch baseline must be the same currently visible offer the buyer chose.
-- A specified configuration may use the existing confirmed-option projection.
create function garimpa.member_watch_start_observation(p_tenant text,p_product text,p_option text)
returns text language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
declare selected_id text; candidate_slug text; visible jsonb;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'')
   or not garimpa.active_tenant(p_tenant)
   or not exists(select 1 from garimpa.app_user u where u.tenant_id=p_tenant
     and u.id=nullif(current_setting('garimpa.actor_app_user_id',true),'')) then
   raise exception 'member_scope_denied';
 end if;
 select offer.observation_id into selected_id from garimpa.public_offer_candidates(p_tenant,null) offer
   join garimpa.price_observation o on o.tenant_id=p_tenant and o.product_id=offer.id and o.id=offer.observation_id
   where offer.id=p_product and (p_option is null or o.option_key=p_option) limit 1;
 if selected_id is null and p_option ~ '^[a-f0-9]{32}$' then
   select pub.slug into candidate_slug from garimpa.publication pub join garimpa.affiliate_account account
     on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id and account.status='active'
     where pub.tenant_id=p_tenant and pub.product_id=p_product and pub.channel='web' and pub.status='active'
     order by pub.published_at desc,pub.id limit 1;
   if candidate_slug is not null then
     visible:=garimpa.public_confirmed_offer(candidate_slug,p_option);
     if visible#>>'{product,id}'=p_product and visible#>>'{product,offerOptionKey}'=p_option then
       select o.id into selected_id from garimpa.price_observation o where o.tenant_id=p_tenant
         and o.product_id=p_product and o.option_key=p_option order by o.observed_at desc,o.id desc limit 1;
     end if;
   end if;
 end if;
 return selected_id;
end $$;
revoke all on function garimpa.member_watch_start_observation(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.member_watch_start_observation(text,text,text) to garimpa_app;

-- The detail page needs its own deadline while it remains open in a browser.
-- Return a timestamp only for an offer accepted by the public projection.
create function garimpa.public_offer_deadline(p_slug text) returns timestamptz
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select case when exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=offer.tenant_id
     and (policy.enabled or policy.factual_gate_required))
   then least(offer.evidence_observed_at+interval '48 hours',offer.last_seen_at+interval '7 days',
     garimpa.current_offer_valid_until(offer.tenant_id,offer.id,offer.observation_id))
   else least(offer.evidence_observed_at+interval '48 hours',offer.last_seen_at+interval '7 days') end
 from garimpa.public_offer_candidates(null,p_slug) offer limit 1
$$;
revoke all on function garimpa.public_offer_deadline(text) from public,anon,authenticated;
grant execute on function garimpa.public_offer_deadline(text) to garimpa_public_runtime;

-- A live campaign may retain a historical destination after its offer expires.
-- This projection never exposes a monetized target and keeps revocation and
-- workspace approval checks independent of offer availability.
create function garimpa.public_campaign_history(p_code text,p_slug text default null)
returns table(slug text,option_key text)
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select pub.slug,r.snapshot->>'optionKey'
 from garimpa.campaign_link l
 join garimpa.campaign_publication cp on cp.id=l.publication_id and cp.tenant_id=l.tenant_id
 join garimpa.commercial_kit k on k.id=cp.kit_id and k.tenant_id=cp.tenant_id
 join garimpa.commercial_kit_revision r on r.id=cp.kit_revision_id and r.tenant_id=cp.tenant_id
 join garimpa.opportunity o on o.id=k.opportunity_id and o.tenant_id=k.tenant_id
 join garimpa.publication pub on pub.id=l.web_publication_id and pub.tenant_id=l.tenant_id and pub.product_id=o.product_id
 where l.code=p_code and l.monetization_status='valid' and l.revoked_at is null
   and (p_slug is null or pub.slug=p_slug)
   and (k.workspace_author_id is null or (k.status='approved' and cp.status in ('ready','exported','published_confirmed') and r.snapshot->>'optionKey' is not null))
   and not exists(select 1 from garimpa.public_campaign_link(p_code,p_slug))
   and (not exists(select 1 from garimpa.public_offer_rows(null) f
        where f.tenant_id=pub.tenant_id and f.publication_id=pub.id and f.id=o.product_id)
     or (k.workspace_author_id is not null and garimpa.public_confirmed_offer(pub.slug,r.snapshot->>'optionKey') is null))
   and garimpa.public_offer_history_stub(pub.slug,pub.tenant_id) is not null
 limit 1
$$;
revoke all on function garimpa.public_campaign_history(text,text) from public,anon,authenticated,garimpa_app;
grant execute on function garimpa.public_campaign_history(text,text) to garimpa_public_runtime;

-- Devices need the decision, not the private score or assessment. Restrict
-- the answer to a pending task in this account (or the caller's own claim).
create function garimpa.recapture_promotion_current(p_tenant text,p_promotion uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 perform garimpa.recapture_watch_active(p_tenant,'');
 return exists(select 1 from garimpa.curation_promotion p
   join garimpa.curation_policy_v2 policy on policy.tenant_id=p.tenant_id and policy.enabled and policy.version=p.policy_version
   join garimpa.curation_score_projection score on score.tenant_id=p.tenant_id and score.product_id=p.product_id
     and score.option_key=p.option_key and score.observation_id=p.requested_observation_id and score.source_revision=p.requested_revision
   join garimpa.curation_attribute_assessment assessment on assessment.tenant_id=score.tenant_id
     and assessment.product_id=score.product_id and assessment.id=score.assessment_id
   join garimpa.product_curation decision on decision.tenant_id=p.tenant_id and decision.product_id=p.product_id and decision.status='approved'
   where p.tenant_id=p_tenant and p.id=p_promotion and p.reason in ('promotion','renewal','slot')
     and p.status='pending' and p.next_attempt_at<=now() and p.deadline>now()
     and p.requested_observation_id=(select o.id from garimpa.price_observation o where o.tenant_id=p.tenant_id
       and o.product_id=p.product_id and o.option_key=p.option_key order by o.observed_at desc,o.id desc limit 1)
     and assessment.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
       where event.tenant_id=p.tenant_id and event.product_id=p.product_id order by event.id desc limit 1)
     and garimpa.has_current_curation_assessment(p.tenant_id,p.product_id,p.requested_observation_id)
     and not (coalesce(assessment.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
     and not garimpa.equivalent_human_veto(p.tenant_id,p.product_id,p.requested_observation_id)
     and exists(select 1 from garimpa.recapture_target target join garimpa.recapture_task task
       on task.tenant_id=target.tenant_id and task.id=target.task_id
       where target.tenant_id=p.tenant_id and target.product_id=p.product_id and target.option_key=p.option_key
         and target.status='pending' and (task.status='pending' or (task.status='claimed'
           and task.device_id=nullif(current_setting('garimpa.device_id',true),'')))));
end $$;
revoke all on function garimpa.recapture_promotion_current(text,uuid) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.recapture_promotion_current(text,uuid) to garimpa_app;

create function garimpa.recapture_watch_option_needs_check(p_tenant text,p_product text,p_option text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if not garimpa.recapture_watch_option_due(p_tenant,p_product,p_option) then return false; end if;
 return not exists(select 1 from garimpa.price_observation recent
   join garimpa.offer_verification v on v.tenant_id=recent.tenant_id and v.product_id=recent.product_id
     and v.option_key=recent.option_key and v.price_type=recent.offer_evidence->>'priceType'
     and v.observation_id=recent.id and v.availability<>'unavailable'
   where recent.tenant_id=p_tenant and recent.product_id=p_product and recent.option_key=p_option
     and recent.price_cents>0 and recent.offer_evidence->>'currency'='BRL'
     and recent.offer_evidence->>'priceType' in ('exact','range','from')
     and recent.offer_evidence#>>'{source,method}'='browser'
     and recent.offer_evidence->>'observationMethod' in ('listing','product_page')
     and recent.observed_at>now()-interval '24 hours' and recent.observed_at<=now()
     and not exists(select 1 from garimpa.offer_availability_observation unavailable
       where unavailable.tenant_id=p_tenant and unavailable.product_id=p_product
         and unavailable.option_key in (p_option,'listing') and unavailable.status='unavailable_confirmed'
         and unavailable.observed_at>=v.verified_at)
     and recent.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=p_tenant
       and latest.product_id=p_product and latest.option_key=p_option order by latest.observed_at desc,latest.id desc limit 1));
end $$;
revoke all on function garimpa.recapture_watch_option_needs_check(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.recapture_watch_option_needs_check(text,text,text) to garimpa_app;
commit;
