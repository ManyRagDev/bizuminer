-- Independent prepared recommendations; never sends messages to customers.
set local lock_timeout='5s';
set local statement_timeout='45s';

-- Observation identity is deliberately weaker than historical comparability.
-- An unknown field stays unknown: it cannot accidentally become comparable.
create function garimpa.observation_option_key(e jsonb) returns text
language sql immutable set search_path=pg_catalog,garimpa as $$
 select case when coalesce(e->'variantIdentity'->>'key',e->>'variantKey','')<>''
  and (not(e ? 'variantIdentity') or e->'variantIdentity'->>'state' in ('source_verified','human_verified'))
 then md5(jsonb_build_object('configuration',coalesce(garimpa.offer_configuration_key(e),
  jsonb_build_object('variant',coalesce(e->'variantIdentity'->>'key',e->>'variantKey'),
   'attributes',e->'variantIdentity'->'attributes','seller',e->>'sellerId',
   'quantity',coalesce(e->'packageQuantity',e->'conditions'->'quantity'),'contents',e->'packageContents',
   'dimensions',e->'dimensions','payment',e->'conditions'->'payment','coupon',e->'conditions'->'coupon','region',e->'conditions'->'region',
   'missingStates',(select jsonb_object_agg(key,value) from jsonb_each(coalesce(e->'fieldStates','{}'::jsonb))
     where key in ('sellerId','packageContents','packageQuantity','dimensions','payment','coupon','region') and value='"not_applicable"'::jsonb))),
  'currency',e->>'currency','shipping',e->'conditions'->'shipping')::text)
 else 'listing' end
$$;
revoke all on function garimpa.observation_option_key(jsonb) from public,anon,authenticated;
grant execute on function garimpa.observation_option_key(jsonb) to garimpa_app;
alter table garimpa.price_observation add column option_key text
 generated always as (garimpa.observation_option_key(offer_evidence)) stored;
do $$declare constraint_name text; begin
 for constraint_name in select c.conname from pg_constraint c
 where c.conrelid='garimpa.price_observation'::regclass and c.contype='u'
 and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
  where a.attrelid=c.conrelid and a.attnum=any(c.conkey))=array['capture_run_id','product_id']::text[]
 loop execute format('alter table garimpa.price_observation drop constraint %I',constraint_name); end loop;
end $$;
alter table garimpa.price_observation add constraint price_observation_run_product_option_key
 unique(capture_run_id,product_id,option_key);
create index price_observation_option_recent_idx on garimpa.price_observation(tenant_id,product_id,option_key,observed_at desc,id desc);

create table garimpa.editorial_offer_choice(
 tenant_id text not null, product_id text not null, option_key text not null check(option_key<>'listing'),
 selected_by text not null references garimpa.app_user(id), selected_at timestamptz not null default now(),
 primary key(tenant_id,product_id),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id) on delete cascade
);
create index editorial_offer_choice_actor_idx on garimpa.editorial_offer_choice(selected_by);
create table garimpa.recommendation_channel(
 tenant_id text not null references garimpa.affiliate_account(tenant_id),
 channel text not null check(channel in ('home','whatsapp','stories')),
 version integer not null check(version>0), policy_version text not null,
 enabled boolean not null default false, policy jsonb not null check(jsonb_typeof(policy)='object'),
 manual_order jsonb check(manual_order is null or (jsonb_typeof(manual_order)='array' and jsonb_array_length(manual_order)<=24)),
 valid_until timestamptz, updated_at timestamptz not null default now(),
 primary key(tenant_id,channel)
);
create table garimpa.recommendation_edition(
 tenant_id text not null, channel text not null, id uuid not null unique,
 version integer not null check(version>0), config_version integer not null,
 policy_version text not null, renewed_at timestamptz not null, valid_until timestamptz,
 selection jsonb not null check(jsonb_typeof(selection)='object' and jsonb_typeof(selection->'products')='array' and jsonb_array_length(selection->'products')<=24),
 inputs jsonb not null check(jsonb_typeof(inputs)='array' and jsonb_array_length(inputs)<=24),
 dependencies jsonb not null default '[]' check(jsonb_typeof(dependencies)='array' and jsonb_array_length(dependencies)<=1200),
 primary key(tenant_id,channel), foreign key(tenant_id,channel) references garimpa.recommendation_channel(tenant_id,channel)
);
create table garimpa.recommendation_edition_archive(
 id uuid primary key, tenant_id text not null,channel text not null,version integer not null,config_version integer not null,
 prepared_at timestamptz not null,selection jsonb not null,inputs jsonb not null,
 unique(tenant_id,channel,id),foreign key(tenant_id,channel) references garimpa.recommendation_channel(tenant_id,channel)
);
create index recommendation_archive_scope_idx on garimpa.recommendation_edition_archive(tenant_id,channel,prepared_at desc);
revoke all on garimpa.recommendation_edition_archive from public,anon,authenticated,garimpa_public_runtime,garimpa_app;
grant select,insert on garimpa.recommendation_edition_archive to garimpa_app;
alter table garimpa.recommendation_edition_archive enable row level security;
create policy recommendation_archive_scope on garimpa.recommendation_edition_archive to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create table garimpa.recommendation_exposure(
 id uuid primary key default gen_random_uuid(), tenant_id text not null, channel text not null,
 edition_id uuid not null, product_id text not null, option_key text, price_cents integer not null check(price_cents>0),
 confirmed_at timestamptz not null default now(), confirmed_by text not null references garimpa.app_user(id),
 unique(tenant_id,channel,edition_id,product_id),
 foreign key(tenant_id,channel,edition_id) references garimpa.recommendation_edition_archive(tenant_id,channel,id),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id) on delete cascade
);
create index recommendation_exposure_product_idx on garimpa.recommendation_exposure(tenant_id,channel,product_id,confirmed_at desc);
create index recommendation_exposure_actor_idx on garimpa.recommendation_exposure(confirmed_by);

revoke all on garimpa.editorial_offer_choice,garimpa.recommendation_channel,garimpa.recommendation_edition,garimpa.recommendation_exposure
 from public,anon,authenticated,garimpa_public_runtime,garimpa_app;
grant select,insert,update on garimpa.editorial_offer_choice,garimpa.recommendation_channel,garimpa.recommendation_edition to garimpa_app;
grant select,insert on garimpa.recommendation_exposure to garimpa_app;
alter table garimpa.editorial_offer_choice enable row level security;
alter table garimpa.recommendation_channel enable row level security;
alter table garimpa.recommendation_edition enable row level security;
alter table garimpa.recommendation_exposure enable row level security;
create policy offer_choice_read on garimpa.editorial_offer_choice for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy offer_choice_write on garimpa.editorial_offer_choice for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.actor_type',true)='human')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.actor_type',true)='human'
  and selected_by=nullif(current_setting('garimpa.actor_app_user_id',true),''));
create policy channel_read on garimpa.recommendation_channel for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy channel_write on garimpa.recommendation_channel for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner'
  and current_setting('garimpa.actor_type',true)='human')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner'
  and current_setting('garimpa.actor_type',true)='human');
create policy recommendation_edition_scope on garimpa.recommendation_edition to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy exposure_read on garimpa.recommendation_exposure for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy exposure_confirm on garimpa.recommendation_exposure for insert to garimpa_app
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.actor_type',true)='human'
  and confirmed_by=nullif(current_setting('garimpa.actor_app_user_id',true),''));

-- Only the public projection role can read prepared, still eligible facts.
create function garimpa.read_recommendation_edition(p_tenant text,p_channel text) returns jsonb
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with edition as materialized(
  select e.*,c.policy as channel_policy,c.enabled and c.policy_version='recommendation-v1' and e.policy_version=c.policy_version
   and e.config_version=c.version and (c.valid_until is null or c.valid_until>now()) as source_valid
  from garimpa.recommendation_channel c left join garimpa.recommendation_edition e using(tenant_id,channel)
  where c.tenant_id=p_tenant and c.channel=p_channel
 ), eligible as materialized(
  select product.value||jsonb_build_object('offerValidUntil',guard.value->'validUntil') as value,product.ordinality,guard.value as input
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
revoke all on function garimpa.read_recommendation_edition(text,text) from public,anon,authenticated,garimpa_app;
grant execute on function garimpa.read_recommendation_edition(text,text) to garimpa_public_runtime;

-- Specific offer detail. The slug resolves ownership; callers cannot choose a tenant.
create function garimpa.public_confirmed_offer(p_slug text,p_option text) returns jsonb
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
 where pub.slug=p_slug and pub.channel='web' and pub.status='active' and p_option ~ '^[a-f0-9]{32}$'
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
  'lowestVerified',false,'offerValidUntil',c.observed_at+interval '48 hours'),
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
revoke all on function garimpa.public_confirmed_offer(text,text) from public,anon,authenticated,garimpa_app;
grant execute on function garimpa.public_confirmed_offer(text,text) to garimpa_public_runtime;

create or replace function garimpa.record_homepage_engagement(p_tenant text,p_edition uuid,p_view uuid,p_events jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare affected integer;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>50 then return 0; end if;
 with allowed as materialized (
  select garimpa.read_homepage_edition(p_tenant,'home') as selection from garimpa.homepage_edition h where h.tenant_id=p_tenant and h.id=p_edition
   and h.refreshed_at>now()-interval '48 hours'
   and exists(select 1 from garimpa.affiliate_account a where a.tenant_id=p_tenant and a.status='active')
  union all
  select garimpa.read_recommendation_edition(p_tenant,'home') from garimpa.recommendation_edition e
   where e.tenant_id=p_tenant and e.channel='home' and e.id=p_edition
 ), events as (
  select e->>'productId' as product_id,e->>'surface' as surface,(e->>'position')::smallint as position,
   bool_or(e->>'event'='impression') as impressed,bool_or(e->>'event'='detail') as detail,
   bool_or(e->>'event'='favorite') as favorite,bool_or(e->>'event'='outbound') as outbound
  from allowed h cross join lateral jsonb_array_elements(p_events) e
  where e->>'surface' in ('grid','hero') and e->>'event' in ('impression','detail','favorite','outbound')
   and (e->>'position') ~ '^([0-9]|1[0-9]|2[0-3])$'
   and case when e->>'surface'='grid' then h.selection->'products'->((e->>'position')::int)->>'id'=e->>'productId'
    else h.selection->'heroProductIds'->>((e->>'position')::int)=e->>'productId' end
  group by e->>'productId',e->>'surface',(e->>'position')::smallint
 )
 insert into garimpa.homepage_engagement(tenant_id,view_id,edition_id,product_id,surface,position,impressed,detail,favorite,outbound)
 select p_tenant,p_view,p_edition,product_id,surface,position,impressed,detail,favorite,outbound from events
 on conflict(tenant_id,view_id,product_id,surface,position) do update set
  impressed=homepage_engagement.impressed or excluded.impressed,
  detail=homepage_engagement.detail or excluded.detail,
  favorite=homepage_engagement.favorite or excluded.favorite,
  outbound=homepage_engagement.outbound or excluded.outbound;
 get diagnostics affected=row_count;
 return affected;
end $$;

create table garimpa.editorial_discovery_policy(
 tenant_id text not null references garimpa.affiliate_account(tenant_id),
 marketplace text not null check(marketplace in ('shopee','aliexpress')),
 version integer not null check(version>0), enabled boolean not null default false,
 items_per_run integer not null check(items_per_run between 1 and 20),
 keywords jsonb not null check(jsonb_typeof(keywords)='array' and jsonb_array_length(keywords) between 1 and 12),
 updated_at timestamptz not null default now(),primary key(tenant_id,marketplace)
);
revoke all on garimpa.editorial_discovery_policy from public,anon,authenticated,garimpa_public_runtime,garimpa_app;
grant select,insert,update on garimpa.editorial_discovery_policy to garimpa_app;
alter table garimpa.editorial_discovery_policy enable row level security;
create policy discovery_read on garimpa.editorial_discovery_policy for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy discovery_write on garimpa.editorial_discovery_policy for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner' and current_setting('garimpa.actor_type',true)='human')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner' and current_setting('garimpa.actor_type',true)='human');
