begin;
set local lock_timeout='5s';

-- Prepared facts never join the live catalogue. Their parent run is the checkpoint.
create table garimpa.capture_prepared_offer (
 tenant_id text not null references garimpa.affiliate_account(tenant_id) on delete cascade,
 capture_run_id text not null references garimpa.capture_run(id) on delete cascade,
 marketplace text not null,
 external_id text not null,
 option_key text not null,
 product_id text not null default gen_random_uuid()::text,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 prepared_at timestamptz not null default now(),
 primary key(tenant_id,capture_run_id,external_id,option_key)
);
create index capture_prepared_catalogue on garimpa.capture_prepared_offer(tenant_id,marketplace,external_id);
alter table garimpa.capture_prepared_offer enable row level security;
create policy capture_prepared_scope on garimpa.capture_prepared_offer to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and exists(
   select 1 from garimpa.capture_run r where r.id=capture_run_id and r.tenant_id=capture_prepared_offer.tenant_id));
revoke all on garimpa.capture_prepared_offer from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update,delete on garimpa.capture_prepared_offer to garimpa_app;

create function garimpa.stage_capture_offer(p_tenant text,p_run text,p_offer jsonb) returns jsonb
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
   if not found or b.status<>'running' or b.metadata#>>'{publication,publishedAt}' is not null then raise exception 'capture_batch_not_writable'; end if;
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

-- Internal primitive shared by a complete standalone operation and a complete batch.
create function garimpa.publish_capture_runs(p_tenant text,p_runs text[],p_worker text default null) returns integer
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
   if exists(select 1 from garimpa.capture_run r where r.tenant_id=p_tenant and
      ((r.parameters->>'operationBatchId'=batch_ids[1] and not(r.id=any(p_runs))) or
       (r.id=any(p_runs) and (r.parameters->>'operationBatchId') is distinct from batch_ids[1])))
     or exists(select 1 from unnest(b.requested_marketplaces) m where coalesce(b.metadata#>>array['execution','stores',m,'status'],'')<>'ok'
       or not exists(select 1 from garimpa.capture_run r where r.tenant_id=p_tenant and r.id=any(p_runs) and r.marketplace=m and r.status='ok'))
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
   title=excluded.title,product_url=case when p.marketplace='aliexpress' and p.product_url like 'https://s.click.aliexpress.com/%' and excluded.product_url not like 'https://s.click.aliexpress.com/%' then p.product_url else excluded.product_url end,
   image_url=coalesce(excluded.image_url,p.image_url),category=coalesce(excluded.category,p.category),
   family_key=coalesce(excluded.family_key,p.family_key),family_label=coalesce(excluded.family_label,p.family_label),
   family_method=coalesce(excluded.family_method,p.family_method),family_version=coalesce(excluded.family_version,p.family_version),
   last_price_cents=excluded.last_price_cents,last_seen_at=excluded.last_seen_at,last_capture_run_id=excluded.last_capture_run_id,updated_at=now()
 where excluded.last_seen_at>p.last_seen_at;
 -- Apply source observations chronologically inside this single commit. The
 -- existing 20-hour stable-sampling rule still keeps every A -> B -> A change.
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
   and ((select o.option_key from garimpa.price_observation o where o.tenant_id=p_tenant and o.product_id=p.id order by o.observed_at desc,o.id desc limit 1)
       is distinct from s.option_key
     or not exists(select 1 from (
       select o.* from garimpa.price_observation o where o.tenant_id=p_tenant and o.product_id=p.id and o.option_key=s.option_key
       order by o.observed_at desc,o.id desc limit 1
     ) latest where latest.observed_at>(s.payload->>'observedAt')::timestamptz-interval '20 hours'
       and latest.observed_at<=(s.payload->>'observedAt')::timestamptz
       and latest.title_snapshot is not distinct from s.payload->>'title'
       and latest.product_url_snapshot is not distinct from s.payload->>'productUrl'
       and latest.image_url_snapshot is not distinct from s.payload->>'imageUrl'
       and latest.category_snapshot is not distinct from s.payload->>'category'
       and latest.price_cents=(s.payload->>'priceCents')::integer
       and latest.original_price_cents is not distinct from (s.payload->>'originalPriceCents')::integer
       and latest.claimed_discount_rate is not distinct from (s.payload->>'claimedDiscountRate')::numeric
       and latest.rating_star is not distinct from (s.payload->>'ratingStar')::numeric
       and latest.sales_label is not distinct from s.payload->>'salesLabel'
       and latest.sales_count is not distinct from (s.payload->>'salesCount')::bigint
       and (latest.offer_evidence #- '{source,capturedAt}') is not distinct from ((s.payload->'offerEvidence') #- '{source,capturedAt}')))
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
 update garimpa.capture_run set parameters=parameters||jsonb_build_object('publishedAt',now(),'publicationPolicy','complete-operation-v1')
 where tenant_id=p_tenant and id=any(p_runs) and parameters->>'publishedAt' is null;
 return n;
end $$;

create function garimpa.publish_capture_run(p_tenant text,p_run text) returns integer
language plpgsql security invoker set search_path='' as $$
declare r garimpa.capture_run;
begin
 select * into r from garimpa.capture_run where tenant_id=p_tenant and id=p_run for update;
 if not found or r.parameters->>'operationBatchId' is not null then raise exception 'capture_standalone_required'; end if;
 if r.parameters->>'publishedAt' is not null then return 0; end if;
 return garimpa.publish_capture_runs(p_tenant,array[p_run]);
end $$;

create function garimpa.publish_capture_batch(p_tenant text,p_batch uuid,p_worker text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b garimpa.capture_batch; runs text[]; n integer;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'') then raise exception 'capture_scope_denied'; end if;
 select * into b from garimpa.capture_batch where tenant_id=p_tenant and id=p_batch for update;
 if not found then raise exception 'capture_batch_not_found'; end if;
 if b.metadata#>>'{publication,publishedAt}' is not null then return b.metadata->'publication'; end if;
 if b.status<>'running' or p_worker is null or b.metadata#>>'{execution,workerId}' is distinct from p_worker or
   (b.metadata#>>'{execution,deadline}')::timestamptz<=now() then raise exception 'capture_batch_ownership_lost'; end if;
 if exists(select 1 from unnest(b.requested_marketplaces) m where coalesce(b.metadata#>>array['execution','stores',m,'status'],'')<>'ok') then raise exception 'capture_publication_incomplete'; end if;
 perform id from garimpa.capture_run where tenant_id=p_tenant and parameters->>'operationBatchId'=p_batch::text order by id for update;
 select array_agg(id order by id) into runs from garimpa.capture_run where tenant_id=p_tenant and parameters->>'operationBatchId'=p_batch::text;
 if runs is null or exists(select 1 from unnest(b.requested_marketplaces) m where not exists(
    select 1 from garimpa.capture_run r where r.tenant_id=p_tenant and r.id=any(runs) and r.marketplace=m and r.status='ok')) then raise exception 'capture_publication_incomplete'; end if;
 n:=garimpa.publish_capture_runs(p_tenant,runs,p_worker);
 update garimpa.capture_batch set metadata=metadata||jsonb_build_object('publication',jsonb_build_object(
   'publishedAt',now(),'policy','complete-operation-v1','observations',n)) where id=p_batch and tenant_id=p_tenant returning metadata into b.metadata;
 return b.metadata->'publication';
end $$;

-- Explicit bounded maintenance; no timer, no deletion of observations or run audit.
create function garimpa.prune_capture_preparations(p_tenant text,p_limit integer default 500) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'') then raise exception 'capture_scope_denied'; end if;
 if p_limit<1 or p_limit>5000 then raise exception 'capture_cleanup_limit_invalid'; end if;
 with removable as (
   select s.tenant_id,s.capture_run_id,s.external_id,s.option_key from garimpa.capture_prepared_offer s
   join garimpa.capture_run r on r.tenant_id=s.tenant_id and r.id=s.capture_run_id
   where s.tenant_id=p_tenant and (
     (r.parameters->>'publishedAt')::timestamptz<now()-interval '7 days'
     or (r.status='error' and r.finished_at<now()-interval '30 days'
       and not exists(select 1 from garimpa.capture_batch b where b.tenant_id=r.tenant_id
         and b.id::text=r.parameters->>'operationBatchId' and b.status='running')))
   order by s.prepared_at,s.capture_run_id,s.external_id,s.option_key limit p_limit for update of s skip locked
 ), removed as (
   delete from garimpa.capture_prepared_offer s using removable d
   where s.tenant_id=d.tenant_id and s.capture_run_id=d.capture_run_id and s.external_id=d.external_id and s.option_key=d.option_key returning 1
 ) select count(*)::integer into n from removed;
 return n;
end $$;
revoke all on function garimpa.prune_capture_preparations(text,integer) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.prune_capture_preparations(text,integer) to garimpa_app;

revoke all on function garimpa.stage_capture_offer(text,text,jsonb),garimpa.publish_capture_runs(text,text[],text),garimpa.publish_capture_run(text,text),garimpa.publish_capture_batch(text,uuid,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.stage_capture_offer(text,text,jsonb),garimpa.publish_capture_runs(text,text[],text),garimpa.publish_capture_run(text,text),garimpa.publish_capture_batch(text,uuid,text) to garimpa_app;
commit;
