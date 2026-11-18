begin;
set local lock_timeout='5s';

-- Null preserves older product-level requests whose option is unknown.
alter table garimpa.price_watch add column option_key text
  check(option_key is null or option_key='listing' or option_key ~ '^[a-f0-9]{32}$');

-- Reconstruct the new membership-aware key from the original baseline only
-- when the matching observation proves one unambiguous configuration.
-- Otherwise keep the baseline and prevent an unsafe comparison.
update garimpa.price_watch w
set baseline_configuration=coalesce((
  select (array_agg(distinct original.configuration))[1]
  from garimpa.price_observation o
  cross join lateral (select garimpa.offer_configuration_key(o.offer_evidence) as configuration) original
  where o.tenant_id=w.tenant_id and o.product_id=w.product_id
    and o.observed_at=w.baseline_observed_at and o.price_cents=w.baseline_price_cents
    and (w.option_key is null or o.option_key=w.option_key)
    and (w.baseline_currency is null or o.offer_evidence->>'currency'=w.baseline_currency)
    and original.configuration is not null
    and original.configuration-'membership'=w.baseline_configuration
  having count(distinct original.configuration)=1
), w.baseline_configuration||jsonb_build_object('membership_unresolved',true))
where w.baseline_configuration is not null and not (w.baseline_configuration ? 'membership');
do $$
declare constraint_name text;
begin
 for constraint_name in select c.conname from pg_constraint c
   where c.conrelid='garimpa.price_watch'::regclass and c.contype='u'
     and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
       where a.attrelid=c.conrelid and a.attnum=any(c.conkey))=array['product_id','user_id']::text[]
 loop execute format('alter table garimpa.price_watch drop constraint %I',constraint_name); end loop;
end $$;
-- An empty key represents an explicitly unspecified option, distinct from a
-- generic listing and from all verified configurations.
create unique index price_watch_user_product_option on garimpa.price_watch(user_id,product_id,(coalesce(option_key,'')));
create index price_watch_active_option on garimpa.price_watch(tenant_id,product_id,option_key) where active;

create function garimpa.monitoring_interest_options(p_tenant text)
returns table(product_id text,option_key text,active_watches integer)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'')
    or not garimpa.active_tenant(p_tenant) then raise exception 'monitoring_worker_scope_required'; end if;
 -- A legacy product-level request has no selected configuration. Route its
 -- next check to the latest observed option without changing the saved watch
 -- or treating that observation as a comparable baseline.
 return query select w.product_id,coalesce(w.option_key,latest.option_key,'listing'),count(*)::integer
   from garimpa.price_watch w left join lateral (select o.option_key from garimpa.price_observation o
     where o.tenant_id=w.tenant_id and o.product_id=w.product_id order by o.observed_at desc,o.id desc limit 1) latest on true
   where w.tenant_id=p_tenant and w.active group by w.product_id,coalesce(w.option_key,latest.option_key,'listing');
end $$;
revoke all on function garimpa.monitoring_interest_options(text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.monitoring_interest_options(text) to garimpa_app;

create function garimpa.recapture_watch_option_active(p_tenant text,p_product text,p_option text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 -- Reuse the existing account, device and membership checks before consulting
 -- the narrower aggregate. A product-level watch follows its latest observed
 -- option only for planning; it does not acquire that option as a baseline.
 if not garimpa.recapture_watch_active(p_tenant,p_product) then return false; end if;
 return exists(select 1 from garimpa.price_watch w left join lateral (select o.option_key from garimpa.price_observation o
   where o.tenant_id=w.tenant_id and o.product_id=w.product_id order by o.observed_at desc,o.id desc limit 1) latest on true
   where w.tenant_id=p_tenant and w.product_id=p_product and w.active
     and coalesce(w.option_key,latest.option_key,'listing')=p_option);
end $$;
revoke all on function garimpa.recapture_watch_option_active(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.recapture_watch_option_active(text,text,text) to garimpa_app;

-- Devices can check the account-wide retry window without reading another
-- device's task or revealing the people who requested the watch.
create function garimpa.recapture_watch_option_due(p_tenant text,p_product text,p_option text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if not garimpa.recapture_watch_option_active(p_tenant,p_product,p_option) then return false; end if;
 return not exists(select 1 from garimpa.recapture_target prior
   join garimpa.recapture_task attempt on attempt.tenant_id=prior.tenant_id and attempt.id=prior.task_id
   where prior.tenant_id=p_tenant and prior.product_id=p_product and prior.option_key=p_option
     and prior.status in ('residual','unreported') and prior.residual_reason is distinct from 'price_conflict' and attempt.status='completed'
     and attempt.updated_at>now()-interval '1 hour');
end $$;
revoke all on function garimpa.recapture_watch_option_due(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.recapture_watch_option_due(text,text,text) to garimpa_app;

-- Buyer projection: return only operational state for the caller's own active
-- watch, without exposing the account's queue, devices or other subscribers.
create function garimpa.member_watch_evidence(p_tenant text,p_watch text)
returns table(evidence_current boolean,no_safe_page boolean,valid_until timestamptz,public_current boolean,public_slug text)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
declare watched garimpa.price_watch; latest_id text; enabled boolean; visible_slug text;
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'')
   or nullif(current_setting('garimpa.actor_app_user_id',true),'') is null
   or not garimpa.active_tenant(p_tenant) then raise exception 'watch_scope_denied'; end if;
 select * into watched from garimpa.price_watch w where w.tenant_id=p_tenant and w.id::text=p_watch
   and w.user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'') and w.active;
 if not found then raise exception 'watch_scope_denied'; end if;
 select exists(select 1 from garimpa.curation_policy_v2 p where p.tenant_id=p_tenant and (p.enabled or p.factual_gate_required)) into enabled;
 select o.id into latest_id from garimpa.price_observation o where o.tenant_id=p_tenant and o.product_id=watched.product_id
   and (watched.option_key is null or o.option_key=watched.option_key) order by o.observed_at desc,o.id desc limit 1;
 -- Use the actual destination's gate. A specific-option link must resolve as
 -- that option; a visible generic product alone is not enough.
 select pub.slug into visible_slug from garimpa.publication pub join garimpa.affiliate_account account
   on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id and account.status='active'
 where pub.tenant_id=p_tenant and pub.product_id=watched.product_id and pub.channel='web' and pub.status='active'
   and (case when coalesce(watched.option_key,'listing')='listing' then
       exists(select 1 from garimpa.public_offer_candidates(p_tenant,null) offer where offer.id=watched.product_id
         and offer.publication_id=pub.id and offer.observation_id=latest_id)
     else exists(select 1 from (select garimpa.public_confirmed_offer(pub.slug,watched.option_key) as value) detail
       where detail.value#>>'{product,id}'=watched.product_id and detail.value#>>'{product,offerOptionKey}'=watched.option_key) end)
 order by pub.published_at desc,pub.id limit 1;
 return query select (not enabled or coalesce(now()<garimpa.current_offer_valid_until(p_tenant,watched.product_id,latest_id),false)),
   exists(select 1 from garimpa.recapture_unroutable pending where pending.tenant_id=p_tenant and pending.product_id=watched.product_id
     and pending.option_key=coalesce(watched.option_key,(select o.option_key from garimpa.price_observation o
       where o.tenant_id=p_tenant and o.product_id=watched.product_id and o.id=latest_id),'listing')
     and pending.resolved_at is null and pending.deadline>now()),
   (select case when enabled and garimpa.current_offer_valid_until(p_tenant,watched.product_id,latest_id) is null then null
     else least(o.observed_at+interval '48 hours',p.last_seen_at+interval '7 days',
       case when enabled then garimpa.current_offer_valid_until(p_tenant,watched.product_id,latest_id)
         else o.observed_at+interval '48 hours' end) end
     from garimpa.price_observation o join garimpa.product p on p.tenant_id=o.tenant_id and p.id=o.product_id
     where o.tenant_id=p_tenant and o.id=latest_id and o.product_id=watched.product_id),
   visible_slug is not null,visible_slug;
end $$;
revoke all on function garimpa.member_watch_evidence(text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.member_watch_evidence(text,text) to garimpa_app;
commit;
