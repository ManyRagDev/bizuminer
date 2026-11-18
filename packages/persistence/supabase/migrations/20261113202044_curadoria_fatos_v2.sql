begin;
set local lock_timeout = '5s';
create unique index if not exists price_observation_identity_scope on garimpa.price_observation(id, tenant_id, product_id);
alter table garimpa.price_observation add column capture_payload_fingerprint text;
alter table garimpa.price_observation add constraint price_observation_payload_fingerprint_format
  check (capture_payload_fingerprint is null or capture_payload_fingerprint ~ '^[0-9a-f]{64}$');

-- Separate observations from the identity of the source page and the latest
-- verification of each price type/configuration. Missing values remain missing.
create table garimpa.product_source_page (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  marketplace text not null,
  option_key text not null,
  page_url text not null check (length(page_url) between 1 and 2048),
  page_url_hash text generated always as (md5(page_url)) stored,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  encounter_count integer not null default 1 check (encounter_count > 0),
  primary key (tenant_id, product_id, option_key, page_url_hash),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id)
);
create index product_source_page_lookup on garimpa.product_source_page(tenant_id, marketplace, last_seen_at desc);

create table garimpa.offer_verification (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  option_key text not null,
  price_type text not null check (price_type in ('exact','range','from')),
  observation_id text not null,
  verified_at timestamptz not null,
  availability text not null default 'unknown' check (availability in ('unknown','available','unavailable')),
  primary key (tenant_id, product_id, option_key, price_type),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id),
  foreign key (observation_id, tenant_id, product_id) references garimpa.price_observation(id, tenant_id, product_id)
);
create index offer_verification_age on garimpa.offer_verification(tenant_id, verified_at, product_id);

create table garimpa.curation_fact_delta (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  observation_id text not null,
  product_id text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (tenant_id, observation_id),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id),
  foreign key (observation_id, tenant_id, product_id) references garimpa.price_observation(id, tenant_id, product_id)
);
create index curation_fact_delta_pending on garimpa.curation_fact_delta(tenant_id, created_at, observation_id) where processed_at is null;

create table garimpa.extension_capture_receipt (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  device_id text not null references garimpa.extension_device(id),
  request_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, device_id, request_id)
);

create table garimpa.curation_fact_backfill (
  tenant_id text primary key references garimpa.affiliate_account(tenant_id),
  last_observation_id text not null default '',
  complete boolean not null default false,
  updated_at timestamptz not null default now()
);
create index price_observation_backfill_cursor on garimpa.price_observation(tenant_id,id);

alter table garimpa.product_source_page enable row level security;
alter table garimpa.offer_verification enable row level security;
alter table garimpa.curation_fact_delta enable row level security;
alter table garimpa.extension_capture_receipt enable row level security;
alter table garimpa.curation_fact_backfill enable row level security;
create policy product_source_page_scope on garimpa.product_source_page to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id));
create policy offer_verification_scope on garimpa.offer_verification to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id));
create policy curation_fact_delta_scope on garimpa.curation_fact_delta to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id));
create policy extension_capture_receipt_scope on garimpa.extension_capture_receipt to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id)
    and exists(select 1 from garimpa.extension_device d join garimpa.affiliate_account a on a.id=d.affiliate_id
      where d.id=extension_capture_receipt.device_id and a.tenant_id=extension_capture_receipt.tenant_id
        and d.revoked_at is null and (current_setting('garimpa.actor_type',true)='worker'
          or d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),''))
        and (current_setting('garimpa.actor_type',true)<>'device' or d.id=nullif(current_setting('garimpa.device_id',true),''))))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), '') and garimpa.active_tenant(tenant_id)
    and exists(select 1 from garimpa.extension_device d join garimpa.affiliate_account a on a.id=d.affiliate_id
      where d.id=extension_capture_receipt.device_id and a.tenant_id=extension_capture_receipt.tenant_id
        and d.revoked_at is null and (current_setting('garimpa.actor_type',true)='worker'
          or d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),''))
        and (current_setting('garimpa.actor_type',true)<>'device' or d.id=nullif(current_setting('garimpa.device_id',true),''))));
create policy curation_fact_backfill_scope on garimpa.curation_fact_backfill to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker')
  with check (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker');
revoke all on garimpa.product_source_page, garimpa.offer_verification, garimpa.curation_fact_delta from public, anon, authenticated, garimpa_public_runtime;
grant select, insert, update on garimpa.product_source_page, garimpa.offer_verification, garimpa.curation_fact_delta to garimpa_app;
revoke all on garimpa.extension_capture_receipt from public,anon,authenticated,garimpa_public_runtime;
grant select,insert on garimpa.extension_capture_receipt to garimpa_app;
revoke all on garimpa.curation_fact_backfill from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.curation_fact_backfill to garimpa_app;

-- A listing is not a confirmation when it contradicts the last specific PDP
-- observation of the same option and price type. The observations themselves
-- remain immutable and available in the history.
create function garimpa.listing_conflicts_with_pdp(p_tenant text,p_observation text) returns boolean
language sql volatile security invoker set search_path=pg_catalog,garimpa as $$
 select coalesce((select listing.price_cents is distinct from pdp.price_cents
   or listing.offer_evidence->>'priceMaxCents' is distinct from pdp.offer_evidence->>'priceMaxCents'
   from garimpa.price_observation listing join lateral (
     select prior.price_cents,prior.offer_evidence from garimpa.price_observation prior
     where prior.tenant_id=listing.tenant_id and prior.product_id=listing.product_id
       and prior.option_key=listing.option_key and prior.observed_at<=listing.observed_at
       and prior.offer_evidence#>>'{source,method}'='browser' and prior.offer_evidence->>'observationMethod'='product_page'
       and prior.offer_evidence->>'currency'='BRL' and prior.offer_evidence->>'priceType'=listing.offer_evidence->>'priceType'
       and prior.price_cents>0
     order by prior.observed_at desc,prior.id desc limit 1
   ) pdp on true
   where listing.tenant_id=p_tenant and listing.id=p_observation and listing.price_cents>0
     and listing.offer_evidence#>>'{source,method}'='browser' and listing.offer_evidence->>'observationMethod'='listing'
     and listing.offer_evidence->>'currency'='BRL' and listing.offer_evidence->>'priceType' in ('exact','range','from')),false)
$$;
revoke all on function garimpa.listing_conflicts_with_pdp(text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.listing_conflicts_with_pdp(text,text) to garimpa_app;

create function garimpa.project_curation_observation() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare source_marketplace text; v_price_type text;
begin
  select marketplace into source_marketplace from garimpa.product where tenant_id=new.tenant_id and id=new.product_id;
  if new.source_page_url is not null and length(new.source_page_url) between 1 and 2048 then
    insert into garimpa.product_source_page(tenant_id, product_id, marketplace, option_key, page_url, first_seen_at, last_seen_at)
      values(new.tenant_id, new.product_id, source_marketplace, new.option_key, new.source_page_url, new.observed_at, new.observed_at)
    on conflict(tenant_id, product_id, option_key, page_url_hash) do update
      set first_seen_at=least(garimpa.product_source_page.first_seen_at, excluded.first_seen_at),
          last_seen_at=greatest(garimpa.product_source_page.last_seen_at, excluded.last_seen_at),
          encounter_count=garimpa.product_source_page.encounter_count+1;
  end if;
  v_price_type := new.offer_evidence->>'priceType';
  if new.price_cents > 0 and new.offer_evidence->>'currency'='BRL' and v_price_type in ('exact','range','from')
    and not garimpa.listing_conflicts_with_pdp(new.tenant_id,new.id) then
    insert into garimpa.offer_verification(tenant_id, product_id, option_key, price_type, observation_id, verified_at)
      values(new.tenant_id, new.product_id, new.option_key, v_price_type, new.id, new.observed_at)
    on conflict(tenant_id, product_id, option_key, price_type) do update
      set observation_id=excluded.observation_id, verified_at=excluded.verified_at, availability='unknown'
      where excluded.verified_at > garimpa.offer_verification.verified_at;
  end if;
  -- A delayed PDP can reveal that a previously accepted listing disagreed.
  -- Revert only the verification pointer, never the historical observation.
  if new.offer_evidence#>>'{source,method}'='browser' and new.offer_evidence->>'observationMethod'='product_page'
    and new.price_cents>0 and new.offer_evidence->>'currency'='BRL' and v_price_type in ('exact','range','from') then
    update garimpa.offer_verification v set observation_id=new.id,verified_at=new.observed_at,availability='unknown'
      where v.tenant_id=new.tenant_id and v.product_id=new.product_id and v.option_key=new.option_key and v.price_type=v_price_type
        and v.verified_at>=new.observed_at and garimpa.listing_conflicts_with_pdp(v.tenant_id,v.observation_id)
        and new.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=new.tenant_id
          and latest.product_id=new.product_id and latest.option_key=new.option_key and latest.observed_at<=v.verified_at
          and latest.offer_evidence#>>'{source,method}'='browser' and latest.offer_evidence->>'observationMethod'='product_page'
          and latest.offer_evidence->>'currency'='BRL' and latest.offer_evidence->>'priceType'=v_price_type and latest.price_cents>0
          order by latest.observed_at desc,latest.id desc limit 1);
  end if;
  insert into garimpa.curation_fact_delta(tenant_id, observation_id, product_id)
    values(new.tenant_id, new.id, new.product_id) on conflict do nothing;
  return new;
end $$;

-- The worker owns the batch, but publication is independently committed for
-- each completed source. Repeated delivery returns its existing receipt.
create function garimpa.publish_capture_source(p_tenant text,p_batch uuid,p_worker text,p_marketplace text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b garimpa.capture_batch; runs text[]; n integer; receipt jsonb;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'') then raise exception 'capture_scope_denied'; end if;
 select * into b from garimpa.capture_batch where tenant_id=p_tenant and id=p_batch for update;
 if not found or not(p_marketplace=any(b.requested_marketplaces)) then raise exception 'capture_batch_not_found'; end if;
 if b.status<>'running' or p_worker is null or b.metadata#>>'{execution,workerId}' is distinct from p_worker
   or (b.metadata#>>'{execution,deadline}')::timestamptz<=now() then raise exception 'capture_batch_ownership_lost'; end if;
 receipt:=b.metadata#>array['publicationSources',p_marketplace];
 if receipt is not null then return receipt; end if;
 if coalesce(b.metadata#>>array['execution','stores',p_marketplace,'status'],'')<>'ok' then raise exception 'capture_publication_incomplete'; end if;
 select array_agg(id order by id) into runs from garimpa.capture_run
  where tenant_id=p_tenant and parameters->>'operationBatchId'=p_batch::text and marketplace=p_marketplace;
 if runs is null then raise exception 'capture_publication_incomplete'; end if;
 n:=garimpa.publish_capture_runs(p_tenant,runs,p_worker);
 receipt:=jsonb_build_object('publishedAt',now(),'policy','per-source-v2','marketplace',p_marketplace,'observations',n);
 update garimpa.capture_batch set metadata=jsonb_set(metadata,'{publicationSources}',
   coalesce(metadata->'publicationSources','{}'::jsonb)||jsonb_build_object(p_marketplace,receipt),true)
   where tenant_id=p_tenant and id=p_batch;
 return receipt;
end $$;
revoke all on function garimpa.publish_capture_source(text,uuid,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.publish_capture_source(text,uuid,text,text) to garimpa_app;
revoke all on function garimpa.project_curation_observation() from public, anon, authenticated, garimpa_public_runtime;
create trigger project_curation_observation after insert on garimpa.price_observation
  for each row execute function garimpa.project_curation_observation();

-- Preserve the existing worker-only aggregate and its ownership/tenant guard;
-- favorites are no longer represented as explicit price watches.
create or replace function garimpa.monitoring_interest_counts(p_tenant text)
returns table(product_id text, active_watches integer)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null
    or current_setting('garimpa.tenant_id',true) is distinct from p_tenant then
  raise exception 'monitoring_worker_scope_required';
 end if;
 if not garimpa.active_tenant(p_tenant) then raise exception 'monitoring_account_unavailable'; end if;
 return query select w.product_id,count(*)::integer from garimpa.price_watch w
  where w.tenant_id=p_tenant and w.active group by w.product_id;
end $$;
revoke all on function garimpa.monitoring_interest_counts(text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.monitoring_interest_counts(text) to garimpa_app;

-- Replace the existing publication primitive without modifying prior migrations.
create or replace function garimpa.publish_capture_runs(p_tenant text,p_runs text[],p_worker text default null) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer:=0; inserted_count integer; prepared record; batch_ids text[]; b garimpa.capture_batch;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'') then raise exception 'capture_scope_denied'; end if;
 -- Serializes catalogue publication in this account, without holding a lock during provider I/O.
 select array_agg(distinct parameters->>'operationBatchId') filter(where parameters->>'operationBatchId' is not null)
 into batch_ids from garimpa.capture_run where tenant_id=p_tenant and id=any(p_runs);
 if batch_ids is not null then
   if cardinality(batch_ids)<>1 then raise exception 'capture_publication_mixed_operations'; end if;
   select * into b from garimpa.capture_batch where tenant_id=p_tenant and id=batch_ids[1]::uuid for update;
   if not found or b.status<>'running' or p_worker is null or b.metadata#>>'{execution,workerId}' is distinct from p_worker
     or (b.metadata#>>'{execution,deadline}')::timestamptz<=now() then raise exception 'capture_batch_ownership_lost'; end if;
   -- A source is the atomic boundary; all its runs must be present and complete.
   if exists(select 1 from garimpa.capture_run r where r.tenant_id=p_tenant and r.id=any(p_runs)
       and ((r.parameters->>'operationBatchId') is distinct from batch_ids[1]
         or not (r.marketplace=any(b.requested_marketplaces))
         or coalesce(b.metadata#>>array['execution','stores',r.marketplace,'status'],'')<>'ok'))
     or exists(select 1 from garimpa.capture_run r where r.tenant_id=p_tenant
       and r.parameters->>'operationBatchId'=batch_ids[1] and not(r.id=any(p_runs))
       and r.marketplace in (select chosen.marketplace from garimpa.capture_run chosen
         where chosen.tenant_id=p_tenant and chosen.id=any(p_runs)))
     then raise exception 'capture_publication_incomplete'; end if;
 end if;
 perform id from garimpa.capture_run where tenant_id=p_tenant and id=any(p_runs) order by id for update;
 perform pg_advisory_xact_lock(hashtextextended('capture-publication:'||p_tenant,0));
 if exists(select 1 from garimpa.capture_run where tenant_id=p_tenant and id=any(p_runs) and status<>'ok') then raise exception 'capture_publication_incomplete'; end if;
 if exists(select 1 from garimpa.capture_run r where r.tenant_id=p_tenant and r.id=any(p_runs) and r.items_captured>0
   and r.parameters->>'publishedAt' is null and not exists(select 1 from garimpa.capture_prepared_offer s where s.tenant_id=p_tenant and s.capture_run_id=r.id)) then raise exception 'capture_preparation_missing'; end if;
 if (select count(*) from garimpa.capture_run where tenant_id=p_tenant and id=any(p_runs))<>cardinality(p_runs) then raise exception 'capture_scope_denied'; end if;
 insert into garimpa.product as p(id,tenant_id,marketplace,external_id,title,product_url,image_url,category,
   family_key,family_label,family_method,family_version,last_price_cents,first_seen_at,last_seen_at,last_capture_run_id)
 select distinct on(s.marketplace,s.external_id) s.product_id,s.tenant_id,s.marketplace,s.external_id,s.payload->>'title',s.payload->>'productUrl',s.payload->>'imageUrl',s.payload->>'category',
   s.payload#>>'{family,key}',s.payload#>>'{family,label}',s.payload#>>'{family,method}',s.payload#>>'{family,version}',
   (s.payload->>'priceCents')::integer,(s.payload->>'observedAt')::timestamptz,(s.payload->>'observedAt')::timestamptz,s.capture_run_id
 from garimpa.capture_prepared_offer s where s.tenant_id=p_tenant and s.capture_run_id=any(p_runs)
 order by s.marketplace,s.external_id,(s.payload->>'observedAt')::timestamptz desc,s.capture_run_id desc,s.option_key
 on conflict(tenant_id,marketplace,external_id) do update set
   first_seen_at=least(p.first_seen_at,excluded.first_seen_at),
   title=case when excluded.last_seen_at>p.last_seen_at then excluded.title else p.title end,
   product_url=case when excluded.last_seen_at<=p.last_seen_at or (p.marketplace='aliexpress' and p.product_url like 'https://s.click.aliexpress.com/%' and excluded.product_url not like 'https://s.click.aliexpress.com/%') then p.product_url else excluded.product_url end,
   image_url=case when excluded.last_seen_at>p.last_seen_at then coalesce(excluded.image_url,p.image_url) else p.image_url end,
   category=case when excluded.last_seen_at>p.last_seen_at then coalesce(excluded.category,p.category) else p.category end,
   family_key=case when excluded.last_seen_at>p.last_seen_at then coalesce(excluded.family_key,p.family_key) else p.family_key end,
   family_label=case when excluded.last_seen_at>p.last_seen_at then coalesce(excluded.family_label,p.family_label) else p.family_label end,
   family_method=case when excluded.last_seen_at>p.last_seen_at then coalesce(excluded.family_method,p.family_method) else p.family_method end,
   family_version=case when excluded.last_seen_at>p.last_seen_at then coalesce(excluded.family_version,p.family_version) else p.family_version end,
   last_price_cents=case when excluded.last_seen_at>p.last_seen_at then excluded.last_price_cents else p.last_price_cents end,
   last_seen_at=greatest(excluded.last_seen_at,p.last_seen_at),
   last_capture_run_id=case when excluded.last_seen_at>p.last_seen_at then excluded.last_capture_run_id else p.last_capture_run_id end,
   updated_at=now();
 -- Apply source observations chronologically inside this single commit. The
 -- Every independent run contributes a fact, including stable prices.
 -- This loop performs no network calls; the option index bounds each lookup.
 for prepared in select s.capture_run_id,s.external_id,s.option_key from garimpa.capture_prepared_offer s
   where s.tenant_id=p_tenant and s.capture_run_id=any(p_runs)
   order by (s.payload->>'observedAt')::timestamptz,s.capture_run_id,s.external_id,s.option_key
 loop
 insert into garimpa.price_observation(id,tenant_id,capture_run_id,product_id,price_cents,original_price_cents,claimed_discount_rate,
   rating_star,sales_label,sales_count,observed_at,title_snapshot,product_url_snapshot,image_url_snapshot,category_snapshot,offer_evidence,
   capture_source,source_page_url,client_captured_at)
 select gen_random_uuid()::text,s.tenant_id,s.capture_run_id,p.id,(s.payload->>'priceCents')::integer,(s.payload->>'originalPriceCents')::integer,
   (s.payload->>'claimedDiscountRate')::numeric,(s.payload->>'ratingStar')::numeric,s.payload->>'salesLabel',(s.payload->>'salesCount')::bigint,
   (s.payload->>'observedAt')::timestamptz,s.payload->>'title',s.payload->>'productUrl',s.payload->>'imageUrl',s.payload->>'category',s.payload->'offerEvidence',
   coalesce(s.payload->>'captureSource','sweep'),s.payload->>'sourcePageUrl',(s.payload->>'clientCapturedAt')::timestamptz
 from garimpa.capture_prepared_offer s join garimpa.product p on p.tenant_id=s.tenant_id and p.marketplace=s.marketplace and p.external_id=s.external_id
 where s.tenant_id=p_tenant and s.capture_run_id=prepared.capture_run_id and s.external_id=prepared.external_id and s.option_key=prepared.option_key

 on conflict(capture_run_id,product_id,option_key) do nothing;
 get diagnostics inserted_count=row_count;
 n:=n+inserted_count;
 end loop;
 -- Browser pages need a stable publication identity before affiliate generation.
 insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
 select distinct gen_random_uuid()::text,p.tenant_id,p.id,a.id,'web',
   case when p.marketplace='amazon' then 'amz-'||p.external_id||'-'||a.public_slug
     when p.tenant_id='local' then 'ali-'||p.external_id else a.public_slug||'-ali-'||p.external_id end
 from garimpa.product p join garimpa.affiliate_account a on a.tenant_id=p.tenant_id and a.status='active'
 where p.tenant_id=p_tenant and p.marketplace in ('amazon','aliexpress') and exists(
   select 1 from garimpa.capture_prepared_offer s where s.tenant_id=p.tenant_id and s.marketplace=p.marketplace and s.external_id=p.external_id
    and s.capture_run_id=any(p_runs) and s.payload->>'captureSource' in ('extension','bookmarklet'))
 on conflict(affiliate_id,product_id,channel) do nothing;
 update garimpa.capture_run set parameters=parameters||jsonb_build_object('publishedAt',now(),'publicationPolicy','per-source-v2')
 where tenant_id=p_tenant and id=any(p_runs) and parameters->>'publishedAt' is null;
 return n;
end $$;


-- A source receipt fences late writers even while another source is running.
create or replace function garimpa.stage_capture_offer(p_tenant text,p_run text,p_offer jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r garimpa.capture_run; b garimpa.capture_batch; existing garimpa.product;
 staged garimpa.capture_prepared_offer; option_id text; product_identity text; fresh boolean;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'') then raise exception 'capture_scope_denied'; end if;
 -- Batch then run: same order as publication, so an old producer cannot cross commit.
 select * into r from garimpa.capture_run where id=p_run and tenant_id=p_tenant;
 if not found then raise exception 'capture_run_not_found'; end if;
 if r.parameters->>'operationBatchId' is not null then
   select * into b from garimpa.capture_batch where tenant_id=p_tenant and id=(r.parameters->>'operationBatchId')::uuid for update;
   if not found or b.status<>'running' or b.metadata#>>'{publication,publishedAt}' is not null or b.metadata#>>array['publicationSources',r.marketplace,'publishedAt'] is not null then raise exception 'capture_batch_not_writable'; end if;
   if r.parameters->>'operationWorkerId' is not null and
     ((b.metadata#>>'{execution,workerId}') is distinct from r.parameters->>'operationWorkerId'
       or p_offer->>'operationWorkerId' is distinct from r.parameters->>'operationWorkerId'
       or (b.metadata#>>'{execution,deadline}')::timestamptz<=now()) then raise exception 'capture_batch_ownership_lost'; end if;
 end if;
 select * into r from garimpa.capture_run where id=p_run and tenant_id=p_tenant for update;
 if r.status<>'running' or r.parameters->>'publishedAt' is not null then raise exception 'capture_run_not_writable'; end if;
 if p_offer->>'marketplace' is distinct from r.marketplace or coalesce(p_offer->>'externalId','')='' or
   coalesce((p_offer->>'priceCents')::integer,0)<=0 or coalesce(p_offer->>'title','')='' or
   (p_offer->>'observedAt')::timestamptz is null or (p_offer->>'observedAt')::timestamptz>now()+interval '1 minute' then raise exception 'capture_offer_invalid'; end if;
 option_id:=garimpa.observation_option_key(p_offer->'offerEvidence');
 perform pg_advisory_xact_lock(hashtextextended('capture-identity:'||p_tenant||':'||r.marketplace||':'||(p_offer->>'externalId'),0));
 select product_id into product_identity from garimpa.capture_prepared_offer where tenant_id=p_tenant and marketplace=r.marketplace
   and external_id=p_offer->>'externalId' order by prepared_at,capture_run_id limit 1;
 select * into existing from garimpa.product where tenant_id=p_tenant and marketplace=r.marketplace and external_id=p_offer->>'externalId';
 select * into staged from garimpa.capture_prepared_offer where tenant_id=p_tenant and capture_run_id=p_run and external_id=p_offer->>'externalId' and option_key=option_id;
 fresh:=staged.capture_run_id is null and existing.id is null;
 insert into garimpa.capture_prepared_offer(tenant_id,capture_run_id,marketplace,external_id,option_key,product_id,payload)
 values(p_tenant,p_run,r.marketplace,p_offer->>'externalId',option_id,coalesce(existing.id,staged.product_id,product_identity,gen_random_uuid()::text),p_offer)
 -- The first observation of this option in this run is immutable. A new capture uses a new run.
 on conflict(tenant_id,capture_run_id,external_id,option_key) do nothing;
 select * into staged from garimpa.capture_prepared_offer where tenant_id=p_tenant and capture_run_id=p_run and external_id=p_offer->>'externalId' and option_key=option_id;
 return jsonb_build_object('id',staged.product_id,'is_new',fresh,'previous_price_cents',existing.last_price_cents);
end $$;


-- Explicit, bounded and resumable; never synthesizes capture dates. The
-- delta table identifies observations already projected by the new trigger.
create function garimpa.backfill_curation_facts(p_tenant text,p_limit integer default 250) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare state garimpa.curation_fact_backfill; o record; n integer:=0; cursor_id text; v_price_type text;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'')
    or current_setting('garimpa.actor_type',true) is distinct from 'worker' then raise exception 'capture_scope_denied'; end if;
 if p_limit<1 or p_limit>500 then raise exception 'backfill_limit_invalid'; end if;
 insert into garimpa.curation_fact_backfill(tenant_id) values(p_tenant) on conflict do nothing;
 select * into state from garimpa.curation_fact_backfill where tenant_id=p_tenant for update;
 if state.complete then return jsonb_build_object('processed',0,'complete',true); end if;
 cursor_id:=state.last_observation_id;
 for o in select obs.*,p.marketplace from garimpa.price_observation obs
   join garimpa.product p on p.id=obs.product_id and p.tenant_id=obs.tenant_id
   where obs.tenant_id=p_tenant and obs.id>state.last_observation_id
     and not exists(select 1 from garimpa.curation_fact_delta d where d.tenant_id=obs.tenant_id and d.observation_id=obs.id)
   order by obs.id limit p_limit
 loop
   cursor_id:=o.id; n:=n+1;
   -- Legacy query strings and unknown hosts are not recoverable safely.
   if o.source_page_url ~* '^https://([a-z0-9-]+\.)*(mercadolivre\.com\.br|amazon\.com\.br|aliexpress\.com)(/[^?#]*)?$'
     and o.source_page_url !~* '/(login|checkout|ap/signin|gp/cart|p/trade)(/|$)'
     and length(o.source_page_url)<=2048 then
     insert into garimpa.product_source_page(tenant_id,product_id,marketplace,option_key,page_url,first_seen_at,last_seen_at)
       values(o.tenant_id,o.product_id,o.marketplace,o.option_key,o.source_page_url,o.observed_at,o.observed_at)
     on conflict(tenant_id,product_id,option_key,page_url_hash) do update
       set first_seen_at=least(garimpa.product_source_page.first_seen_at,excluded.first_seen_at),
           last_seen_at=greatest(garimpa.product_source_page.last_seen_at,excluded.last_seen_at),
           encounter_count=garimpa.product_source_page.encounter_count+1;
   end if;
   v_price_type:=o.offer_evidence->>'priceType';
   if o.price_cents>0 and o.offer_evidence->>'currency'='BRL' and v_price_type in ('exact','range','from')
     and not garimpa.listing_conflicts_with_pdp(o.tenant_id,o.id) then
     insert into garimpa.offer_verification(tenant_id,product_id,option_key,price_type,observation_id,verified_at)
       values(o.tenant_id,o.product_id,o.option_key,v_price_type,o.id,o.observed_at)
     on conflict(tenant_id,product_id,option_key,price_type) do update
       set observation_id=excluded.observation_id,verified_at=excluded.verified_at
       where excluded.verified_at>garimpa.offer_verification.verified_at;
   end if;
 end loop;
 update garimpa.curation_fact_backfill set last_observation_id=cursor_id,complete=(n<p_limit),updated_at=now()
  where tenant_id=p_tenant;
 return jsonb_build_object('processed',n,'complete',n<p_limit);
end $$;
revoke all on function garimpa.backfill_curation_facts(text,integer) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.backfill_curation_facts(text,integer) to garimpa_app;

commit;
