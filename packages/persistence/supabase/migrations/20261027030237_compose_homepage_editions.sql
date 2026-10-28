-- Precomputed editions and bounded anonymous engagement, private to BizuMiner.
set local lock_timeout = '5s';
set local statement_timeout = '45s';

create table garimpa.homepage_edition (
 tenant_id text primary key references garimpa.affiliate_account(tenant_id),
 id uuid not null unique,
 policy_version text not null,
 source_selection_id text,
 renewed_at timestamptz not null,
 renew_after timestamptz not null,
 refreshed_at timestamptz not null default now(),
 selection jsonb not null check (jsonb_typeof(selection)='object' and jsonb_typeof(selection->'products')='array' and jsonb_array_length(selection->'products')<=24),
 inputs jsonb not null check (jsonb_typeof(inputs)='array' and jsonb_array_length(inputs)<=24),
 dependencies jsonb not null check (jsonb_typeof(dependencies)='array' and jsonb_array_length(dependencies)<=1200),
 foreign key (source_selection_id,tenant_id) references garimpa.editorial_selection(id,tenant_id)
);
create table garimpa.homepage_product_history (
 tenant_id text not null,
 product_id text not null,
 first_featured_at timestamptz not null default now(),
 primary key(tenant_id,product_id),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id) on delete cascade
);
-- One row per anonymous page view/product/position, not one row per event.
create table garimpa.homepage_engagement (
 tenant_id text not null references garimpa.affiliate_account(tenant_id),
 view_id uuid not null,
 edition_id uuid not null,
 product_id text not null,
 surface text not null check(surface in ('grid','hero')),
 position smallint not null check(position between 0 and 23),
 impressed boolean not null default false,
 detail boolean not null default false,
 favorite boolean not null default false,
 outbound boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(tenant_id,view_id,product_id,surface,position),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id) on delete cascade
);
create index homepage_engagement_report_idx on garimpa.homepage_engagement(tenant_id,created_at);
create index homepage_engagement_product_idx on garimpa.homepage_engagement(tenant_id,product_id);
create index homepage_engagement_retention_idx on garimpa.homepage_engagement(created_at);

revoke all on garimpa.homepage_edition,garimpa.homepage_product_history,garimpa.homepage_engagement
 from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa.homepage_edition to garimpa_app;
grant select,insert on garimpa.homepage_product_history to garimpa_app;
grant select,delete on garimpa.homepage_engagement to garimpa_app;
alter table garimpa.homepage_edition enable row level security;
alter table garimpa.homepage_product_history enable row level security;
alter table garimpa.homepage_engagement enable row level security;
create policy homepage_edition_scope on garimpa.homepage_edition to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy homepage_history_scope on garimpa.homepage_product_history to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy homepage_engagement_scope on garimpa.homepage_engagement to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));

-- Only small, selected product lookups. No history aggregation or full curation view.
-- Observation identity deliberately fails closed between a capture and its refresh.
create function garimpa.read_homepage_edition(p_tenant text,p_destination text)
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
  'products',coalesce((select jsonb_agg(value order by ordinality) from visible),'[]'::jsonb),
  'heroProductIds',coalesce((select ids from heroes),'[]'::jsonb))
 from edition h where p_destination in ('home','pauta','all');
$$;
create function garimpa.record_homepage_engagement(p_tenant text,p_edition uuid,p_view uuid,p_events jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare affected integer;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>50 then return 0; end if;
 with allowed as materialized (
  select garimpa.read_homepage_edition(p_tenant,'home') as selection from garimpa.homepage_edition h where h.tenant_id=p_tenant and h.id=p_edition
   and h.refreshed_at>now()-interval '48 hours'
   and exists(select 1 from garimpa.affiliate_account a where a.tenant_id=p_tenant and a.status='active')
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
revoke all on function garimpa.read_homepage_edition(text,text),garimpa.record_homepage_engagement(text,uuid,uuid,jsonb)
 from public,anon,authenticated,garimpa_app;
grant execute on function garimpa.read_homepage_edition(text,text),garimpa.record_homepage_engagement(text,uuid,uuid,jsonb)
 to garimpa_public_runtime;
